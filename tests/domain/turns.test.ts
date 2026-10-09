import { describe, expect, it } from "vitest";
import { counterOf, hasOperated } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { roundLabel } from "../../src/domain/i18n/es";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";

/** US7: rounds, operating order and manual turn overrides (FR-050, FR-051, FR-052). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = (id: string) => TestSession.start(getBuiltInGame(id), players);
const next = { type: "nextCompany" } as const;

function withTwo(id = "1830") {
  const s = start(id).do({ type: "startSR" });
  seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
  seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
  return s;
}

describe("round labels", () => {
  it("SR n, CR n, OR n.m and the initial private sale", () => {
    const s = start("21moon");
    expect(roundLabel(s.state.turn)).toBe("Privadas");
    s.do({ type: "startSR" });
    expect(roundLabel(s.state.turn)).toBe("SR 1");
    s.do({ type: "startCR" });
    expect(roundLabel(s.state.turn)).toBe("CR 1");
    s.do({ type: "startOR" });
    expect(roundLabel(s.state.turn)).toBe("OR 1.1");
  });
});

describe("startOR and nextCompany (US7-1, US7-2)", () => {
  it("startOR shows OR n.1, sets the order and the first company, and private income is offered", () => {
    const s = withTwo().do({ type: "startOR" });
    expect(roundLabel(s.state.turn)).toBe("OR 1.1");
    expect(s.state.turn.operatingOrder).toEqual(["PRR", "NYC"]);
    expect(s.state.turn.currentCompany).toBe("PRR");
    expect(s.tryDo({ type: "privateIncome" }).kind).toBe("ok");
  });

  it("nextCompany steps through the order, then to the next OR in the set, then prompts for an SR", () => {
    const s = withTwo();
    s.apply({ t: "turnAdvance", phase: "3" }); // 2 ORs per set
    s.do({ type: "startOR" });
    expect(s.state.turn.orsInSet).toBe(2);
    s.do(next);
    expect(s.state.turn.currentCompany).toBe("NYC");
    s.do(next);
    expect(roundLabel(s.state.turn)).toBe("OR 1.2");
    expect(s.state.turn.currentCompany).toBe("PRR");
    s.do(next).do(next);
    expect(s.state.turn.currentCompany).toBeUndefined();
    expect(s.lastWarnings.map((w) => w.code)).toContain("setComplete");
    expect(roundLabel(s.state.turn)).toBe("OR 1.2");
  });

  it("1830: ORs per set are fixed when the set starts (§3.3)", () => {
    const s = withTwo().do({ type: "startOR" });
    expect(s.state.turn.orsInSet).toBe(1);
    s.apply({ t: "turnAdvance", phase: "3" });
    s.do(next).do(next);
    expect(s.state.turn.orsInSet).toBe(1);
    expect(s.state.turn.currentCompany).toBeUndefined();
  });

  it("nextCompany past a company with no run marks it operated", () => {
    const s = withTwo().do({ type: "startOR" }).do(next);
    expect(hasOperated(s.state, "PRR")).toBe(true);
    expect(s.state.turn.operatedThisOR).toContain("PRR");
  });

  it("nextCompany does not add a second run for a company that already paid out", () => {
    const s = withTwo().do({ type: "startOR" });
    s.do({ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 100 }], mode: "full" });
    s.do(next);
    expect(counterOf(s.state, "company:PRR", "runs")).toBe(1);
  });

  it("nextCompany is not offered outside an OR", () => {
    expect(withTwo().tryDo(next).kind).toBe("unavailable");
  });
});

describe("21Moon fixed schedule (§3, §11)", () => {
  it("follows PRIVATES, SR n, CR n, OR n.1, OR n.2", () => {
    const s = start("21moon");
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6 } });
    s.do({ type: "startSR" }).do({ type: "startCR" }).do({ type: "startOR" });
    expect(s.state.turn).toMatchObject({ round: "OR", orSet: 1, orIndex: 1, orsInSet: 2 });
    expect(s.game.roundSchedule.type === "fixed" && s.game.roundSchedule.sequence[s.state.turn.scheduleIndex ?? -1]).toBe(
      "OR1.1",
    );
    s.do(next);
    expect(roundLabel(s.state.turn)).toBe("OR 1.2");
  });

  it("the last set has three ORs (OR 5.3)", () => {
    const s = start("21moon");
    s.apply({ t: "turnAdvance", round: "CR", srNumber: 5, orSet: 4, orIndex: 2 });
    s.do({ type: "startOR" });
    expect(s.state.turn).toMatchObject({ orSet: 5, orIndex: 1, orsInSet: 3 });
  });

  it("OR4.1 closes all privates before income", () => {
    const s = start("21moon");
    s.apply(
      { t: "assetTransfer", asset: "private:P3", from: "bank", to: "player:p1" },
      { t: "turnAdvance", round: "CR", srNumber: 4, orSet: 3, orIndex: 2 },
    );
    s.do({ type: "startOR" });
    expect(s.state.assets["private:P3"]).toBe("removed");
    s.do({ type: "privateIncome" });
    expect(eventsOf(s.lastEvents, "moneyTransfer")).toEqual([]);
  });

  it("OR3.1 records the Space Port note", () => {
    const s = start("21moon");
    s.apply({ t: "turnAdvance", round: "CR", srNumber: 3, orSet: 2, orIndex: 2 });
    s.do({ type: "startOR" });
    expect(eventsOf(s.lastEvents, "note").map((n) => n.text)).toContain("El puerto espacial vale 30");
  });
});

describe("manual overrides (FR-024, US7-3)", () => {
  it("setMarket records a manual market move", () => {
    const s = withTwo().do({ type: "setMarket", company: "PRR", cell: { row: 1, col: 3 } });
    expect(eventsOf(s.lastEvents, "marketMove")).toEqual([
      { t: "marketMove", company: "PRR", to: { row: 1, col: 3 }, reason: "manual" },
    ]);
  });

  it("setMarket to a cell that does not exist is not available", () => {
    expect(withTwo().tryDo({ type: "setMarket", company: "PRR", cell: { row: 10, col: 0 } }).kind).toBe("unavailable");
  });

  it("setMarket into the 1848 receivership column triggers the takeover", () => {
    const s = start("1848");
    seedCompany(s, "QR", { cell: { row: 2, col: 3 }, par: 70, holders: { "player:p1": 6 } });
    s.do({ type: "setMarket", company: "QR", cell: { row: 2, col: 0 } });
    expect(s.state.companies["QR"]!.status).toBe("receivership");
  });

  it("setPhase and setTurn record turnAdvance", () => {
    const s = withTwo().do({ type: "setPhase", phase: "4" });
    expect(s.state.turn.phase).toBe("4");
    s.do({ type: "setTurn", round: "OR", srNumber: null, orSet: 2, orIndex: 2, orsInSet: 2, company: "NYC" });
    expect(s.state.turn).toMatchObject({ round: "OR", orSet: 2, orIndex: 2, orsInSet: 2, currentCompany: "NYC" });
    expect(eventsOf(s.lastEvents, "turnAdvance")).toHaveLength(1);
  });

  it("setPhase to an unknown phase is not available", () => {
    expect(withTwo().tryDo({ type: "setPhase", phase: "9" }).kind).toBe("unavailable");
  });
});
