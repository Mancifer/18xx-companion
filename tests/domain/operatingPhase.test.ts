import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import type { EffectiveGroup } from "../../src/domain/ledger/effectiveLog";
import { operatingPhase, type OperatingPhase, type PlayerSettlement } from "../../src/domain/ledger/operatingPhase";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";
import { seedCompany } from "../helpers/seed";

/** Feature 012: the operating phase and each player's settlement (contracts/operating-phase.md). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const next = { type: "nextCompany" } as const;
const pay = (company: string, amount: number) => ({ type: "runAndPayout", company, parts: [{ part: "revenue", amount }], mode: "full" });

const phaseOf = (s: TestSession) => operatingPhase(s.game, s.players, s.groups, s.state);

/** What undoing the newest entries back to here would leave: the groups and state as they are now. */
function mark(s: TestSession) {
  const groups = [...s.groups];
  const state = s.state;
  return () => operatingPhase(s.game, s.players, groups, state);
}

const settlement = (phase: OperatingPhase | null, player: string): PlayerSettlement => {
  const found = phase?.players.find((p) => p.player === player);
  if (!found) throw new Error(`no settlement for ${player}`);
  return found;
};

/** 1830 in SR 1: Ana presides PRR (60%), Bruno presides NYC (60%). */
function withTwo() {
  const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
  seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
  seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
  return s;
}

const lastGroup = (s: TestSession): EffectiveGroup => {
  const g = s.groups.at(-1);
  if (!g) throw new Error("no groups");
  return g;
};

describe("where the operating phase starts and ends (R1, G3–G5)", () => {
  it("is null before the first OR", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    expect(phaseOf(s)).toBeNull();
    s.do({ type: "startSR" });
    expect(phaseOf(s)).toBeNull();
  });

  it("opens at startOR, with the first OR and the opening group", () => {
    const s = withTwo().do({ type: "startOR" });
    const phase = phaseOf(s);
    expect(phase).not.toBeNull();
    expect(phase?.firstOR).toEqual({ orSet: 1, orIndex: 1 });
    expect(phase?.startGroupId).toBe(lastGroup(s).id);
  });

  it("stays the same phase when nextCompany starts the next OR of the set", () => {
    const s = withTwo().do({ type: "setPhase", phase: "3" }).do({ type: "startOR" });
    const start = lastGroup(s).id;
    expect(s.state.turn.orsInSet).toBe(2);
    s.do(pay("PRR", 100)).do(next).do(pay("NYC", 100)).do(next);
    expect(s.state.turn.orIndex).toBe(2);
    expect(phaseOf(s)?.startGroupId).toBe(start);
    expect(phaseOf(s)?.firstOR).toEqual({ orSet: 1, orIndex: 1 });
  });

  it("keeps back-to-back sets in one phase (G4)", () => {
    const s = withTwo().do({ type: "startOR" });
    const start = lastGroup(s).id;
    s.do(next).do(next);
    expect(s.state.turn.currentCompany).toBeUndefined();
    s.do({ type: "startOR" });
    expect(s.state.turn.orSet).toBe(2);
    expect(phaseOf(s)?.startGroupId).toBe(start);
  });

  it("closes when the SR starts (G3)", () => {
    const s = withTwo().do({ type: "startOR" }).do(next).do(next).do({ type: "startSR" });
    expect(phaseOf(s)).toBeNull();
  });

  it("comes back when the SR start is undone, and goes when the OR start is undone (G5)", () => {
    const s = withTwo();
    const beforeOR = mark(s);
    s.do({ type: "startOR" });
    const start = lastGroup(s).id;
    s.do(next).do(next);
    const beforeSR = mark(s);
    s.do({ type: "startSR" });
    expect(phaseOf(s)).toBeNull();
    expect(beforeSR()?.startGroupId).toBe(start);
    expect(beforeOR()).toBeNull();
  });
});

