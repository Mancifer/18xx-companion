# Implementation Plan: Automatic End-of-Round Step

**Branch**: `003-auto-end-of-round` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-auto-end-of-round/spec.md`

## Summary

Starting a round (`startOR`, `startCR`, `startSR`, by touch or voice) will first apply the end step of the round being left, in the same event group. The "Fin de ronda de acciones" and "Fin de ronda corporativa" buttons go away.

The approach:

- One pure function, `roundEndEvents(game, state)`, builds the end step of the **current** round:
  - SR: pending capital, then the end-of-SR sold-out moves.
  - CR: the end-of-CR sold-out moves and pool penalty.
  - OR or private auction: nothing.
  - A round whose end step was already applied: nothing.
  - SR and CR end steps finish with a marker event.
- The marker is a new optional field on the existing `turnAdvance` primitive: `roundEnd: "SR" | "CR"`. The reducer turns it into a derived flag, `turn.roundEnded`. The flag is cleared whenever the round changes, so the same marker covers a voice `endSR`, a start action, and undo. Undo needs no extra handling: a reverted group's events are not reduced.
- For saved games from before this change, the reducer also sets the flag on events only an end step produces: a `marketMove` with reason `soldOut` or `poolPenalty`, or a `companyStatus` with `capitalPending: false`.
- `endSR` and `endCR` now use `roundEndEvents`. They are unavailable when the round doesn't match or its end step was already applied, so a repeated voice "fin de la ronda" appends nothing and tells the table why.
- The start actions compute the rest of their events on the state *after* the end step, so the OR's operating order sees the sold-out prices.

No new action types, no new primitive event types, no new dependencies, and no voice prompt or tool-schema changes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), ES2022; Node.js 22 LTS for tooling

**Primary Dependencies**: react 19, react-dom 19, zod 4 (unchanged; no new dependencies)

**Storage**: IndexedDB event log. One optional field is added to the `turnAdvance` event. Old logs stay valid with no migration.

**Testing**: Vitest + @testing-library/react (domain + UI), Playwright (e2e)

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus desktop browsers.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: No measurable change. The end step costs one extra reduce over a handful of events per round start.

**Constraints**: Works offline. Money is conserved. One user intent produces one event group.

**Scale/Scope**: 3 built-in games plus custom games. Files touched:
- Domain (6): `events/types.ts`, `events/schema.ts`, `events/reduce.ts`, `events/state.ts`, `mechanics/roundEnd.ts`, `actions/expand/flow.ts`.
- Mechanics and summaries (2): `mechanics/custom/corporateRound.ts`, `i18n/es.ts`.
- UI (1): `ui/screens/Table.tsx`.
- e2e specs (3) and `docs/spec.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Event-Sourced Ledger | ✅ | The end step and the round start are one group (one intent → one group). The "already ended" fact is derived by reducing events, not stored beside the log. No new primitive: `turnAdvance` gains one optional field (see Complexity Tracking). |
| II. Money Is Conserved | ✅ | Capital moves bank → company through the existing `pendingCapitalEvents`. The invariants run after the combined group as usual. Tests cover SR → OR with pending capital, undo, and redo. |
| III. Rules as Data | ✅ | Which moves run at `endSR` or `endCR` still comes from `game.market.moves` and `game.capitalization`. `roundEndEvents` is generic across games; 21Moon needs no special branch. `endSR` and `endCR` become unavailable only when they would do nothing (no rule is blocked). Every price can still be overridden with `setMarket`. |
| IV. Propose, Confirm, Undo | ✅ | Voice start commands show the end-step effects on the confirmation card (flows plus effects). One undo reverts the whole transition. Touch start buttons apply immediately, as they do today. |
| V. Voice and Touch Parity | ✅ | Touch and voice dispatch the same `startOR`, `startCR` and `startSR` actions through the same pipeline. Going from SR to OR drops from 2 taps to 1. |
| VI. Test-First Domain Logic | ✅ | `roundEndEvents`, the reducer flag, and the start/end handlers are written test-first. Per-game tests cover 1830 capital and sold-out moves, 1848 sold-out moves, and the 21Moon CR penalty and skipped CR. |
| VII. Local-First Simplicity | ✅ | No backend, no new dependency, no migration. |
| Workflow: `docs/spec.md` updated | ✅ | The flow row (line ~209) and the turn-state description are updated in the same change (FR-014). |
| Workflow: voice eval | ✅ n/a | No change to the system prompt, tool schemas or tool descriptions. `endSR` and `endCR` keep their schemas and descriptions; only their expansion changes. |

**Result**: PASS. Re-checked after Phase 1 design: still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/003-auto-end-of-round/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R7
├── data-model.md        # Phase 1: event field, derived turn flag, end-step composition
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   ├── actions.md       # Behavior of startOR / startCR / startSR / endSR / endCR
│   └── ui.md            # Round controls after the change
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── events/
│   │   ├── types.ts            # turnAdvance.roundEnd?: "SR" | "CR"
│   │   ├── schema.ts           # Zod: roundEnd optional enum
│   │   ├── state.ts            # TurnState.roundEnded?: true (derived)
│   │   └── reduce.ts           # set on marker / legacy end-step events, clear on round change
│   ├── mechanics/
│   │   ├── roundEnd.ts         # + roundEndEvents(game, state)
│   │   └── custom/
│   │       └── corporateRound.ts  # startCR / endCR use roundEndEvents
│   ├── actions/expand/
│   │   └── flow.ts             # startSR / startOR / endSR prepend the end step
│   └── i18n/es.ts              # effectsEs: "fin de la ronda de acciones / corporativa"
└── ui/screens/Table.tsx        # remove the two "Fin de ronda" buttons

tests/
├── domain/
│   ├── roundEnd.test.ts        # new: roundEndEvents, flag, idempotence, undo
│   ├── turns.test.ts           # start actions include the end step
│   ├── capitalization.test.ts  # 1830 capital via startOR
│   └── corporateRound.test.ts  # 21Moon CR → OR, SR → OR skip
├── games/1830.test.ts, 1848.test.ts, 21moon.test.ts
└── ui/taps.test.tsx            # buttons gone; one tap SR → OR

e2e/operating.spec.ts, a11y.spec.ts, offline.spec.ts   # drop the "Fin de ronda" taps
docs/spec.md                                            # flow row + turn state
```

**Structure Decision**: Same single-project layout as features 001 and 002. The change lives in the domain flow handlers and the reducer. The UI only loses two buttons.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New optional field `roundEnd` on the `turnAdvance` primitive (vocabulary extension, not a new primitive) | "At most once per round" (FR-006) must survive an end step that produced no other events, and a late SR action after a voice "fin de la ronda" must not re-trigger it. Only an explicit marker records that. | Inferring the flag only from end-step events (`soldOut`, `poolPenalty`, `capitalPending: false`) misses empty end steps. Scanning the effective log for `endSR` groups needs the log inside `ActionContext`, which breaks "state is derived by reducing events". A `note` event would carry meaning in free text. |
