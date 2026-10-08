import { reduceAll } from "../events/reduce";
import { initialState, type SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { checkInvariants, type InvariantWarning } from "../mechanics/invariants";
import type { Player } from "../types";
import { effectiveLog } from "./effectiveLog";
import type { LogEntry } from "./entries";

export interface ReplayResult {
  readonly state: SessionState;
  /** Violations present at the end, each with the first group after which it appeared. */
  readonly violations: readonly InvariantWarning[];
}

/**
 * A replay position: the state so far, plus when each current invariant violation first
 * appeared (so History can highlight the group that caused it, FR-015).
 */
export interface ReplayCursor {
  readonly state: SessionState;
  readonly firstSeen: Readonly<Record<string, string>>;
  readonly violations: readonly InvariantWarning[];
}

export function startCursor(game: GameDefinition, players: readonly Player[]): ReplayCursor {
  return cursorAt(game, initialState(game, players), {}, "");
}

/** Applies one group's events and re-checks the invariants. */
export function advance(
  game: GameDefinition,
  cursor: ReplayCursor,
  group: { readonly id: string; readonly events: readonly PrimitiveEvent[] },
): ReplayCursor {
  return cursorAt(game, reduceAll(cursor.state, group.events), cursor.firstSeen, group.id);
}

export function cursorAt(
  game: GameDefinition,
  state: SessionState,
  previous: Readonly<Record<string, string>>,
  groupId: string,
): ReplayCursor {
  const firstSeen: Record<string, string> = {};
  const violations: InvariantWarning[] = [];
  for (const v of checkInvariants(game, state)) {
    const key = `${v.kind}|${v.detail}`;
    const first = previous[key] ?? groupId;
    firstSeen[key] = first;
    violations.push({ ...v, firstBadGroupId: first });
  }
  return { state, firstSeen, violations };
}

/** State = reduce(effective log), with invariants checked after every group (FR-015). */
export function replay(game: GameDefinition, players: readonly Player[], log: readonly LogEntry[]): ReplayResult {
  let cursor = startCursor(game, players);
  for (const g of effectiveLog(log)) cursor = advance(game, cursor, g);
  return { state: cursor.state, violations: cursor.violations };
}
