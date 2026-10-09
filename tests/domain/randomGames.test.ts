import { describe, expect, it } from "vitest";
import { builtInGames } from "../../src/domain/games";
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
