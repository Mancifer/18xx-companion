import { describe, expect, it } from "vitest";
import { finalScores } from "../../src/domain/mechanics/scores";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** Final scores (US8, research R12, B p.19): cash plus shares at the current price. */

function scored() {
  const s = rotlaSession();
  // Starting cash 300 each.
  seedCompany(s, "CON", { price: 100, holders: { "player:p1": 6, "player:p2": 4 }, treasury: 500 });
  seedCompany(s, "EXP", { price: 80, holders: { "player:p3": 3, "company:EXP": 2 } });
  return s;
}

describe("finalScores", () => {
  it("cash plus shares at the current price; treasuries do not count", () => {
    const s = scored();
    expect(finalScores(s.game, s.players, s.state)).toEqual([
      { player: "p1", cash: 300, sharesValue: 600, total: 900, rank: 1, eliminated: false },
      { player: "p2", cash: 300, sharesValue: 400, total: 700, rank: 2, eliminated: false },
      { player: "p3", cash: 300, sharesValue: 240, total: 540, rank: 3, eliminated: false },
    ]);
  });

  it("a tie goes to the president of the company highest in the operating order, then the next", () => {
    const s = scored();
    // Bruno and Carla both at 700: Carla presides EXP (80), Bruno presides nothing; then give
    // Bruno the presidency of a company at 90 (above EXP).
    s.apply({ t: "moneyTransfer", from: "bank", to: "player:p3", amount: 160 });
    seedCompany(s, "TUN", { price: 90, holders: { "player:p2": 2, "company:TUN": 3 } });
    s.apply({ t: "moneyTransfer", from: "player:p2", to: "bank", amount: 180 });
    const scores = finalScores(s.game, s.players, s.state);
    expect(scores.map((r) => [r.player, r.total, r.rank, r.tieBreak])).toEqual([
      ["p1", 900, 1, undefined],
      ["p2", 700, 2, "TUN"],
      ["p3", 700, 3, undefined],
    ]);
  });

  it("an eliminated player is listed last, with no total or rank", () => {
    const s = scored();
    s.apply({ t: "counterChange", subject: "player:p1", key: "bankrupt", delta: 1 });
    const scores = finalScores(s.game, s.players, s.state);
    expect(scores.at(-1)).toEqual({ player: "p1", cash: 300, sharesValue: 600, total: null, rank: null, eliminated: true });
    expect(scores.map((r) => r.rank)).toEqual([1, 2, null]);
  });
});
