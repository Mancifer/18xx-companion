import type { Action } from "../actions/schemas";
import { isPlayerBankrupt, type SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { EndTriggerType, GameDefinition } from "../games/schema";
import type { EffectiveGroup } from "../ledger/effectiveLog";
import type { GroupId } from "../ledger/entries";
import { parseHolder, type Player, type PlayerId } from "../types";
import type { SessionOutcome } from "../session";
import { autoEndTriggers } from "./endTriggers";
import { finalResults } from "./scores";

/**
 * Whether the game is finished is derived from the log, never stored (feature 007, research R1,
 * R2): an `endGame` group ends it, a `reopenGame` group cancels the end, and for games that end
 * on their own the group that turns `gameOver` from false to true ends it.
 */
export interface GameEnd {
  /** The endGame group, or the group that reached an automatic end. */
  readonly groupId: GroupId;
  readonly seq: number;
  /** That group's time. */
  readonly at: string;
  readonly auto: boolean;
  readonly triggers: readonly EndTriggerType[];
  /** The state right after that group: the frozen results (FR-012). */
  readonly state: SessionState;
  /** The elimination order at that group, frozen with the state. */
  readonly eliminationOrder: readonly PlayerId[];
}

export interface GameEndStatus {
  /** null = not finished. */
  readonly end: GameEnd | null;
  /** Active groups after the end (0 when not finished). */
  readonly laterEntries: number;
}

/** The fold's running values, kept in the replay cursor and in snapshots. */
export interface GameEndFold {
  /** gameOver after the last group. */
  readonly over: boolean;
  readonly end: GameEnd | null;
  /** Players in the order their bankrupt counter went above 0 (research R8). */
  readonly eliminationOrder: readonly PlayerId[];
  /** Every group that reached an automatic end, kept after a reopening (History tags them). */
  readonly autoEndGroups: readonly GroupId[];
}

export interface FoldGroup {
  readonly id: GroupId;
  readonly seq: number;
  readonly at: string;
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
}

/** Players whose bankrupt counter crossed 0 in this group, in event order. */
function eliminationStep(order: readonly PlayerId[], group: FoldGroup, before: SessionState, after: SessionState): readonly PlayerId[] {
  let next = order;
  for (const e of group.events) {
    if (e.t !== "counterChange" || e.key !== "bankrupt") continue;
    const h = parseHolder(e.subject);
    if (h.kind !== "player") continue;
    const was = isPlayerBankrupt(before, h.id);
    const is = isPlayerBankrupt(after, h.id);
    if (!was && is && !next.includes(h.id)) next = [...next, h.id];
    else if (was && !is) next = next.filter((p) => p !== h.id);
  }
  return next;
}

/** One step of the fold (research R2, R8). Pure. */
export function stepGameEnd(
  game: GameDefinition,
  prev: GameEndFold,
  group: FoldGroup,
  before: SessionState,
  after: SessionState,
): GameEndFold {
  const eliminationOrder = eliminationStep(prev.eliminationOrder, group, before, after);
  const fired = autoEndTriggers(game, after);
  const over = fired.length > 0;
  const endHere = (auto: boolean, triggers: readonly EndTriggerType[]): GameEnd => ({
    groupId: group.id,
    seq: group.seq,
    at: group.at,
    auto,
    triggers,
    state: after,
    eliminationOrder,
  });

  let end = prev.end;
  let autoEndGroups = prev.autoEndGroups;
  if (group.action.type === "endGame") {
    end = endHere(false, group.action.triggers ?? []);
  } else if (group.action.type === "reopenGame") {
    end = null;
  } else if (!end && !prev.over && over) {
    end = endHere(true, fired);
    autoEndGroups = [...autoEndGroups, group.id];
  }
  if (over === prev.over && end === prev.end && eliminationOrder === prev.eliminationOrder && autoEndGroups === prev.autoEndGroups) return prev;
  return { over, end, eliminationOrder, autoEndGroups };
}

/** The status for the UI and the ActionContext. */
export function gameEndStatus(cursor: { readonly end: GameEnd | null }, effective: readonly EffectiveGroup[]): GameEndStatus {
  const end = cursor.end;
  if (!end) return { end: null, laterEntries: 0 };
  return { end, laterEntries: effective.filter((g) => g.seq > end.seq).length };
}

/**
 * The Home outcome (data-model §7), the only place it is computed: null while open, otherwise the
 * end time and the rank-1 players of the frozen results, in players order.
 */
export function outcomeOf(game: GameDefinition, players: readonly Player[], status: { readonly end: GameEnd | null }): SessionOutcome | null {
  const end = status.end;
  if (!end) return null;
  const winners = new Set(finalResults(game, players, end.state, end.eliminationOrder).filter((r) => r.winner).map((r) => r.player));
  return { endedAt: end.at, winners: players.filter((p) => winners.has(p.id)).map((p) => p.id) };
}

/** Whether two outcomes say the same thing (the store writes only a change). */
export function sameOutcome(a: SessionOutcome | null | undefined, b: SessionOutcome | null | undefined): boolean {
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  return a.endedAt === b.endedAt && a.winners.length === b.winners.length && a.winners.every((w, i) => w === b.winners[i]);
}
