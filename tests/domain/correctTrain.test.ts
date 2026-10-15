import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { cashOf } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { trainStack } from "../../src/domain/mechanics/phases";
import type { AssetId } from "../../src/domain/types";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedEvents } from "../helpers/seed";
import { makeMeta } from "../helpers/session";

/** Feature 011, US3: the correctTrain action (contracts/actions.md, data-model §1). */

const g1830 = getBuiltInGame("1830");
const g1848 = getBuiltInGame("1848");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

type Correct = { company?: string; train: string; op: "remove" | "add"; to?: "bank" | "pool" | "removed" | null; amount?: number | null };
const correct = ({ company = "PRR", train, op, to = null, amount = null }: Correct) => ({ type: "correctTrain", company, train, op, to, amount });

function moneyTotal(s: TestSession): number {
  const holders = ["bank", ...s.players.map((p) => `player:${p.id}`), ...s.game.companies.map((c) => `company:${c.id}`)] as const;
  return holders.reduce((sum, h) => sum + cashOf(s.state, h as never), 0);
}

/** A session in OR 1.1 with PRR floated, $1000 in the treasury and the given trains. */
function withPRR(trains: AssetId[] = ["train:2:1", "train:2:2"], game: GameDefinition = g1830): TestSession {
  const company = game.id === "1848" ? "QR" : "PRR";
  const s = TestSession.start(game, players).do({ type: "startSR" });
  s.apply(...seedEvents(company, { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 }, cash: 1000, trains }));
  return s.do({ type: "startOR" });
}

/** Runs the action, checks the invariants and the money total (SC-007), returns its events. */
function run(s: TestSession, action: unknown): readonly PrimitiveEvent[] {
  const before = moneyTotal(s);
  s.do(action);
  expect(s.violations()).toEqual([]);
  expect(moneyTotal(s)).toBe(before);
  return s.lastEvents;
}

const reason = (s: TestSession, action: unknown) => {
  const r = s.tryDo(action);
  return r.kind === "unavailable" ? r.reasonEs : r.kind;
};
const codes = (s: TestSession) => s.lastWarnings.map((w) => w.code);

