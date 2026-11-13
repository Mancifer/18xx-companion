# Data Model: Player and Company History, Last Run Revenue

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

Nothing here is stored. Every shape is derived from the existing ledger (FR-019). No event,
action, schema or persistence change is made.

## 1. HistorySubject

The player or company a filtered history is for.

```ts
type HistorySubject =
  | { readonly kind: "player"; readonly id: PlayerId }
  | { readonly kind: "company"; readonly id: CompanyId };
```

- Its holder ref is `player:<id>` or `company:<id>`.
- Validation: the id must exist in the session (`meta.players` or `meta.game.companies`). An unknown
  id (for example after an import) falls back to the full History.

## 2. Involvement

`involves(subject, events): boolean`. The rules per event are in research R1.

A group is involved when any event of any of its versions matches. This applies to every status:
active, reverted and amended.

`involvedGroupIds(history, subject): Set<GroupId>` is used by the screen.

## 3. Filtered round sections

`RoundSection` (feature 011) is unchanged. The filtered view takes `roundSections(game, history)`
over the **full** history, then:
- keeps each section's `groupIds` ∩ involved;
- drops the sections left empty.

Titles and the `finished` flag stay those of the full view.

## 4. FocusedBreakdown

```ts
interface FocusedBreakdown extends EntryBreakdown {
  readonly movements: readonly (Movement & { readonly mine: boolean })[];
  readonly balances: readonly (BalanceChange & { readonly mine: boolean })[];
}
```

`mine` is true when the movement or balance involves the subject, with the same rules as R1
applied to the movement kinds (`money`, `shares`, `asset`, `price`, `status`, `counter`, `turn`).
Lines with `mine` come first, in their original order, then the rest in their original order.

## 5. LastRun

```ts
type RunMode = "full" | "withhold" | "half";

interface LastRun {
  readonly company: CompanyId;
  readonly groupId: GroupId;
  /** The OR the run belongs to. */
  readonly or: OrRef;            // { orSet, orIndex } from operatingPhase.ts
  /** Sum of the parts; null when the run's amount could not be read (legacy compound). */
  readonly revenue: number | null;
  /** In game.revenueParts order; one entry in most games, two in 21Moon. */
  readonly parts: readonly { readonly part: string; readonly amount: number }[];
  /** null: the game's parts are fixed (no payout choice). */
  readonly mode: RunMode | null;
}
```

`lastRun(game, effective, company): LastRun | undefined`. It returns:
- `undefined` when the company never ran (FR-014);
- `undefined` for a national company (research R5);
- for any other company, the last `runs` mark in the effective log.

A closed company still has a `LastRun`. FR-016 is a display rule (§6), so the domain stays
status-agnostic.

`lastRuns(game, effective): ReadonlyMap<CompanyId, LastRun>` does one fold for every company, for
the Table.

### State changes that affect it

| Change | Effect on `lastRun(C)` |
|---|---|
| C runs (`runAndPayout`, a compound with a run, or a turn passed with no run) | Becomes that run |
| Latest run of C undone | The previous effective run, or `undefined` |
| A new OR starts, C not yet operated | Unchanged (previous run, its own `or`) |
| C formed by a RotLA merger | `undefined` until C itself runs (FR-017) |
| C closed | Unchanged in the domain; hidden in the UI |

## 6. Display rules (derived in UI)

- **Card**: show `lastRun.revenue` when `lastRun` exists, `revenue !== null` and status ≠
  `closed`. The label is "Última corrida" / "Last run", next to the trains row. It is shown even
  without trains (a run of 0 shows 0).
- **Sheet**: under the same conditions, show:
  - the amount;
  - the mode label (when `mode !== null`);
  - `orHeading(or.orSet, or.orIndex)`;
  - each part with its game text name, when `parts.length > 1`.

## 7. Screen parameters (nav)

```ts
type Screen =
  | { name: "table"; reopen?: { kind: "player" | "company"; id: string } }
  | { name: "history"; subject?: HistorySubject; focus?: GroupId; back?: Screen }
  | /* unchanged */ ...;
```

The routing rules are in [contracts/ui.md](./contracts/ui.md).
