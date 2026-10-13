import type { Action, Warning } from "../actions/schemas";
import type { PrimitiveEvent } from "../events/types";
import type { HolderRef } from "../types";

/** The ledger (data-model §10, research R3). Every entry is append-only. */

export type GroupId = string;
export type EntrySource = "touch" | "voice" | "system";

export interface GroupEntry {
  readonly kind: "group";
  readonly seq: number;
  readonly id: GroupId;
  readonly at: string;
  readonly source: EntrySource;
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
  readonly touches: readonly string[];
  readonly transcript?: string;
  readonly warnings: readonly Warning[];
}

/** Legacy (before feature 010): read-only, never written again. Undid one group or popped its latest amendment. */
export interface RevertEntry {
  readonly kind: "revert";
  readonly seq: number;
  readonly at: string;
  readonly groupId: GroupId;
}

/** Legacy (before feature 010): read-only, never written again. A corrected version of a group. */
export interface AmendEntry {
  readonly kind: "amend";
  readonly seq: number;
  readonly at: string;
  readonly groupId: GroupId;
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
  readonly touches: readonly string[];
}

/**
 * One undo intent (feature 010, research R1): every listed group becomes reverted as a whole,
 * whatever its versions. Newest first; at least one id.
 */
export interface UndoEntry {
  readonly kind: "undo";
  readonly seq: number;
  readonly at: string;
  readonly groupIds: readonly GroupId[];
}

export type LogEntry = GroupEntry | RevertEntry | AmendEntry | UndoEntry;

/**
 * Keys of the entities whose values an event changes (FR-014 dependency detection):
 * `money:<holder>`, `shares:<company>`, `market:<company>`, `asset:<assetId>`, `turn`,
 * `status:<company>`, `counter:<subject>`.
 */
export function touchesOf(events: readonly PrimitiveEvent[]): string[] {
  const keys = new Set<string>();
  const money = (h: HolderRef) => keys.add(`money:${h}`);
  for (const e of events) {
    switch (e.t) {
      case "moneyTransfer":
        money(e.from);
        money(e.to);
        break;
      case "shareTransfer":
        keys.add(`shares:${e.company}`);
        break;
      case "marketMove":
        keys.add(`market:${e.company}`);
        break;
      case "companyStatus":
        keys.add(`status:${e.company}`);
        break;
      case "assetTransfer":
        keys.add(`asset:${e.asset}`);
        break;
      case "turnAdvance":
        keys.add("turn");
        break;
      case "counterChange":
        keys.add(`counter:${e.subject}`);
        break;
      case "note":
        break;
    }
  }
  return [...keys].sort();
}
