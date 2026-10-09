import { describe, expect, it } from "vitest";
import { reduceAll } from "../../src/domain/events/reduce";
import { initialState, type SessionState } from "../../src/domain/events/state";
import type { CompanyStatus } from "../../src/domain/events/types";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import { applyMoveRules, cellTagsAt, moveSteps, neighbor, priceAt } from "../../src/domain/mechanics/market";
import type { CellRef } from "../../src/domain/types";
import { makePlayers } from "../helpers/dispatch";
import { miniGame } from "../helpers/miniGame";

const g1830 = getBuiltInGame("1830");
const g1848 = getBuiltInGame("1848");
const g21 = getBuiltInGame("21moon");
const at = (row: number, col: number): CellRef => ({ row, col });

function placed(game: GameDefinition, company: string, cell: CellRef, status: CompanyStatus = "floated"): SessionState {
  return reduceAll(initialState(game, makePlayers(["Ana", "Bruno", "Carla"])), [
    { t: "companyStatus", company, status },
    { t: "marketMove", company, to: cell, reason: "par" },
  ]);
}

describe("neighbor and edges (data-model §4 MarketDef)", () => {
  it("1830: right 1 inside a row", () => {
    expect(neighbor(g1830, at(0, 6), "right")).toEqual(at(0, 7));
  });

  it("1830: the right end of a row moves up, if the cell exists", () => {
    expect(neighbor(g1830, at(1, 18), "right")).toEqual(at(0, 18));
  });

  it("1830: no upward move at 350 (noUp, top row)", () => {
    expect(neighbor(g1830, at(0, 18), "right")).toBeUndefined();
    expect(neighbor(g1830, at(0, 18), "up")).toBeUndefined();
  });

  it("1830: the left end of a row moves down", () => {
    expect(neighbor(g1830, at(0, 0), "left")).toEqual(at(1, 0));
  });

  it("1830: no move off the bottom-left corner", () => {
    expect(neighbor(g1830, at(10, 3), "left")).toBeUndefined();
    expect(neighbor(g1830, at(10, 3), "down")).toBeUndefined();
  });

  it("up and down stay inside the column", () => {
    expect(neighbor(g1830, at(3, 4), "up")).toEqual(at(2, 4));
    expect(neighbor(g1830, at(3, 4), "down")).toEqual(at(4, 4));
    expect(neighbor(g1830, at(0, 4), "up")).toBeUndefined();
  });

  it("21Moon: printed arrows override the default edges", () => {
    expect(neighbor(g21, at(2, 17), "right")).toEqual(at(1, 17));
    expect(neighbor(g21, at(2, 0), "left")).toEqual(at(3, 0));
    expect(neighbor(g21, at(1, 2), "left")).toEqual(at(2, 2));
    // No arrow at the end of the top row: the token stays put.
    expect(neighbor(g21, at(0, 17), "right")).toBeUndefined();
  });

  it("21Moon: moving left from the 40 on row 5 reaches the Closed cell", () => {
    const target = neighbor(g21, at(5, 0), "left");
    expect(target).toEqual(at(6, 0));
    expect(cellTagsAt(g21, target)).toContain("closed");
  });

  it("1848: withholding from the first column enters the receivership column", () => {
    const target = neighbor(g1848, at(2, 1), "left");
    expect(target).toEqual(at(2, 0));
    expect(cellTagsAt(g1848, target)).toContain("receivership");
    expect(neighbor(g1848, at(2, 0), "left")).toBeUndefined();
  });

  it("moveSteps applies n steps and stops where the next step is blocked", () => {
    expect(moveSteps(g1830, at(0, 15), "right", 2)).toEqual(at(0, 17));
    expect(moveSteps(g1830, at(0, 17), "right", 3)).toEqual(at(0, 18));
    expect(moveSteps(g1848, at(3, 2), "left", 3)).toEqual(at(3, 0));
  });

  it("1848 top cell is tagged as the end-game cell", () => {
    expect(cellTagsAt(g1848, at(0, 16))).toContain("top");
    expect(priceAt(g1848, "QR", at(0, 16))).toBe(450);
  });
});

describe("applyMoveRules (FR-033)", () => {
  it("1830 payout right 1, withhold left 1", () => {
    const s = placed(g1830, "PRR", at(0, 6));
    expect(applyMoveRules(g1830, s, "PRR", "payout", { dividend: 240 })).toEqual(at(0, 7));
    expect(applyMoveRules(g1830, s, "PRR", "withhold", { dividend: 0 })).toEqual(at(0, 5));
  });

  it("no rule for the kind means no move (half not defined in 1830)", () => {
    const s = placed(g1830, "PRR", at(0, 6));
    expect(applyMoveRules(g1830, s, "PRR", "half", { dividend: 100 })).toBeUndefined();
  });

  it("21Moon thresholds compare the dividend with the pre-move price (§11.5)", () => {
    const s = placed(g21, "VH", at(4, 2)); // 70
    expect(applyMoveRules(g21, s, "VH", "payout", { dividend: 0 })).toEqual(at(4, 1));
    expect(applyMoveRules(g21, s, "VH", "payout", { dividend: 30 })).toBeUndefined();
    expect(applyMoveRules(g21, s, "VH", "payout", { dividend: 35 })).toEqual(at(4, 3));
    expect(applyMoveRules(g21, s, "VH", "payout", { dividend: 139 })).toEqual(at(4, 3));
    expect(applyMoveRules(g21, s, "VH", "payout", { dividend: 140 })).toEqual(at(4, 4));
  });

  it("first matching rule wins", () => {
    const game: GameDefinition = {
      ...miniGame,
      market: {
        ...miniGame.market,
        moves: {
          ...miniGame.market.moves,
          payout: [
            { when: { dividendAtLeast: { priceTimes: 1 } }, dir: "right", n: 2 },
            { dir: "right", n: 1 },
          ],
        },
      },
    };
    const s = placed(game, "AA", at(0, 0)); // 50
    expect(applyMoveRules(game, s, "AA", "payout", { dividend: 50 })).toEqual(at(0, 2));
    expect(applyMoveRules(game, s, "AA", "payout", { dividend: 10 })).toEqual(at(0, 1));
  });

  it("unfloated companies do not move in ORs (1830 §5.5 note)", () => {
    const s = placed(g1830, "PRR", at(0, 6), "parred");
    expect(applyMoveRules(g1830, s, "PRR", "payout", { dividend: 100 })).toBeUndefined();
  });

  it("a company in receivership still moves", () => {
    const s = placed(g1830, "PRR", at(0, 6), "receivership");
    expect(applyMoveRules(g1830, s, "PRR", "withhold", { dividend: 0 })).toEqual(at(0, 5));
  });

  it("a blocked move returns no move", () => {
    const s = placed(g1830, "PRR", at(0, 18));
    expect(applyMoveRules(g1830, s, "PRR", "payout", { dividend: 100 })).toBeUndefined();
  });
});

describe("stacking (1848 §11.3)", () => {
  it("a company arriving in an occupied cell goes underneath", () => {
    const s = reduceAll(placed(g1830, "PRR", at(0, 6)), [
      { t: "companyStatus", company: "NYC", status: "floated" },
      { t: "marketMove", company: "NYC", to: at(0, 6), reason: "par" },
    ]);
    expect(s.companies["NYC"]!.stackOrder).toBeGreaterThan(s.companies["PRR"]!.stackOrder);
  });
});
