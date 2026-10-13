import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { Player } from "../../src/domain/types";
import { touchesOf, type GroupEntry, type LogEntry } from "../../src/domain/ledger/entries";
import { entryBreakdown } from "../../src/domain/ledger/breakdown";
import { replay } from "../../src/domain/ledger/replay";
import { replayFromSnapshot, snapshotsFor } from "../../src/domain/ledger/snapshots";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { FLOW, candidates, rng } from "../helpers/randomWalk";
import { freshDbName, makeMeta } from "../helpers/session";

/**
 * T163 (plan performance goals): replay of a long game, snapshot load and one write. Times are
 * medians of several runs after a warm-up, so a slow machine or a GC pause does not flake.
 */

const GROUPS = 1500;
const game = getBuiltInGame("1830");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function timeIt(fn: () => void, runs = 7): number {
  fn(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    times.push(performance.now() - t);
  }
  return median(times);
}

/** A 1,500-group log from a seeded random walk, ending with a company about to run. */
function longGame(g: GameDefinition = game, ps: readonly Player[] = players): { log: LogEntry[]; payout: unknown } {
  const s = TestSession.start(g, ps);
  const log: LogEntry[] = [];
  const rand = rng(42);
  const push = (action: { type: string }) => {
    s.do(action);
    const group: GroupEntry = {
      kind: "group",
      seq: log.length + 1,
      id: `g${log.length + 1}`,
      at: "2026-10-09T20:00:00.000Z",
      source: "touch",
      action: action as GroupEntry["action"],
      events: s.lastEvents,
      touches: touchesOf(s.lastEvents),
      warnings: [...s.lastWarnings],
    };
    log.push(group);
  };
  push({ type: "createSession", players: ps, walletMode: "appTruth" } as never);
  while (log.length < GROUPS) {
    const next = [...candidates(s, rand), ...FLOW].find((a) => s.tryDo(a).kind === "ok");
    if (!next) throw new Error(`walk stalled at ${log.length}`);
    push(next);
  }
  const payout = { type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 240 }], mode: "full" };
  // Bounded: a walk where every company has closed (RotLA) never reaches a payout.
  for (let extra = 0; extra < 500 && s.tryDo(payout).kind !== "ok"; extra++) {
    const next = [...candidates(s, rand), ...FLOW].find((a) => a.type !== "runAndPayout" && s.tryDo(a).kind === "ok");
    if (!next) throw new Error("no way to reach a payout");
    push(next);
  }
  return { log, payout };
}

describe("performance (T163)", () => {
  const { log, payout } = longGame();

  it(`replays a ${GROUPS}-group log in under 50 ms`, () => {
    expect(log.length).toBeGreaterThanOrEqual(GROUPS);
    const ms = timeIt(() => replay(game, players, log));
    expect(ms).toBeLessThan(50);
  });

  it("loads from the latest snapshot plus the tail well under that", () => {
    const latest = snapshotsFor(game, players, log).at(-1)!;
    expect(latest).toBeDefined();
    const full = replay(game, players, log).state;
    expect(replayFromSnapshot(game, log, latest).state).toEqual(full);
    const ms = timeIt(() => new SessionStore({ appendEntry: () => Promise.resolve() }, makeMeta({ game, players }), log, { snapshot: latest }));
    expect(ms).toBeLessThan(25);
  });

  it("dispatches a payout (pipeline + IndexedDB write) in under 100 ms", async () => {
    const db = await openCompanionDb(freshDbName());
    try {
      const repo = new SessionRepo(db);
      const meta = makeMeta({ game, players, entryCount: log.length });
      await repo.importSession(meta, log);
      for (const snapshot of snapshotsFor(game, players, log).slice(-1)) await repo.putSnapshot(meta.id, snapshot);
      const store = (await SessionStore.open(repo, meta.id))!;
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        const result = await store.dispatch(payout);
        times.push(performance.now() - t);
        expect(result.ok).toBe(true);
        await store.undoLast(); // back to the same position for the next run
      }
      expect(median(times)).toBeLessThan(100);
    } finally {
      db.close();
    }
  });

  it("undoes back to the first entry of a 300-group game in under 500 ms (feature 010, SC-004)", async () => {
    const short = log.slice(0, 300);
    const first = short[1] as GroupEntry;
    const times: number[] = [];
    for (let run = 0; run < 3; run++) {
      const db = await openCompanionDb(freshDbName());
      try {
        const repo = new SessionRepo(db);
        const meta = makeMeta({ game, players, entryCount: short.length });
        await repo.importSession(meta, short);
        for (const snapshot of snapshotsFor(game, players, short)) await repo.putSnapshot(meta.id, snapshot);
        const store = (await SessionStore.open(repo, meta.id))!;
        const t = performance.now();
        const result = await store.undoTo(first.id, { confirmed: true });
        times.push(performance.now() - t);
        expect(result.ok && result.undone.length).toBe(299);
        expect(store.getSnapshot().effective).toHaveLength(1);
      } finally {
        db.close();
      }
    }
    expect(median(times)).toBeLessThan(500);
  });

  it("expands the first entry of a 300-group game in under 50 ms, active and undone (plan performance goals)", () => {
    const short = log.slice(0, 300);
    const first = short[1] as GroupEntry;
    expect(timeIt(() => entryBreakdown(game, players, short, first.id))).toBeLessThan(50);
    const ids = short.slice(1).map((e) => (e as GroupEntry).id).reverse();
    const undone: LogEntry[] = [...short, { kind: "undo", seq: 301, at: "2026-10-12T20:00:00.000Z", groupIds: ids }];
    expect(entryBreakdown(game, players, undone, first.id)?.status).toBe("reverted");
    expect(timeIt(() => entryBreakdown(game, players, undone, first.id))).toBeLessThan(50);
  });
});

describe("performance with RotLA mergers (T100)", () => {
  const rotla = getBuiltInGame("rotla");
  const rotlaPlayers = players.slice(0, 4);
  const { log } = longGame(rotla, rotlaPlayers);

  it(`replays a ${GROUPS}-group RotLA log with mergers in under 50 ms`, () => {
    const merges = log.filter((e) => e.kind === "group" && e.action.type === "mergeCompanies").length;
    expect(merges).toBeGreaterThan(0);
    const ms = timeIt(() => replay(rotla, rotlaPlayers, log));
    expect(ms).toBeLessThan(50);
  });
});
