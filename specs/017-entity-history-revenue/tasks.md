---

description: "Task list for feature 017 — Player and Company History, Last Run Revenue"
---

# Tasks: Player and Company History, Last Run Revenue

**Input**: Design documents from `specs/017-entity-history-revenue/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/domain.md](contracts/domain.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle VI requires test-first domain logic (`involves`,
`focusBreakdown`, `lastRun`). The UI tests extend the existing Testing Library suites. Write each
test task first and watch it fail before doing its implementation task.

**Organization**: One phase per user story, in spec priority order: US1 and US2 (P1), then US3
(P2), then US4 (P3). US1 and US2 are independent of each other. US3 reuses US1's filtered screen.
US4 needs the filtered screen from US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md

## Path Conventions

- Single project: `src/`, `tests/`, `e2e/` at the repo root.
- Spanish catalogs are in `src/i18n/es/ui/` and English ones in `src/i18n/en/ui/`. Both use the
  same keys, typed by `src/i18n/contract/ui.ts`. `tests/ui/catalog.test.ts` checks parity.
- Spanish text uses Uruguayan wording.
- Ledger helpers live in `src/domain/ledger/`, next to `breakdown.ts`, `rounds.ts` and
  `operatingPhase.ts`.

---

## Phase 1: Setup

**Purpose**: Get a baseline before any change.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the clean tree. Note any failures that already exist in the Notes section of specs/017-entity-history-revenue/tasks.md, so they are not blamed on this feature.

---

## Phase 2: Foundational (navigation parameters)

**Purpose**: The screen parameters that US1, US3 and US4 need to open a filtered History and come back to the sheet (research R2–R4, data-model §7).

- [X] T002 Extend `Screen` in src/ui/nav.ts:
  - `{ name: "table"; reopen?: { kind: "player" | "company"; id: string } }`
  - `{ name: "history"; subject?: HistorySubject; focus?: GroupId; back?: Screen }`
  - Import `HistorySubject` from src/domain/ledger/involvement.ts. Create that file now with only `export type HistorySubject = { readonly kind: "player"; readonly id: PlayerId } | { readonly kind: "company"; readonly id: CompanyId }` and `export function subjectRef(s: HistorySubject): HolderRef` (returns `player:<id>` or `company:<id>`).
- [X] T003 Pass the screen parameters through in src/ui/App.tsx:
  - `History` receives `subject`, `focus` and `back` from the `history` screen;
  - `Table` receives `reopen` from the `table` screen.
  - Any screen built without these fields must still type-check.
- [X] T004 [P] Add a failing test in tests/ui/history.test.tsx: rendering `Table` with `reopen: { kind: "company", id }` opens that company's sheet on mount, and with `kind: "player"` opens that player's sheet.
- [X] T005 Make T004 pass. In src/ui/screens/Table.tsx, seed the `open` state from the `reopen` prop, using the same `Open` values the player tile and company card set today. Then add a `back` target to the History top-bar arrow in src/ui/screens/History.tsx: go to `back ?? { name: "table" }`.

**Checkpoint**: Navigation can carry a subject and return to a sheet. No visible change yet.

---

## Phase 3: User Story 1 — Trace what happened to a company (Priority: P1) 🎯 MVP

**Goal**: "Historial" in the company sheet opens a read-only History of only the entries that touched that company (FR-002, FR-004 to FR-010).

**Independent Test**:
1. In an 1830 session, play two SRs and two ORs with several companies.
2. Open the PRR history.
3. It lists every entry that moved PRR money, PRR shares (including a pool buy), PRR trains, the
   PRR price or status, or passed the turn to the PRR, and nothing else.
4. It shows no undo controls.

### Tests for User Story 1 (write first, see them fail)

- [X] T006 [P] [US1] Create tests/domain/involvement.test.ts with a company `C` case for each event kind, following research R1:
  - `moneyTransfer` from or to `company:C` → true;
  - `shareTransfer` with `company === C` (for example player ← pool) → true;
  - `shareTransfer` of another company where `from`/`to` is `company:C` → true;
  - `assetTransfer` from or to `company:C` → true;
  - `marketMove` and `companyStatus` with `company === C` → true;
  - `counterChange` with subject `company:C` → true;
  - `turnAdvance` with `company === C` → true;
  - `note` → false;
  - another company's payout to C's shareholders → false.
- [X] T007 [P] [US1] Add tests to tests/domain/involvement.test.ts:
  - `involvedGroupIds(history, subject)` includes reverted groups, and amended legacy groups that match on any version;
  - `filterSections(sections, ids)` keeps section order and titles, drops sections left empty, and never adds ids.
- [X] T008 [P] [US1] Add tests to tests/domain/involvement.test.ts for `focusBreakdown(breakdown, { kind: "company", id })`:
  - a stable partition: the subject's movements and balances come first, in their original order, marked `mine: true`;
  - the others follow with `mine: false`;
  - nothing is dropped or changed.
- [X] T009 [P] [US1] Add tests to tests/ui/history.test.tsx, rendering `History` with `subject: { kind: "company", id: "PRR" }` on a fixture session:
  - only PRR entries are listed;
  - only round sections that hold a listed entry are shown, with the same titles as the full view;
  - undone PRR entries show the "deshecha" badge;
  - the title reads "Historial · " followed by the PRR badge;
  - there is no "Deshacer" and no "Deshacer hasta acá" in any row or panel, and no `UndoToast`;
  - an expanded entry renders the PRR lines first with class `history-mine`;
  - a company with no entries shows the empty message.
- [X] T010 [P] [US1] Add a test to tests/ui/history.test.tsx (company sheet case): tapping "Historial" in `CompanySheet` navigates to `{ name: "history", subject: { kind: "company", id }, back: { name: "table", reopen: { kind: "company", id } } }`.

- [X] T039 [US1] *(added 2026-11-09 by analysis C1; run after T011, and again after T027 for players)* Add an entity-history check to tests/domain/randomGames.test.ts. It reuses the existing seeded walks over every built-in game (`TestSession`, `SEEDS`, `STEPS`). After each walk, for every company C:
  - **Money adds up (SC-003)**: the signed sum of `moneyTransfer` amounts into and out of `company:C`, over the active groups in `involvedGroupIds(history, { kind: "company", id: C })`, equals `cashOf(s.state, "company:C")`.
  - **Nothing missing (SC-002)**: every active group *not* in that set has no `entryBreakdown(...)` movement whose `from`, `to`, `company`, `subject` or turn `company` refers to C. This checks `involves` against the independent breakdown code.
  - **Players, once T027 is done**: the same two checks for every player, comparing the money sum against their cash minus their cash in `initialState(game, players)`.
  - Report the seed, game and subject on failure, in the style of `checkIncome`.

### Implementation for User Story 1

- [X] T011 [US1] Implement in src/domain/ledger/involvement.ts:
  - `involves(subject, events)`, with the company rules from research R1 (the player rules come in US3, T027);
  - `involvedGroupIds(history: readonly GroupHistory[], subject): Set<GroupId>`, matching any version (`h.versions`, falling back to `h.group.events`);
  - `filterSections(sections: readonly RoundSection[], ids: ReadonlySet<GroupId>): RoundSection[]`.
  - This makes T006 and T007 pass.
- [X] T012 [US1] Implement `focusBreakdown(b: EntryBreakdown, subject): FocusedBreakdown` in src/domain/ledger/involvement.ts, with the type from data-model §4. `mine` applies the R1 rules to each movement kind:
  - `money` / `shares` / `asset`: `from` or `to`;
  - `price` / `status`: `company`;
  - `counter`: `subject`;
  - `turn`: `event.company`;
  - balances: `holder === subjectRef(subject)`.
  - This makes T008 pass.
- [X] T013 [P] [US1] Add the text keys to src/i18n/contract/ui.ts, src/i18n/es/ui/history.ts, src/i18n/en/ui/history.ts and src/i18n/es/ui/sheets.ts / src/i18n/en/ui/sheets.ts, following contracts/ui.md:
  - `history.subjectTitle(subject)`: "Historial · {subject}" / "History · {subject}";
  - `history.emptyFor(name)`: "No hay movimientos de {subject} todavía." / "Nothing involving {subject} yet.";
  - `sheets.history`: "Historial" / "History".
- [X] T014 [US1] Add a filtered mode to src/ui/screens/History.tsx, used when `subject` is set:
  - compute `involvedGroupIds` with `useMemo` on `[history, subject]`;
  - build `filterSections(roundSections(...full history...), ids)`;
  - render the title with the player name or the `CompanyBadge` plus name (FR-007);
  - show the empty message when `ids` is empty (FR-009);
  - pass no `onUndo` / `onUndoBackTo` and skip `UndoToast` and `UndoRangeSheet` (FR-008);
  - keep the invariant banner;
  - pass `subject` down to `HistoryItem` and `Breakdown`, so `Breakdown` renders through `focusBreakdown` and adds class `history-mine` to marked `<li>`s.
  - This makes T009 pass.
- [X] T015 [P] [US1] Add a `.history-mine` style to src/ui/styles/components.css: bold, with a leading "▸" marker through `::before`, so color is never the only cue (constitution V). Check it in light and dark themes.
- [X] T016 [US1] Add an optional `onHistory?: () => void` prop to src/ui/sheets/HolderSheet.tsx. It renders a "Historial" button (at least 48 px, FR-020) first in the action row, before "Pagar" / `payMenu`. In src/ui/sheets/CompanySheet.tsx, wire it to `go({ name: "history", subject: { kind: "company", id: companyId }, back: { name: "table", reopen: { kind: "company", id: companyId } } })` with `useNav()`. Make sure the button also shows in finished sessions (feature 007). This makes T010 pass.

**Checkpoint**: The company history works end to end. MVP is shippable.

---

## Phase 4: User Story 2 — See a company's last run revenue at a glance (Priority: P1)

**Goal**: Every company card shows its last run revenue next to its trains, and the company sheet adds how it was paid, the OR, and the parts (FR-011 to FR-017).

**Independent Test**:
1. In 1830, run the B&O for 160 with a full payout. The card shows "Última corrida 160" and the
   sheet shows "160 · repartió · OR 1.1".
2. Next OR, run it for 0 and withhold. Both show 0.
3. Undo that run. Both show 160 again.

### Tests for User Story 2 (write first, see them fail)

- [X] T017 [P] [US2] Create tests/domain/lastRun.test.ts, built with the existing session/test helpers in tests/helpers:
  - **1830 basics**:
    - a company that never ran → `undefined`;
    - `runAndPayout` 160 full → `{ revenue: 160, parts: [{ part: "revenue", amount: 160 }], mode: "full", or: { orSet: 1, orIndex: 1 } }`;
    - a later run of 0 withheld → `revenue: 0, mode: "withhold"`;
    - after undoing the second run → back to 160 (fold only the `effectiveLog`).
  - **New OR**: a new OR started and the company has not operated → keeps the previous run with its own `or`.
  - **Turn passed with no run**: `nextCompany` with no recorded run → `revenue: 0`, with the parts and mode of `zeroRunAction`.
  - **Half**: the half mode → `"half"`.
- [X] T018 [P] [US2] Add edge cases to tests/domain/lastRun.test.ts:
  - **Compound**: a `compound` group with a `runAndPayout` item where `company: null` and the company is operating → the revenue is read from that item (research R5).
  - **Unmatched compound**: a compound whose run cannot be matched → `revenue: null`.
  - **Forced withhold**: a forced withhold (receivership) records `mode: "withhold"` even though the action said full. The mode is taken from the run's `marketMove` reason (research R6: `payout`/`restack` → full, `withhold`, `half`).
  - **21Moon**: two parts → total = sum, `parts` in `game.revenueParts` order, `mode: null`.
  - **1848**: the national company (BoE, `kind: "national"`) after `nationalPayout` → absent from `lastRuns`.
  - **RotLA merger (FR-017)**: two minors that ran are merged → the major has no `LastRun` until it runs. The minors keep theirs, since the domain is status-agnostic.
- [X] T019 [P] [US2] Create tests/ui/companyCard.test.tsx, covering the card and the sheet:
  - no "Última corrida" before the first run;
  - after a run of 160 the card shows `data-testid="last-run-<id>"` with the formatted 160, even when the company has no trains;
  - a run of 0 shows 0;
  - after undo it disappears;
  - a closed company shows none (FR-016);
  - `CompanySheet` shows "160 · repartió · OR 1.1";
  - in 21Moon the sheet lists each part by its game text name.

### Implementation for User Story 2

- [X] T020 [US2] Implement src/domain/ledger/lastRun.ts, following data-model §5 and contracts/domain.md:
  - **Types**: `RunMode` and `LastRun`, with `or: OrRef` imported from operatingPhase.ts.
  - **`lastRuns(game, effective): ReadonlyMap<CompanyId, LastRun>`**: fold the groups in seq order, event by event, starting from `initialState(game, [])`:
    - pass `turnAdvance` through `advanceTurn` (as rounds.ts does);
    - on `counterChange { key: "runs", delta > 0, subject: company:C }` with C not `kind: "national"`, record a run for C in that group at the current `orSet` / `orIndex`;
    - remember the operating company just before that event, to resolve compound items with a null company.
  - **Amount and parts**, resolved from the group's action:
    - a `runAndPayout` action;
    - a `compound` whose last `runAndPayout` item has `company === C`, or `company === null` while C was operating;
    - otherwise a run of 0 built from `zeroRunAction(game, C)`;
    - if nothing matches, `revenue: null`.
  - **Mode**: from the group's `marketMove` for C with reason in {payout, restack, withhold, half}. Otherwise from the item's `mode`, where null means `"full"` when the game has a payout choice (`revenueParts.length === 1 && revenueParts[0].to === "choice"`), and `null` otherwise.
  - **`lastRun(game, effective, company)`**: `lastRuns(...).get(company)`.
  - This makes T017 and T018 pass.
- [X] T021 [P] [US2] Add the text keys to src/i18n/contract/ui.ts, src/i18n/es/ui/table.ts / src/i18n/en/ui/table.ts and src/i18n/es/ui/sheets.ts / src/i18n/en/ui/sheets.ts:
  - `table.companyCard.lastRun`: "Última corrida" / "Last run";
  - `sheets.company.runModes`: `{ full: "repartió", withhold: "retuvo", half: "mitad" }` / `{ full: "paid out", withhold: "withheld", half: "half" }`;
  - `sheets.company.lastRun`: the label.
  - The OR label reuses `domainText.orHeading(set, index)`.
- [X] T022 [US2] Show the last run on the company card in src/ui/components/CompanyCard.tsx:
  - fold the game once, not once per card: in src/ui/screens/Table.tsx, compute `lastRuns(meta.game, effectiveLog(log))` with `useMemo` on `[meta.game, log]`, and pass each card a `lastRun?: LastRun` prop (`lastRuns.get(companyId)`). `CompanyCard` does not call `lastRuns` itself. T023's `CompanySheet` computes its single value with `useMemo` on the same inputs (one sheet open at a time);
  - render it inside the `company-trains` row as `<span className="label">{t.lastRun}</span> <span className="money" data-testid={`last-run-${companyId}`}>{formatMoney(revenue)}</span>`;
  - render the row when the company has trains, loans or a shown last run;
  - hide it when there is no `LastRun`, when `revenue === null`, or when the status is `closed` (data-model §6).
- [X] T023 [US2] Show the last run in src/ui/sheets/CompanySheet.tsx: in the `info` block below the price line, add "Última corrida: {amount} · {mode label, when mode ≠ null} · {orHeading}". When `parts.length > 1`, add one line listing each part's game text name and amount. Same display rules as T022. This makes T019 pass.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — Trace what happened to a player (Priority: P2)

**Goal**: "Historial" in the player sheet opens the same read-only History, filtered to the player's own money and holdings (FR-001, FR-003).

**Independent Test**:
1. In 1830, play an SR and an OR, then make a "Fijar dinero" adjustment on Ana.
2. Open Ana's history. It lists her buys, her dividends and the adjustment.
3. Payouts of companies she doesn't hold are not listed.

### Tests for User Story 3 (write first, see them fail)

- [X] T024 [P] [US3] Add player cases to tests/domain/involvement.test.ts:
  - `moneyTransfer` from or to `player:p1` → true;
  - `shareTransfer` from or to `player:p1`, including presidency swaps → true;
  - `assetTransfer` (a private) from or to `player:p1` → true;
  - `counterChange` with subject `player:p1` → true;
  - `marketMove`, `companyStatus`, `turnAdvance` and `note` → false;
  - a payout of a company p1 holds no shares in → false;
  - a train bought by p1's company with no p1 money → false (spec Assumptions).
- [X] T025 [P] [US3] Add a `focusBreakdown` test with a player subject to tests/domain/involvement.test.ts: for a set-money adjustment, the balance line for `player:p1` (before → after) comes first, with `mine: true`.
- [X] T026 [P] [US3] Add tests to tests/ui/playerSheet.test.tsx:
  - "Historial" in `PlayerSheet` navigates to `{ name: "history", subject: { kind: "player", id }, back: { name: "table", reopen: { kind: "player", id } } }`;
  - rendering `History` with that subject lists only the player's entries, titled "Historial · <name>".

### Implementation for User Story 3

- [X] T027 [US3] Add the player rules from research R1 to `involves` in src/domain/ledger/involvement.ts. This makes T024 and T025 pass.
- [X] T028 [US3] Wire `onHistory` in src/ui/sheets/PlayerSheet.tsx to `go({ name: "history", subject: { kind: "player", id: playerId }, back: { name: "table", reopen: { kind: "player", id: playerId } } })`. In src/ui/screens/History.tsx, make sure the title uses the player's name from `meta.players`, and fall back to the full History when the subject id is unknown (data-model §1). This makes T026 pass.

**Checkpoint**: Player and company histories both work.

---

## Phase 6: User Story 4 — Move from a filtered history to the full timeline (Priority: P3)

**Goal**: Each expanded entry in a filtered history offers "Ver en el historial completo". It opens the full History at that entry, expanded, where undo works as today. Back returns to the filtered view (FR-008).

**Independent Test**:
1. In a company history, expand an older entry and choose "Ver en el historial completo".
2. The full History opens with it expanded, offering "Deshacer hasta acá".
3. Back returns to the filtered view. Back again returns to the Table with the sheet open.

### Tests for User Story 4 (write first, see them fail)

- [X] T029 [P] [US4] Add tests to tests/ui/history.test.tsx:
  - in a filtered history, every expanded panel has "Ver en el historial completo";
  - choosing it navigates to `{ name: "history", focus: <groupId>, back: <the current filtered screen> }`;
  - rendering the full `History` with `focus` opens that item's `<details>` (`open` attribute) and calls `scrollIntoView` once (mock it);
  - its panel still shows "Deshacer hasta acá" for an older entry;
  - the back arrow goes to `back`.

### Implementation for User Story 4

- [X] T030 [P] [US4] Add the text key `history.showInFull` ("Ver en el historial completo" / "Show in full history") to src/i18n/contract/ui.ts, src/i18n/es/ui/history.ts and src/i18n/en/ui/history.ts.
- [X] T031 [US4] In src/ui/screens/History.tsx:
  - give `HistoryItem` an optional `onShowInFull`, rendered as a button in the panel when set (filtered mode only), calling `go({ name: "history", focus: group.id, back: { name: "history", subject, back } })`;
  - add a `focused` prop that sets `<details open>` initially and, in a mount-only `useEffect`, calls `scrollIntoView({ block: "center" })` on the item's `<li>`.
  - This makes T029 pass.

**Checkpoint**: All four stories work.

---

## Phase 7: Polish & Cross-Cutting

- [X] T032 [P] Extend tests/domain/perf.test.ts with a ~160-action RotLA game: `lastRuns` plus `involvedGroupIds` for every player and company stays within the file's existing time budget (research R8).
- [X] T033 [P] Add a merger case to tests/ui/rotla.test.tsx: after a Merger Round merge of two minors that had run, the major's card shows no `last-run-<id>` until its first run (FR-017).
- [X] T034 [P] Add e2e/entity-history.spec.ts on a phone-portrait viewport. Use the e2e/helpers.ts setup.
  1. Start an 1830 game and par and run a company.
  2. Check that its card shows the last run.
  3. Tap the card, then "Historial": only that company's entries are shown, with no undo button.
  4. Expand an entry, then "Ver en el historial completo": the full History is shown with the entry open.
  5. Back, back: the Table is shown with the company sheet open.
  6. Run `npm run build` before `npm run test:e2e`, since the :4173 preview may serve an old dist.
- [X] T035 [P] Check that tests/ui/catalog.test.ts, tests/ui/englishLeak.test.tsx and tests/ui/spanishGolden.test.tsx cover the new keys. Update the golden snapshots in tests/ui/__snapshots__ only where the new text is expected, and review each diff.
- [X] T036 [P] Update docs/spec.md (FR-021):
  - in §7 History, describe the filtered player/company History: read-only, "Ver en el historial completo", and which entries are listed;
  - in the player and company sheet descriptions, add the "Historial" button;
  - in the company card and sheet descriptions, add "Última corrida": total on the card; mode, OR and parts in the sheet; hidden before the first run, for closed companies, for national companies, and for a merged major until it runs.
- [X] T037 Run all the gates: `npm run typecheck`, `npm run lint`, `npm test`, then `npm run build && npm run test:e2e`. Summarize the full-suite and perf output with a cheap model before reading it (memory: perf output via cheap model). Record the results in the Notes.
- [ ] T038 Manual check of quickstart.md §1–§7 on a phone (portrait) and a tablet (landscape), in Spanish and English (needs user).

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)**, which blocks US1, US3 and US4.
- **US1 (T006–T016)**: after Foundational. It creates the filtered screen and the `involvement.ts` company rules.
- **US2 (T017–T023)**: needs only T001. It is independent of Foundational and US1 and can run in parallel with them.
- **US3 (T024–T028)**: after US1 (it reuses the filtered screen, `onHistory` in `HolderSheet`, and `involvement.ts`).
- **US4 (T029–T031)**: after US1. It is independent of US2 and US3.
- **T039** (US1, added by analysis): write it with the US1 tests. It passes once T011 is done. Extend it with the player checks once T027 is done.
- **Polish (T032–T038)**: after every story. T033 needs US2, T034 needs US1, US2 and US4.

Within a story: tests → domain → text → UI. Text tasks marked [P] touch only the catalog files.

## Parallel Examples

- **After T001**: run US2 (T017, T018, T019 in parallel, then T020 → T021 → T022/T023) alongside Foundational and US1.
- **US1 tests**: T006, T007 and T008 (same new file, write them together), plus T009 and T010 (UI).
- **US1 support**: T013 (text) and T015 (CSS) in parallel with T011 and T012.
- **Polish**: T032, T033, T034, T035 and T036 in parallel, then T037, then T038.

## Implementation Strategy

1. **MVP = US1**: the company history. It answers the reported "how did the PRR get this money?" case.
2. **US2 next**: last run revenue, independent and highly visible. It can ship with or right after the MVP.
3. **US3**: the player history, a small step once US1 exists.
4. **US4**: the hand-off to the full History for undo.
5. **Polish**: perf, e2e, catalogs, docs/spec.md, all gates, manual check.

Leave changes uncommitted for review (memory: no auto-commit).

## Notes

- T001 baseline (2026-11-09, clean tree): typecheck and lint pass. Full suite 2524/2525: only `perf.test.ts > replays a 1500-group RotLA log with mergers in under 50 ms` failed (77.9 ms) under full-suite load; it passes alone (11/11). Pre-existing timing flake, not this feature.
- T037 gates (2026-11-09): typecheck and lint pass. Full suite 2577/2578: the only failure is the same pre-existing `perf.test.ts > replays a 1500-group RotLA log with mergers in under 50 ms` load flake as at T001 (87.7 ms in the full run); perf.test.ts alone passes 13/13, including the two new feature-017 cases. `npm run build` then `npm run test:e2e`: 66/66 (phone and tablet), including e2e/entity-history.spec.ts.
- Deviations from the task text:
  - "Historial" was also added to the Stock and Operate sheets (next to "Detalles y ajustes…"), not only the details sheet. In an SR or OR the card opens those sheets, so without it SC-001 (2 taps) would not hold. The `reopen` screen parameter remembers which sheet view to restore.
  - The UI tests for T004, T009, T010, T026 and T029 live in tests/ui/entityHistory.test.tsx, and T019 in tests/ui/companyCard.test.tsx. They drive the real App (sheet → Historial → Volver), instead of asserting `go()` arguments.
  - The player rules (T024, T025, T027) were written together with the company rules in T011, since `involves` is one function.
  - No game has a "half" payout mode, so `half` is covered by the mode mapping only, with no game fixture. The 21Moon parts are covered in tests/domain/lastRun.test.ts, not in a UI test.
  - The tests/setup.ts stub adds `Element.prototype.scrollIntoView`, which jsdom lacks.
