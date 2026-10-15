---

description: "Task list for feature 012 — Operating Round Income Summary"
---

# Tasks: Operating Round Income Summary

**Input**: Design documents from `specs/012-or-income-summary/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/operating-phase.md](contracts/operating-phase.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first domain logic, and the spec's measurable outcomes (SC-002 to SC-004) are checked by tests. Write each test task first, and see it fail before doing the matching implementation task.

**Organization**: Tasks are grouped by user story, in spec priority order: US1 → US2 (P1), then US3 → US4 (P2). The domain function every story reads is in Phase 2. US1 is the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Conventions

Single-project PWA: `src/`, `tests/` and `docs/` at the repository root.

## Testing notes

- **Domain tests** use `TestSession` from `tests/helpers/dispatch.ts`. `s.groups` is the effective
  log, and `s.state` is the current state.
- **Undo** runs newest first, so an undo leaves a prefix of the effective log. Simulate it with
  `s.groups.slice(0, n)` and the state reduced from that prefix:
  `reduceAll(initialState(game, players), prefix.flatMap((g) => g.events))`.
- **UI tests** use `openSeededTable({ game, actions })` and `openMenuItem` from
  `tests/ui/helpers.tsx`. They dispatch through the real store, so undo can go through the toast
  or History.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Record a baseline, so pre-existing failures are not blamed on this feature.

- [X] T001 Create or switch to a feature branch `012-or-income-summary`. The repository is on `main`. Don't commit: changes stay uncommitted for review. Then run `npm run typecheck`, `npm run lint` and `npm test` on the current tree, and record any pre-existing failures in a note under this task. A known flaky case is the `tests/domain/perf.test.ts` 1500-group RotLA replay, which is slow under full-suite load.
  - Note (2026-10-15): on branch `012-or-income-summary` (from `cfb8a45`). Typecheck and lint clean, 1712/1712 tests pass (87 files). No pre-existing failures.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure `operatingPhase` function and its labels. Every story reads it.

**⚠️ CRITICAL**: No user story UI work can begin until this phase is complete.

### Tests for the foundation ⚠️

- [X] T002 [P] Create `tests/domain/operatingPhase.test.ts` with the phase-boundary tests from [contracts/operating-phase.md](contracts/operating-phase.md), behavior steps 1–4 and guarantees G3, G4 and G5. Use an 1830 `TestSession` with 4 players (`makePlayers(["Ana","Bruno","Carla","Dani"])`).
  - (a) **Before any OR**: after `createSession` and during the first SR, `operatingPhase(game, players, s.groups, s.state)` returns `null`.
  - (b) **First OR**: after `startOR`, it returns a phase with `firstOR` `{ orSet: 1, orIndex: 1 }` and `startGroupId` equal to the `startOR` group's id.
  - (c) **OR to OR**: after finishing every company of OR 1.1 with `nextCompany`, so that `nextCompany` itself starts OR 1.2, the phase is the same (same `startGroupId`).
  - (d) **Back-to-back sets**: a `startOR` dispatched while the set's ORs are done (the "newSet" warning) keeps the same phase (G4).
  - (e) **SR ends it**: after `startSR`, the result is `null` (G3).
  - (f) **Undo SR start**: rebuilding from the prefix without the `startSR` group gives the phase back with the same `startGroupId`.
  - (g) **Undo OR start**: the prefix without the `startOR` group gives `null` (G5).
- [X] T003 [P] In `tests/domain/operatingPhase.test.ts`, add the amount tests (data-model §2, G1):
  - (a) **Payouts**: after `startOR` and a `runAndPayout` of 100 (mode `full`) for a company whose president holds 60%, that player's `delta` is 60. Their `startCash` equals their cash just before the payout, and `startCash + delta === cash`.
  - (b) **Private income**: a `privateIncome` in the same OR adds each private's `income` to its owner's `delta`.
  - (c) **No change**: a player with no money change has `delta` 0 and `movements` `[]`.
  - (d) **G1**: for every player, `movements.reduce((t, m) => t + m.amount, 0) === delta`.
  - (e) **Undo**: rebuilding from the prefix without the payout drops that payout's amount.
  - (f) **SR money is outside**: money moved in the SR before `startOR` (for example a `buyShare`) is not in the phase's `delta`.
- [X] T004 [P] In `tests/domain/operatingPhase.test.ts`, add the start-inside-a-group test (behavior step 2, edge case "after any end step of the round before it"). Build a session whose `startOR` group carries money events *before* its `turnAdvance` (for example, seed an SR end step that pays the bank, or apply a crafted effective group `{ action: { type: "startOR" }, events: [moneyTransfer player→bank 10, turnAdvance { round: "OR", orSet: 1, orIndex: 1, orsInSet: 1, company: null }] }`). The 10 must *not* be counted. A transfer placed *after* the `turnAdvance` in the same group must be counted.

### Implementation for the foundation

- [X] T005 Create `src/domain/ledger/operatingPhase.ts`, exporting the `OperatingPhase`, `PlayerSettlement` and `SettlementMovement` types and the `operatingPhase(game, players, effective, state): OperatingPhase | null` function, exactly as in [data-model.md](data-model.md) §1–§3 and [contracts/operating-phase.md](contracts/operating-phase.md):
  - Fold the turn from `initialState(game, [])` over `effective` in `seq` order, event by event, applying `advanceTurn` (exported from `src/domain/events/reduce.ts`) to each `turnAdvance`, as `roundSections` in `src/domain/ledger/rounds.ts` does.
  - A `turnAdvance` with `round: "OR"` while the folded round is not `"OR"` opens a phase at that event: record `startGroupId` and `firstOR` from the folded turn after it. A `turnAdvance` with any other `round` closes it and clears the accumulated nets.
  - For each `moneyTransfer` inside an open phase whose `from` or `to` starts with `player:`, add `−amount` (from) or `+amount` (to) to that player's net for that group. Record the folded `{ orSet, orIndex }` at the first such event for the player in the group.
  - Return `null` when no phase is open at the end.
  - Build `players` in seat order:
    - `cash = cashOf(state, "player:<id>")`;
    - `delta` is the sum of that player's group nets;
    - `startCash = cash − delta`;
    - `out = isPlayerBankrupt(state, id)` (from `src/domain/events/state.ts`);
    - `movements` is one per group with a non-zero net: `{ groupId, seq, or, action, amount }`, in log order. Movements whose net is 0 are dropped.
  - Set `over = turn.round === "OR" && turn.currentCompany === undefined && turn.orIndex >= turn.orsInSet`, using `state.turn`.
  - Pure, no I/O. Amounts are integers with no rounding (data-model §4).
  
  This makes T002–T004 pass.
- [X] T006 [P] Add `INCOME_ES` to `src/domain/i18n/es.ts` with exactly the keys and texts in the [contracts/operating-phase.md](contracts/operating-phase.md) "Labels" table, in Uruguayan Spanish:
  - `title`, `take(m)`, `pay(m)`, `none`, `allSettled`, `out`, `rule`, `since(or)`, `startCash`, `cashNow`, `orHeading(set, index)`.
  - `take` and `pay` receive an already formatted money string. `since` receives `"<set>.<index>"`.

**Checkpoint**: `npx vitest run tests/domain/operatingPhase.test.ts` passes. User stories can begin.

---

## Phase 3: User Story 1 - Settle every player's money at the end of the ORs (Priority: P1) 🎯 MVP

**Goal**: During an operating phase, one tap on the Table opens "Ingresos de las ORs". It lists each player with their cash at the start, their cash now, the difference in words ("Cobra del banco" / "Paga al banco" / "Nada que liquidar"), and the chips.

**Independent Test**: In an 1830 session, play an operating phase of two ORs with payouts and private income, then open the summary. Each player's amount equals their cash now minus their cash when OR 1 of the phase started.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Create `tests/ui/income.test.tsx`. Seed an 1830 table with `openSeededTable` and actions that par and float a company, `startOR`, and pay out 100 with `runAndPayout`.
  - (a) **Button**: a button named "Ingresos de las ORs" is in the round controls.
  - (b) **Rows**: clicking it opens a dialog titled "Ingresos de las ORs" with the subtitle "Desde el inicio de la OR 1.1" and the `INCOME_ES.rule` text. Each player has a row with "Al empezar" and "Ahora" amounts. The paid player shows "Cobra del banco $60" (or the game's money format) and chip discs whose labels sum to 60.
  - (c) **No change**: a player with no change shows "Nada que liquidar" and no chips.
  - (d) **All settled**: with no money movement since `startOR`, the dialog shows "Nadie tiene nada que liquidar."
  - (e) **Read-only**: opening and closing the sheet records nothing. History's entry count is unchanged (FR-006).
- [X] T008 [P] [US1] In `tests/domain/operatingPhase.test.ts`, add the US1 independent test as a domain test. An 1830 operating phase of two ORs (OR 1.1 and 1.2, each with at least two payouts and one `privateIncome`) must satisfy, for each player, `delta === cash − cashAt(OR 1.1 start)`. Compute `cashAt` by reducing the effective groups up to and including the `startOR` group.

### Implementation for User Story 1

- [X] T009 [US1] Create `src/ui/sheets/IncomeSheet.tsx` (props `{ onClose: () => void }`) following [contracts/ui.md](contracts/ui.md) §2:
  - Read `useSession()` (`meta`, `state`, `effective`). Compute `useMemo(() => operatingPhase(meta.game, meta.players, effective, state), [meta.game, meta.players, effective, state])`. Call `onClose()` from an effect when it becomes `null`.
  - Render the shared `Sheet` titled `INCOME_ES.title`. Show the subtitle `INCOME_ES.since(\`${firstOR.orSet}.${firstOR.orIndex}\`)` and the `INCOME_ES.rule` text (FR-011).
  - When every non-`out` player has `delta === 0`, show `INCOME_ES.allSettled`.
  - Show one row per player in seat order:
    - the player's name, with their color dot paired with the name (never color alone);
    - "Al empezar <startCash> · Ahora <cash>" in muted text, using `formatMoney`;
    - the direction text: `INCOME_ES.take(formatMoney(delta))` when > 0, `INCOME_ES.pay(formatMoney(-delta))` when < 0, `INCOME_ES.none` when 0. Add the `.income-take` or `.income-pay` class and a ↑ or ↓ glyph (FR-003);
    - when `delta !== 0`, `ChipDiscs` from `src/ui/components/ChipStrip.tsx` for `breakdown(meta.chipSet, Math.abs(delta))`, from `src/domain/mechanics/chips.ts`. When the breakdown is null, show "no hay cambio exacto" (FR-004);
    - for an `out` player, only the name and `INCOME_ES.out`.
  - Nothing in the sheet dispatches (FR-006).
- [X] T010 [US1] In `src/ui/screens/Table.tsx`:
  - Add `{ kind: "income" }` to the `Open` union.
  - Compute `phase` with `useMemo(() => operatingPhase(meta.game, meta.players, effective, state), [meta.game, meta.players, effective, state])`.
  - When `phase !== null`, render a first button "Ingresos de las ORs" in the `round-controls` row that opens it.
  - Render `<IncomeSheet onClose={close} />` when `open?.kind === "income"`.
  - Don't change the other controls.
- [X] T011 [P] [US1] Add the `.income-row` (min-height 48px, a single column on phone portrait), `.income-take` and `.income-pay` styles to `src/ui/styles/components.css`, using the existing color tokens. The glyph and words carry the meaning, and color is only an extra cue ([contracts/ui.md](contracts/ui.md) §3, FR-015).

**Checkpoint**: T007 and T008 pass. US1 can be demonstrated on its own.

---

## Phase 4: User Story 2 - A president pays for their company mid-phase (Priority: P1)

**Goal**: Money a player puts into a company during the phase (and share sales, manual corrections and payments between players) is part of their amount automatically. A negative amount reads "Paga al banco".

**Independent Test**: Run an operating phase where a player earns 200 in dividends and then puts 300 into a company. At the end, the summary shows −100 for that player, labeled as money to pay to the bank.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] In `tests/domain/operatingPhase.test.ts`, add the US2 tests:
  - (a) **Contribution**: a player who receives 200 from a payout and then pays 300 to a company (`transferMoney` from `player:<id>` to `company:<id>`, amount 300) has `delta === -100`, and has two movements, +200 and −300.
  - (b) **Forced purchase**: a `forcedTrainPurchase` where the president sells shares and contributes counts as one movement, with the group's net for that player.
  - (c) **Share sale**: a `sellShares` by a player during the OR adds the sale money to their `delta`.
  - (d) **Between players**: a `transferMoney` between two players changes both `delta`s by opposite amounts.
  - (e) **Bankrupt player**: after `declareBankruptcy` for a player mid-phase, that player's settlement has `out === true` (FR-012).
