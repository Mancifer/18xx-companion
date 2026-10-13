import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { cashOf } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import { entryBreakdown, type EntryBreakdown, type Movement } from "../../src/domain/ledger/breakdown";
import { touchesOf, type GroupEntry, type LogEntry } from "../../src/domain/ledger/entries";
import type { HolderRef, Player } from "../../src/domain/types";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { FLOW, NAMES, candidates, rng } from "../helpers/randomWalk";
import { seedCompany } from "../helpers/seed";
import { ROTLA_NAMES, rotlaGame, seedCompany as seedRotla } from "../helpers/rotla";

/** Feature 010, US3 (FR-010 to FR-016, data-model §5): where the money went, per entry. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const g1830 = getBuiltInGame("1830");

/**
 * A TestSession whose every step is also written to a log: the setup group, each seed (applied
 * raw events) as a note group, and each action as its own group.
 */
function recorded(s: TestSession) {
  const log: LogEntry[] = [];
  const push = (action: Action, events: readonly PrimitiveEvent[]): GroupEntry => {
    const seq = log.length + 1;
    const group: GroupEntry = {
      kind: "group",
      seq,
      id: `g${seq}`,
      at: "2026-10-12T20:00:00.000Z",
      source: "touch",
      action,
      events,
      touches: touchesOf(events),
      warnings: [],
    };
    log.push(group);
    return group;
  };
  const created = s.groups[0]!;
  push(created.action, created.events);
  const apply = s.apply.bind(s);
  s.apply = (...events: PrimitiveEvent[]) => {
    push({ type: "note", text: "seed" }, events);
    return apply(...events);
  };
  const run = s.do.bind(s);
  let last: GroupEntry | undefined;
  s.do = (action: unknown) => {
    run(action);
    const g = s.groups[s.groups.length - 1]!;
    last = push(g.action, g.events);
    return s;
  };
  const breakdown = (id = last?.id): EntryBreakdown => {
    const b = entryBreakdown(s.game, s.players, log, id!);
    if (!b) throw new Error(`no breakdown for ${String(id)}`);
    return b;
  };
  return { s, log, breakdown, last: () => last! };
}

const money = (b: EntryBreakdown) => b.movements.filter((m): m is Extract<Movement, { kind: "money" }> => m.kind === "money");
const balance = (b: EntryBreakdown, holder: HolderRef) => b.balances.find((x) => x.holder === holder);

describe("entryBreakdown: payouts (FR-012)", () => {
  /** PRR at $100: Ana 6 (president), Bruno 2, 1 in the pool, 1 left in the IPO. */
  function prr() {
    const r = recorded(TestSession.start(g1830, players));
    seedCompany(r.s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6, "player:p2": 2, pool: 1 } });
    return r;
  }
  const run = (amount: number, mode: string) => ({ type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount }], mode });

  it("one money line per recipient, balances by hand, and the price change", () => {
    const r = prr();
    r.s.do(run(100, "full"));
    const b = r.breakdown();
    // $10 a share: Ana 60, Bruno 20, and in 1830 the pool share pays the company; the IPO share pays nobody.
    expect(money(b)).toEqual([
      { kind: "money", from: "bank", to: "player:p1", amount: 60 },
      { kind: "money", from: "bank", to: "player:p2", amount: 20 },
      { kind: "money", from: "bank", to: "company:PRR", amount: 10 },
    ]);
    expect(balance(b, "player:p1")).toEqual({ holder: "player:p1", before: 600, after: 660, delta: 60 });
    expect(balance(b, "player:p2")).toEqual({ holder: "player:p2", before: 600, after: 620, delta: 20 });
    expect(balance(b, "company:PRR")).toEqual({ holder: "company:PRR", before: 0, after: 10, delta: 10 });
    const bank = balance(b, "bank")!;
    expect(bank.delta).toBe(-90);
    expect(bank.after).toBe(bank.before! - 90);
    expect(b.movements.find((m) => m.kind === "price")).toEqual({ kind: "price", company: "PRR", from: 100, to: 112, reason: "payout" });
    expect(b.status).toBe("active");
  });

  it("withhold pays the whole run to the treasury", () => {
    const w = prr();
    w.s.do(run(100, "withhold"));
    expect(money(w.breakdown())).toEqual([{ kind: "money", from: "bank", to: "company:PRR", amount: 100 }]);
  });

  it("21Moon: a split run pays the treasury and the shareholders, the company's own shares included (§11.5)", () => {
    const game = getBuiltInGame("21moon");
    const r = recorded(TestSession.start(game, players));
    seedCompany(r.s, "VH", { cell: { row: 4, col: 2 }, holders: { "player:p1": 6, "company:VH": 1 } });
    r.s.do({ type: "runAndPayout", company: "VH", parts: [{ part: "local", amount: 60 }, { part: "spacePort", amount: 40 }], mode: null });
    const b = r.breakdown();
    // Base local (60) to the treasury plus its own share's dividend (4), summed in one line; Ana 24.
    expect(money(b)).toEqual([
      { kind: "money", from: "bank", to: "company:VH", amount: 64 },
      { kind: "money", from: "bank", to: "player:p1", amount: 24 },
    ]);
    expect(balance(b, "company:VH")?.delta).toBe(64);
    // Unlimited bank: amount only (FR-011).
    expect(balance(b, "bank")).toMatchObject({ before: null, after: null });
    expect(balance(b, "bank")!.delta).toBeLessThan(0);
  });
});

