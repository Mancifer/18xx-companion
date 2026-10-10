import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { finalResults } from "../../src/domain/mechanics/scores";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany as seed } from "../helpers/seed";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** Final results (feature 007, data-model §6; RotLA B p.19): cash plus shares at final prices. */

const four = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = (id: string) => TestSession.start(getBuiltInGame(id), four);
const results = (s: TestSession, eliminationOrder: readonly string[] = []) => finalResults(s.game, s.players, s.state, eliminationOrder);
const byPlayer = (s: TestSession, player: string) => results(s).find((r) => r.player === player)!;

function scored() {
  const s = rotlaSession();
  // Starting cash 300 each.
  seedCompany(s, "CON", { price: 100, holders: { "player:p1": 6, "player:p2": 4 }, treasury: 500 });
  seedCompany(s, "EXP", { price: 80, holders: { "player:p3": 3, "company:EXP": 2 } });
  return s;
}

describe("finalResults: RotLA (presidentEarliest)", () => {
  it("cash plus shares at the current price; treasuries do not count", () => {
    const s = scored();
    expect(results(s)).toEqual([
      { player: "p1", cash: 300, sharesValue: 600, total: 900, rank: 1, status: "active", winner: true },
      { player: "p2", cash: 300, sharesValue: 400, total: 700, rank: 2, status: "active", winner: false },
      { player: "p3", cash: 300, sharesValue: 240, total: 540, rank: 3, status: "active", winner: false },
    ]);
  });

  it("a tie goes to the president of the company highest in the operating order, then the next", () => {
    const s = scored();
    // Bruno and Carla both at 700: Carla presides EXP (80), Bruno presides nothing; then give
    // Bruno the presidency of a company at 90 (above EXP).
    s.apply({ t: "moneyTransfer", from: "bank", to: "player:p3", amount: 160 });
    seedCompany(s, "TUN", { price: 90, holders: { "player:p2": 2, "company:TUN": 3 } });
    s.apply({ t: "moneyTransfer", from: "player:p2", to: "bank", amount: 180 });
    expect(results(s).map((r) => [r.player, r.total, r.rank, r.tieBreak, r.winner])).toEqual([
      ["p1", 900, 1, undefined, true],
      ["p2", 700, 2, "TUN", false],
      ["p3", 700, 3, undefined, false],
    ]);
  });

  it("an eliminated player is listed last, with no total or rank", () => {
    const s = scored();
    s.apply({ t: "counterChange", subject: "player:p1", key: "bankrupt", delta: 1 });
    const r = results(s, ["p1"]);
    expect(r.at(-1)).toEqual({ player: "p1", cash: 300, sharesValue: 600, total: null, rank: null, status: "eliminated", winner: false });
    expect(r.map((x) => x.rank)).toEqual([1, 2, null]);
    expect(r.map((x) => x.winner)).toEqual([true, false, false]);
  });
});