- [X] T013 [P] [US2] In `tests/ui/income.test.tsx`, add the US2 UI tests:
  - (a) **Pays the bank**: seed a payout that gives a player 200 and then a `transferMoney` of 300 from that player to a company. The player's row shows "Paga al banco $100" with chips summing to 100.
  - (b) **Bankrupt player**: a player bankrupt via `declareBankruptcy` shows "Fuera de la partida", with no amount and no chips.

### Implementation for User Story 2

- [X] T014 [US2] Make T012 and T013 pass. The amounts should already be right from T005, because every `moneyTransfer` counts. Fix any gaps in `src/domain/ledger/operatingPhase.ts`, such as sign handling or a player who is both payer and payee in one group. Fix the `out` rendering in `src/ui/sheets/IncomeSheet.tsx`. Don't add action-type special cases (research R2).

**Checkpoint**: US1 and US2 both work. The P1 scope is complete.

---

## Phase 5: User Story 3 - See where a player's amount came from (Priority: P2)

**Goal**: Each player's row expands to the movements behind the amount, grouped by OR, each labeled with its History title. They add up to the amount.

**Independent Test**: Expand a player's row after an operating phase with payouts, private income and a contribution to a company. The listed movements add up exactly to the amount.

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] In `tests/domain/operatingPhase.test.ts`, add the OR attribution tests (data-model §3, research R4):
  - (a) **By OR**: a payout in OR 1.1 has `or` `{ orSet: 1, orIndex: 1 }`, and one in OR 1.2 has `{ 1, 2 }`.
  - (b) **Compound**: a voice-style compound `{ type: "compound", actions: [buyTrain…, runAndPayout…] }` yields one movement per player, with the group's net and the compound action.
  - (c) **Order**: movements are in `seq` order.