describe("entryBreakdown: single movements (FR-010, FR-013)", () => {
  it("setting money shows before, after and the difference, with the bank as the other side", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "adjustMoney", holder: "player:p1", delta: null, setTo: 640 });
    const b = r.breakdown();
    expect(money(b)).toEqual([{ kind: "money", from: "bank", to: "player:p1", amount: 40 }]);
    expect(balance(b, "player:p1")).toEqual({ holder: "player:p1", before: 600, after: 640, delta: 40 });
    expect(balance(b, "bank")?.delta).toBe(-40);
  });

  it("a share purchase shows the share movement, the price paid, its receiver and the buyer's balance", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "startSR" }).do({ type: "parCompany", player: "p1", company: "PRR", price: 100 });
    r.s.do({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 1 });
    const b = r.breakdown();
    expect(b.movements).toContainEqual({ kind: "shares", company: "PRR", from: "ipo:PRR", to: "player:p2", units: 1, presidency: false });
    const [paid] = money(b);
    expect(paid).toMatchObject({ from: "player:p2", amount: 100 });
    expect(balance(b, "player:p2")).toEqual({ holder: "player:p2", before: 600, after: 500, delta: -100 });
  });

  it("a train purchase shows the train, the seller, the price and the treasury before and after", () => {
    const r = recorded(TestSession.start(g1830, players));
    seedCompany(r.s, "PRR", { cell: { row: 0, col: 6 }, cash: 500, holders: { "player:p1": 6 } });
    r.s.apply({ t: "turnAdvance", round: "OR", company: "PRR" });
    r.s.do({ type: "buyTrain", company: "PRR", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    const b = r.breakdown();
    const train = b.movements.find((m) => m.kind === "asset");
    expect(train).toMatchObject({ kind: "asset", from: "bank", to: "company:PRR" });
    expect(money(b)).toEqual([{ kind: "money", from: "company:PRR", to: "bank", amount: 80 }]);
    expect(balance(b, "company:PRR")).toEqual({ holder: "company:PRR", before: 500, after: 420, delta: -80 });
  });

  it("a private sold to a company moves the private and the money, with both balances (FR-010)", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "buyPrivate", buyer: "p1", private: "CS", price: 40, par: null });
    seedCompany(r.s, "PRR", { cell: { row: 0, col: 6 }, cash: 500, holders: { "player:p1": 6 } });
    r.s.apply({ t: "turnAdvance", round: "OR", company: "PRR", phase: "3" });
    r.s.do({ type: "buyPrivateByCompany", company: "PRR", private: "CS", price: 70 });
    const b = r.breakdown();
    expect(b.movements).toContainEqual({ kind: "asset", asset: "private:CS", from: "player:p1", to: "company:PRR" });
    expect(money(b)).toEqual([{ kind: "money", from: "company:PRR", to: "player:p1", amount: 70 }]);
    expect(balance(b, "player:p1")?.delta).toBe(70);
    expect(balance(b, "company:PRR")?.delta).toBe(-70);
  });

  it("sums repeated same-direction transfers but never nets opposite directions", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.apply(
      { t: "moneyTransfer", from: "player:p1", to: "player:p2", amount: 10 },
      { t: "moneyTransfer", from: "player:p2", to: "player:p1", amount: 3 },
      { t: "moneyTransfer", from: "player:p1", to: "player:p2", amount: 5 },
    );
    const b = r.breakdown("g2");
    expect(money(b)).toEqual([
      { kind: "money", from: "player:p1", to: "player:p2", amount: 15 },
      { kind: "money", from: "player:p2", to: "player:p1", amount: 3 },
    ]);
    expect(balance(b, "player:p1")?.delta).toBe(-12);
  });

  it("orders balances: players by seat, companies in definition order, then the bank and the rest", () => {
    const seated: Player[] = players.map((p, i) => ({ ...p, seat: players.length - i }));
    const r = recorded(TestSession.start(g1830, seated));
    const [first, second] = g1830.companies.map((c) => c.id);
    r.s.apply(
      { t: "moneyTransfer", from: "bank", to: `company:${second!}`, amount: 5 },
      { t: "moneyTransfer", from: "player:p1", to: "pool", amount: 1 },
      { t: "moneyTransfer", from: "bank", to: `company:${first!}`, amount: 5 },
      { t: "moneyTransfer", from: "player:p2", to: "bank", amount: 4 },
    );
    expect(r.breakdown("g2").balances.map((x) => x.holder)).toEqual(["player:p2", "player:p1", `company:${first!}`, `company:${second!}`, "bank", "pool"]);
  });
});

