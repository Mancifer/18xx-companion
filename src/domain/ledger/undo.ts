import { effectiveLog, type EffectiveGroup } from "./effectiveLog";
import type { GroupId, LogEntry } from "./entries";

/**
 * What an undo back to a group covers (feature 010, data-model §3): the target plus every later
 * effective group, newest first. Undo only runs in order, so the result is always the effective
 * log as it was just before the target.
 */
export interface UndoRange {
  readonly targetId: GroupId;
  /** Newest first. */
  readonly groups: readonly EffectiveGroup[];
  readonly count: number;
  /** The target. */
  readonly oldest: EffectiveGroup;
  readonly newest: EffectiveGroup;
}

/** The session's setup group can never be undone. */
export function isSetup(group: { readonly action: { readonly type: string } }): boolean {
  return group.action.type === "createSession";
}

/** The group a plain "Deshacer" undoes: the newest effective non-setup group. */
export function newestUndoable(log: readonly LogEntry[]): EffectiveGroup | undefined {
  return [...effectiveLog(log)].reverse().find((g) => !isSetup(g));
}

/** Undefined when the target is unknown, already undone, or the setup group. */
export function undoRangeOf(log: readonly LogEntry[], targetId: GroupId): UndoRange | undefined {
  return undoRangeIn(effectiveLog(log), targetId);
}

/** The same, from an effective log already at hand (voice resolution). */
export function undoRangeIn(effective: readonly EffectiveGroup[], targetId: GroupId): UndoRange | undefined {
  const target = effective.find((g) => g.id === targetId);
  if (!target || isSetup(target)) return undefined;
  const groups = effective.filter((g) => g.seq >= target.seq).reverse();
  const newest = groups[0] ?? target;
  return { targetId, groups, count: groups.length, oldest: target, newest };
}