- [X] T016 [P] [US3] In `tests/ui/income.test.tsx`, add the US3 UI tests:
  - (a) **Toggle**: each player row is a button with `aria-expanded="false"`. Clicking it sets `aria-expanded="true"` and shows headings "OR 1.1" and "OR 1.2" in phase order.
  - (b) **Lines**: under the headings, one line per movement with `summaryEs(action, ctx)` (for example "Ingresos de las privadas") and a signed amount (`+$60` / `−$300`).
  - (c) **Sum**: the signed amounts parse and sum to the row's amount (SC-003).
  - (d) **Bankrupt player**: an `out` player's row does not expand.

### Implementation for User Story 3

- [X] T017 [US3] In `src/ui/sheets/IncomeSheet.tsx`, make each non-`out` row a toggle button (`aria-expanded`, min 48 px). When expanded, render a `.income-movements` list:
  - Group the movements by `or`, in phase order, with an `INCOME_ES.orHeading(set, index)` heading per group.
  - Under each heading, one line per movement: `summaryEs(m.action, { game: meta.game, players: meta.players })`, called *without* events (research R3), followed by the signed amount `+<formatMoney>` or `−<formatMoney>`.
  - Keep the expanded rows in component state.
- [X] T018 [P] [US3] Add the `.income-movements` styles (indented list, muted OR headings, amounts aligned right) to `src/ui/styles/components.css`.

