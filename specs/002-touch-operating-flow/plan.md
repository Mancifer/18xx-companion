# Implementation Plan: Touch-First Operating Flow

**Branch**: `002-touch-operating-flow` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-touch-operating-flow/spec.md`

## Summary

This plan fixes four problems in touch-only play:

- "Comprar privada" opening an empty list.
- Operating turns that can be skipped without recording a run, so the share price never drops.
- Typed revenue lost when buying a train.
- Operating actions recorded for companies whose turn it is not.

The approach reuses the existing ledger:

- "No run" is a zero-revenue `runAndPayout` with withhold.
- `nextCompany` records that same "no run" when nothing was recorded, with a warning, instead
  of skipping silently.
- Out-of-turn operating actions get an `outOfTurn` warning that is stored in History.
- Three new pure queries (`turnActivity`, `upcomingCompanies`, `purchasablePrivates`) drive the
  UI.
- On the UI side, the separate "Siguiente" button goes away. The operate sheet becomes a turn
  that stays open: the revenue draft is lifted out of `RevenueEntry`, sub-view actions return to
  the turn instead of closing it, and the sheet gains a turn summary, a "No corrió" button and a
  "Terminar turno" button.

No new action types, event types, schemas or dependencies are needed.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), ES2022; Node.js 22 LTS for tooling

**Primary Dependencies**: react 19, react-dom 19, zod 4 (unchanged; no new dependencies)

**Storage**: IndexedDB event log (unchanged; no new persisted fields)

**Testing**: Vitest + @testing-library/react (domain + UI), Playwright (e2e), voice eval
(`npm run eval:voice`)

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus
desktop browsers.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: The operate sheet re-renders instantly. Queries are O(groups in the
current OR).

**Constraints**: Works offline. Touch targets are at least 48 px. Common actions take at most 2
taps (a full turn takes ≤ 6 taps plus digits, per SC-004).

**Scale/Scope**: 3 built-in games plus custom games. About 5 domain files (`flow.ts`,
`operating.ts`, `validate.ts`, `resolve.ts`, `queries.ts`, plus `i18n/es.ts`) and 4 UI files
touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|-----------|--------|
| I. Event-sourced ledger | No direct state changes. "No run" and finishing a turn are existing actions, each one group. The turn draft is UI state only, never logged. | ✅ |
| II. Money conserved | A zero run moves no money. The market move uses the game's withhold rule. Invariants are untouched. | ✅ |
| III. Rules as data, table wins | Nothing is blocked. Out of turn is warn-and-allow (spec clarification). The finish-turn gating in the UI is guided flow: "No corrió" is always one tap away, and voice `nextCompany` and the turn editor still advance. The market move comes from each game's `withhold` rule; no per-game code. | ✅ |
| IV. Propose, confirm, undo | Voice `nextCompany` now shows the `noRunRecorded` warning and the market move on the confirmation card. Every step is undoable as one group. | ✅ |
| V. Voice/touch parity, minimal taps | Both paths use the same actions and the same pipeline, and the warnings apply to both. The tap budget is in SC-004; one tap is added versus today's skip, but that is the point. | ✅ |
| VI. Test-first domain | The `nextCompany` change, the `outOfTurn` validation and the 3 queries are written test-first. Game tests cover the zero-run move in 1830, 1848 and 21Moon. | ✅ (planned) |
| VII. Local-first simplicity | No backend or dependency. No stored draft (YAGNI). | ✅ |
| Workflow: `docs/spec.md` updated | FR-017: the round controls and operating sections are updated in the same change. | ✅ (planned) |
| Workflow: voice eval | The `nextCompany` expansion changes, so the eval is re-run and accuracy reported (research R8). | ✅ (planned) |

**Post-design re-check (after Phase 1)**: unchanged. The contracts add no blocking path and no new
state. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/002-touch-operating-flow/
├── plan.md              # This file
├── research.md          # Phase 0: design decisions R1–R8
├── data-model.md        # Phase 1: derived entities, turn state machine, warning codes
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── actions.md       # nextCompany / out-of-turn behavior, new queries
│   └── ui.md            # round controls, card tap routing, operate sheet layout
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/domain/
├── actions/
│   ├── expand/flow.ts         # nextCompany: zero run for an unrecorded current company + noRunRecorded
│   └── validate.ts            # outOfTurn turn check for operating actions
└── queries.ts                 # turnActivity, upcomingCompanies, purchasablePrivates

src/ui/
├── screens/Table.tsx          # remove "Siguiente"; "Después:" hint; privates control gating; card tap routing
├── sheets/OperateSheet.tsx    # lifted draft, stay-open sub-views, summary, "No corrió", "Terminar turno", out-of-turn mode
├── sheets/CompanySheet.tsx    # "Operar fuera de turno…" control (via extraActions from Table)
└── sheets/PrivatesSheet.tsx   # use purchasablePrivates; empty message

docs/spec.md                   # FR-017 product reference update

tests/
├── domain/turns.test.ts       # nextCompany zero run, undo as one group
├── domain/queries.test.ts     # the 3 queries
├── domain/actions/…           # outOfTurn warning
├── games/{1830,1848,21moon}.test.ts  # zero-run market move per game
├── ui/operate.test.tsx        # draft survival, finish gating, stay-open, out-of-turn banner
├── ui/taps.test.tsx           # SC-004 tap budgets
└── e2e/operating.spec.ts      # full OR walk-through (updated: no "Siguiente")
```

**Structure Decision**: This is the existing single-project layout. Domain changes go in
`src/domain` and are tested in `tests/domain` and `tests/games`. UI changes go in `src/ui` and
are tested in `tests/ui` and `e2e/`. Existing tests and e2e flows that tap "Siguiente" must be
moved to "Terminar turno".

## Complexity Tracking

No constitution violations, so nothing to justify.