describe("entryBreakdown: undone and legacy entries (FR-017, FR-018)", () => {
  it("an undone entry keeps the breakdown it had while active", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "transferMoney", from: "bank", to: "player:p1", amount: 50 });
    r.s.do({ type: "transferMoney", from: "player:p1", to: "player:p2", amount: 30 });
    const active = r.breakdown("g3");
    r.log.push({ kind: "undo", seq: 4, at: "2026-10-12T20:00:00.000Z", groupIds: ["g3", "g2"] });
    // Later play replaces the undone tail.
    r.log.push({ ...(r.log[1] as GroupEntry), seq: 5, id: "g5", events: [{ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 200 }] });
    const undone = entryBreakdown(g1830, players, r.log, "g3")!;
    expect(undone.status).toBe("reverted");
    expect(undone.movements).toEqual(active.movements);
    expect(undone.balances).toEqual(active.balances);
    expect(balance(undone, "player:p1")).toEqual({ holder: "player:p1", before: 650, after: 620, delta: -30 });
  });

  it("a legacy amended entry uses its latest version", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "transferMoney", from: "bank", to: "player:p1", amount: 50 });
    r.log.push({
      kind: "amend",
      seq: 3,
      at: "2026-10-01T20:00:00.000Z",
      groupId: "g2",
      action: { type: "transferMoney", from: "bank", to: "player:p1", amount: 70 },
      events: [{ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 70 }],
      touches: [],
    });
    const b = entryBreakdown(g1830, players, r.log, "g2")!;
    expect(b.status).toBe("amended");
    expect(money(b)).toEqual([{ kind: "money", from: "bank", to: "player:p1", amount: 70 }]);
  });

  it("an unknown group has no breakdown", () => {
    expect(entryBreakdown(g1830, players, [], "g1")).toBeUndefined();
  });
});