**Checkpoint**: US3 works on top of US1/US2.

---

## Phase 6: User Story 4 - Find the summary fast, only while it applies (Priority: P2)

**Goal**: The summary is 1 tap away during the ORs, 2 taps from the menu, highlighted when the phase's last OR is over, and absent outside the ORs.

**Independent Test**: During an OR, open the summary from the Table in one tap. Finish the last OR and check the summary is highlighted. Start the SR and check it is no longer offered. Undo the SR start and check it is offered again.

### Tests for User Story 4 ⚠️

- [X] T019 [P] [US4] In `tests/domain/operatingPhase.test.ts`, add the `over` tests:
  - (a) **Mid-OR**: `over === false` while a company is operating.
  - (b) **Last OR done (1830)**: `over === true` after `nextCompany` finishes the last company of the last OR of the set (no current company, `orIndex >= orsInSet`).
  - (c) **RotLA between ORs**: in RotLA (`getBuiltInGame("rotla")`), after the last company of RO 1 of a 2-OR set, `over === false`. After the last company of RO 2, `over === true`.
  - (d) **21Moon**: in 21Moon (`getBuiltInGame("21moon")`), `startCR` closes the phase (`null`).
  - (e) **RotLA merger round**: in RotLA, `startMR` closes the phase.
- [X] T020 [P] [US4] In `tests/ui/income.test.tsx`, add the US4 UI tests:
  - (a) **Before the first OR**: no "Ingresos de las ORs" button, and the menu (via `openMenuItem`, or by opening "Menú" and querying the dialog) has no such entry.
  - (b) **After `startOR`**: the button is present without the `primary` class, and the menu lists "Ingresos de las ORs", which opens the sheet (2 taps).
  - (c) **Phase over**: after the set's last company finishes, the button has the `primary` class, and "Empezar ronda de acciones" is still present and enabled.
  - (d) **After `startSR`**: the button and the menu entry are gone.
  - (e) **Undo**: undoing the SR start (toast "Deshacer") brings the button back.
  - (f) **Sheet open during undo**: with the sheet open, an undo that removes the phase closes the sheet.