describe("each player's amount (R2, G1)", () => {
  it("a payout: the president's delta, start cash and current cash agree", () => {
    const s = withTwo().do({ type: "startOR" });
    const anaBefore = cashOf(s.state, "player:p1");
    s.do(pay("PRR", 100));
    const ana = settlement(phaseOf(s), "p1");
    expect(ana.delta).toBe(60);
    expect(ana.startCash).toBe(anaBefore);
    expect(ana.cash).toBe(cashOf(s.state, "player:p1"));
    expect(ana.startCash + ana.delta).toBe(ana.cash);
  });

  it("private income adds each private's income to its owner", () => {
    const s = withTwo();
    s.apply({ t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p3" });
    s.apply({ t: "assetTransfer", asset: "private:CS", from: "bank", to: "player:p3" });
    s.do({ type: "startOR" }).do({ type: "privateIncome" });
    expect(settlement(phaseOf(s), "p3").delta).toBe(15);
  });

  it("a player with no change has delta 0 and no movements", () => {
    const s = withTwo().do({ type: "startOR" }).do(pay("PRR", 100));
    const dani = settlement(phaseOf(s), "p4");
    expect(dani.delta).toBe(0);
    expect(dani.movements).toEqual([]);
  });

  it("movements add up to the delta for every player (G1)", () => {
    const s = withTwo().do({ type: "startOR" }).do(pay("PRR", 100)).do(next).do(pay("NYC", 80));
    s.do({ type: "transferMoney", from: "player:p1", to: "player:p2", amount: 25 });
    for (const p of phaseOf(s)?.players ?? []) {
      expect(p.movements.reduce((t, m) => t + m.amount, 0)).toBe(p.delta);
    }
  });

  it("an undone payout drops out", () => {
    const s = withTwo().do({ type: "startOR" });
    const beforePayout = mark(s);
    s.do(pay("PRR", 100));
    expect(settlement(beforePayout(), "p1").delta).toBe(0);
  });

  it("money moved in the SR before the OR is outside the phase", () => {
    const s = withTwo().do({ type: "buyShare", buyer: "player:p3", company: "PRR", source: "ipo", count: 1 });
    s.do({ type: "startOR" });
    expect(settlement(phaseOf(s), "p3").delta).toBe(0);
  });
});

describe("US1: settling after an operating phase of two ORs", () => {
  it("each player's amount is their cash now minus their cash when OR 1.1 started", () => {
    const s = withTwo();
    s.apply({ t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p3" });
    s.apply({ t: "assetTransfer", asset: "private:CS", from: "bank", to: "player:p1" });
    s.do({ type: "setPhase", phase: "3" }).do({ type: "startOR" });
    const atStart = s.state;
    s.do({ type: "privateIncome" }).do(pay("PRR", 100)).do(next).do(pay("NYC", 70)).do(next);
    expect(s.state.turn.orIndex).toBe(2);
    s.do({ type: "privateIncome" }).do(pay("PRR", 150)).do(next).do(pay("NYC", 90)).do(next);
    const phase = phaseOf(s);
    expect(phase?.over).toBe(true);
    for (const p of players) {
      const ref = `player:${p.id}` as const;
      expect(settlement(phase, p.id).delta).toBe(cashOf(s.state, ref) - cashOf(atStart, ref));
    }
    expect(settlement(phase, "p1").delta).toBe(60 + 90 + 2 * 10);
    expect(settlement(phase, "p3").delta).toBe(2 * 5);
  });
});

describe("US2: everything that changes a player's cash counts", () => {
  it("a president who earned 120 and put 220 into a company pays 100 to the bank", () => {
    const s = withTwo().do({ type: "startOR" }).do(pay("PRR", 200));
    expect(settlement(phaseOf(s), "p1").delta).toBe(120);
    s.do({ type: "transferMoney", from: "player:p1", to: "company:PRR", amount: 220 });
    const ana = settlement(phaseOf(s), "p1");
    expect(ana.delta).toBe(-100);
    expect(ana.movements.map((m) => m.amount)).toEqual([120, -220]);
  });

  it("a forced train purchase is one movement with the group's net for the president", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 6, "player:p2": 4 }, treasury: 150 });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p2": 2, "player:p1": 3 }, operated: true });
    s.do({ type: "startOR" });
    s.do({ type: "forcedTrainPurchase", company: "CON", trainType: "4", variant: null, from: "bank", sales: [{ company: "EXP", count: 2 }] });
    const ana = settlement(phaseOf(s), "p1");
    expect(ana.movements).toHaveLength(1);
    expect(ana.movements[0]?.amount).toBe(netMoney(s.lastEvents)["player:p1"]);
    expect(ana.delta).toBe(netMoney(s.lastEvents)["player:p1"]);
  });

  it("a share sale during the OR adds the sale money", () => {
    const s = withTwo();
    seedCompany(s, "B&O", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6, "player:p3": 2 } });
    s.do({ type: "startOR" });
    const before = cashOf(s.state, "player:p3");
    s.do({ type: "sellShares", seller: "player:p3", company: "B&O", count: 1 });
    const gained = cashOf(s.state, "player:p3") - before;
    expect(gained).toBeGreaterThan(0);
    expect(settlement(phaseOf(s), "p3").delta).toBe(gained);
  });

  it("money between two players moves both amounts by opposite amounts", () => {
    const s = withTwo().do({ type: "startOR" });
    s.do({ type: "transferMoney", from: "player:p3", to: "player:p4", amount: 40 });
    expect(settlement(phaseOf(s), "p3").delta).toBe(-40);
    expect(settlement(phaseOf(s), "p4").delta).toBe(40);
  });

  it("a player who goes bankrupt mid-phase is out (FR-012)", () => {
    const s = withTwo().do({ type: "startOR" }).do({ type: "declareBankruptcy", player: "p4", company: null });
    expect(settlement(phaseOf(s), "p4").out).toBe(true);
    expect(settlement(phaseOf(s), "p3").out).toBe(false);
  });
});

