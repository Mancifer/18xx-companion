# Contract: Domain Queries

Pure functions, all test-first (constitution VI). Paths are proposals for tasks.

## `src/domain/ledger/involvement.ts`

```ts
export type HistorySubject = { kind: "player"; id: PlayerId } | { kind: "company"; id: CompanyId };
export function subjectRef(s: HistorySubject): HolderRef;
export function involves(subject: HistorySubject, events: readonly PrimitiveEvent[]): boolean;
export function involvedGroupIds(history: readonly GroupHistory[], subject: HistorySubject): Set<GroupId>;
export function filterSections(sections: readonly RoundSection[], ids: ReadonlySet<GroupId>): RoundSection[];
export function focusBreakdown(b: EntryBreakdown, subject: HistorySubject): FocusedBreakdown;
```

Guarantees:
- `involves` follows the table in research R1 exactly. `note` events never match.
- `involvedGroupIds` includes reverted and amended groups, matching on any version.
- `filterSections` keeps section order and titles, drops empty sections, and never adds ids.
- `focusBreakdown` is a stable partition. It never drops or changes a movement or balance.

## `src/domain/ledger/lastRun.ts`

```ts
export interface LastRun { company; groupId; or: OrRef; revenue: number | null; parts; mode: RunMode | null }
export function lastRuns(game: GameDefinition, effective: readonly EffectiveGroup[]): ReadonlyMap<CompanyId, LastRun>;
export function lastRun(game: GameDefinition, effective: readonly EffectiveGroup[], company: CompanyId): LastRun | undefined;
```

Guarantees:
- **Run signal**: only `counterChange { key: "runs", delta > 0, subject: company:C }` marks a run.
- **Revenue**: the total equals the sum of the matched `runAndPayout` parts. A turn passed with no
  run is 0, with the `zeroRunAction` parts and mode. If no item matches, `revenue` is null.
- **Mode**: the run `marketMove` reason wins (payout/restack → full, withhold, half). Otherwise
  the item's mode, where null means full when the game has a choice, and none when its parts are
  fixed.
- **National companies** never appear in the result.
- **Mergers**: a merged major gets no entry from its minors.
- **Undo**: the result depends only on the effective groups passed in.

## Required tests

| Test file | What it covers |
|---|---|
| `tests/domain/involvement.test.ts` | Each event kind × player/company; a pool share purchase is in the company history; another company's payout is not in a non-holder's history; reverted groups are included; filtered sections |
| `tests/domain/lastRun.test.ts` | 1830 full / withhold / 0; undo falls back; previous OR kept; turn passed with no run → 0; compound with a null company; receivership forced withhold; 21Moon parts; 1848 BoE excluded; RotLA merger major has none (FR-017) |
| `tests/domain/perf.test.ts` (extend) | A ~160-action RotLA game: `lastRuns` plus `involvedGroupIds` for every subject stays within the existing perf budget |
