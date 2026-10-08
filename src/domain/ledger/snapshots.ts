import type { SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import type { Player } from "../types";
import { effectiveLog } from "./effectiveLog";
import type { LogEntry } from "./entries";
import { advance, cursorAt, startCursor, type ReplayCursor, type ReplayResult } from "./replay";

/**
 * Snapshots make load time independent of game length (research R3). They are an
 * optimization only: replaying the whole log always gives the same result.
 */
export const SNAPSHOT_EVERY = 50;

export interface Snapshot {
  /** Seq of the last group included. */
  readonly seq: number;
  /** Effective groups included, so the next snapshot point is known. */
  readonly groupCount: number;
  readonly state: SessionState;
  readonly firstSeen: Readonly<Record<string, string>>;
}

export function toSnapshot(cursor: ReplayCursor, seq: number, groupCount: number): Snapshot {
  return { seq, groupCount, state: cursor.state, firstSeen: cursor.firstSeen };
}

export function cursorFromSnapshot(game: GameDefinition, snapshot: Snapshot): ReplayCursor {
  return cursorAt(game, snapshot.state, snapshot.firstSeen, "");
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
  return { state: cursor.state, violations: cursor.violations };
}

/** A revert or amend aimed at a group the snapshot includes makes the snapshot stale. */
export function invalidatedBy(log: readonly LogEntry[], entry: LogEntry, snapshot: Snapshot): boolean {
  if (entry.kind === "group") return false;
  const target = log.find((e) => e.kind === "group" && e.id === entry.groupId);
  return target !== undefined && target.seq <= snapshot.seq;
}
