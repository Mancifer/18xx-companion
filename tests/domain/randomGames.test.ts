import { describe, expect, it } from "vitest";
import { applyOptions, builtInGames, getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { FLOW, NAMES, candidates, rng } from "../helpers/randomWalk";

/**
 * T162 (SC-002): seeded random sequences of valid high-level actions, through the real pipeline,
 * never break the money or share invariants. Candidates the pipeline refuses are skipped; the
 * point is to explore orders and combinations no hand-written test covers.
 */

const STEPS = 250;
const SEEDS = [1, 2, 3];

function play(gameIndex: number, seed: number) {
  const game = builtInGames[gameIndex]!;
  const rand = rng(seed * 7919 + gameIndex);
  const count = Math.min(game.playerCount.max, Math.max(game.playerCount.min, 4));
  const s = TestSession.start(game, makePlayers(NAMES.slice(0, count)));
  const applied: string[] = [];
  for (let step = 0; step < STEPS; step++) {
    const next = [...candidates(s, rand), ...FLOW].find((a) => s.tryDo(a).kind === "ok");
    if (!next) break;
    s.do(next);
    applied.push(next.type);
    const violations = s.violations();
    if (violations.length > 0) {
      throw new Error(`${game.id} seed ${seed} step ${step} after ${JSON.stringify(next)}: ${JSON.stringify(violations)}`);
    }
  }
  return { s, applied };
}

describe("random games keep the invariants (SC-002)", () => {
  const cases = builtInGames.flatMap((g, gi) => SEEDS.map((seed) => [g.id, seed, gi] as const));
  it.each(cases)("%s, seed %i", (_id, seed, gi) => {
    const { applied } = play(gi, seed);
    // The walk must actually reach the interesting parts of a game, not stall in setup.
    expect(applied.length).toBeGreaterThan(STEPS / 2);
    expect(applied).toContain("runAndPayout");
    expect(applied).toContain("buyShare");
  });
});

describe("random games reach the end step inside startOR (feature 003)", () => {
  it("some 1830 walk starts an OR from an SR with pending capital, and the invariants hold", () => {
    const gi = builtInGames.findIndex((g) => g.id === "1830");
    const covered = SEEDS.some((seed) =>
      play(gi, seed).s.groups.some(
        (g) =>
          g.action.type === "startOR" &&
          g.events.some((e) => e.t === "turnAdvance" && e.roundEnd === "SR") &&
          g.events.some((e) => e.t === "moneyTransfer" && e.from === "bank" && e.to.startsWith("company:")),
      ),
    );
    expect(covered).toBe(true);
  });
});

/**
 * SC-005 (feature 004): RotLA over many seeded games, each with a different mix of options, never
 * breaks the share or money invariants (the bank is unlimited unless Bank Break is on).
 */
const ROTLA_GAMES = Number(process.env["ROTLA_GAMES"] ?? 1000);
const ROTLA_STEPS = 80;
const ROTLA_OPTIONS: readonly Readonly<Record<string, string>>[] = [
  {},
  { mode: "short" },
  { expansion: "landmarks" },
  { bankBreak: "on", stockDrops: "perShare" },
  { mode: "micro3", headquarters: "on" },
];

describe("RotLA random games keep the invariants (SC-005)", () => {
  it(`${ROTLA_GAMES} seeded games`, () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= ROTLA_GAMES; seed++) {
      const options = ROTLA_OPTIONS[seed % ROTLA_OPTIONS.length]!;
      const game = applyOptions(getBuiltInGame("rotla"), options);
      const rand = rng(seed * 104729);
      const s = TestSession.start(game, makePlayers(NAMES.slice(0, options["mode"] === "micro3" ? 3 : 4)));
      for (let step = 0; step < ROTLA_STEPS; step++) {
        const next = [...candidates(s, rand), ...FLOW].find((a) => s.tryDo(a).kind === "ok");
        if (!next) break;
        s.do(next);
        seen.add(next.type);
        const violations = s.violations();
        if (violations.length > 0) {
          throw new Error(`rotla ${JSON.stringify(options)} seed ${seed} step ${step} after ${JSON.stringify(next)}: ${JSON.stringify(violations)}`);
        }
      }
    }
    for (const type of ["launchCompany", "buyShare", "runAndPayout", "buyTrain", "issueShares", "mergeCompanies", "startMR", "startSR"]) {
      expect(seen, type).toContain(type);
    }
  }, 600_000);
});
