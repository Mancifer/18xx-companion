# Tasks: Touch-First Operating Flow

**Input**: Design documents from `specs/002-touch-operating-flow/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/actions.md](contracts/actions.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle VI requires test-first domain logic, and the
existing UI test suites (`tests/ui/*.test.tsx`, `e2e/`) cover each touched screen. Test tasks
come before the implementation they cover and MUST fail first.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md), so each story can be
implemented and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1, US2, US3, US4)

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline before any change.

- [X] T001 Run `npm run typecheck && npm run lint && npm test` from the repo root and record the baseline (all green), so later failures can be traced to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: A shared helper used by US1 (turn summary) and by the existing private-income
offer in `Table.tsx`.

- [X] T002 Write failing tests in `tests/domain/queries.test.ts` for `currentORGroups(effective)`. It returns the effective groups after the latest group whose events contain a `turnAdvance` with `orIndex` defined, and returns all groups when there is none
- [X] T003 Implement `currentORGroups(effective)` in `src/domain/queries.ts`, pulling out the scan now inlined in `src/ui/screens/Table.tsx` (the `orStart` loop), and replace that inline loop in `Table.tsx` with a call to it (no behavior change to "Cobrar privadas")

**Checkpoint**: The helper exists and the full suite is still green.

---

## Phase 3: User Story 1 - A company's turn ends only after its operation is recorded (Priority: P1) 🎯 MVP

**Goal**: A turn can only be finished once a run or "no run" is recorded. "Siguiente" is gone.
`nextCompany` without a run records a zero run with the game's withhold move.

**Independent Test**: Start an OR with three floated companies (1830). The only way forward is
"Operar X" → "Pagar"/"No corrió" → "Terminar turno". A "no run" company's token moves by the
withhold rule. Undoing a finished turn brings back the previous company.

### Tests for User Story 1 (write first, must fail)

- [X] T004 [P] [US1] Update `tests/domain/turns.test.ts` for `nextCompany` per contracts/actions.md. Replace the test "nextCompany past a company with no run marks it operated" with: (a) a non-national current company with no run gets the events of `runAndPayout{parts all 0, mode withhold}` (zero money transfers, a `marketMove` with `reason: "withhold"` when the game's withhold rule matches, `runs` +1), then a `turnAdvance`, all in ONE group, plus a warning with code `noRunRecorded` and message `No se registró la operación de {X}: cuenta como que no corrió y su acción baja.`; (b) a company that already ran gets no extra events and no warning; (c) reverting that one group restores the previous `currentCompany` and the market position; (d) a national company (1848 BoE) with no run keeps today's events (`runs` +1, no market move) and gets an `info`-severity `noRunRecorded` warning
- [X] T005 [P] [US1] Add a zero-run market move test to `tests/games/1830.test.ts`, `tests/games/1848.test.ts` and `tests/games/21moon.test.ts`: `runAndPayout` with every revenue part 0 (mode `withhold` for 1830/1848, `null` for 21Moon) moves the company's token by that game's withhold/zero-dividend rule (or not at all if the rulebook says so), and the bank total is unchanged (SC-002). Also add a custom-game case to `tests/games/customGame.test.ts`: a choice part whose `payoutModes` has no `withhold` still gets a valid zero run from `zeroRunAction` (mode `full`, treated as a withhold)
- [X] T006 [P] [US1] Write failing tests in `tests/domain/queries.test.ts` for `turnActivity(effective, state, company)` per data-model.md: `runRecorded` is `state.turn.operatedThisOR.includes(company)`; `groups` are the `currentORGroups` whose `action.company === company`; `canFinish` is true only when `round === "OR"`, `company === turn.currentCompany` and `runRecorded`. Include a run recorded by voice (a group with `source: "voice"`) counting as recorded (FR-009)
- [X] T007 [P] [US1] Write failing UI tests in `tests/ui/operate.test.tsx`: (a) in an OR the round controls show "Operar {current}" and no "Siguiente" button (FR-001); (b) "Terminar turno" is disabled before a run, with the reason text "Registra lo que corrió o «No corrió» primero" (FR-003); (c) "No corrió" records a zero run, then "Terminar turno" makes the next company current (FR-002, FR-004); (d) "No corrió" is not shown for a national company (1848 BoE); (e) with forced withhold, "No corrió" is still shown

### Implementation for User Story 1

- [X] T008 [US1] Change the `nextCompany` expansion in `src/domain/actions/expand/flow.ts` (`nextCompanyEvents`): when the current company is non-national and not in `operatedThisOR`, prepend the events from the `runAndPayout` handler's expansion for `{type: "runAndPayout", company: current, parts: game.revenueParts.map(p => ({part: p.id, amount: 0})), mode}` (reuse `operatingHandlers.runAndPayout.expand`, not a copy), instead of the bare `runs` counter. Pick `mode` like this: when the game has a choice part (`hasChoice` = `game.revenueParts.length === 1 && game.revenueParts[0].to === "choice"`, the same test `OperateSheet` uses), use `"withhold"` if it is in `game.payoutModes`, else `"full"` (a zero full payout is already treated as a withhold by `computePayout`, `src/domain/mechanics/payout.ts:79`); with no choice part, use `null`. Export this zero-run payload builder (e.g. `zeroRunAction(game, company)` in `src/domain/actions/expand/operating.ts`) so the touch "No corrió" button (T011) dispatches exactly the same payload. Keep the bare counter for national companies. Add the `noRunRecorded` warning to `nextCompany.validate` (`warn`, or `info` for national) next to the existing `setComplete` warning. In the same `validate`, when the zero run is added, also append the warnings from `operatingHandlers.runAndPayout.validate` for that zero-run payload (e.g. the `forcedWithhold` info), so the voice confirmation card shows them too. Make T004 pass
- [X] T009 [US1] Implement `turnActivity(effective, state, company): { runRecorded: boolean; canFinish: boolean; groups: readonly Group[] }` in `src/domain/queries.ts` using `currentORGroups`. Make T006 pass
- [X] T010 [US1] In `src/ui/screens/Table.tsx`, remove the "Siguiente" round-control button (FR-001). Keep "Operar {current}" as the single primary control. When the round is OR with no current company (set finished), make "Empezar ronda de acciones" the primary-styled control
- [X] T011 [US1] In `src/ui/sheets/OperateSheet.tsx`, add an `inTurn` path (company === `state.turn.currentCompany` and round OR) with: a "No corrió" button beside the payout-mode buttons (hidden for `def.kind === "national"`) that dispatches `zeroRunAction(meta.game, companyId)` from T008, and a full-width primary "Terminar turno → siguiente: {next}" button at the bottom. The button is enabled only when `turnActivity(...).canFinish`, otherwise disabled with the visible reason "Registra lo que corrió o «No corrió» primero". It dispatches `{type: "nextCompany"}` and closes the sheet on success. `{next}` is the short name from `nextToOperate` on the current state; when it is undefined, show "OR {orSet}.{orIndex + 1}" if `turn.orIndex < turn.orsInSet` (a new OR in the set starts), else "fin del set" (the stock round comes next)
- [X] T012 [US1] In `src/ui/sheets/OperateSheet.tsx`, once `runRecorded` is true, hide the revenue keypad and payout buttons and show "✓ Operación registrada" instead (the run is not offered again; this also serves FR-008 scenario 3). Make T007 pass
- [X] T013 [US1] Update `tests/ui/taps.test.tsx` (line ~86 taps "Siguiente") to the new flow, and assert the SC-004 budgets: revenue + pay + buy one train + finish ≤ 6 taps plus digits; "Operar" → "No corrió" → "Terminar turno" ≤ 3 taps
- [X] T014 [US1] Review `tests/helpers/randomWalk.ts`, `tests/domain/operatingOrder.test.ts` and `tests/domain/randomGames.test.ts` for assumptions that `nextCompany` never moves the market. Adjust expectations only where the new zero-run move is the cause, and keep the conservation invariants asserted
- [X] T015 [US1] Update the Spanish summary for `nextCompany` in `src/domain/i18n/es.ts` so a group that included a zero run reads e.g. "{X} no corrió → izquierda 1 · siguiente: {Y}" (History and the confirmation card show the move)
- [X] T016 [US1] Add a case to `tests/ui/voice.test.tsx` (recorded-response style used there): with a current company that has no run, a resolved `nextCompany` shows a confirmation card containing the `noRunRecorded` warning text and the market move line (e.g. "izquierda 1"), and nothing is applied until the user confirms; after confirming, the next company is current (FR-009)

**Checkpoint**: US1 works on its own. No turn can be skipped silently, and "no run" moves the
price.

---

## Phase 4: User Story 2 - Revenue entry and train purchase in one operating turn (Priority: P1)

**Goal**: Typed revenue survives sub-views. Sub-view actions return to the turn instead of
closing it. The turn shows what has been recorded so far.

**Independent Test**: Open a turn, type 80, open "Comprar tren", go back (80 still there). Buy a
train (the sheet stays open, 80 still there, the summary lists the train). Pay, then finish.

### Tests for User Story 2 (write first, must fail)

- [X] T017 [P] [US2] Write failing tests in `tests/ui/operate.test.tsx`: (a) type 80 → "Comprar tren" → "← Volver" → keypad still shows 80 (FR-006); (b) type 80 → buy a 2-train from the bank → the sheet is still open on the run view, the keypad still shows 80, and the summary lists the train (FR-006, FR-007); (c) after "Pagar", buying a train keeps "✓ Operación registrada" and offers no keypad (scenario 3); (d) 21Moon with two parts: both typed part values survive a train purchase; (e) the same stay-open behavior for "Pagar costo" and "Cobro del banco"; (f) type 80, buy a train, then close the sheet and reopen "Operar {current}": the keypad is empty, the train purchase is still listed in "Este turno", and the same company is still current (spec edge case "Closing the sheet without finishing")

### Implementation for User Story 2

- [X] T018 [US2] In `src/ui/sheets/OperateSheet.tsx`, lift the turn draft out of `RevenueEntry` into `OperateSheet` per data-model.md ("Turn draft — held in `OperateSheet`": `amounts: Record<partId, number | null>`, `editingPart: string`). Pass them to `RevenueEntry` as props, and clear them after a successful payout
- [X] T019 [US2] In `src/ui/sheets/OperateSheet.tsx`, split `run` into `runAndClose` (used only by "Terminar turno") and `runInTurn`, which on success calls `setView("run")` and keeps the sheet open. Pass `runInTurn` to `TrainView`, `AmountView`, `PrivateView`, `LoanView`, the discard view and the supply view (FR-007)
- [X] T020 [US2] Add a "Este turno" summary to the top of `OperateSheet` in `src/ui/sheets/OperateSheet.tsx`, listing `turnActivity(...).groups` with the existing Spanish action summaries from `src/domain/i18n/es.ts` (one short line per group; "—" when empty) (FR-008). Make T017 pass

**Checkpoint**: US1 and US2 both work. A full turn with a run and a train purchase is done in one
sheet.

---

## Phase 5: User Story 3 - Operating actions follow the operating order (Priority: P2)

**Goal**: Only the current company gets operating actions on the normal path. Out-of-turn work
needs an explicit control and is marked in History. The next companies are visible.

**Independent Test**: In a 1830 OR with three companies, tap a non-current card. Details open,
with "Operar fuera de turno…". Pay a cost through it. History shows the `outOfTurn` warning, and
the current company is unchanged.

### Tests for User Story 3 (write first, must fail)

- [X] T021 [P] [US3] Write failing tests in `tests/domain/actions/outOfTurn.test.ts`: in an OR, each of `runAndPayout`, `buyTrain`, `payCost`, `bankPays`, `takeLoan`, `buyPrivateByCompany`, `discardTrain` naming a company ≠ `turn.currentCompany` is applied (never unavailable) with a warning code `outOfTurn`, message `{X} opera fuera de turno (le toca a {Y}).`, severity `warn`. The same action for the current company, or outside an OR, has no `outOfTurn` warning. `currentCompany` is unchanged afterwards. Also: (i) after `setTurn{company: B}` (the turn editor, FR-013), an action for B has no `outOfTurn` warning and the `setTurn` group is in the log as a manual override; (ii) in an OR with no current company (set finished), no `outOfTurn` warning is raised
- [X] T022 [P] [US3] Write failing tests in `tests/domain/queries.test.ts` for `upcomingCompanies(game, state, n = 2)`: `operatingOrder(game, state)` without `currentCompany` and without `operatedThisOR`, first `n`; re-sorted after a payout moves a price mid-OR (spec Story 3 scenario 4)
- [X] T023 [P] [US3] Write failing UI tests in `tests/ui/operate.test.tsx`: (a) in an OR, tapping the current company's card opens the operate sheet; tapping another company's card opens the details sheet with "Operar fuera de turno…" (FR-011); (b) the out-of-turn operate sheet shows the banner "Fuera de turno: le toca a {C}. Lo que registres quedará marcado en el historial." and has no "No corrió" or "Terminar turno" (FR-012); (c) the round controls show "Después: {D}, {E}" (FR-010); (d) outside an OR, card taps keep opening the stock sheet

### Implementation for User Story 3

- [X] T024 [US3] In `src/domain/actions/validate.ts`, after the handler's own `validate`, add a turn check for the action types in `CURRENT_COMPANY_ACTIONS` (export it from `src/domain/actions/resolve.ts`) plus `discardTrain`: when `state.turn.round === "OR"`, `state.turn.currentCompany` is defined, and `action.company` is defined and ≠ `state.turn.currentCompany`, append `warning("outOfTurn", "{X} opera fuera de turno (le toca a {Y}).")` using company short names. Make T021 pass
- [X] T025 [US3] Implement `upcomingCompanies(game, state, n = 2): CompanyId[]` in `src/domain/queries.ts`. Make T022 pass
- [X] T026 [US3] In `src/ui/screens/Table.tsx`: route company-card taps in an OR (current → `{kind: "company", view: "operate"}`; others → `{view: "details"}`); add an "Operar fuera de turno…" button to `companyActions(id)` for non-current companies in an OR that opens the operate sheet with `outOfTurn`; show the "Después: …" text from `upcomingCompanies` next to "Operar {current}" (≥ 48 px row, short names, not color-only)
- [X] T027 [US3] In `src/ui/sheets/OperateSheet.tsx`, add an `outOfTurn?: boolean` prop. When true, render the banner text from contracts/ui.md and hide "No corrió" and "Terminar turno". The `Open` type in `src/ui/screens/Table.tsx` carries the flag. Make T023 pass
- [X] T028 [US3] Check that `src/ui/screens/History.tsx` renders the `outOfTurn` warning on the entry (existing `group.warnings` rendering); add a History UI assertion in `tests/ui/history.test.tsx`
- [X] T029 [US3] Check that the voice "hacerlo a mano" fallback in `src/ui/screens/Table.tsx` (`manual`) still opens the current company's operate sheet for operating hints, and does not open a non-current company without the out-of-turn flag

**Checkpoint**: US1–US3 work. The normal path follows the operating order, and out-of-turn work
is explicit and recorded.

---

## Phase 6: User Story 4 - "Comprar privada" appears only when a private can be bought (Priority: P3)

**Goal**: The control and the sheet share one purchasability rule. The list is never empty.

**Independent Test**: 1830: buy all privates and start SR1, and the control is hidden. Start SR2,
and it is shown, listing the owned privates. 1848/21Moon: check every round type.

### Tests for User Story 4 (write first, must fail)

- [X] T030 [P] [US4] Write failing tests in `tests/domain/privates.test.ts` for `purchasablePrivates(game, state)` per data-model.md: a private is included only when "its holder is not `removed`, and the private is not closed" AND "the holder is `bank`, **or** `privateResaleOpen(game, state)` is true". Cases: unsold in PRIVATES; all sold in SR1 → empty; all sold in SR2 of 1830 → the owned ones; a game with `privateTrading: "none"` in SR2 → empty; all removed → empty in every round
- [X] T031 [P] [US4] Write failing UI tests in `tests/ui/stock.test.tsx` (or a new `tests/ui/privates.test.tsx`): the round control "Comprar privada" is shown iff the round ∈ {PRIVATES, SR} and `purchasablePrivates` is non-empty, for 1830, 1848 and 21Moon (SC-005); with none purchasable, the sheet opened via the voice fallback shows "No hay privadas a la venta ahora." (FR-015)

### Implementation for User Story 4

- [X] T032 [US4] Implement `purchasablePrivates(game, state): PrivateDef[]` in `src/domain/queries.ts` (reusing `privateResaleOpen` from `src/domain/actions/expand/stock.ts`). Make T030 pass
- [X] T033 [US4] In `src/ui/sheets/PrivatesSheet.tsx`, replace the inline `open` filter with `purchasablePrivates`, and render "No hay privadas a la venta ahora." when it is empty
- [X] T034 [US4] In `src/ui/screens/Table.tsx`, show the "Comprar privada" round control only when `(round === "PRIVATES" || round === "SR") && purchasablePrivates(meta.game, state).length > 0` (FR-014). Make T031 pass

**Checkpoint**: All four stories work on their own.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T035 [P] Update `e2e/operating.spec.ts` to the new flow (no "Siguiente"; "Terminar turno"; one "No corrió" company; one out-of-turn action visible in History), and run `npm run test:e2e -- operating`
- [X] T036 [P] Update `docs/spec.md` (round controls and operating sections, ~line 300) to describe the operating turn ("Operar X" → run or "No corrió" → "Terminar turno"), the removal of "Siguiente", the out-of-turn control, the zero-run behavior of "siguiente compañía", and the private-purchase control rule (FR-017)
- [X] T037 [P] Extend `e2e/a11y.spec.ts` for FR-016: the new buttons ("No corrió", "Terminar turno", "Operar fuera de turno…") are ≥ 48 px, have accessible names, and lay out in phone portrait and tablet landscape
- [ ] T038 Run `npm run eval:voice` and report accuracy (constitution quality gate; research R8). The expected action for `fl-01` stays `nextCompany`
- [X] T039 Run `npm run typecheck && npm run lint && npm test` and walk through `specs/002-touch-operating-flow/quickstart.md` steps 1–9 manually (`npm run dev`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks US1 (T009 uses `currentORGroups`).
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: after US1. It edits the same `OperateSheet.tsx`, and the summary (T020) uses `turnActivity` from T009.
- **US3 (Phase 5)**: domain tasks (T021, T022, T024, T025) can start after Foundational. UI tasks (T026, T027) come after US1, because the out-of-turn mode hides the US1 controls.
- **US4 (Phase 6)**: after Foundational. Independent of US1–US3, apart from the shared files `src/ui/screens/Table.tsx` and `src/domain/queries.ts`, so their edits must be sequenced.
- **Polish (Phase 7)**: after all the stories you want to ship.

### Within Each Story

- Tests are written first and must fail, then the domain code, then the UI.
- Tasks that touch `src/ui/sheets/OperateSheet.tsx` (T011, T012, T018–T020, T027) run one after another.
- Tasks that touch `src/ui/screens/Table.tsx` (T003, T010, T026, T029, T034) run one after another.
- Tasks that touch `src/domain/queries.ts` (T003, T009, T025, T032) run one after another.

### Parallel Opportunities

- US1 tests T004–T007 are in different files and can be written together.
- US3 domain work (T021/T024, T022/T025) and US4 domain work (T030/T032) can run alongside US1's UI tasks.
- Polish T035–T037 run in parallel.

## Parallel Example: User Story 1

```text
Task: "T004 Update tests/domain/turns.test.ts for nextCompany zero run"
Task: "T005 Zero-run market move tests in tests/games/{1830,1848,21moon}.test.ts"
Task: "T006 turnActivity tests in tests/domain/queries.test.ts"
Task: "T007 Operate turn UI tests in tests/ui/operate.test.tsx"
```

## Parallel Example: User Stories 3 and 4 (domain only)

```text
Task: "T021 outOfTurn warning tests in tests/domain/actions/outOfTurn.test.ts"
Task: "T030 purchasablePrivates tests in tests/domain/privates.test.ts"
```

---

## Implementation Strategy

### MVP first (US1)

1. Phase 1 and Phase 2.
2. Phase 3 (US1). **Stop and validate**: no turn can be skipped silently, and "no run" moves the price (quickstart steps 1, 4, 5, 7).
3. Ship it. This fixes the money and market bug, which is the most important issue.

### Incremental delivery

1. US1 → validate → ship (MVP).
2. US2 → validate (quickstart steps 2–3) → ship. These are the two P1 stories.
3. US3 → validate (quickstart step 6) → ship.
4. US4 → validate (quickstart steps 1 and 8) → ship.
5. Polish: docs, e2e, eval report.

## Notes

- Do not add action types, event types or persisted fields. Everything goes through the existing pipeline (plan Constitution Check).
- Warnings never make an action unavailable (Principle III).
- Commit after each task or logical group, and keep the suite green at every checkpoint.