### Implementation for User Story 4

- [X] T021 [US4] In `src/ui/screens/Table.tsx`:
  - Give the round-controls button `className={phase.over ? "primary" : undefined}`.
  - Add a "Ingresos de las ORs" button to the Menu sheet's `choice-grid` that calls `setOpen({ kind: "income" })`, rendered only when `phase !== null`.
  - Don't change "Empezar ronda de acciones", `CycleControls` or "Ronda de fusiones" (FR-010).
- [X] T022 [US4] Confirm that the self-closing effect from T009 in `src/ui/sheets/IncomeSheet.tsx` covers T020 (f). Adjust it if the sheet flickers or throws when `operatingPhase` returns `null`.

**Checkpoint**: All four stories work independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T023 [P] In `tests/domain/randomGames.test.ts`, add a property test over the existing seeded walks (each built-in game, each seed). Whenever `operatingPhase(game, players, s.groups, s.state)` is non-null:
  - G1: for every player, Σ `movements.amount === delta`.
  - G2: `startCash` equals the player's cash in `reduceAll(initialState(game, players), …)` over the groups' events up to and including the opening `turnAdvance` event of `startGroupId`.
  - Sample after every step, or every 10 steps to keep the suite fast.
- [X] T024 [P] In `tests/domain/perf.test.ts`, add a case for G6: `operatingPhase` over the existing 300-group `longGame()` log (effective groups and final state) runs in under 20 ms, using the file's `timeIt`.
- [X] T025 [P] Update `docs/spec.md` §9.1 (Screens) with a short "Ingresos de las ORs" subsection covering:
  - what it shows: cash at the start of the operating phase, cash now, the difference with its direction, the chips, and the movements by OR;
  - when it's offered: only during the ORs, highlighted when the last OR is over;
  - the table rule it assumes: players don't move their own chips during the ORs.
  
  Also add a line to §2.1 if the MVP list enumerates table screens.