describe("US3: movements by OR (R3, R4)", () => {
  it("each movement carries the OR it happened in, in log order", () => {
    const s = withTwo().do({ type: "setPhase", phase: "3" }).do({ type: "startOR" });
    s.do(pay("PRR", 100)).do(next).do(next);
    expect(s.state.turn.orIndex).toBe(2);
    s.do(pay("PRR", 50));
    const ana = settlement(phaseOf(s), "p1");
    expect(ana.movements.map((m) => [m.or, m.amount])).toEqual([
      [{ orSet: 1, orIndex: 1 }, 60],
      [{ orSet: 1, orIndex: 2 }, 30],
    ]);
    const seqs = ana.movements.map((m) => m.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it("a voice compound is one movement per player, with the compound action", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6, "player:p2": 2 }, cash: 200 });
    s.do({ type: "startOR" });
    const buy = { type: "buyTrain", company: "PRR", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null };
    s.do({ type: "compound", actions: [buy, pay("PRR", 100)] });
    const group = lastGroup(s);
    const ana = settlement(phaseOf(s), "p1");
    const bruno = settlement(phaseOf(s), "p2");
    expect(ana.movements).toEqual([expect.objectContaining({ groupId: group.id, amount: 60 })]);
    expect(ana.movements[0]?.action.type).toBe("compound");
    expect(bruno.movements).toEqual([expect.objectContaining({ groupId: group.id, amount: 20 })]);
  });
});

describe("US4: when the phase is over, and what closes it (FR-008, FR-010)", () => {
  it("1830: not over while a company operates; over once the set's last company finishes", () => {
    const s = withTwo().do({ type: "startOR" });
    expect(phaseOf(s)?.over).toBe(false);
    s.do(next);
    expect(phaseOf(s)?.over).toBe(false);
    s.do(next);
    expect(phaseOf(s)?.over).toBe(true);
  });

  it("RotLA: between RO 1 and RO 2 it is not over; after RO 2 it is", () => {
    const s = rotlaSession().do({ type: "startOR" });
    expect(s.state.turn.orsInSet).toBe(2);
    expect(s.state.turn.currentCompany).toBeUndefined();
    expect(phaseOf(s)?.over).toBe(false);
    s.do({ type: "startOR" });
    expect(s.state.turn.orIndex).toBe(2);
    expect(phaseOf(s)?.over).toBe(true);
  });

  it("21Moon: the CR before the ORs is outside, and the next SR closes the phase", () => {
    const s = TestSession.start(getBuiltInGame("21moon"), players).do({ type: "startSR" }).do({ type: "startCR" });
    expect(phaseOf(s)).toBeNull();
    s.do({ type: "startOR" });
    expect(phaseOf(s)).not.toBeNull();
    s.do({ type: "startSR" });
    expect(phaseOf(s)).toBeNull();
  });

  it("RotLA: the merger round closes it", () => {
    // As atOR2("green") in cycles.test.ts: RO 2 done in the green phase, so the MR is due.
    const s = rotlaSession();
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 5 } });
    seedRotla(s, "TUN", { price: 90, holders: { "player:p2": 5 } });
    seedRotla(s, "CON", { price: 100, holders: { "player:p3": 10 } });
    s.do({ type: "startOR" }).do({ type: "startOR" });
    s.apply({ t: "turnAdvance", phase: "green" });
    // A seeded company still has its RO 2 turn, so the phase is open but not over.
    expect(phaseOf(s)).not.toBeNull();
    s.do({ type: "startMR" });
    expect(s.state.turn.round).toBe("MR");
    expect(phaseOf(s)).toBeNull();
  });
});

describe("a phase that opens inside a group", () => {
  it("counts only the money after the opening turnAdvance", () => {
    const s = withTwo();
    const game = s.game;
    const groups: EffectiveGroup[] = [
      ...s.groups,
      {
        id: "crafted",
        seq: s.groups.length + 1,
        at: "2026-10-15T20:00:00.000Z",
        source: "touch",
        action: { type: "startOR" },
        events: [
          { t: "moneyTransfer", from: "player:p1", to: "bank", amount: 10 },
          { t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1, orsInSet: 1, company: null },
          { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 7 },
        ],
        touches: [],
      },
    ];
    const phase = operatingPhase(game, s.players, groups, s.state);
    expect(phase?.startGroupId).toBe("crafted");
    const ana = settlement(phase, "p1");
    expect(ana.delta).toBe(7);
    expect(ana.movements).toEqual([expect.objectContaining({ groupId: "crafted", amount: 7, or: { orSet: 1, orIndex: 1 } })]);
  });
});
