import { describe, expect, it } from "vitest";
import { cashOf, counterOf, unitsOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import { endTriggers } from "../../src/domain/mechanics/endTriggers";
import { operatingOrder } from "../../src/domain/mechanics/operatingOrder";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** Dissolution at 0 and player bankruptcy (US9, research R15, B p.11, p.17). */

const withhold = (company: string, amount = 0) => ({ type: "runAndPayout", company, parts: [{ part: "revenue", amount }], mode: "withhold" });

describe("dissolution when the price reaches 0", () => {
  function at10() {
    const s = rotlaSession();
    seedCompany(s, "EXP", { price: 10, holders: { "player:p1": 3, "company:EXP": 1, pool: 1 }, treasury: 50, trains: ["train:2:1"] });
    seedCompany(s, "TUN", { price: 80, holders: { "player:p2": 5 } });
    return s;
  }

  it("a withhold at 10 dissolves the company in the same group", () => {
    const s = at10().do(withhold("EXP"));
    expect(unitsOf(s.state, "removed", "EXP")).toBe(5);
    expect(cashOf(s.state, "company:EXP")).toBe(0);
    expect(s.state.assets["train:2:1"]).toBe("pool");
    expect(s.state.companies["EXP"]!.status).toBe("closed");
    expect(operatingOrder(s.game, s.state)).toEqual(["TUN"]);
    expect(endTriggers(s.game, s.state)).toEqual([]);
    expect(s.violations()).toEqual([]);
  });

  it("the same happens when a forced purchase's sale takes the price to 0", () => {
    const s = rotlaSession();
    seedCompany(s, "CON", { price: 100, holders: { "player:p1": 6, "player:p2": 4 }, treasury: 50 });
    seedCompany(s, "EXP", { price: 10, holders: { "player:p1": 3, "player:p3": 2 }, operated: true });
    s.do({ type: "forcedTrainPurchase", company: "CON", trainType: "2", variant: null, from: "bank", sales: [{ company: "EXP", count: 1 }] });
    expect(s.state.companies["EXP"]!.status).toBe("closed");
    expect(unitsOf(s.state, "removed", "EXP")).toBe(5);
    expect(s.violations()).toEqual([]);
  });
});

describe("player bankruptcy: liquidatePresided", () => {
  /** Carla presides CON (at 100) and EXP (at 80), holds a TUN share (Ana presides), and has 70. */
  function carlaBroke() {
    const s = rotlaSession();
    seedCompany(s, "CON", { price: 100, holders: { "player:p3": 4, "player:p1": 3, "player:p2": 2, pool: 1 }, treasury: 120, trains: ["train:3:1"] });
    seedCompany(s, "EXP", { price: 80, holders: { "player:p3": 2, "player:p2": 1, "company:EXP": 2 }, treasury: 30 });
    seedCompany(s, "TUN", { price: 70, holders: { "player:p1": 3, "player:p3": 1, "company:TUN": 1 } });
    s.apply({ t: "moneyTransfer", from: "player:p3", to: "bank", amount: 230 });
    return s;
  }

  it("one group: other holders paid, the presided companies close, then the rest goes as before", () => {
    const s = carlaBroke().do({ type: "declareBankruptcy", player: "p3", company: null });
    const net = netMoney(s.lastEvents);
    // CON: Ana 3 × 100, Bruno 2 × 100; EXP: Bruno 1 × 80. Pool and treasury shares are not paid.
    expect(net["player:p1"]).toBe(300);
    expect(net["player:p2"]).toBe(280);
    for (const c of ["CON", "EXP"]) {
      expect(s.state.companies[c]!.status).toBe("closed");
      expect(unitsOf(s.state, "removed", c)).toBe(s.state.companies[c]!.shareCount);
      expect(cashOf(s.state, `company:${c}`)).toBe(0);
    }
    expect(s.state.assets["train:3:1"]).toBe("pool");
    // The TUN share goes to the pool, with no payment and no price move.
    expect(unitsOf(s.state, "pool", "TUN")).toBe(1);
    expect(eventsOf(s.lastEvents, "marketMove").filter((e) => e.company === "TUN")).toEqual([]);
    expect(cashOf(s.state, "player:p3")).toBe(0);
    expect(counterOf(s.state, "player:p3", "bankrupt")).toBe(1);
    expect(s.violations()).toEqual([]);
  });

  it("one undo restores everything", () => {
    const s = carlaBroke();
    const AT = "2026-10-09T20:00:00.000Z";
    const before = s.state;
    s.do({ type: "declareBankruptcy", player: "p3", company: null });
    const g = s.groups.at(-1)!;
    const entry: GroupEntry = { kind: "group", seq: 1, id: "g1", at: AT, source: "touch", action: g.action, events: g.events, touches: [], warnings: [] };
    const log: LogEntry[] = [entry, { kind: "revert", seq: 2, at: AT, groupId: "g1" }];
    const start = replay(s.game, s.players, []).state;
    expect(replay(s.game, s.players, log).state).toEqual(start);
    expect(before).not.toEqual(s.state);
  });

  it("naming an eliminated player warns, never blocks", () => {
    const s = carlaBroke().do({ type: "declareBankruptcy", player: "p3", company: null });
    const launch = s.tryDo({ type: "launchCompany", player: "p3", company: "ADP", bid: 120, price: null });
    expect(launch.kind === "ok" && launch.warnings.map((w) => w.code)).toContain("eliminatedPlayer");
    const buy = s.tryDo({ type: "buyShare", buyer: "player:p3", company: "TUN", source: "pool", count: 1 });
    expect(buy.kind === "ok" && buy.warnings.map((w) => w.code)).toContain("eliminatedPlayer");
  });

  it("with Bank Break, the bankruptcy ends the game", () => {
    const s = rotlaSession({ options: { bankBreak: "on" } });
    seedCompany(s, "CON", { price: 100, holders: { "player:p3": 10 } });
    s.do({ type: "declareBankruptcy", player: "p3", company: null });
    expect(endTriggers(s.game, s.state).map((t) => t.type)).toContain("bankruptcy");
  });

  it("21Moon player bankruptcy is unchanged: shares to the pool, nothing liquidated", () => {
    const s = TestSession.start(getBuiltInGame("21moon"), makePlayers(["Ana", "Bruno", "Carla"]));
    s.apply(
      { t: "companyStatus", company: "VH", status: "floated" },
      { t: "shareTransfer", company: "VH", from: "ipo:VH", to: "player:p1", units: 2, presidency: true },
      { t: "shareTransfer", company: "VH", from: "ipo:VH", to: "player:p2", units: 1 },
    );
    s.do({ type: "declareBankruptcy", player: "p1", company: null });
    expect(unitsOf(s.state, "pool", "VH")).toBe(2);
    expect(s.state.companies["VH"]!.status).toBe("floated");
    expect(netMoney(s.lastEvents)["player:p2"]).toBeUndefined();
  });
});
