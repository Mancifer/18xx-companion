# Research: Touch-First Operating Flow

**Feature**: [spec.md](spec.md) | **Date**: 2026-10-09

The Technical Context has no open unknowns: the stack, storage and tests are unchanged from
`001-companion-mvp`. The research below settles design questions by reading the current code.

## R1. How "no run" is recorded

- **Decision**: Record "no run" as an ordinary `runAndPayout` action. Every revenue part is 0,
  and the mode is `withhold` when the game offers a payout choice, or `null` when it uses fixed
  revenue parts (21Moon). The national company (1848 BoE) keeps using `nationalPayout`, and
  "no run" is not offered for it.
- **Rationale**: `computePayout` already treats a zero full payout as a withhold
  (`src/domain/mechanics/payout.ts:79`). `applyMoveRules` then moves the share price with the
  game's `withhold` rule. The handler also bumps the `runs` counter, which marks the company in
  `operatedThisOR`. No new action type, event type or market rule is needed (Principle I: a
  small vocabulary). For fixed-part games, the move rules match on the dividend, so a zero
  dividend picks up the game's own rule.
- **Alternatives considered**: A new `noRun` action was rejected because it would duplicate
  `runAndPayout`'s expansion and need a voice-tool change. Moving the price only on
  `nextCompany` was rejected because the move would be hidden inside a flow action, and the
  History entry would not show a run.

## R2. What `nextCompany` does when the current company has no run

- **Decision**: Change the `nextCompany` expansion. If the current company is not in
  `operatedThisOR`, expand the same events a "no run" `runAndPayout` would produce (transfers,
  market move, `runs` counter), then the turn advance. Everything goes in the one group. The
  validator adds a warning, `noRunRecorded`: "No se registró la operación de X: cuenta como que
  no corrió y su acción baja." National companies keep today's behavior (count the run, no
  move), with an info warning.
- **Rationale**: Voice "siguiente compañía" (eval case `fl-01`) and any other caller now follow
  the rules. The confirmation card shows the warning and the market move, so voice users confirm
  "no run" explicitly (FR-009). This is warn-not-block (Principle III), and undo still reverts
  the whole step in one go (FR-005). Touch users never reach this path, because the touch
  "finish turn" control is only enabled once a run is recorded (FR-003).
- **Alternatives considered**: Making `nextCompany` unavailable without a run was rejected: it
  blocks, which violates Principle III, and leaves voice users stuck. Keeping today's silent
  counter bump was rejected because it is the bug being fixed.

## R3. Marking out-of-turn actions in History

- **Decision**: In `validateAction` (`src/domain/actions/validate.ts`), add a turn check for
  the operating actions: the existing `CURRENT_COMPANY_ACTIONS` set in
  `src/domain/actions/resolve.ts`, plus `discardTrain`. It runs after each handler's own
  `validate`. In an OR, when the company named by the action is not `turn.currentCompany`, it
  adds a warning
  `outOfTurn`: "X opera fuera de turno (le toca a Y)." Warnings are already stored on the group
  (`src/domain/ledger/entries.ts:20`) and shown in History (`src/ui/screens/History.tsx:139`).
- **Rationale**: The out-of-turn mark becomes part of the ledger, so it shows up for voice and
  touch alike. It needs no new field or event, and it never blocks.
- **Alternatives considered**: A `note` event in the group was rejected because warnings
  already do this job. A UI-only flag was rejected because it would not be in History or in
  exports.

## R4. Keeping typed revenue while buying a train

- **Decision**: Move the revenue draft (`amounts`, the part being edited) out of
  `RevenueEntry` and into `OperateSheet`, so it survives view changes. Give sub-view actions
  (train, cost, bank payment, private, loan, discard) a `runInTurn` callback. On success it
  returns to the `run` view instead of closing. Only the payout itself and "finish turn" end
  their step.
- **Rationale**: Today the draft lives in `RevenueEntry`. Switching to a sub-view unmounts it,
  and `run` closes the sheet on every success (`OperateSheet.tsx:51`). Lifting the state is the
  smallest fix. The draft is UI state only and is never logged, as the spec's Key Entities
  require.
- **Alternatives considered**: Recording revenue before buying trains (forcing an order) was
  rejected: some tables buy trains first, and the rules allow both orders for some actions. A
  draft persisted to the store was rejected (YAGNI); dropping the draft on close is accepted
  (edge case in the spec).

## R5. Summary of the turn so far

- **Decision**: Add a pure query, `turnActivity(effective, state, company)`. It returns the
  effective groups recorded since the current OR began (the last group with an OR
  `turnAdvance`, the same scan `Table.tsx` uses for private income) whose action resolves to
  that company. The operate sheet lists them with the existing Spanish action summaries. "Run
  recorded" comes from `state.turn.operatedThisOR`.
- **Rationale**: This is derived from the log (Principle I) and needs no new state. The
  same-OR scan already exists, so it can be pulled into one shared helper.
- **Alternatives considered**: A `turnActions` list stored in `TurnState` was rejected because
  it is redundant with the log and would need reducer changes.

## R6. Showing and enforcing the operating order in the controls

- **Decision**: Add a query, `upcomingCompanies(game, state, n)`. It returns the companies
  that come after the current one in `operatingOrder`, skipping those already in
  `operatedThisOR`. The round controls show "Operar <current>" plus "Después: <next>". In an
  OR, tapping a non-current company's card opens its details sheet (`CompanySheet`). That
  sheet gains a "Operar fuera de turno…" control, which opens `OperateSheet` with an
  out-of-turn banner and no "finish turn" control. The current company's card opens
  `OperateSheet` directly.
- **Rationale**: The order logic (`operatingOrder`, `nextToOperate`) is already correct and
  tested. Only the controls change. A non-current company never gets a "finish turn" control,
  so the turn cannot be advanced from the wrong company.
- **Alternatives considered**: Disabling other companies' cards was rejected because it
  blocks and hides their details.

## R7. When "Comprar privada" can be bought

- **Decision**: Add a query, `purchasablePrivates(game, state)`, using the same filter as
  `PrivatesSheet` today: the holder is not `removed`, and either the bank holds it or
  `privateResaleOpen` is true. Also exclude privates that are closed. The round control is
  shown only when the round is PRIVATES or SR and the list is not empty. `PrivatesSheet` uses
  the same query and shows "No hay privadas a la venta ahora." when it is empty.
- **Rationale**: A single source of truth for the control and the sheet makes the empty-menu
  state impossible (SC-005). `privateResaleOpen` already handles 1830-style trading from SR2
  and games with no trading.
- **Alternatives considered**: Hiding the control after the PRIVATES round was rejected
  because it breaks resale in SR2+.

## R8. Voice and eval impact

- **Decision**: No tool-schema or prompt change. The eval set is still re-run, because
  `nextCompany` expansion changes what the confirmation card shows.
- **Rationale**: Under the constitution's quality gate, a change that touches what voice
  commands do must report eval accuracy. The expected action for `fl-01` (`nextCompany`) is
  unchanged.
