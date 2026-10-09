import { describe, expect, it } from "vitest";
import { unitsOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";
import { buy, sell } from "../helpers/stock";

/** 21Moon corporate round (§10). */

const g21 = getBuiltInGame("21moon");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

function cr() {
  const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
  seedCompany(s, "VH", { cell: { row: 4, col: 3 }, cash: 100, holders: { "player:p1": 2, "player:p2": 3 } }); // 80
  seedCompany(s, "SSF", { cell: { row: 3, col: 2 }, cash: 300, holders: { "player:p3": 2 } }); // 80
  return s;
}

describe("corporate round (§10)", () => {
  it("startCR moves to the CR of the current set", () => {
    const s = cr();
    expect(s.state.turn).toMatchObject({ round: "CR", srNumber: 1 });
  });

  it("§10.1.2 issuing: IPO → pool, the Bank pays the company, down 1 once however many are issued", () => {
    const s = cr().do({ type: "issueShares", company: "VH", count: 2 });
    expect(unitsOf(s.state, "pool", "VH")).toBe(2);
    expect(netMoney(s.lastEvents)).toEqual({ bank: -160, "company:VH": 160 });
    expect(eventsOf(s.lastEvents, "marketMove")).toEqual([
      { t: "marketMove", company: "VH", to: { row: 5, col: 3 }, reason: "issue" },
    ]);
  });

  it("issuing beyond the 50% pool limit warns", () => {
    const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
    seedCompany(s, "VH", { cell: { row: 2, col: 9 }, holders: { "player:p1": 2 } });
    s.do({ type: "issueShares", company: "VH", count: 5 });
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("poolLimit");
    s.do({ type: "issueShares", company: "VH", count: 1 });
    expect(s.lastWarnings.map((w) => w.code)).toContain("poolLimit");
  });

  it("a company buys another company's IPO share, paid to that company", () => {
    const s = cr().do(buy("company:SSF", "VH"));
    expect(netMoney(s.lastEvents)).toEqual({ "company:SSF": -80, "company:VH": 80 });
    expect(unitsOf(s.state, "company:SSF", "VH")).toBe(1);
  });

  it("a company buys from the pool, its own shares included, paid to the Bank", () => {
    const s = cr().do({ type: "issueShares", company: "VH", count: 1 });
    s.do(buy("company:VH", "VH", "pool"));
    expect(netMoney(s.lastEvents)).toEqual({ "company:VH": -70, bank: 70 });
  });

  it("treasury sales go to the pool and the Bank pays the company", () => {
    const s = cr().do(buy("company:SSF", "VH"));
    s.do(sell("company:SSF", "VH", 1));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -80, "company:SSF": 80 });
    expect(unitsOf(s.state, "pool", "VH")).toBe(1);
  });

  it("company buyers are only offered with corporateRound", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 2 } });
    expect(s.tryDo(buy("company:NYC", "PRR")).kind).toBe("unavailable");
  });

  it("CR actions are not offered outside 21Moon", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    expect(s.tryDo({ type: "startCR" }).kind).toBe("unavailable");
    expect(s.tryDo({ type: "issueShares", company: "PRR", count: 1 }).kind).toBe("unavailable");
  });

  describe("§10.3 end of the CR, in descending price order", () => {
    it("up 1 when 100% is held by players or companies", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
      seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "company:SSF": 4 } });
      s.do({ type: "endCR" });
      expect(s.state.companies["VH"]!.position).toEqual({ row: 3, col: 3 });
    });

    it("down 1 with shares in the pool, unless the company has not operated", () => {
      const s = cr().do({ type: "issueShares", company: "VH", count: 1 }); // now at row 5
      s.do({ type: "issueShares", company: "SSF", count: 1 }); // SSF row 3 → 4
      s.apply({ t: "counterChange", subject: "company:VH", key: "runs", delta: 1 });
      s.do({ type: "endCR" });
      expect(s.state.companies["VH"]!.position).toEqual({ row: 6, col: 3 });
      expect(s.state.companies["SSF"]!.position).toEqual({ row: 4, col: 2 });
    });

    it("companies are moved in descending price order", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
      seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 10 } }); // 80
      seedCompany(s, "SSF", { cell: { row: 4, col: 5 }, holders: { "player:p2": 10 } }); // 100
      s.do({ type: "endCR" });
      expect(eventsOf(s.lastEvents, "marketMove").map((e) => e.company)).toEqual(["SSF", "VH"]);
      expect(s.lastEvents.at(-1)).toEqual({ t: "turnAdvance", roundEnd: "CR" });
    });

    it("a second endCR is not available (feature 003)", () => {
      const s = cr().do({ type: "endCR" });
      expect(s.tryDo({ type: "endCR" })).toMatchObject({
        kind: "unavailable",
        reasonEs: "Ya se aplicó el fin de la ronda corporativa",
      });
    });

    it("endCR is only available in the CR (feature 003)", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" });
      expect(s.tryDo({ type: "endCR" })).toMatchObject({ kind: "unavailable", reasonEs: "Solo en la ronda corporativa" });
    });
  });

  describe("round transitions (feature 003, US4)", () => {
    const moves = (s: TestSession) => eventsOf(s.lastEvents, "marketMove");
    const markerAt = (s: TestSession, roundEnd: "SR" | "CR") =>
      s.lastEvents.findIndex((e) => e.t === "turnAdvance" && e.roundEnd === roundEnd);
    const roundAt = (s: TestSession, round: string) => s.lastEvents.findIndex((e) => e.t === "turnAdvance" && e.round === round);

    it("startOR from the CR applies the pool penalty, then the CR marker, then the OR start", () => {
      const s = cr().do({ type: "issueShares", company: "VH", count: 1 }); // row 5
      s.apply({ t: "counterChange", subject: "company:VH", key: "runs", delta: 1 });
      s.do({ type: "startOR" });
      expect(moves(s)).toEqual([{ t: "marketMove", company: "VH", to: { row: 6, col: 3 }, reason: "poolPenalty" }]);
      const penalty = s.lastEvents.findIndex((e) => e.t === "marketMove");
      expect(penalty).toBeLessThan(markerAt(s, "CR"));
      expect(markerAt(s, "CR")).toBeLessThan(roundAt(s, "OR"));
      expect(s.state.companies["VH"]!.position).toEqual({ row: 6, col: 3 });
    });

    it("startOR from the CR moves a company held 100% by players and companies up 1", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
      seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "company:SSF": 4 } });
      s.do({ type: "startOR" });
      expect(moves(s)).toEqual([{ t: "marketMove", company: "VH", to: { row: 3, col: 3 }, reason: "soldOut" }]);
    });

    it("startCR closes the SR: the SR marker first, then the CR, with no market move", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" });
      seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "player:p2": 4 } });
      s.do({ type: "startCR" });
      expect(s.lastEvents[0]).toEqual({ t: "turnAdvance", roundEnd: "SR" });
      expect(s.lastEvents[1]).toMatchObject({ t: "turnAdvance", round: "CR" });
      expect(moves(s)).toEqual([]);
      expect(s.state.turn.roundEnded).toBeUndefined();
    });

    it("SR → OR directly skips the CR end step (FR-011)", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" });
      seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "player:p2": 4 } });
      seedCompany(s, "SSF", { cell: { row: 3, col: 2 }, holders: { "player:p3": 2, pool: 2 } });
      s.apply({ t: "counterChange", subject: "company:SSF", key: "runs", delta: 1 });
      s.do({ type: "startOR" });
      expect(moves(s).filter((e) => e.reason === "soldOut" || e.reason === "poolPenalty")).toEqual([]);
      expect(markerAt(s, "SR")).toBe(0);
      expect(markerAt(s, "CR")).toBe(-1);
    });

    it("startSR from the CR applies the CR end step first", () => {
      const s = TestSession.start(g21, players).do({ type: "startSR" }).do({ type: "startCR" });
      seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "company:SSF": 4 } });
      s.do({ type: "startSR" });
      expect(moves(s)).toEqual([{ t: "marketMove", company: "VH", to: { row: 3, col: 3 }, reason: "soldOut" }]);
      expect(markerAt(s, "CR")).toBeGreaterThan(0);
      expect(markerAt(s, "CR")).toBeLessThan(roundAt(s, "SR"));
    });
  });
});
