# Implementation Plan: Operating Round Income Summary

**Branch**: `012-or-income-summary` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-or-income-summary/spec.md`

## Summary

A read-only "Ingresos de las ORs" sheet shows, for each player, their cash now minus their cash
at the start of the current operating phase. It says in words whether they take that amount from
the bank or pay it, shows the chips, and can be expanded to the movements behind it, grouped
by OR.

- **Domain** ([R1](research.md#r1-where-the-operating-phase-starts-and-ends),
  [R2](research.md#r2-computing-each-players-amount),
  [R3](research.md#r3-movements-and-their-labels-us3-fr-005)): a new pure function,
  `operatingPhase`. It folds the turn over the effective log event by event, with the reducer's
  own `advanceTurn`, to find where the phase opened: the first `turnAdvance` into `OR` from
  another round. It then sums each player's `moneyTransfer`s after that point. The start cash is
  the cash now minus that sum, so it needs no replay. The movements are per-entry nets, labeled
  with the entry's History title.
- **UI** ([R6](research.md#r6-where-the-summary-lives-in-the-ui-fr-009-fr-010)):
  - a new `IncomeSheet`;
  - an "Ingresos de las ORs" button in the Table's round controls, which turns primary when the
    phase's last OR is over;
  - a menu entry.
  
  Both entry points exist only while a phase is current.

There is no new action, no new event, no storage or export change, no voice change, and no new
dependency.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022. Node.js 22 for tooling.

**Primary Dependencies**: Existing only: react 19, zod 4, idb 8. Nothing new.

**Storage**: N/A. The summary is derived from the effective log and the current state, and
nothing is stored ([R9](research.md#r9-persistence-and-export)).

**Testing**:
- **Domain**: Vitest. The new `tests/domain/operatingPhase.test.ts` is written test-first.
- **Property**: a check against `replay`, in the random-games suite.
- **Perf**: a case in `tests/domain/perf.test.ts`.
- **UI**: the new `tests/ui/income.test.tsx`, using Testing Library.

**Target Platform**: Installable PWA (Chrome Android, Safari iOS 17+, desktop), phone portrait and
tablet landscape

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: `operatingPhase` over a 300-group log runs in under 20 ms in Node. It is
memoized on `effective`, so the Table stays as fast as before.

**Constraints**:
- **Read-only**: nothing is dispatched (FR-006).
- **Scope**: the summary is offered only during an operating phase (FR-008).
- **Totals**: the amounts equal the app's balances to the unit (FR-002), and the movements sum to
  the amount (SC-003).
- **Language**: Uruguayan Spanish.

**Scale/Scope**:
- Domain:
  - New `src/domain/ledger/operatingPhase.ts`.
  - `src/domain/i18n/es.ts`: `INCOME_ES`.
- UI:
  - New `src/ui/sheets/IncomeSheet.tsx`.
  - `src/ui/screens/Table.tsx`: the `Open` kind, the round-controls button and the menu entry.
  - `src/ui/styles/components.css`.
- Docs: `docs/spec.md`.
- Tests: 2 new files, plus extensions to `randomGames` and `perf`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* (Constitution v2.0.0)

| Principle | Check | Status |
|---|---|---|
| I. Event-Sourced Ledger | Nothing is written. The summary is a pure fold over the effective log, and the phase boundary comes from the existing `turnAdvance` events. No new primitive or action. | PASS |
| II. Money Is Conserved | No money moves. Amounts are integer sums of recorded transfers, with no rounding. `startCash + delta === cash` and Σ movements === delta are asserted in tests, including against a full `replay` (G1, G2). | PASS |
| III. Rules as Data, the Table Wins | No per-game code. Round boundaries come from the shared turn model, so RotLA, 21Moon and custom games work unchanged. The settlement rule is a table convention stated on screen, not enforced. | PASS |
| IV. Propose, Confirm, Undo | No new actions, so nothing to confirm or undo. The summary follows undo automatically (G5). | PASS |
| V. Voice and Touch Parity, Minimal Screen Time | Reachable by touch in 1 tap (round controls) or 2 (menu). No voice tool, because it is a read-only view and voice is a shortcut, not a requirement ([R8](research.md#r8-product-reference-and-voice)). Direction is in words plus a glyph, never color alone. Rows are at least 48 px. Works in phone portrait and tablet landscape. | PASS |
| VI. Test-First Domain Logic | `operatingPhase` is developed test-first, with a replay oracle and a perf bound. The voice eval doesn't need a run, because no prompt, tool or provider changes. | PASS |
| VII. Local-First Simplicity | No backend, storage or dependency. The collection mark, reminders and history of earlier phases were dropped (YAGNI, user 2026-10-15). | PASS |
| Quality gates | Typecheck, lint and the full suite. `docs/spec.md` gets a short subsection. | PLANNED |

**Post-design re-check**: PASS. The design adds one pure domain module and one sheet. It reuses
`advanceTurn`, `summaryEs`, `breakdown`/`ChipDiscs`, `isPlayerBankrupt` and `Sheet`. Nothing
needs complexity tracking.

## Project Structure

### Documentation (this feature)

```text
specs/012-or-income-summary/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R9
├── data-model.md        # Phase 1: OperatingPhase, PlayerSettlement, SettlementMovement
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── operating-phase.md  # operatingPhase signature, behavior, guarantees G1–G7, INCOME_ES
│   └── ui.md               # entry points, IncomeSheet layout, styles, UI tests
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── ledger/operatingPhase.ts   # NEW operatingPhase (pure)
│   └── i18n/es.ts                 # + INCOME_ES
└── ui/
    ├── sheets/IncomeSheet.tsx     # NEW
    ├── screens/Table.tsx          # Open "income", round-controls button, menu entry
    └── styles/components.css      # income row / direction / movements styles

tests/
├── domain/operatingPhase.test.ts  # NEW (test-first)
├── domain/randomGames.test.ts     # + replay oracle property (G1, G2)
├── domain/perf.test.ts            # + 300-group bound (G6)
└── ui/income.test.tsx             # NEW

docs/spec.md                       # income summary subsection
```

**Structure Decision**: single-project PWA, following the existing `src/domain` / `src/ui` split.
The new domain module sits next to `rounds.ts` in `ledger/`, because both are derived folds over
the log. The UI is one sheet opened from the Table, following the Chips and Privates sheets.

## Delivery Order

1. **Domain**: `operatingPhase`, test-first (US1 and US2 amounts, G1–G7), and `INCOME_ES`.
2. **US1 and US2 UI**: `IncomeSheet` rows with direction, chips and the rule text, plus the
   round-controls button.
3. **US4**: the primary highlight when the phase is over, the menu entry, and the checks that the
   summary is absent outside a phase.
4. **US3**: expandable movements grouped by OR.
5. **Wrap-up**: `docs/spec.md`, the full suite, and the manual check in
   [quickstart.md](quickstart.md).

## Complexity Tracking

No constitution violations to justify.
