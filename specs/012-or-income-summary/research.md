# Research: Operating Round Income Summary

Feature: [spec.md](spec.md) · Plan: [plan.md](plan.md)

There were no open "NEEDS CLARIFICATION" items. The spec was settled with the user on 2026-10-15:
a read-only net settlement with no collection mark. The decisions below cover how to build it
in this codebase.

## R1. Where the operating phase starts and ends

**Decision**: Walk the effective log event by event and fold only the turn, using the reducer's
own `advanceTurn` (the same technique as `roundSections` in `src/domain/ledger/rounds.ts`). The
phase **starts** at the first `turnAdvance` that sets `round: "OR"` while the previous round was
not `OR`. It **ends** at any `turnAdvance` that sets a round other than `OR`. If the fold ends in a
started phase, that phase is current. Otherwise there is no phase and the summary is not offered
(FR-008).

**Rationale**:
- Every OR start, built-in or custom, goes through `startOREvents`, which emits
  `turnAdvance { round: "OR", … }`. Every other round start (`startSR`, `startCR`, `startMR`,
  `setTurn`) emits a `turnAdvance` with its own round. The round field is a reliable boundary
  for every game, including RotLA's "RO" labels and 21Moon's CR.
- Back-to-back sets (`startOR` with the "newSet" warning while in an OR) stay `OR → OR`, so they
  stay in one phase, as the spec's edge case requires.
- Working at the event level, not the group level, handles a group that both ends a round and
  starts an OR. Examples are `startOR` with its end step, and a voice compound. Money before the
  boundary event is outside the phase, and money after it is inside, which matches "after any
  end step of the round before it".
- Undo needs no special code. The fold runs over `effective`, so undoing the SR start puts the
  phase back, and undoing the OR start removes it (US4 independent test).

**Alternatives considered**:
- *Use `turn.orSet` as the boundary*: rejected because back-to-back sets would split the phase.
- *Store a phase-start marker event*: rejected. It is derivable, the constitution keeps the
  event vocabulary small, and old sessions would lack it.
- *Use `currentORGroups` from `queries.ts`*: rejected. It finds the current OR, not the phase,
  and it works on whole groups.

## R2. Computing each player's amount

**Decision**: Use `delta(player) = Σ moneyTransfer.amount to the player − Σ from the player`,
over the events after the phase start. Then `startCash = cashOf(state, player) − delta`. No
replay to the start point is needed.

**Rationale**:
- In `reduce.ts`, player cash changes only through `moneyTransfer`. The initial state sets every
  player to 0, and setup money arrives as transfers too. So the sum over the phase's events is
  exactly the cash change.
- Movements then add up to the amount by construction (SC-003). The amount equals the app's
  balance change to the unit (FR-002, SC-002).
- It costs one linear pass and no reduces. That is cheaper than `replay` or the snapshot
  machinery.

**Alternatives considered**:
- *Replay to the start point and diff the states*: correct, but it costs a full reduce for no
  gain. It is kept as the **test oracle** instead (see R7).
- *Count only income actions (dividends, privates)*: this was the first version of the spec. The
  user rejected it on 2026-10-15 in favor of the net difference.

## R3. Movements and their labels (US3, FR-005)

**Decision**: Use one movement per (effective group, player) with a non-zero net in the phase.
The movement keeps its `groupId`, the OR it happened in, the group's action and its signed
amount. Its label is the entry's History title, `summaryEs(action, ctx)` called *without*
events, so the effect suffixes are left out. Examples: "PRR paga $240", "Ingresos de las
privadas", "Compra forzada: PRR compra un 4 al banco · el presidente vende 2 B&O".

**Rationale**:
- The History title already names the source: the paying company, privates, the company a
  president contributed to, a share sale, or a correction. That satisfies FR-005's "each with
  its source" with no new classification code to maintain.
- Voice compounds such as "compra un 3 y paga 290" get the compound's joined title, so the source
  stays clear without splitting events by item. Splitting can't be done reliably from stored
  events.
- Netting per group keeps one line per entry. A forced train purchase, where the player sells
  shares and pays the company, shows its net, which is what the player settles.

**Alternatives considered**:
- *A coarse `kind` enum (dividend / privates / contribution / sale / other) inferred from
  counterparties*: rejected. It is ambiguous for compounds and mixed groups, and the title is
  already clearer.
