import { describe, expect, it } from "vitest";
import { reduceAll } from "../../src/domain/events/reduce";
import { cashOf, initialState } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { applyOptions, builtInGames, getBuiltInGame } from "../../src/domain/games";
import { balanceLineEs, movementLineEs, summaryEs } from "../../src/domain/i18n/es";
import { stripMentions } from "../../src/domain/i18n/mentions";
import { entryBreakdown } from "../../src/domain/ledger/breakdown";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { operatingPhase } from "../../src/domain/ledger/operatingPhase";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { FLOW, NAMES, candidates, rng } from "../helpers/randomWalk";

/**
 * T162 (SC-002): seeded random sequences of valid high-level actions, through the real pipeline,
 * never break the money or share invariants. Candidates the pipeline refuses are skipped; the
 * point is to explore orders and combinations no hand-written test covers.
 */

const STEPS = 250;
const SEEDS = [1, 2, 3];

/**
 * Feature 012 (G1, G2): when an operating phase is current, each player's movements add up to
 * their amount, and their start cash is their cash in a replay up to the opening turnAdvance.
 */
function checkIncome(s: TestSession, where: string): boolean {
  const phase = operatingPhase(s.game, s.players, s.groups, s.state);
  if (!phase) return false;
  const events: PrimitiveEvent[] = [];
  for (const g of s.groups) {
    if (g.id !== phase.startGroupId) {
      events.push(...g.events);
      continue;
    }
    // Up to and including the turnAdvance that opened the phase (the first one into an OR).
    let state = reduceAll(initialState(s.game, s.players), events);
    for (const e of g.events) {
      const opens = e.t === "turnAdvance" && e.round === "OR" && state.turn.round !== "OR";
      state = reduceAll(state, [e]);
      if (opens) break;
    }
    for (const p of phase.players) {
      const sum = p.movements.reduce((t, m) => t + m.amount, 0);
      if (sum !== p.delta) throw new Error(`${where}: ${p.player} movements ${sum} ≠ delta ${p.delta}`);
      const start = cashOf(state, `player:${p.player}`);
      if (start !== p.startCash) throw new Error(`${where}: ${p.player} start cash ${p.startCash} ≠ replay ${start}`);
    }
    return true;
  }
  throw new Error(`${where}: start group ${phase.startGroupId} not in the log`);
}

/**
 * Feature 013: the marked lines History renders strip back to the plain lines, for the newest
 * group (its summary, its movements and its balances).
 */
function checkMentions(s: TestSession, where: string): void {
  const plain = { game: s.game, players: s.players, state: s.state };
  const marked = { ...plain, marks: true as const };
  const same = (what: string, a: string | undefined, b: string | undefined) => {
    if (stripMentions(a ?? "") !== (b ?? "")) throw new Error(`${where} ${what}: "${stripMentions(a ?? "")}" ≠ "${b ?? ""}"`);
  };
  const g = s.groups[s.groups.length - 1]!;
  same(g.action.type, summaryEs(g.action, marked, g.events), summaryEs(g.action, plain, g.events));
  const log: LogEntry[] = s.groups.map((e) => ({ kind: "group", ...e, warnings: [] }));
  const b = entryBreakdown(s.game, s.players, log, g.id);
  for (const m of b?.movements ?? []) same(`movement ${m.kind}`, movementLineEs(m, marked), movementLineEs(m, plain));
  for (const x of b?.balances ?? []) same(`balance ${x.holder}`, balanceLineEs(x, marked), balanceLineEs(x, plain));
}

function play(gameIndex: number, seed: number) {
  const game = builtInGames[gameIndex]!;
  const rand = rng(seed * 7919 + gameIndex);
  const count = Math.min(game.playerCount.max, Math.max(game.playerCount.min, 4));
  const s = TestSession.start(game, makePlayers(NAMES.slice(0, count)));
  const applied: string[] = [];
  let phases = 0;
  for (let step = 0; step < STEPS; step++) {
    const next = [...candidates(s, rand), ...FLOW].find((a) => s.tryDo(a).kind === "ok");
    if (!next) break;
    s.do(next);
    applied.push(next.type);
    const violations = s.violations();
    if (violations.length > 0) {
      throw new Error(`${game.id} seed ${seed} step ${step} after ${JSON.stringify(next)}: ${JSON.stringify(violations)}`);
    }
    if (checkIncome(s, `${game.id} seed ${seed} step ${step}`)) phases++;
    if (step % 10 === 0) checkMentions(s, `${game.id} seed ${seed} step ${step}`);
  }
  return { s, applied, phases };
}

describe("random games keep the invariants (SC-002)", () => {
  const cases = builtInGames.flatMap((g, gi) => SEEDS.map((seed) => [g.id, seed, gi] as const));
  it.each(cases)("%s, seed %i", (_id, seed, gi) => {
    const { applied, phases } = play(gi, seed);
    // The OR income summary (feature 012) was checked inside an operating phase.
    expect(phases).toBeGreaterThan(0);
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
        if (seed % 20 === 0 && step % 10 === 0) checkMentions(s, `rotla seed ${seed} step ${step}`);
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
