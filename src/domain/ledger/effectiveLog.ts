import type { Action } from "../actions/schemas";
import type { PrimitiveEvent } from "../events/types";
import type { EntrySource, GroupEntry, GroupId, LogEntry } from "./entries";

/** One group as it currently applies: its latest version, unless reverted. */
export interface EffectiveGroup {
  readonly id: GroupId;
  readonly seq: number;
  /** When the group was first recorded. */
  readonly at: string;
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
  /** Seq of the entry that reverted the group. */
  undoneBy?: number;
}

/**
 * Walks the log in seq order (research R3, feature 010 R1):
 * - `undo` marks every listed group reverted, whatever its versions;
 * - legacy `revert` pops the latest amendment if there is one, otherwise marks the group reverted;
 * - legacy `amend` pushes a new version (ignored for a reverted group).
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
    if (entry.kind === "undo") {
      for (const id of entry.groupIds) {
        const t = groups.get(id);
        if (t && !t.reverted) markReverted(t, entry.seq);
      }
      continue;
    }
    const t = groups.get(entry.groupId);
    if (!t) continue;
    if (entry.kind === "revert") {
      if (t.versions.length > 1) t.versions.pop();
      else if (!t.reverted) markReverted(t, entry.seq);
    } else if (!t.reverted) {
      t.versions.push({ action: entry.action, events: entry.events, touches: entry.touches });
    }
  }
  return groups;
}

function markReverted(t: Track, seq: number): void {
  t.reverted = true;
  t.undoneBy = seq;
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
      at: t.group.at,
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
  /** Seq of the `undo` (or legacy `revert`) entry that reverted the group. */
  readonly undoneBy?: number;
}

/** For History (FR-013): every group with its status and versions. */
export function groupHistory(log: readonly LogEntry[]): GroupHistory[] {
  return [...track(log).values()].map((t) => ({
    group: t.group,
    status: t.reverted ? "reverted" : t.versions.length > 1 ? "amended" : "active",
    versions: [...t.versions],
    ...(t.undoneBy !== undefined ? { undoneBy: t.undoneBy } : {}),
  }));
}

export function groupStatus(log: readonly LogEntry[], groupId: GroupId): GroupStatus | undefined {
  return groupHistory(log).find((h) => h.group.id === groupId)?.status;
}
