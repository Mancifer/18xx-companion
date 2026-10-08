import { effectiveLog, groupHistory, type EffectiveGroup } from "./effectiveLog";
import type { LogEntry } from "./entries";

/**
 * Later active groups that touch an entity whose value the group changes (FR-014). Pass
 * `extraKeys` with an amend's new touches, so entities only the correction changes count too.
 */
export function dependentsOf(log: readonly LogEntry[], groupId: string, extraKeys: readonly string[] = []): EffectiveGroup[] {
  const history = groupHistory(log).find((h) => h.group.id === groupId);
  if (!history) return [];
  const current = history.versions[history.versions.length - 1] ?? history.versions[0];
  const keys = new Set([...(current?.touches ?? []), ...extraKeys]);
  return effectiveLog(log).filter((g) => g.seq > history.group.seq && g.touches.some((k) => keys.has(k)));
}
