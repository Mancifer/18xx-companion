import { describe, expect, it } from "vitest";
import { presidentOf, unitsOf } from "../../src/domain/events/state";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";

/** FR-021, data-model §5 "Presidency" (1830 §6.4, 1848 §6.2, 21Moon §9.4). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const give = (to: string, units: number, from = "ipo:PRR") => ({
  type: "transferShares",
  company: "PRR",
  from,
  to,
  units,
  presidency: null,
});

function withPRR(holders: Record<string, number>, ruleset?: "base") {
  const game = ruleset ? applyOptions(getBuiltInGame("1830"), { ruleset }) : getBuiltInGame("1830");
  return seedCompany(TestSession.start(game, players), "PRR", { cell: { row: 0, col: 6 }, holders });
}

describe("presidency changes", () => {
  it("a tie keeps the president", () => {
    const s = withPRR({ "player:p1": 3, "player:p2": 2 });
    s.do(give("player:p2", 1));
    expect(presidentOf(s.state, "PRR")).toBe("p1");
  });

  it("moves when another player holds strictly more, as a presidency swap plus compensating units (US4-4)", () => {
    const s = withPRR({ "player:p1": 3, "player:p2": 3 });
    s.do(give("player:p2", 1));
    expect(presidentOf(s.state, "PRR")).toBe("p2");
    const transfers = eventsOf(s.lastEvents, "shareTransfer");
    expect(transfers).toContainEqual({ t: "shareTransfer", company: "PRR", from: "player:p1", to: "player:p2", units: 2, presidency: true });
    expect(transfers).toContainEqual({ t: "shareTransfer", company: "PRR", from: "player:p2", to: "player:p1", units: 2 });
    // Unit counts are unchanged by the swap itself.
    expect(unitsOf(s.state, "player:p1", "PRR")).toBe(3);
    expect(unitsOf(s.state, "player:p2", "PRR")).toBe(4);
    expect(s.violations()).toEqual([]);
  });

  it("a tie for most excluding the president goes to the next player in seat order after the old president", () => {
    // Bruno (seat 2) presides with 2; Ana (seat 1) and Dani (seat 4) reach 3 each.
    const s = withPRR({ "player:p2": 2, "player:p1": 3, "player:p4": 2 });
    expect(presidentOf(s.state, "PRR")).toBe("p2");
    s.do(give("player:p4", 1));
    expect(presidentOf(s.state, "PRR")).toBe("p4");
  });

  it("a company never becomes president", () => {
    const s = withPRR({ "player:p1": 2 });
    s.do(give("company:NYC", 5));
    expect(presidentOf(s.state, "PRR")).toBe("p1");
    expect(s.state.presidency["PRR"]).toBe("player:p1");
  });

  it("a sale that leaves another player ahead hands over the presidency", () => {
    const s = withPRR({ "player:p1": 4, "player:p2": 3 });
    s.do(give("pool", 2, "player:p1"));
    expect(presidentOf(s.state, "PRR")).toBe("p2");
  });

  it("a manual presidency transfer is respected", () => {
    const s = withPRR({ "player:p1": 4, "player:p2": 2 });
    s.do({ type: "transferShares", company: "PRR", from: "player:p1", to: "player:p2", units: 2, presidency: true });
    expect(presidentOf(s.state, "PRR")).toBe("p2");
  });

  it("is frozen while the company owes the Bank (1830 Base receivership) and applied when the debt is repaid", () => {
    const s = withPRR({ "player:p1": 3, "player:p2": 3 }, "base");
    s.apply(
      { t: "companyStatus", company: "PRR", status: "receivership" },
      { t: "counterChange", subject: "company:PRR", key: "debt", delta: 50 },
    );
    s.do(give("player:p2", 1));
    expect(presidentOf(s.state, "PRR")).toBe("p1");
    s.do({ type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 50 }], mode: "withhold" });
    expect(s.state.companies["PRR"]!.status).toBe("floated");
    expect(presidentOf(s.state, "PRR")).toBe("p2");
  });
});