- [X] T026 Run `npm run typecheck`, `npm run lint` and `npm test`. Fix any new failures, and compare against the T001 baseline. Leave the changes uncommitted.
  - Note (2026-10-15): typecheck and lint clean (one unneeded `!` in `tests/ui/income.test.tsx` fixed). 1751/1751 tests pass in 89 files, up from 1712 in the T001 baseline. No regressions.
- [X] T027 Manual check: follow [quickstart.md](quickstart.md) steps 1–9 on a phone (portrait) and a tablet (landscape) after `npm run build` and `npm run preview`. Rebuild first: a stale `:4173` server can serve an old `dist`. Needs the user.
  - Manual testing done, all working as expected.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after T001. T005 blocks every story. T006 blocks the UI tasks (T009 onward).
- **US1 (Phase 3)**: after Phase 2. This is the MVP.
- **US2 (Phase 4)**: after Phase 2. Its UI test (T013) needs T009 and T010.
- **US3 (Phase 5)**: after T009, because it extends `IncomeSheet`.
- **US4 (Phase 6)**: after T010, because it extends the Table button. Its domain test (T019) only needs T005.
- **Polish (Phase 7)**: after the stories it covers. T023 and T024 only need T005.

### Within each story

Tests first. See them fail, then implement. Domain before UI.

### Parallel Opportunities

- T002, T003, T004 are written together in one new file. Write them in one pass, then do T005. T006 can be done alongside them.
- T007, T008 (US1 tests) and T011 (CSS) can run in parallel.
- T012, T013 (US2 tests) can run in parallel. So can T015, T016 and T018 (US3), and T019 and T020 (US4).
- After T005, T023, T024 and T025 can run in parallel with any story.

## Parallel Example: User Story 1

```text
Task: "T007 [US1] UI tests for the sheet in tests/ui/income.test.tsx"
Task: "T008 [US1] Domain test of the US1 independent test in tests/domain/operatingPhase.test.ts"
Task: "T011 [US1] Income styles in src/ui/styles/components.css"
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001) → Phase 2 (T002–T006).
2. Phase 3 (T007–T011).
3. **Stop and validate**: quickstart steps 1–2. The table can already settle at the end of the ORs.

### Incremental Delivery

1. Add US2 (T012–T014). Negative amounts and bankrupt players are covered, and the P1 scope is done.
2. Add US3 (T015–T018), the movements behind each amount.
3. Add US4 (T019–T022), the highlight, the menu entry, and the checks that the summary is absent outside the ORs.
4. Do the polish (T023–T027).

## Notes

- There are no new actions, events, voice tools or storage changes. If a task seems to need one,
  stop and re-check [research.md](research.md).
- Leave the changes uncommitted for review. Ignore any "commit after each task" habit.

## Phase 8: Convergence

- [X] T028 In `tests/domain/operatingPhase.test.ts`, replace the `setTurn` stand-in in "any non-OR round closes it, such as RotLA's merger round" with a real `startMR`. Build the session like `atOR2("green")` in `tests/domain/cycles.test.ts`: a `rotlaSession()` with EXP, TUN and CON seeded, `startOR` twice, then `s.apply({ t: "turnAdvance", phase: "green" })`. Assert that the phase is non-null with `over === true` before `startMR`, and that `operatingPhase(...)` is `null` after it, per T019(e) (partial)
  - Note (2026-10-15): done with a real `startMR`. One correction to the task: with seeded companies, RO 2 still has a company operating, so `over` is false before `startMR`. The test asserts the phase is non-null (open) before and `null` after, instead of `over === true`.