describe("entryBreakdown: automatic and system groups (FR-015)", () => {
  it("private income pays each owner", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "buyPrivate", buyer: "p2", private: "SV", price: 20, par: null });
    r.s.do({ type: "privateIncome" });
    const b = r.breakdown();
    expect(money(b)).toEqual([{ kind: "money", from: "bank", to: "player:p2", amount: 5 }]);
    expect(balance(b, "player:p2")?.delta).toBe(5);
  });

  it("the end of the stock round inside startOR: the sold-out move and the turn change", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "startSR" });
    seedCompany(r.s, "PRR", { cell: { row: 2, col: 6 }, holders: { "player:p1": 6, "player:p2": 4 } });
    r.s.do({ type: "startOR" });
    const b = r.breakdown();
    expect(b.movements).toContainEqual({ kind: "price", company: "PRR", from: 82, to: 90, reason: "soldOut" });
    expect(b.movements.some((m) => m.kind === "turn")).toBe(true);
  });

  it("a game end moves nothing", () => {
    const r = recorded(TestSession.start(g1830, players));
    r.s.do({ type: "endGame", triggers: null });
    expect(r.breakdown()).toMatchObject({ movements: [], balances: [] });
  });

  it("RotLA: a player's bankruptcy lists every share, train and money movement and the closures", () => {
    const r = recorded(TestSession.start(rotlaGame(), makePlayers(ROTLA_NAMES.slice(0, 3))));
    seedRotla(r.s, "CON", { price: 100, holders: { "player:p3": 4, "player:p1": 3, "player:p2": 2, pool: 1 }, treasury: 120, trains: ["train:3:1"] });
    seedRotla(r.s, "EXP", { price: 80, holders: { "player:p3": 2, "player:p2": 1, "company:EXP": 2 }, treasury: 30 });
    r.s.apply({ t: "moneyTransfer", from: "player:p3", to: "bank", amount: 230 });
    r.s.do({ type: "declareBankruptcy", player: "p3", company: null });
    const b = r.breakdown();
    const sums = conservation(b);
    for (const [holder, net] of sums) expect([holder, balance(b, holder as HolderRef)?.delta ?? 0]).toEqual([holder, net]);
    expect(b.movements.some((m) => m.kind === "shares")).toBe(true);
    expect(b.movements.some((m) => m.kind === "counter" && m.key === "bankrupt")).toBe(true);
  });

  it("RotLA: a merger moves the minors' shares, trains and treasuries into the major", () => {
    const r = recorded(TestSession.start(rotlaGame(), makePlayers(ROTLA_NAMES.slice(0, 3))));
    r.s.apply({ t: "turnAdvance", round: "MR", srNumber: 2, phase: "green" });
    seedRotla(r.s, "EXP", { price: 80, holders: { "player:p1": 3, "player:p2": 2 }, treasury: 200, trains: ["train:2:1"] });
    seedRotla(r.s, "TUN", { price: 70, holders: { "player:p2": 3, "company:TUN": 2 }, treasury: 110, trains: ["train:3:1"] });
    r.s.do({ type: "mergeCompanies", a: "EXP", b: "TUN", into: "CON", identity: null });
    const b = r.breakdown();
    expect(b.movements.filter((m) => m.kind === "asset").length).toBeGreaterThanOrEqual(2);
    expect(b.movements).toContainEqual(expect.objectContaining({ kind: "status", company: "EXP", to: "closed" }));
    expect(balance(b, "company:EXP")).toMatchObject({ before: 200, after: 0 });
  });

  it("closing a company shows the status change", () => {
    const r = recorded(TestSession.start(g1830, players));
    seedCompany(r.s, "PRR", { cell: { row: 0, col: 6 }, cash: 120, holders: { "player:p1": 6 } });
    r.s.do({ type: "closeCompany", company: "PRR" });
    expect(r.breakdown().movements).toEqual([{ kind: "status", company: "PRR", from: "floated", to: "closed" }]);
  });

  it("RotLA: a dissolution at 0 shows the closure and what the company returns", () => {
    const r = recorded(TestSession.start(rotlaGame(), makePlayers(ROTLA_NAMES.slice(0, 3))));
    seedRotla(r.s, "EXP", { price: 10, holders: { "player:p1": 3, "company:EXP": 1, pool: 1 }, treasury: 50, trains: ["train:2:1"] });
    seedRotla(r.s, "TUN", { price: 80, holders: { "player:p2": 5 } });
    r.s.do({ type: "runAndPayout", company: "EXP", parts: [{ part: "revenue", amount: 0 }], mode: "withhold" });
    const b = r.breakdown();
    expect(b.movements).toContainEqual(expect.objectContaining({ kind: "status", company: "EXP", to: "closed" }));
    expect(b.movements).toContainEqual({ kind: "asset", asset: "train:2:1", from: "company:EXP", to: "pool" });
    expect(b.movements.filter((m) => m.kind === "shares" && m.to === "removed").length).toBeGreaterThan(0);
    expect(balance(b, "company:EXP")).toMatchObject({ before: 50, after: 0 });
  });
});

/** Σ money in − Σ money out per holder, from the movements. */
function conservation(b: EntryBreakdown): Map<string, number> {
  const net = new Map<string, number>();
  for (const m of money(b)) {
    net.set(m.from, (net.get(m.from) ?? 0) - m.amount);
    net.set(m.to, (net.get(m.to) ?? 0) + m.amount);
  }
  return net;
}

describe("entryBreakdown: conservation over random games (FR-016)", () => {
  const games: [string, GameDefinition][] = [
    ["1830", g1830],
    ["1848", getBuiltInGame("1848")],
    ["21moon", getBuiltInGame("21moon")],
    ["rotla", applyOptions(getBuiltInGame("rotla"), {})],
  ];

  it.each(games)("%s: every group's money movements add up to each holder's balance change", (_id, game) => {
    const r = recorded(TestSession.start(game, makePlayers(NAMES.slice(0, 4))));
    const rand = rng(1234);
    for (let step = 0; step < 120; step++) {
      const next = [...candidates(r.s, rand), ...FLOW].find((a) => r.s.tryDo(a).kind === "ok");
      if (!next) break;
      r.s.do(next);
    }
    for (const g of r.log) {
      if (g.kind !== "group") continue;
      const b = entryBreakdown(game, r.s.players, r.log, g.id)!;
      const sums = conservation(b);
      for (const holder of new Set([...sums.keys(), ...b.balances.map((x) => x.holder)])) {
        if (holder === "bank") continue;
        expect([g.id, holder, sums.get(holder) ?? 0]).toEqual([g.id, holder, balance(b, holder as HolderRef)?.delta ?? 0]);
      }
    }
    expect(cashOf(r.s.state, "bank")).toBeDefined();
  });
});
