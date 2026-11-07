import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { CompanyStatus } from "../../src/domain/events/types";
import { domainText } from "../../src/i18n";
import { makePlayers } from "../helpers/dispatch";

/** Feature 014 T018: English labels (research R12). */

const en = domainText("en");
const g1830 = getBuiltInGame("1830");
const rotla = getBuiltInGame("rotla");
const players = makePlayers(["Ana", "Bruno"]);

describe("English labels", () => {
  it("round labels", () => {
    expect(en.roundLabel({ round: "PRIVATES", srNumber: 0, orSet: 0, orIndex: 0 })).toBe("Privates");
    expect(en.roundLabel({ round: "SR", srNumber: 3, orSet: 0, orIndex: 0 })).toBe("SR 3");
    expect(en.roundLabel({ round: "OR", srNumber: 2, orSet: 2, orIndex: 1 })).toBe("OR 2.1");
    expect(en.roundLabel({ round: "CR", srNumber: 1, orSet: 0, orIndex: 0 })).toBe("CR 1");
    expect(en.roundLabel({ round: "MR", srNumber: 2, orSet: 0, orIndex: 0 })).toBe("MR 2");
  });

  it("RotLA cycle labels and History titles", () => {
    expect(en.cycleRoundLabel(rotla, { round: "OR", srNumber: 2, orIndex: 1, orsInSet: 2 })).toBe("Cycle 2 of 6 · OR 1/2");
    expect(en.cycleRoundLabel(rotla, { round: "MR", srNumber: 3, orIndex: 0, orsInSet: 2 })).toBe("Cycle 3 of 6 · MR");
    expect(en.cycleRoundLabel(g1830, { round: "OR", srNumber: 2, orIndex: 1, orsInSet: 2 })).toBeUndefined();
    expect(en.roundTitle(g1830, { round: "OR", srNumber: 2, orSet: 2, orIndex: 1, orsInSet: 2 })).toBe("Operating Round 2.1");
    expect(en.roundTitle(g1830, { round: "SR", srNumber: 3, orSet: 0, orIndex: 0, orsInSet: 2 })).toBe("Stock Round 3");
    expect(en.roundTitle(rotla, { round: "OR", srNumber: 2, orSet: 2, orIndex: 1, orsInSet: 2 })).toBe("Cycle 2 · Operating Round 1/2");
  });

  it("company statuses", () => {
    const expected: Record<CompanyStatus, string> = {
      unstarted: "not started",
      parred: "parred",
      floated: "floated",
      receivership: "in receivership",
      bankrupt: "bankrupt",
      closed: "closed",
    };
    expect(en.status).toEqual(expected);
  });

  it("holder names", () => {
    expect(en.holderName("bank", g1830, players)).toBe("the bank");
    expect(en.holderName("pool", g1830, players)).toBe("the pool");
    expect(en.holderName("removed", g1830, players)).toBe("out of the game");
    expect(en.holderName("ipo:PRR", g1830, players)).toBe("the PRR IPO");
    expect(en.holderName("player:p1", g1830, players)).toBe("Ana");
  });

  it("end conditions, counters and fixed texts", () => {
    expect(en.endConditions(["bankBroken", "bankruptcy"])).toBe("(bank broken, bankruptcy)");
    expect(en.endConditions([])).toBe("(no end condition)");
    expect(en.counterLabels["debt"]).toBe("debt");
    expect(en.income.title).toBe("OR income");
    expect(en.income.take("$60")).toBe("Collects $60 from the bank");
    expect(en.undoRange.title(3)).toBe("Undo 3 entries?");
    expect(en.undoRange.undoBackToHere).toBe("Undo back to here");
    expect(en.gameEnd.notEnded).toBe("The game is not over");
    expect(en.systemNotes).toEqual({ gameOver: "Game over", gameReopened: "Game reopened" });
    expect(en.trainsHead(2, 4)).toBe("Trains 2/4");
    expect(en.trainsHead(2, Infinity)).toBe("Trains 2");
  });

  it("both languages provide every field", () => {
    const es = domainText("es");
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});