- *One movement per raw transfer*: rejected as too noisy. A payout is one line per entry, as in
  History.

## R4. The OR a movement belongs to

**Decision**: A movement's OR is the turn (`orSet.orIndex`) in the fold at the group's first
counted money event for that player. The UI groups movements under "OR 3.1", "OR 3.2", and so on,
in phase order.

**Rationale**: It is exact, it costs nothing extra (the fold already has the turn), and it
handles a group that starts a new OR before paying (`nextCompany` → next OR, with no money).

## R5. Bankrupt players (FR-012)

**Decision**: A player for whom `isPlayerBankrupt(state, id)` is true now is shown as "Fuera de
la partida", with no amount, no chips and no movements.

**Rationale**: The game's bankruptcy rules already moved their cash. Settling a bankrupt
player's difference makes no sense at the table. This works the same whether they went bankrupt
in this phase or earlier.

## R6. Where the summary lives in the UI (FR-009, FR-010)

**Decision**:
- **New sheet**: a new `IncomeSheet` (`src/ui/sheets/IncomeSheet.tsx`) built on the shared
  `Sheet`, opened through a new `Open` kind `{ kind: "income" }` in `Table.tsx`.
- **Table button**: while a phase is current, the Table's `round-controls` row shows an
  "Ingresos de las ORs" button (1 tap). It is placed first.
- **Phase over**: when the phase is over (`round === "OR"`, no current company,
  `orIndex >= orsInSet`), the button gets the `primary` class so it stands out next to "Empezar
  ronda de acciones" (and RotLA's `CycleControls`). Nothing else changes and nothing is blocked
  (FR-010).
- **Menu**: the Menu sheet lists the same entry while a phase is current (2 taps), and never
  outside one.
- Outside a phase, neither entry is rendered (FR-008, SC-004).

**Rationale**: It follows how "Cobrar privadas" is offered, as a round-scoped button in
`round-controls`. It needs no new navigation route, because sheets keep the Table underneath,
like Chips. One tap is within constitution V's 2-tap limit for common actions.

**Alternatives considered**:
- *A new screen route (like Results)*: rejected. It would leave the Table for a quick check.
- *A badge on each PlayerTile*: rejected for this feature, because it puts more on a tile that is
  already busy. It could be done later.
- *A confirmation step on "Empezar ronda de acciones"*: rejected because FR-010 forbids adding a
  step.

## R7. Testing strategy (constitution VI)

**Decision**:
- **Domain, test-first**: a new `tests/domain/operatingPhase.test.ts` using the existing 1830
  helpers (`tests/helpers/session.ts`, `flows.ts`). It covers:
  - the phase start and end at each kind of round boundary;
  - back-to-back sets;
  - a start inside a group;
  - undo of a payout, of the OR start and of the SR start;
  - a contribution that gives a negative amount (US2);
  - a share sale;
  - a bankrupt player;
  - the OR attribution;
  - a voice compound;
  - no phase before the first OR.
- **Per-game checks**: one each for 21Moon (CR boundary, revenue parts), RotLA (MR boundary,
  phase over between RO 1 and RO 2 is *not* over) and 1848 (national payout).
- **Property test**: in `tests/domain/randomGames.test.ts` (or alongside it), for random walks,
  `startCash` must equal the cash from `replay` up to the phase start (the oracle from R2), and
  Σ movements must equal the delta.
- **Perf**: a case in `tests/domain/perf.test.ts`. On the 300-group log, the summary computes in
  under 20 ms in Node.
- **UI**: a new `tests/ui/income.test.tsx` (Testing Library) covering:
  - the button shows only in a phase and is primary when the phase is over;
  - the menu entry;
  - "Cobra del banco" and "Paga al banco" wording;
  - chips;
  - expanded movements grouped by OR;
  - a bankrupt player;
  - the empty state ("nada que liquidar").

## R8. Product reference and voice

**Decision**:
- **Product reference**: `docs/spec.md` gains a short subsection on the income summary in the
  table UI section, plus the table rule it assumes.
- **Voice**: no voice tool or query kind. The summary is read-only and touch-reachable, and
  constitution V only requires touch parity for capabilities. Because no voice change is made,
  the eval set doesn't need a run.

## R9. Persistence and export

**Decision**: No change. Nothing is stored. The summary is derived from `effective` and `state`
on every render, memoized on `effective`. Export and import, snapshots and older sessions work
unchanged.