describe("correctTrain expansion", () => {
  it("remove → bank with the default refund: the latest 2 goes back and the list price is refunded", () => {
    const s = withPRR();
    expect(run(s, correct({ train: "2", op: "remove", to: "bank" }))).toEqual([
      { t: "assetTransfer", asset: "train:2:2", from: "company:PRR", to: "bank" },
      { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 80 },
    ]);
  });

  it("remove → bank with amount 0 refunds nothing; with 50, refunds 50", () => {
    const none = withPRR();
    expect(run(none, correct({ train: "2", op: "remove", to: "bank", amount: 0 })).filter((e) => e.t === "moneyTransfer")).toEqual([]);
    const fifty = withPRR();
    expect(run(fifty, correct({ train: "2", op: "remove", to: "bank", amount: 50 }))).toContainEqual({
      t: "moneyTransfer",
      from: "bank",
      to: "company:PRR",
      amount: 50,
    });
  });

  it("remove → removed and → pool move no money by default", () => {
    const removed = withPRR();
    expect(run(removed, correct({ train: "2", op: "remove", to: "removed" }))).toEqual([
      { t: "assetTransfer", asset: "train:2:2", from: "company:PRR", to: "removed" },
    ]);
    const pool = withPRR();
    expect(run(pool, correct({ train: "2", op: "remove", to: "pool" }))).toEqual([
      { t: "assetTransfer", asset: "train:2:2", from: "company:PRR", to: "pool" },
    ]);
  });

  it("remove → pool with an amount records it, with the refundOffSupply warning", () => {
    const s = withPRR();
    expect(run(s, correct({ train: "2", op: "remove", to: "pool", amount: 30 }))).toContainEqual({
      t: "moneyTransfer",
      from: "bank",
      to: "company:PRR",
      amount: 30,
    });
    expect(codes(s)).toContain("refundOffSupply");
  });

  it("an asset id picks that train", () => {
    const s = withPRR();
    expect(run(s, correct({ train: "train:2:1", op: "remove", to: "removed" }))[0]).toMatchObject({ asset: "train:2:1" });
  });

  it("removing a rusted kept train clears its rusted counter", () => {
    const s = withPRR();
    s.apply({ t: "counterChange", subject: "company:PRR", key: "rusted:train:2:1", delta: 1 });
    expect(run(s, correct({ train: "train:2:1", op: "remove", to: "removed" }))).toContainEqual({
      t: "counterChange",
      subject: "company:PRR",
      key: "rusted:train:2:1",
      delta: -1,
    });
  });

  it("add takes the bank's lowest-numbered train of the type, with no money by default", () => {
    const s = withPRR([]);
    expect(run(s, correct({ train: "2", op: "add" }))).toEqual([{ t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:PRR" }]);
  });

  it("add with an amount: the company pays the bank", () => {
    const s = withPRR([]);
    expect(run(s, correct({ train: "2", op: "add", amount: 80 }))).toContainEqual({ t: "moneyTransfer", from: "company:PRR", to: "bank", amount: 80 });
  });

  it("add of an unlimited type mints the next number (1848 2E)", () => {
    const s = withPRR([], g1848);
    expect(run(s, correct({ company: "QR", train: "2E", op: "add" }))).toEqual([
      { t: "assetTransfer", asset: "train:2E:1", from: "bank", to: "company:QR" },
    ]);
  });
});

describe("correctTrain and the supply order (FR-013)", () => {
  it("after a mistaken purchase is returned, the stack is back and the next purchase takes that train", () => {
    const s = withPRR(["train:2:1"]);
    const stack = () => trainStack(s.game, s.state).find((e) => e.type === "2")?.left;
    const before = stack();
    const cash = cashOf(s.state, "company:PRR");
    run(s, { type: "buyTrain", company: "PRR", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    run(s, correct({ train: "2", op: "remove", to: "bank" }));
    expect(stack()).toBe(before);
    expect(cashOf(s.state, "company:PRR")).toBe(cash);
    s.do({ type: "buyTrain", company: "PRR", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    expect(s.lastEvents).toContainEqual({ t: "assetTransfer", asset: "train:2:2", from: "bank", to: "company:PRR" });
  });
});

describe("correctTrain availability", () => {
  it("a train the company does not hold", () => {
    expect(reason(withPRR(), correct({ train: "3", op: "remove", to: "bank" }))).toBe("La compañía no tiene ese tren");
  });

  it("remove with no destination, add with one", () => {
    expect(reason(withPRR(), correct({ train: "2", op: "remove", to: null }))).toBe("Falta a dónde va el tren");
    expect(reason(withPRR(), correct({ train: "2", op: "add", to: "bank" }))).toBe("Al dar un tren no hay destino");
  });

  it("add with an empty supply", () => {
    const s = withPRR([]);
    s.apply(...[1, 2, 3, 4, 5, 6].map((n) => ({ t: "assetTransfer" as const, asset: `train:2:${n}`, from: "bank" as const, to: "removed" as const })));
    expect(reason(s, correct({ train: "2", op: "add" }))).toBe("No quedan trenes 2 en la oferta");
  });

  it("the pool in a game whose discarded trains leave the game (1848)", () => {
    const s = withPRR(["train:2:1"], g1848);
    expect(reason(s, correct({ company: "QR", train: "2", op: "remove", to: "pool" }))).toBe("En este juego los trenes no van al pool");
  });
});

describe("correctTrain warnings (never blocking)", () => {
  const buy = (trainType: string) => ({ type: "buyTrain", company: "PRR", trainType, variant: null, from: "bank", seller: null, price: null, tradeIn: null });

  it("phaseStarter: removing the train that started the phase; the phase and the rusting stay (FR-016)", () => {
    const s = withPRR(["train:2:1"]);
    s.do(buy("3")).do(buy("4"));
    expect(s.state.turn.phase).toBe("4");
    expect(s.state.assets["train:2:1"]).toBe("removed");
    run(s, correct({ train: "4", op: "remove", to: "bank" }));
    expect(codes(s)).toContain("phaseStarter");
    expect(s.state.turn.phase).toBe("4");
    expect(s.state.assets["train:2:1"]).toBe("removed");
  });

  it("notOnSale: returning a type whose rusting phase has been reached; none for a type that never rusts", () => {
    const s = withPRR(["train:2:1", "train:5:1"]);
    s.apply({ t: "turnAdvance", phase: "4" });
    run(s, correct({ train: "2", op: "remove", to: "bank" }));
    expect(codes(s)).toContain("notOnSale");
    expect(s.lastWarnings.find((w) => w.code === "notOnSale")?.messageEs).toBe("El 2 ya no se vende en esta fase.");
    run(s, correct({ train: "5", op: "remove", to: "bank" }));
    expect(codes(s)).not.toContain("notOnSale");
  });

  it("bankBroken: a refund larger than a finite bank", () => {
    const s = withPRR();
    s.apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: cashOf(s.state, "bank") - 10 });
    run(s, correct({ train: "2", op: "remove", to: "bank" }));
    expect(codes(s)).toContain("bankBroken");
  });

  it("insufficientCash: a payment larger than the treasury", () => {
    const s = withPRR([]);
    run(s, correct({ train: "2", op: "add", amount: 2000 }));
    expect(codes(s)).toContain("insufficientCash");
  });
});

describe("correctTrain undo (US3-6)", () => {
  it("undoLast restores the earlier state", async () => {
    const created = TestSession.start(g1830, players);
    const group = (seq: number, action: unknown, events: readonly PrimitiveEvent[]): LogEntry => ({
      kind: "group",
      seq,
      id: `g${seq}`,
      at: "2026-10-12T20:00:00.000Z",
      source: "system",
      action: action as never,
      events,
      touches: [],
      warnings: [],
    });
    const log: LogEntry[] = [
      group(1, { type: "createSession", players, walletMode: "appTruth" }, created.lastEvents),
      group(2, { type: "note", text: "seed" }, seedEvents("PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 }, cash: 500, trains: ["train:2:1"] })),
    ];
    const store = new SessionStore({ appendEntry: () => Promise.resolve() }, makeMeta({ game: g1830, players }), log);
    const before = store.getSnapshot().state;
    const done = await store.dispatch(correct({ train: "2", op: "remove", to: "bank" }));
    expect(done.ok).toBe(true);
    expect(store.getSnapshot().state).not.toEqual(before);
    expect((await store.undoLast()).ok).toBe(true);
    expect(store.getSnapshot().state).toEqual(before);
  });
});
