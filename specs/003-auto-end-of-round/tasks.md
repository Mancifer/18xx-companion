# Tasks: Automatic End-of-Round Step

**Input**: Design documents from `specs/003-auto-end-of-round/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/actions.md](contracts/actions.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle VI requires test-first domain logic. Test tasks come before the implementation they cover and MUST fail first. Domain tests use `TestSession` from `tests/helpers/dispatch.ts`: `.do()` throws on unavailable, `.tryDo()` returns the result kind, `.lastEvents` holds the last group's events, and `.apply()` reduces a raw primitive event.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md). US1, US2 and US3 are all P1 and share the foundational marker. US4 and US5 extend the same mechanism.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1–US5)

---

## Phase 1: Setup

**Purpose**: Confirm a green baseline before any change.

- [X] T001 Run `npm run typecheck && npm run lint && npm test` from the repo root and record the baseline (all green), so later failures can be traced to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The marker event field, the derived `turn.roundEnded` flag, and `roundEndEvents(game, state)`. Every story depends on these (research R1–R3, data-model §1–§3).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Write failing tests in `tests/domain/events.test.ts`:
  - The event schema in `src/domain/events/schema.ts` accepts `{ t: "turnAdvance", roundEnd: "SR" }` and `{ t: "turnAdvance", roundEnd: "CR" }`, and rejects `roundEnd: "OR"`. The field is `roundEnd: z.enum(["SR", "CR"]).optional()`.
  - The reducer (`reduce` / `reduceAll` from `src/domain/events/reduce.ts`):
    - (a) sets `state.turn.roundEnded === true` after `{ t: "turnAdvance", roundEnd: "SR" }` and leaves `round`, `srNumber` and the other turn fields unchanged;
    - (b) clears `roundEnded` (property absent) on a later `turnAdvance` that changes `round`, `srNumber`, `orSet` or `orIndex`;
    - (c) keeps it on a `turnAdvance` that only changes `company` or `phase`;
    - (d) sets it on a `marketMove` with reason `soldOut` and on one with reason `poolPenalty`, but not on reasons `sell`, `manual` or `payout`;
    - (e) sets it on a `companyStatus` with `capitalPending: false`;
    - (f) leaves it absent in `initialState`.
- [X] T003 Add `readonly roundEnd?: "SR" | "CR";` (doc comment: "This round's end step was applied (marker).") to the `turnAdvance` member of `PrimitiveEvent` in `src/domain/events/types.ts`, and `roundEnd: z.enum(["SR", "CR"]).optional()` to the `turnAdvance` object in `src/domain/events/schema.ts`
- [X] T004 Add `readonly roundEnded?: true;` (doc comment: "Derived: the current round's end step has been applied.") to `TurnState` in `src/domain/events/state.ts`, and implement the rules in `src/domain/events/reduce.ts`. Make T002 pass.
  - In `advanceTurn`, drop `roundEnded` when `turn.round !== prev.round || turn.srNumber !== prev.srNumber || turn.orSet !== prev.orSet || turn.orIndex !== prev.orIndex`.
  - Then set `roundEnded: true` when `e.roundEnd !== undefined`.
  - In the `marketMove` case, set `turn.roundEnded = true` when `event.reason` is `soldOut` or `poolPenalty`.
  - In the `companyStatus` case, set it when `event.capitalPending === false`. This is the legacy inference (research R2).
- [X] T005 [P] Write failing tests in a new `tests/domain/roundEnd.test.ts` for `roundEndEvents(game, state)`, with games from `getBuiltInGame` and seeded states as in `tests/domain/corporateRound.test.ts`. Use 1830, with the round set through `startSR` / `startOR`, and 21Moon for the CR.
  - In an SR, it returns the `pendingCapitalEvents(game, state)` events, then the `endOfRoundMoves(game, state, "endSR")` events, then exactly `{ t: "turnAdvance", roundEnd: "SR" }` last.
  - In a 21Moon CR, it returns the `endOfRoundMoves(…, "endCR")` events, then `{ t: "turnAdvance", roundEnd: "CR" }`.
  - In an OR and in PRIVATES, it returns `[]`.
  - When `state.turn.roundEnded` is true, it returns `[]`.
  - In an SR with nothing owed and nothing sold out, it returns only the marker.
- [X] T006 Implement and export `roundEndEvents(game: GameDefinition, state: SessionState): PrimitiveEvent[]` in `src/domain/mechanics/roundEnd.ts`, following data-model §3: import `pendingCapitalEvents` from `./capitalization`, and add a JSDoc that cites 1830 §6.3 / §5.5, 1848 §12.6.1 and 21Moon §10.3. Make T005 pass.

**Checkpoint**: The marker, the flag and `roundEndEvents` exist and are tested. No action uses them yet, so the full suite is still green.

---

## Phase 3: User Story 1 - Starting the OR closes the stock round (Priority: P1) 🎯 MVP

**Goal**: "Empezar OR" (and voice "empieza la ronda de operaciones") from an SR applies the SR end step, then starts the OR, in one group. The two "Fin de ronda" buttons are gone.

**Independent Test**: In 1830, float NYC during the SR and sell out PRR to players, then dispatch only `startOR`. NYC has its capital, PRR moved up 1, and the turn is `OR 1.1`, with an operating order that uses PRR's new price.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Write failing tests in `tests/games/1830.test.ts` under the "1830 stock round" describe:
  - A copy of the "§6.3 … capital arrives at the end of the SR" case that dispatches `{ type: "startOR" }` instead of `endSR`. Expect `cashOf(s.state, "company:NYC") === 820`, `s.state.companies["NYC"].capitalPending` falsy, `s.state.turn.round === "OR"`, and `s.lastEvents` containing the bank → company:NYC transfer and a `turnAdvance` with `roundEnd: "SR"` before the `turnAdvance` with `round: "OR"`.
  - A sold-out case: all PRR shares held by players, then `startOR` moves PRR up 1 with reason `soldOut`.
- [X] T008 [P] [US1] Write a failing test in `tests/games/1848.test.ts`: a company whose shares are all held by players moves up 1 with reason `soldOut` when the table dispatches `startOR` from the SR, with no `endSR`.
- [X] T009 [P] [US1] Write a failing test in `tests/domain/turns.test.ts` (describe "startOR and nextCompany"): with two companies in the SR where the lower-priced one is sold out and its sold-out move puts it above the other, `startOR` sets `turn.operatingOrder` from the post-move prices (research R4). Also cover an SR with nothing owed and nothing sold out: `startOR`'s `lastEvents` contain no `moneyTransfer` and no `marketMove`, only the marker and the existing start events.
- [X] T010 [P] [US1] Write a failing test in `tests/ui/taps.test.tsx`: render the Table in an SR and in a CR (21Moon). `queryByRole("button", { name: "Fin de ronda de acciones" })` and `queryByRole("button", { name: "Fin de ronda corporativa" })` are both null. In the 1830 SR, one tap on "Empezar OR" leaves the round indicator showing OR 1.1 (contracts/ui.md, SC-003).

### Implementation for User Story 1

- [X] T011 [US1] In `src/domain/actions/expand/flow.ts`, change the `startOR` handler's `expand` to: `const end = roundEndEvents(ctx.game, ctx.state); return [...end, ...startOREvents(ctx.game, reduceAll(ctx.state, end))];`. Import `roundEndEvents` from `../../mechanics/roundEnd`. Keep the existing `validate` (`newSet` warning). Make T007–T009 pass.
- [X] T012 [US1] In `src/domain/i18n/es.ts` `effectsEs`, `case "turnAdvance"`: push `"fin de la ronda de acciones"` when `e.roundEnd === "SR"` and `"fin de la ronda corporativa"` when `e.roundEnd === "CR"` (contracts/actions.md, Summaries). Add a test in `tests/domain/summaries.test.ts` that the summary of a `startOR` group from an SR with a sold-out company contains "fin de la ronda de acciones" and the "X → price" move (FR-010).
- [X] T013 [US1] In `src/ui/screens/Table.tsx`, remove the two buttons that dispatch `endSR` ("Fin de ronda de acciones") and `endCR` ("Fin de ronda corporativa"). Leave every other round control and its visibility unchanged. Make T010 pass.
- [X] T014 [P] [US1] Update the e2e flows that tap the removed button: delete the `getByRole("button", { name: "Fin de ronda de acciones" }).click()` lines in `e2e/operating.spec.ts` (two places), `e2e/a11y.spec.ts` and `e2e/offline.spec.ts`. Keep the following "Empezar OR" taps. If an assertion depended on capital arriving after the removed tap, it now holds after "Empezar OR".

**Checkpoint**: SR → OR in one tap applies the SR end step. US1 is shippable.

---

## Phase 4: User Story 2 - The end step can never run twice (Priority: P1)

**Goal**: A round's end step is applied at most once. Voice `endSR` / `endCR` count, a repeated one is unavailable with a reason, and saved games with an old `endSR` group are not double-applied.

**Independent Test**: In an SR with a sold-out company, dispatch `endSR` then `startOR`. The company moved up exactly once, and a second `endSR` (before `startOR`) returns `unavailable` with the reason "Ya se aplicó el fin de la ronda de acciones".

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] Add failing tests to `tests/domain/roundEnd.test.ts` (describe "at most once per round"), for 1830:
  - (a) `endSR` then `startOR`: exactly one `soldOut` move and one capital transfer in total, and `startOR`'s `lastEvents` contain no `marketMove` with reason `soldOut` and no capital `moneyTransfer`.
  - (b) After `endSR`, `s.tryDo({ type: "endSR" })` is `{ kind: "unavailable", reasonEs: "Ya se aplicó el fin de la ronda de acciones" }`.
  - (c) In an OR, `s.tryDo({ type: "endSR" })` is unavailable with `"Solo en la ronda de acciones"`.
  - (d) Legacy log: use `s.apply()` to reduce the pre-change `endSR` events (`pendingCapitalEvents` + `endOfRoundMoves(…, "endSR")`, with no marker), then `startOR`. There is no second move and no second capital payment, because the flag is inferred.
  - (e) A late SR action after `endSR` (a `buyShare` that completes a sell-out), then `startOR`: no new `soldOut` move (spec edge case).
- [X] T016 [P] [US2] Add failing tests to `tests/domain/corporateRound.test.ts` (inside "§10.3 end of the CR"):
  - After `endCR`, `tryDo({ type: "endCR" })` is unavailable with `"Ya se aplicó el fin de la ronda corporativa"`.
  - In an SR, `tryDo({ type: "endCR" })` is unavailable with `"Solo en la ronda corporativa"`.
  - The existing three `endCR` tests stay green. `lastEvents` now also ends with `{ t: "turnAdvance", roundEnd: "CR" }`.

### Implementation for User Story 2

- [X] T017 [US2] In `src/domain/actions/expand/flow.ts`, replace the `endSR` handler (contracts/actions.md, `endSR`):
  - `available`: `ctx.state.turn.round !== "SR"` → `unavailable("Solo en la ronda de acciones")`; `ctx.state.turn.roundEnded` → `unavailable("Ya se aplicó el fin de la ronda de acciones")`; otherwise `AVAILABLE`.
  - `expand`: `roundEndEvents(ctx.game, ctx.state)`.
  - Remove the now-unused `pendingCapitalEvents` and `endOfRoundMoves` imports if nothing else uses them.
  - Make T015 pass.
- [X] T018 [US2] In `src/domain/mechanics/custom/corporateRound.ts`, replace the `endCR` handler with the same pattern: `round !== "CR"` → `unavailable("Solo en la ronda corporativa")`; `roundEnded` → `unavailable("Ya se aplicó el fin de la ronda corporativa")`; expand `roundEndEvents(ctx.game, ctx.state)`. Import `AVAILABLE` / `unavailable` (already imported) and `roundEndEvents` from `../roundEnd`. Make T016 pass.
- [X] T019 [US2] Fix existing tests that now break because `endSR` is unavailable outside the SR or after it was applied. Check each listed file and keep each test's intent:
  - `tests/domain/capitalization.test.ts`, `tests/domain/stock.test.ts`, `tests/games/1830.test.ts`;
  - `tests/ui/history.test.tsx`, `tests/ui/operate.test.tsx`, `tests/ui/taps.test.tsx`, `tests/ui/voice.test.tsx` (seed action lists that contain `{ type: "endSR" }`);
  - `tests/persistence/export.test.ts`.
  - `tests/helpers/randomWalk.ts` needs no change: `randomGames.test.ts` skips unavailable actions through `tryDo`.

  Where a seed list puts `endSR` right before `startOR`, it may simply be removed, since `startOR` now applies the step. Run `npm test` until it is green.

  Result: none of the listed tests broke (they all dispatch `endSR` inside the SR, before `startOR`), so their seed lists were left as they are. The voice eval fixtures (`eval/voice/fixtures/*.json`) were regenerated with `npx tsx eval/voice/buildFixtures.ts`, because their logs now contain the `roundEnd` marker events.

**Checkpoint**: No sequence of `endSR`, `endCR` and start actions applies a round's end step twice (SC-002).

---

## Phase 5: User Story 3 - One undo reverts both the end step and the round start (Priority: P1)

**Goal**: The combined `startOR` group undoes in one step, back to the SR with capital pending and prices unmoved. A redo applies the step again, exactly once.

**Independent Test**: Through `SessionStore` (as in `tests/app/sessionStore.test.ts`), dispatch the SR actions, then `startOR`, then `revert()` once. State equals the pre-`startOR` state. Dispatch `startOR` again and the capital and move are applied once.

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Write failing tests in `tests/app/sessionStore.test.ts`, following that file's existing dispatch + `revert()` pattern, for 1830:
  - (a) Float NYC and sell out PRR in the SR, then dispatch `startOR`. The resulting group is a single group whose `action.type` is `startOR`, containing both the capital transfer and the `soldOut` move.
  - (b) `revert()` once: `state.turn.round === "SR"`, NYC `capitalPending === true`, PRR's position equals the pre-start position, `turn.roundEnded` is absent, and `checkInvariants` reports no violation.
  - (c) `startOR` again: one capital transfer and one `soldOut` move in that group.
  - (d) With `endSR` dispatched first, then `startOR`, then `revert()` (undoing only the start): the round is SR with `roundEnded === true`, and a further `startOR` does not re-apply the step.

### Implementation for User Story 3

- [X] T021 [US3] No new production code is expected: undo already ignores reverted groups' events (research R1). If T020 fails, fix the cause in `src/domain/events/reduce.ts` (flag derivation) or `src/domain/actions/expand/flow.ts` (single-group expansion) and re-run T020 until green.

**Checkpoint**: All P1 stories work. One undo restores the previous round, money and prices (SC-004).

---

## Phase 6: User Story 4 - 21Moon corporate round (Priority: P2)

**Goal**: `startCR` closes the SR. `startOR` from the CR applies the CR end step (sold-out moves, pool penalty). SR → OR directly runs only the SR step.

**Independent Test**: In 21Moon, go `startSR` → `startCR`, issue a share of an operated company to the pool, then `startOR`. The company moves down 1 (`poolPenalty`) in the `startOR` group.

### Tests for User Story 4 ⚠️

- [X] T022 [P] [US4] Add failing tests to `tests/domain/corporateRound.test.ts` (new describe "round transitions"), reusing `cr()` and `seedCompany`:
  - (a) A CR with an operated company that has pool shares, then `startOR`: `lastEvents` contain a `marketMove` with reason `poolPenalty` for it, then `turnAdvance{ roundEnd: "CR" }`, then the OR start. The position moved down 1.
  - (b) A CR where `VH` is held 100% by players and companies, then `startOR`: up 1, `soldOut`.
  - (c) A 21Moon SR, then `startCR`: `lastEvents` start with `{ t: "turnAdvance", roundEnd: "SR" }` and then the CR `turnAdvance`, with no `marketMove`.
  - (d) A 21Moon SR with a company held 100% by players and another with pool shares that has operated, then `startOR` directly: no `soldOut` and no `poolPenalty` move (FR-011).
  - (e) A CR, then `startSR`: the CR end step is applied before the SR starts (spec edge case).
- [X] T023 [P] [US4] Update `tests/domain/turns.test.ts` "21Moon fixed schedule": the existing `startSR → startCR → startOR` sequence still produces the same `scheduleIndex` and turn labels with the end steps included. Adjust the expectations only if they compared `lastEvents` exactly.

### Implementation for User Story 4

- [X] T024 [US4] In `src/domain/mechanics/custom/corporateRound.ts`, change `startCR.expand` to prepend `roundEndEvents(ctx.game, ctx.state)` before its `turnAdvance{ round: "CR", scheduleIndex?, company: null }`. The CR `turnAdvance` does not depend on prices, so it can be computed on the original state. Make T022 (c) pass.
- [X] T025 [US4] In `src/domain/actions/expand/flow.ts`, change `startSR.expand` to prepend `roundEndEvents(ctx.game, ctx.state)` before its SR `turnAdvance`. The `srNumber` and `scheduleIndex` come from `ctx.state.turn`, unchanged by the end step. Make T022 (e) pass. T022 (a), (b) and (d) pass through T011.

**Checkpoint**: 21Moon SR → CR → OR and SR → OR behave per FR-004 and FR-011.

---

## Phase 7: User Story 5 - Rounds without an end step (Priority: P3)

**Goal**: Leaving an OR or the private auction applies nothing extra. `setTurn` and the automatic next-OR start in `nextCompany` never apply an end step.

**Independent Test**: In an OR, dispatch `startSR`, and from PRIVATES dispatch `startSR` / `startOR`. `lastEvents` contain no `marketMove`, no `moneyTransfer` from the end step, and no `roundEnd` marker.

### Tests for User Story 5 ⚠️

- [X] T026 [P] [US5] Add tests to `tests/domain/turns.test.ts` (new describe "no end step"):
  - (a) PRIVATES → `startSR`, and PRIVATES → `startOR`: no event has `roundEnd`.
  - (b) OR → `startSR` and OR → `startOR` (next OR): no `roundEnd`, no `soldOut` or `poolPenalty`, even with a sold-out company.
  - (c) `nextCompany` that auto-starts the next OR in the set: no `roundEnd`.
  - (d) `setTurn` from SR to OR with a sold-out company and pending capital: no `marketMove` and no `moneyTransfer`, and `turn.roundEnded` is absent afterwards (FR-012).

### Implementation for User Story 5

- [X] T027 [US5] No new production code is expected (`roundEndEvents` returns `[]` for OR and PRIVATES, and `setTurn` / `nextCompany` do not call it). If T026 fails, fix it in `src/domain/mechanics/roundEnd.ts` or `src/domain/actions/expand/flow.ts`.

**Checkpoint**: The scope boundary is verified. All user stories are complete.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T028 [P] Update `docs/spec.md` (FR-014):
  - The Flow row (~line 209): `startSR / startCR / startOR` first apply the end step of the round being left (SR: capital of companies floated during the SR and sold-out moves; CR: sold-out and pool-penalty moves), at most once per round. `endSR` / `endCR` are voice-only and unavailable once applied.
  - The Turn state description (~line 125): mention the derived "round ended" flag.
  - The touch controls: the "Fin de ronda" buttons are gone.
- [X] T029 [P] Add a conservation check to `tests/domain/conservation.test.ts` (or confirm `randomGames.test.ts` already covers it): random walks that include `startOR` from an SR with pending capital keep `checkInvariants` clean.
- [X] T030 Run `npm run typecheck && npm run lint && npm test` and `npm run test:e2e`. All green.
- [ ] T031 Run the manual check in `specs/003-auto-end-of-round/quickstart.md` ("Manual check", steps 1–5) with `npm run dev`, and note the result in this file.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)** → **Foundational (T002–T006)** → user stories.
- **US1 (T007–T014)** depends on Foundational. It is the MVP.
- **US2 (T015–T019)** depends on Foundational. It is independent of US1 in code (it touches the `endSR` / `endCR` handlers), but T019's test-fixture cleanup is easier after T011.
- **US3 (T020–T021)** depends on US1 (T011): it tests the combined `startOR` group.
- **US4 (T022–T025)** depends on Foundational. T022 (a), (b) and (d) also need T011. T024 and T025 are independent of US2.
- **US5 (T026–T027)** depends on T011 and T025 (all start handlers wired).
- **Polish (T028–T031)** comes after all stories.

### Within Each Story

- Tests are written first and must fail, then the implementation is written to make them pass.
- T003 comes before T004, T004 before T006, and T011 before T012.

### Parallel Opportunities

- T002 ∥ T005 (different test files).
- In US1: T007 ∥ T008 ∥ T009 ∥ T010, then T014 ∥ T012 after T011.
- In US2: T015 ∥ T016, then T017 ∥ T018 (different files).
- In US4: T022 ∥ T023, then T024 ∥ T025 (different files).
- After Foundational, US2 and US4 can proceed in parallel with US1.
- T028 ∥ T029.

## Parallel Example: User Story 1

```text
Task: "T007 failing 1830 tests for startOR applying capital and sold-out moves in tests/games/1830.test.ts"
Task: "T008 failing 1848 sold-out-on-startOR test in tests/games/1848.test.ts"
Task: "T009 failing operating-order-after-moves test in tests/domain/turns.test.ts"
Task: "T010 failing UI test for removed buttons in tests/ui/taps.test.tsx"
```

## Implementation Strategy

### MVP First (User Story 1)

1. T001, then Foundational T002–T006.
2. US1 T007–T014: SR → OR in one tap with the end step. This alone fixes the "silently lost" defect.
3. Validate with the quickstart manual steps 1–3.

### Incremental Delivery

1. US1: no more lost capital or moves.
2. US2: no more double application, voice idempotence, legacy logs.
3. US3: undo and redo verified.
4. US4: 21Moon CR transitions.
5. US5: scope boundary verified.
6. Polish: docs, conservation, full gates, manual check.
