import type { Action } from "../actions/schemas";
import type { PrimitiveEvent } from "../events/types";
import type { EntrySource, GroupEntry, GroupId, LogEntry } from "./entries";

/** One group as it currently applies: its latest version, unless reverted. */
export interface EffectiveGroup {
  readonly id: GroupId;
  readonly seq: number;
  readonly source: EntrySource;
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
  readonly touches: readonly string[];
}

export type GroupStatus = "active" | "reverted" | "amended";

interface Version {
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
  readonly touches: readonly string[];
}

interface Track {
  readonly group: GroupEntry;
  readonly versions: Version[];
  reverted: boolean;
}

/**
 * Walks the log in seq order (research R3):
 * - `revert` pops the latest amendment if there is one, otherwise marks the group reverted;
 * - `amend` pushes a new version (ignored for a reverted group; the store refuses it anyway).
 */
function track(log: readonly LogEntry[]): Map<GroupId, Track> {
  const groups = new Map<GroupId, Track>();
  const ordered = [...log].sort((a, b) => a.seq - b.seq);
  for (const entry of ordered) {
    if (entry.kind === "group") {
      groups.set(entry.id, {
        group: entry,
        versions: [{ action: entry.action, events: entry.events, touches: entry.touches }],
        reverted: false,
      });
      continue;
    }
    const t = groups.get(entry.groupId);
    if (!t) continue;
    if (entry.kind === "revert") {
      if (t.versions.length > 1) t.versions.pop();
      else t.reverted = true;
    } else if (!t.reverted) {
      t.versions.push({ action: entry.action, events: entry.events, touches: entry.touches });
    }
  }
  return groups;
}

export function effectiveLog(log: readonly LogEntry[]): EffectiveGroup[] {
  const result: EffectiveGroup[] = [];
  for (const t of track(log).values()) {
    if (t.reverted) continue;
    const latest = t.versions[t.versions.length - 1] ?? t.versions[0];
    if (!latest) continue;
    result.push({
      id: t.group.id,
      seq: t.group.seq,
      source: t.group.source,
      action: latest.action,
      events: latest.events,
      touches: latest.touches,
    });
  }
  return result.sort((a, b) => a.seq - b.seq);
}

export interface GroupHistory {
  readonly group: GroupEntry;
  readonly status: GroupStatus;
  /** Every version, original first. */
  readonly versions: readonly Version[];
}

/** For History (FR-013): every group with its status and versions. */
export function groupHistory(log: readonly LogEntry[]): GroupHistory[] {
  return [...track(log).values()].map((t) => ({
    group: t.group,
    status: t.reverted ? "reverted" : t.versions.length > 1 ? "amended" : "active",
    versions: [...t.versions],
  }));
}

export function groupStatus(log: readonly LogEntry[], groupId: GroupId): GroupStatus | undefined {
  return groupHistory(log).find((h) => h.group.id === groupId)?.status;
}
