# Research: Automatic End-of-Round Step

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

The Technical Context had no open unknowns. These are the design decisions, each checked against the current code.

## R1 — How "already applied this round" is recorded

**Decision**: Add an optional field `roundEnd: "SR" | "CR"` to the `turnAdvance` primitive event. Every SR or CR end step ends with `{ t: "turnAdvance", roundEnd: <round> }`. The reducer keeps a derived `turn.roundEnded?: true`:
- It is set by that marker.
- It is cleared whenever `round`, `srNumber`, `orSet` or `orIndex` changes. This uses the same "round changed" test `advanceTurn` already uses to reset `operatedThisOR` and `soldThisSR`.

**Rationale**:
- State stays purely derived from events (constitution I).
- Undo works with no extra code: a reverted group's marker is not reduced, so the flag goes away (FR-007).
- An end step with no effects still records that it ran, so a late SR purchase after a voice "fin de la ronda" does not re-run the sold-out check (spec edge case).

**Alternatives considered**:
- Scan the effective log for an active `endSR` or `endCR` group since the last round change. Rejected: expanders only see `ActionContext { game, players, state }`, and adding the log breaks the pure-reducer model.
- A brand-new primitive (`roundEnd`). Rejected: the turn-tracking primitive already exists, and a field is the smaller change to the vocabulary.
- A `note` event. Rejected: free text must not carry meaning.

## R2 — Saved games from before the change (FR-006, legacy)

**Decision**: The reducer also sets `turn.roundEnded` on events that only an end step produces:
- a `marketMove` whose reason is `soldOut` or `poolPenalty`;
- a `companyStatus` with `capitalPending: false`.

`pendingCapitalEvents` is the only producer of that last event; the initial state sets the field directly, without an event.

**Rationale**: A pre-change log in the middle of an SR, after the old "Fin de ronda de acciones" button was tapped, then has the flag. Starting the OR does not double-apply.

**Accepted gap**: A legacy end step that produced *no* events leaves no trace. Running it again is harmless unless shares changed hands afterwards in the same SR. A persisted snapshot taken in exactly that window also lacks the field. Both are narrow, and the table can fix them with `setMarket`.

**Alternatives considered**: Migrate old logs to insert markers. Rejected: events are never rewritten (constitution I).

## R3 — Where the end step is built

**Decision**: Add `roundEndEvents(game, state): PrimitiveEvent[]` to `src/domain/mechanics/roundEnd.ts`:
- `state.turn.roundEnded` → `[]`
- round `SR` → `[...pendingCapitalEvents(game, state), ...endOfRoundMoves(game, state, "endSR"), { t: "turnAdvance", roundEnd: "SR" }]`
- round `CR` → `[...endOfRoundMoves(game, state, "endCR"), { t: "turnAdvance", roundEnd: "CR" }]`
- round `OR` or `PRIVATES` → `[]`

**Rationale**:
- This is the same composition and order as today's `endSR` and `endCR` handlers (FR-003, FR-004).
- It is data-driven: games without `endSR` or `endCR` moves get only the marker.
- 21Moon's SR step is just the marker: its capital is `incremental` and its sold-out check is `at: "endCR"`.
- A table that skips the CR never runs the CR step (FR-011), because the step follows the round being *left*.

## R4 — Order inside the start group

**Decision**: Each start handler expands to `end = roundEndEvents(game, state)`, then computes its own events on `interim = reduceAll(state, end)`, and returns `[...end, ...own]`.

**Rationale**: `startOREvents` builds the operating order from share prices. Sold-out moves and the pool penalty change prices, so the order must be computed after them. The rules agree: the end-of-round moves happen before the next round's order is set. The `turnAdvance` that changes the round comes after the marker, so the new round starts with `roundEnded` cleared.

## R5 — `endSR` / `endCR` (voice) after the change

**Decision**: Both stay as actions, with their schemas and tool descriptions unchanged. They expand to `roundEndEvents`. Their `available` check returns:
- `unavailable("Ya se aplicó el fin de la ronda de acciones")` (or `… corporativa`) when `turn.roundEnded`;
- `unavailable("Solo en la ronda de acciones")` (or `… corporativa`) when the round doesn't match.

**Rationale**:
- `SessionStore.doDispatch` appends a group even when it has no events. Making the no-op unavailable keeps History clean and shows the reason to the table (FR-008).
- This does not block a rule: there is nothing left to apply. Any manual price fix is still possible with `setMarket`.
- Leaving schemas and descriptions alone means no voice eval re-run is required.

**Alternatives considered**: A warning plus an empty group. Rejected: it leaves a meaningless entry in History, and undoing it confuses the table.

## R6 — What the start entry shows (FR-010)

**Decision**: Capital already appears as a bank → company flow, through `bankFlows` on the confirmation card and the undo toast. `soldOut` and `poolPenalty` moves already appear in `effectsEs` as "X → price". Add one effect line for the marker: "fin de la ronda de acciones" or "fin de la ronda corporativa". The history entry then reads "Empieza la ronda de operaciones · fin de la ronda de acciones · PRR → 82 · …".

**Rationale**: Reuses the existing summary path, and the table sees that the end step happened.

## R7 — Which controls trigger the end step

**Decision**: `startOR`, `startCR` and `startSR`, whether tapped or spoken. They do nothing extra in the OR or the private auction.

Unchanged:
- `nextCompany`, whose automatic next-OR start leaves an OR.
- `setTurn`, the manual override (FR-012). It changes `round` through `turnAdvance` without a marker, so the flag only resets.

UI: remove the two "Fin de ronda" buttons from `Table.tsx`. All other buttons and their visibility stay the same.
