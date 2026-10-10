import { reduceAll } from "../events/reduce";
import { initialState, type SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import { gameOver } from "../mechanics/endTriggers";
import { stepGameEnd, type FoldGroup, type GameEndFold } from "../mechanics/gameEnd";
import { checkInvariants, type InvariantWarning } from "../mechanics/invariants";
import type { Player } from "../types";
import { effectiveLog } from "./effectiveLog";
import type { LogEntry } from "./entries";

export interface ReplayResult extends GameEndFold {
  readonly state: SessionState;
  /** Violations present at the end, each with the first group after which it appeared. */
  readonly violations: readonly InvariantWarning[];
}

/**
 * A replay position: the state so far, when each current invariant violation first appeared
 * (so History can highlight the group that caused it, FR-015), and the game-end fold (feature 007).
 */
export interface ReplayCursor extends GameEndFold {
  readonly state: SessionState;
  readonly firstSeen: Readonly<Record<string, string>>;
  readonly violations: readonly InvariantWarning[];
}

export function startCursor(game: GameDefinition, players: readonly Player[]): ReplayCursor {
  const state = initialState(game, players);
  return cursorAt(game, state, {}, "", { over: gameOver(game, state), end: null, eliminationOrder: [], autoEndGroups: [] });
}

/** Applies one group's events, re-checks the invariants and steps the game-end fold. */
export function advance(game: GameDefinition, cursor: ReplayCursor, group: FoldGroup): ReplayCursor {
  const state = reduceAll(cursor.state, group.events);
  return cursorAt(game, state, cursor.firstSeen, group.id, stepGameEnd(game, cursor, group, cursor.state, state));
}

export function cursorAt(
  game: GameDefinition,
  state: SessionState,
  previous: Readonly<Record<string, string>>,
  groupId: string,
  fold: GameEndFold,
): ReplayCursor {
  const firstSeen: Record<string, string> = {};
  const violations: InvariantWarning[] = [];
  for (const v of checkInvariants(game, state)) {
    const key = `${v.kind}|${v.detail}`;
    const first = previous[key] ?? groupId;
    firstSeen[key] = first;
    violations.push({ ...v, firstBadGroupId: first });
  }
  return { state, firstSeen, violations, ...foldOf(fold) };
}

/** The game-end fields alone (a cursor carries more). */
export function foldOf(f: GameEndFold): GameEndFold {
  return { over: f.over, end: f.end, eliminationOrder: f.eliminationOrder, autoEndGroups: f.autoEndGroups };
}

/** What a replay returns from its final cursor. */
export function resultOf(cursor: ReplayCursor): ReplayResult {
  return { state: cursor.state, violations: cursor.violations, ...foldOf(cursor) };
}

/** State = reduce(effective log), with invariants checked after every group (FR-015). */
export function replay(game: GameDefinition, players: readonly Player[], log: readonly LogEntry[]): ReplayResult {
  let cursor = startCursor(game, players);
  for (const g of effectiveLog(log)) cursor = advance(game, cursor, g);
  return resultOf(cursor);
}
