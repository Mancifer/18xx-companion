import type { PrimitiveEvent } from "../events/types";
import type { CompanyId, HolderRef, PlayerId } from "../types";
import type { BalanceChange, EntryBreakdown, Movement } from "./breakdown";
import type { GroupHistory } from "./effectiveLog";
import type { GroupId } from "./entries";
import type { RoundSection } from "./rounds";

/**
 * Feature 017: which History entries concern one player or one company (research R1). Derived
 * from the stored primitive events, never stored, so undone entries are judged by the movements
 * they had while active and entries from older versions need no migration.
 */

/** The player or company a filtered History is for (data-model §1). */
export type HistorySubject = { readonly kind: "player"; readonly id: PlayerId } | { readonly kind: "company"; readonly id: CompanyId };

export function subjectRef(s: HistorySubject): HolderRef {
  return s.kind === "player" ? `player:${s.id}` : `company:${s.id}`;
}

/** One event against the subject: the table in research R1. */
function eventInvolves(subject: HistorySubject, ref: HolderRef, e: PrimitiveEvent): boolean {
  const company = subject.kind === "company" ? subject.id : undefined;
  switch (e.t) {
    case "moneyTransfer":
    case "assetTransfer":
      return e.from === ref || e.to === ref;
    case "shareTransfer":
      return e.from === ref || e.to === ref || e.company === company;
    case "marketMove":
    case "companyStatus":
      return e.company === company;
    case "counterChange":
      return e.subject === ref;
    case "turnAdvance":
      return company !== undefined && e.company === company;
    case "note":
      // Free text: never matched by name.
      return false;
  }
}

export function involves(subject: HistorySubject, events: readonly PrimitiveEvent[]): boolean {
  const ref = subjectRef(subject);
  return events.some((e) => eventInvolves(subject, ref, e));
}

/** Every group (active, undone or amended) with a version that involves the subject. */
export function involvedGroupIds(history: readonly GroupHistory[], subject: HistorySubject): Set<GroupId> {
  const ids = new Set<GroupId>();
  for (const h of history) {
    const versions = h.versions.length > 0 ? h.versions.map((v) => v.events) : [h.group.events];
    if (versions.some((events) => involves(subject, events))) ids.add(h.group.id);
  }
  return ids;
}

/** The full History's sections, each keeping only the listed groups; empty sections are dropped. */
export function filterSections(sections: readonly RoundSection[], ids: ReadonlySet<GroupId>): RoundSection[] {
  return sections.flatMap((s) => {
    const groupIds = s.groupIds.filter((id) => ids.has(id));
    return groupIds.length > 0 ? [{ ...s, groupIds }] : [];
  });
}

export type FocusedMovement = Movement & { readonly mine: boolean };
export type FocusedBalance = BalanceChange & { readonly mine: boolean };

/** data-model §4: the breakdown with the subject's lines first, marked. */
export interface FocusedBreakdown extends EntryBreakdown {
  readonly movements: readonly FocusedMovement[];
  readonly balances: readonly FocusedBalance[];
}

function movementIsMine(subject: HistorySubject, ref: HolderRef, m: Movement): boolean {
  const company = subject.kind === "company" ? subject.id : undefined;
  switch (m.kind) {
    case "money":
    case "asset":
      return m.from === ref || m.to === ref;
    case "shares":
      return m.from === ref || m.to === ref || m.company === company;
    case "price":
    case "status":
      return m.company === company;
    case "counter":
      return m.subject === ref;
    case "turn":
      return company !== undefined && m.event.company === company;
  }
}

/** A stable partition: the subject's lines first, in their order, then the rest; nothing dropped. */
function partition<T extends { readonly mine: boolean }>(items: readonly T[]): T[] {
  return [...items.filter((i) => i.mine), ...items.filter((i) => !i.mine)];
}

export function focusBreakdown(b: EntryBreakdown, subject: HistorySubject): FocusedBreakdown {
  const ref = subjectRef(subject);
  return {
    ...b,
    movements: partition(b.movements.map((m) => ({ ...m, mine: movementIsMine(subject, ref, m) }))),
    balances: partition(b.balances.map((x) => ({ ...x, mine: x.holder === ref }))),
  };
}
