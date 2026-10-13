import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import type { SessionState } from "../../src/domain/events/state";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { groupHistory } from "../../src/domain/ledger/effectiveLog";
import { isSetup } from "../../src/domain/ledger/undo";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { makePlayers, type TestSession } from "../helpers/dispatch";
import { FLOW, NAMES, candidates, rng } from "../helpers/randomWalk";
import { freshDbName, makeMeta } from "../helpers/session";

/**
 * SC-001 (feature 010): random walks through the real store, interleaving plain undos and undos
 * back to a random older entry. After each undo the state equals the state captured just before
 * that entry was dispatched, and undo never leaves a group active after an undone one.
 */

const STEPS = 70;

const GAMES = [
  { id: "1830", game: getBuiltInGame("1830") },
  { id: "1848", game: getBuiltInGame("1848") },
  { id: "21moon", game: getBuiltInGame("21moon") },
  { id: "rotla", game: applyOptions(getBuiltInGame("rotla"), {}) },
];

async function walk(gameIndex: number, seed: number) {
  const { game } = GAMES[gameIndex]!;
  const players = makePlayers(NAMES.slice(0, 4));
  const repo = new SessionRepo(await openCompanionDb(freshDbName()));
  const meta = makeMeta({ game, players });
  await repo.createSession(meta);
  const store = new SessionStore(repo, meta, []);
  const rand = rng(seed);
  const before = new Map<string, SessionState>();

  const created = await store.dispatch({ type: "createSession", players, walletMode: "appTruth" });
  if (!created.ok) throw new Error(created.messageEs);
  let undos = 0;

  for (let step = 0; step < STEPS; step++) {
    const undoable = store.getSnapshot().effective.filter((g) => !isSetup(g));
    if (undoable.length > 0 && rand() < 0.25) {
      const last = rand() < 0.5;
      const target = last ? undoable[undoable.length - 1]! : undoable[Math.floor(rand() * undoable.length)]!;
      const kept = store.getSnapshot().effective.filter((g) => g.seq < target.seq).map((g) => g.id);
      const result = last ? await store.undoLast() : await store.undoTo(target.id, { confirmed: true });
      if (!result.ok) throw new Error(`${seed}/${step}: ${result.messageEs}`);
      expect(result.undone.at(-1)?.id).toBe(target.id);
      expect(store.getSnapshot().state).toEqual(before.get(target.id));
      expect(store.getSnapshot().effective.map((g) => g.id)).toEqual(kept);
      undos += 1;
      continue;
    }
    const { state } = store.getSnapshot();
    // candidates() only reads game, state and players.
    const view = { game, players, state } as unknown as TestSession;
    let applied = false;
    for (const action of [...candidates(view, rand), ...FLOW]) {
      const result = await store.dispatch(action);
      if (result.ok) {
        before.set(result.group.id, state);
        applied = true;
        break;
      }
    }
    if (!applied) break;
  }

  // Every undo entry undid a whole tail: each group it lists is newer than every group that was
  // still active when it was written.
  const history = groupHistory(store.getSnapshot().log);
  for (const h of history.filter((x) => x.undoneBy !== undefined)) {
    const activeThen = history.filter((x) => x.group.seq < h.undoneBy! && (x.undoneBy === undefined || x.undoneBy > h.undoneBy!));
    expect(activeThen.every((x) => x.group.seq < h.group.seq)).toBe(true);
  }
  return undos;
}

describe("randomized undo walks (SC-001)", () => {
  it.each(GAMES.flatMap((g, i) => [1, 2].map((seed) => [g.id, i, seed] as const)))(
    "%s (game %i, seed %i): every undo restores the state before its target",
    async (_id, index, seed) => {
      const undos = await walk(index, seed * 7919 + index);
      expect(undos).toBeGreaterThan(3);
    },
    30_000,
  );
});
