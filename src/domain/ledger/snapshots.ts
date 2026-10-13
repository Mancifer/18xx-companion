import type { SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import type { GameEndFold } from "../mechanics/gameEnd";
import type { Player } from "../types";
import { effectiveLog } from "./effectiveLog";
import type { LogEntry } from "./entries";
import { advance, cursorAt, foldOf, resultOf, startCursor, type ReplayCursor, type ReplayResult } from "./replay";

/**
 * Snapshots make load time independent of game length (research R3). They are an
 * optimization only: replaying the whole log always gives the same result.
 */
export const SNAPSHOT_EVERY = 50;

export interface Snapshot extends GameEndFold {
  /** Seq of the last group included. */
  readonly seq: number;
  /** Effective groups included, so the next snapshot point is known. */
  readonly groupCount: number;
  readonly state: SessionState;
  readonly firstSeen: Readonly<Record<string, string>>;
}

export function toSnapshot(cursor: ReplayCursor, seq: number, groupCount: number): Snapshot {
  return { seq, groupCount, state: cursor.state, firstSeen: cursor.firstSeen, ...foldOf(cursor) };
}

export function cursorFromSnapshot(game: GameDefinition, snapshot: Snapshot): ReplayCursor {
  return cursorAt(game, snapshot.state, snapshot.firstSeen, "", snapshot);
}

/** A snapshot stored before feature 007 has no game-end fields and cannot be resumed (research R9). */
export function hasEndFields(snapshot: Snapshot): boolean {
  const s: Partial<Snapshot> = snapshot;
  return typeof s.over === "boolean" && s.end !== undefined && Array.isArray(s.eliminationOrder) && Array.isArray(s.autoEndGroups);
}

/**
 * The cursor at the end of the log, from the latest usable snapshot: one that still matches the
 * effective log and has the game-end fields. With none, replays from the start.
 */
export function rebuild(game: GameDefinition, players: readonly Player[], log: readonly LogEntry[], snapshots: readonly Snapshot[]): ReplayCursor {
  const effective = effectiveLog(log);
  const usable = [...snapshots]
    .sort((a, b) => b.seq - a.seq)
    .find((s) => hasEndFields(s) && effective.filter((g) => g.seq <= s.seq).length === s.groupCount);
  let cursor = usable ? cursorFromSnapshot(game, usable) : startCursor(game, players);
  for (const g of effective) {
    if (!usable || g.seq > usable.seq) cursor = advance(game, cursor, g);
  }
  return cursor;
}

/** All snapshot points for a log (every SNAPSHOT_EVERY effective groups). */
export function snapshotsFor(game: GameDefinition, players: readonly Player[], log: readonly LogEntry[]): Snapshot[] {
  const snapshots: Snapshot[] = [];
  let cursor = startCursor(game, players);
  let count = 0;
  for (const g of effectiveLog(log)) {
    cursor = advance(game, cursor, g);
    count += 1;
    if (count % SNAPSHOT_EVERY === 0) snapshots.push(toSnapshot(cursor, g.seq, count));
  }
  return snapshots;
}

/** Replays only the effective groups after the snapshot. */
export function replayFromSnapshot(game: GameDefinition, log: readonly LogEntry[], snapshot: Snapshot): ReplayResult {
  let cursor = cursorFromSnapshot(game, snapshot);
  for (const g of effectiveLog(log)) {
    if (g.seq > snapshot.seq) cursor = advance(game, cursor, g);
  }
  return resultOf(cursor);
}

/**
 * An undo (or legacy revert/amend) aimed at a group the snapshot includes makes the snapshot
 * stale. An undo counts from its oldest group (feature 010, R4).
 */
export function invalidatedBy(log: readonly LogEntry[], entry: LogEntry, snapshot: Snapshot): boolean {
  if (entry.kind === "group") return false;
  const ids = new Set(entry.kind === "undo" ? entry.groupIds : [entry.groupId]);
  return log.some((e) => e.kind === "group" && ids.has(e.id) && e.seq <= snapshot.seq);
}
