import { describe, expect, it } from "vitest";
import { trainPrice } from "../../src/domain/actions/expand/operating";
import { cashOf, presidentOf, unitsOf } from "../../src/domain/events/state";
import { summaryEs } from "../../src/domain/i18n/es";
import { endTriggers, gameOver } from "../../src/domain/mechanics/endTriggers";
import { priceOf } from "../../src/domain/mechanics/market";
import { countedTrains, phaseReached, trainLimitFor, trainStack, trainsHeldBy } from "../../src/domain/mechanics/phases";
import { mergerRoundDue } from "../../src/domain/mechanics/schedule";
import { finalResults } from "../../src/domain/mechanics/scores";
import type { TestSession } from "../helpers/dispatch";
import { netMoney } from "../helpers/flows";
import { rotlaSession } from "../helpers/rotla";

/**
 * SC-001, SC-005: a whole 3-player Short game, cycle 1 to the final scores, played the way a table
 * would and only with game actions (no manual correction). The table's policy is fixed, so the
 * game is deterministic: buy the top train when the company can, pay out by its trains, issue
 * once, sell once, merge the two cheapest minors whenever the Merger Round is due.
 */

const MANUAL = new Set(["adjustMoney", "transferMoney", "transferShares", "setMarket", "setPhase", "setTurn", "adjustCounter"]);

function step(s: TestSession, action: Record<string, unknown>) {
  s.do(action);
  expect(s.violations(), JSON.stringify(action)).toEqual([]);
}

/** One company's turn: maybe a train, maybe an issue, then the run. */
function operate(s: TestSession, cycle: number) {
  const company = s.state.turn.currentCompany!;
  const ref = `company:${company}` as const;
  const top = trainStack(s.game, s.state)[0];
  if (top) {
    const variant = top.type === "7" ? "7" : null;
    const buy = { type: "buyTrain", company, trainType: top.type, variant, from: "bank", seller: null, price: null, tradeIn: null };
    const price = trainPrice(s.game, { trainType: top.type, variant, from: "bank", price: null, tradeIn: null }, s.state);
    const room = countedTrains(s.game, s.state, company).length < trainLimitFor(s.game, s.state, company);
    if (room && cashOf(s.state, ref) >= price) step(s, buy);
    else if (trainsHeldBy(s.state, ref).length === 0) {
      step(s, { type: "forcedTrainPurchase", company, trainType: top.type, variant, from: "bank", sales: [] });
    }
  }
  if (cycle === 2 && unitsOf(s.state, ref, company) > 0 && s.tryDo({ type: "issueShares", company, count: 1 }).kind === "ok") {
    step(s, { type: "issueShares", company, count: 1 });
  }
  const trains = countedTrains(s.game, s.state, company).length;
  const revenue = trains * (60 + 40 * cycle);
  step(s, { type: "runAndPayout", company, parts: [{ part: "revenue", amount: revenue }], mode: revenue > 0 ? "full" : "withhold" });
  step(s, { type: "nextCompany" });
}

function playOR(s: TestSession, cycle: number) {
  while (s.state.turn.round === "OR" && s.state.turn.currentCompany) operate(s, cycle);
}

/** The two cheapest floated minors into the first unstarted major. */
function mergeRound(s: TestSession) {
  step(s, { type: "startMR" });
  const minors = s.game.companies
    .filter((c) => c.tier === "minor" && s.state.companies[c.id]?.status === "floated")
    .sort((x, y) => (priceOf(s.game, s.state, x.id) ?? 0) - (priceOf(s.game, s.state, y.id) ?? 0));
  const into = s.game.companies.find((c) => c.tier === "major" && s.state.companies[c.id]?.status === "unstarted");
  if (minors.length >= 2 && into) step(s, { type: "mergeCompanies", a: minors[0]!.id, b: minors[1]!.id, into: into.id, identity: null });
}

describe("a 3-player Short game, start to finish (SC-001)", () => {
  it("plays 4 cycles through the grey phase, with mergers, exports and final scores", () => {
    const s = rotlaSession({ players: 3, options: { mode: "short" } });
    expect(s.state.turn).toMatchObject({ round: "SR", srNumber: 1 });

    // Cycle 1, SR: four minors launched, treasury shares bought.
    step(s, { type: "launchCompany", player: "p1", company: "TUN", bid: 160, price: null });
    step(s, { type: "launchCompany", player: "p2", company: "EXP", bid: 160, price: null });
    step(s, { type: "launchCompany", player: "p3", company: "AGR", bid: 140, price: null });
    step(s, { type: "buyShare", buyer: "player:p2", company: "TUN", source: "treasury", count: 1 });
    step(s, { type: "buyShare", buyer: "player:p3", company: "EXP", source: "treasury", count: 1 });
    step(s, { type: "buyShare", buyer: "player:p1", company: "AGR", source: "treasury", count: 1 });

    for (let cycle = 1; cycle <= 4; cycle++) {
      if (cycle > 1) {
        // SR: more launches while minors are left, and one sale of a company that has operated.
        const free = s.game.companies.filter((c) => c.tier === "minor" && s.state.companies[c.id]?.status === "unstarted");
        for (const [i, p] of s.players.entries()) {
          const minor = free[i];
          if (minor && cashOf(s.state, `player:${p.id}`) >= 150) {
            step(s, { type: "launchCompany", player: p.id, company: minor.id, bid: 150, price: null });
          }
        }
        if (cycle === 3 && unitsOf(s.state, "player:p2", "TUN") > 0) {
          step(s, { type: "sellShares", seller: "player:p2", company: "TUN", count: 1 });
        }
      }
      step(s, { type: "startOR" });
      playOR(s, cycle);
      step(s, { type: "startOR" });
      playOR(s, cycle);
      if (mergerRoundDue(s.game, s.state)) mergeRound(s);
      if (cycle < 4) step(s, { type: "startSR" });
    }

    // The game is over.
    expect(endTriggers(s.game, s.state).map((t) => t.type)).toContain("cyclesComplete");
    expect(gameOver(s.game, s.state)).toBe(true);
    const actions = s.groups.map((g) => g.action.type);
    expect(actions).toContain("mergeCompanies");
    expect(actions).toContain("issueShares");
    expect(actions).toContain("sellShares");
    expect(phaseReached(s.game, s.state, "grey")).toBe(true);
    // Exports: a startSR that sent trains out of the game.
    expect(s.groups.some((g) => g.action.type === "startSR" && g.events.some((e) => e.t === "assetTransfer" && e.to === "removed"))).toBe(true);
    expect(actions.filter((t) => MANUAL.has(t))).toEqual([]);

    // Every group is one History entry whose money nets to zero (an unlimited bank included).
    for (const g of s.groups) {
      expect(summaryEs(g.action, { game: s.game, players: s.players, state: s.state }, g.events)).not.toBe("");
      expect(Object.values(netMoney(g.events)).reduce((a, b) => a + b, 0)).toBe(0);
    }

    const scores = finalResults(s.game, s.players, s.state, []);
    expect(scores).toHaveLength(3);
    expect(scores.map((r) => r.rank)).toEqual([1, 2, 3]);
    for (const r of scores) expect(r.total).toBe(r.cash + r.sharesValue);
    // Some major is presided by a player.
    expect(s.game.companies.some((c) => c.tier === "major" && presidentOf(s.state, c.id) !== undefined)).toBe(true);
  });
});