describe("finalResults: what counts (rules 1, 2)", () => {
  it("only player cash and player-held shares: treasuries, trains, privates and loans never count", () => {
    const s = start("1848");
    seed(s, "QR", { cell: { row: 3, col: 5 }, cash: 400, holders: { "player:p1": 2 } });
    s.apply(
      { t: "assetTransfer", asset: "loan:1", from: "company:BOE", to: "company:QR" },
      { t: "moneyTransfer", from: "company:BOE", to: "company:QR", amount: 100 },
      { t: "assetTransfer", asset: "private:P1", from: "bank", to: "player:p1" },
    );
    const p1 = byPlayer(s, "p1");
    expect(p1.cash).toBe(cashOf(s.state, "player:p1"));
    expect(p1.sharesValue).toBe(2 * 80);
    expect(p1.total).toBe(p1.cash + 2 * 80);
  });

  it("shares of a company with no price count 0", () => {
    const s = start("1830").apply({ t: "shareTransfer", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2 });
    expect(byPlayer(s, "p1")).toMatchObject({ cash: 600, sharesValue: 0, total: 600 });
  });

  it("negative cash and totals are not clamped", () => {
    const s = start("1830").apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 1000 });
    expect(byPlayer(s, "p1")).toMatchObject({ cash: -400, sharesValue: 0, total: -400 });
    expect(results(s).at(-1)?.player).toBe("p1");
  });

  it("21Moon: each share is worth its price plus 50 per East-West token its company holds (§13)", () => {
    const s = start("21moon");
    seed(s, "VH", { cell: { row: 4, col: 2 }, holders: { "player:p1": 3 } });
    const price = byPlayer(s, "p1").sharesValue / 3;
    s.apply({ t: "counterChange", subject: "company:VH", key: "eastWestTokens", delta: 2 });
    expect(byPlayer(s, "p1").sharesValue).toBe(3 * (price + 100));
  });

  it("1848: BoE shares are valued on the BoE loan track", () => {
    const s = start("1848").apply(
      { t: "marketMove", company: "BOE", to: { index: 3 }, reason: "loan" },
      { t: "shareTransfer", company: "BOE", from: "ipo:BOE", to: "player:p1", units: 2 },
    );
    expect(byPlayer(s, "p1").sharesValue).toBe(2 * 100);
  });

  it("1848: a dividend paid from a broken (negative) bank shows up in the total (research R14)", () => {
    const s = start("1848");
    seed(s, "QR", { cell: { row: 3, col: 5 }, holders: { "player:p1": 4, "player:p2": 2 } });
    s.apply({ t: "moneyTransfer", from: "bank", to: "player:p3", amount: cashOf(s.state, "bank") });
    const cashBefore = byPlayer(s, "p1").cash;
    s.do({ type: "runAndPayout", company: "QR", parts: [{ part: "revenue", amount: 200 }], mode: "full" });
    const dividend = s.lastEvents.reduce((sum, e) => (e.t === "moneyTransfer" && e.to === "player:p1" ? sum + e.amount : sum), 0);
    expect(dividend).toBeGreaterThan(0);
    expect(cashOf(s.state, "bank")).toBeLessThan(0);
    const after = byPlayer(s, "p1");
    expect(after.cash).toBe(cashBefore + dividend);
    expect(after.total).toBe(after.cash + after.sharesValue);
  });
});

describe("finalResults: shared ties (rule 5)", () => {
  it("equal totals share the rank and the next rank skips (1, 1, 3); every rank-1 row is a winner", () => {
    const s = start("1830").apply(
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 100 },
      { t: "moneyTransfer", from: "bank", to: "player:p2", amount: 100 },
    );
    expect(results(s).map((r) => [r.player, r.total, r.rank, r.winner])).toEqual([
      ["p1", 700, 1, true],
      ["p2", 700, 1, true],
      ["p3", 600, 3, false],
      ["p4", 600, 3, false],
    ]);
    expect(results(s).every((r) => r.tieBreak === undefined)).toBe(true);
  });
});

describe("finalResults: bankrupt players by scoring.bankruptPlayers (rules 3, 4, 6; FR-010)", () => {
  const bankrupt = (s: TestSession, ...ids: string[]) => {
    for (const id of ids) s.apply({ t: "counterChange", subject: `player:${id}`, key: "bankrupt", delta: 1 });
    return s;
  };

  it("scored (1830): a bankrupt player is ranked by cash plus held shares, marked bankrupt", () => {
    const s = start("1830");
    seed(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
    bankrupt(s, "p2");
    const p2 = results(s, ["p2"]).find((r) => r.player === "p2")!;
    expect(p2).toMatchObject({ status: "bankrupt", winner: true, rank: 1 });
    expect(p2.total).toBe(600 + p2.sharesValue);
    expect(results(s, ["p2"]).filter((r) => r.status === "active")).toHaveLength(3);
  });

  it("eliminated (21Moon): after every ranked player, latest elimination first, with no rank or total", () => {
    const s = bankrupt(start("21moon"), "p1", "p3");
    const r = results(s, ["p1", "p3"]);
    expect(r.map((x) => [x.player, x.status, x.rank, x.total])).toEqual([
      ["p2", "active", 1, r[0]!.cash],
      ["p4", "active", 1, r[1]!.cash],
      ["p3", "eliminated", null, null],
      ["p1", "eliminated", null, null],
    ]);
  });

  it("a player in eliminationOrder whose bankrupt counter is 0 in the given state is ranked as active", () => {
    const s = start("21moon");
    expect(results(s, ["p1"]).find((r) => r.player === "p1")).toMatchObject({ status: "active", rank: 1 });
  });

  it("when every player but one is eliminated, that player is the only winner (US2-4)", () => {
    const s = bankrupt(start("21moon"), "p1", "p2", "p3");
    const r = results(s, ["p2", "p1", "p3"]);
    expect(r.filter((x) => x.winner).map((x) => x.player)).toEqual(["p4"]);
    expect(r.map((x) => x.player)).toEqual(["p4", "p3", "p1", "p2"]);
  });
});
