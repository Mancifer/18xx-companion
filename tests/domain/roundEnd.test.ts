import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { getBuiltInGame } from "../../src/domain/games";
import { pendingCapitalEvents } from "../../src/domain/mechanics/capitalization";
import { endOfRoundMoves, roundEndEvents } from "../../src/domain/mechanics/roundEnd";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";

/** Feature 003: the end step of the current round (data-model §3). */

const g1830 = getBuiltInGame("1830");
const g21 = getBuiltInGame("21moon");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

/** 1830 SR with NYC floated during the SR (capital pending) and PRR sold out to players. */
function srWithEndStep() {
  const s = TestSession.start(g1830, players)
    .do({ type: "startSR" })
    .do({ type: "parCompany", player: "p1", company: "NYC", price: 82 })
    .do({ type: "buyShare", buyer: "player:p2", company: "NYC", source: "ipo", count: 2 })
    .do({ type: "buyShare", buyer: "player:p3", company: "NYC", source: "ipo", count: 2 });
  seedCompany(s, "PRR", { cell: { row: 2, col: 6 }, holders: { "player:p1": 6, "player:p4": 4 } });
  return s;
}

describe("roundEndEvents", () => {
  it("SR: pending capital, then the end-of-SR moves, then the SR marker last", () => {
    const s = srWithEndStep();
    const events = roundEndEvents(g1830, s.state);
    const capital = pendingCapitalEvents(g1830, s.state);
    const moves = endOfRoundMoves(g1830, s.state, "endSR");
    expect(capital.length).toBeGreaterThan(0);
    expect(moves.length).toBeGreaterThan(0);
    expect(events).toEqual([...capital, ...moves, { t: "turnAdvance", roundEnd: "SR" }]);
  });

  it("21Moon CR: the end-of-CR moves, then the CR marker", () => {
    const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "company:SSF": 4 } });
    const moves = endOfRoundMoves(g21, s.state, "endCR");
    expect(moves.length).toBe(1);
    expect(roundEndEvents(g21, s.state)).toEqual([...moves, { t: "turnAdvance", roundEnd: "CR" }]);
  });

  it("OR and PRIVATES have no end step", () => {
    const s = TestSession.start(g1830, players);
    expect(s.state.turn.round).toBe("PRIVATES");
    expect(roundEndEvents(g1830, s.state)).toEqual([]);
    s.do({ type: "startOR" });
    expect(s.state.turn.round).toBe("OR");
    expect(roundEndEvents(g1830, s.state)).toEqual([]);
  });

  it("returns nothing once the round's end step was applied", () => {
    const s = srWithEndStep();
    s.apply(...roundEndEvents(g1830, s.state));
    expect(s.state.turn.roundEnded).toBe(true);
    expect(roundEndEvents(g1830, s.state)).toEqual([]);
  });

  it("an SR with nothing owed and nothing sold out returns only the marker", () => {
    const s = TestSession.start(g1830, players).do({ type: "startSR" });
    expect(roundEndEvents(g1830, s.state)).toEqual([{ t: "turnAdvance", roundEnd: "SR" }]);
  });
});

describe("at most once per round (US2, FR-006)", () => {
  const all = (s: TestSession) => s.groups.flatMap((g) => g.events);
  const soldOutMoves = (events: readonly PrimitiveEvent[]) =>
    eventsOf(events, "marketMove").filter((e) => e.reason === "soldOut");
  const capitalPaid = (events: readonly PrimitiveEvent[]) =>
    eventsOf(events, "moneyTransfer").filter((e) => e.from === "bank" && e.to === "company:NYC");

  it("endSR then startOR applies the step once", () => {
    const s = srWithEndStep().do({ type: "endSR" }).do({ type: "startOR" });
    expect(soldOutMoves(s.lastEvents)).toEqual([]);
    expect(capitalPaid(s.lastEvents)).toEqual([]);
    expect(soldOutMoves(all(s))).toHaveLength(1);
    expect(capitalPaid(all(s))).toHaveLength(1);
    expect(s.violations()).toEqual([]);
  });

  it("a second endSR is not available", () => {
    const s = srWithEndStep().do({ type: "endSR" });
    expect(s.tryDo({ type: "endSR" })).toMatchObject({
      kind: "unavailable",
      reasonEs: "Ya se aplicó el fin de la ronda de acciones",
    });
  });

  it("endSR is only available in the SR", () => {
    const s = srWithEndStep().do({ type: "startOR" });
    expect(s.tryDo({ type: "endSR" })).toMatchObject({ kind: "unavailable", reasonEs: "Solo en la ronda de acciones" });
  });

  it("a log from before the change (endSR with no marker) is not applied again", () => {
    const s = srWithEndStep();
    s.apply(...pendingCapitalEvents(g1830, s.state));
    s.apply(...endOfRoundMoves(g1830, s.state, "endSR"));
    const prr = s.state.companies["PRR"]!.position;
    const nyc = cashOf(s.state, "company:NYC");
    s.do({ type: "startOR" });
    expect(soldOutMoves(s.lastEvents)).toEqual([]);
    expect(capitalPaid(s.lastEvents)).toEqual([]);
    expect(s.state.companies["PRR"]!.position).toEqual(prr);
    expect(cashOf(s.state, "company:NYC")).toBe(nyc);
  });

  it("a late SR purchase after endSR that completes a sell-out does not move the price at startOR", () => {
    const s = TestSession.start(g1830, players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 2, col: 6 }, par: 82, holders: { "player:p1": 6, "player:p2": 3 } });
    s.do({ type: "endSR" });
    s.do({ type: "buyShare", buyer: "player:p3", company: "PRR", source: "ipo", count: 1 });
    s.do({ type: "startOR" });
    expect(soldOutMoves(all(s))).toEqual([]);
  });
});
