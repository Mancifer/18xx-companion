# Implementation Plan: Player and Company History, Last Run Revenue

**Branch**: `017-entity-history-revenue` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/017-entity-history-revenue/spec.md`

## Summary

This feature adds two things:
- **A read-only History filtered to one player or one company.** It opens from their sheet and
  hands off to the full History for undo.
- **Each company's last run revenue** on its card and sheet.

Both are pure derivations over the existing event ledger. No new events, actions or persistence:
- **Involvement** comes from a group's stored primitive events (research R1).
- **The last run** is the latest effective `runs` counter mark for the company. Its amount comes
  from the matching `runAndPayout` parts, and the payout mode from the run's market move
  (R5, R6).
- **The History screen gains optional `subject`, `focus` and `back` parameters.** The Table gains
  `reopen`, so the sheet comes back when the user returns (R2–R4).

## Technical Context

**Language/Version**: TypeScript (strict), React 19

**Primary Dependencies**: React, Vite (PWA), zod. No new dependency.

**Storage**: IndexedDB event log. Unchanged, no migration.

**Testing**: Vitest + Testing Library (unit/UI), Playwright (e2e)

**Target Platform**: Installable PWA, phone portrait and tablet landscape, offline

**Project Type**: Single-project web app (`src/`, `tests/`, `e2e/`)

**Performance Goals**:
- The filtered History and the cards update within one render after any entry.
- The full-game fold (~160 actions) stays inside the existing perf test budget.

**Constraints**:
- Derived only (FR-019).
- es/en text (FR-018).
- 48 px targets (FR-020).
- No undo from the filtered views (FR-008).

**Scale/Scope**:
- 2 new domain modules.
- 4 UI files changed (History, Table, HolderSheet/CompanySheet, CompanyCard), plus nav, i18n
  catalogs and `docs/spec.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Event-Sourced Ledger | Read-only derivations from the log; no new primitives; legacy amend/revert entries are read through `groupHistory` / `effectiveLog` | Pass |
| II. Money Is Conserved | No state change; the invariant banner still shows in filtered views | Pass |
| III. Rules as Data | No per-game code path. Revenue parts come from `game.revenueParts`, and national companies are excluded by the existing `kind` data field. No `customRules` hook is needed. | Pass |
| IV. Propose, Confirm, Undo | Undo stays in-order and only in the full History; the filtered view links there, so the range confirmation still counts every entry | Pass |
| V. Voice/Touch Parity, Minimal Screen Time | A touch-only view feature with no new action types, so parity is unaffected. Histories open in 2 taps (SC-001). The last run is visible with 0 taps. 48 px buttons. Companies use badge + name. | Pass |
| VI. Test-First Domain Logic | `involves`, `lastRun` and `focusBreakdown` get failing tests first (contracts/domain.md). Voice is unchanged, so no eval rerun. | Pass |
| VII. Local-First Simplicity | No backend, no stored data. Nav gets 3 optional fields instead of a navigation stack (YAGNI). | Pass |
| Workflow | `docs/spec.md` updated in the same change (FR-021) | Planned |

**Post-design re-check**: Pass. The design added no events, dependencies or hooks.

## Project Structure

### Documentation (this feature)

```text
specs/017-entity-history-revenue/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── domain.md
│   └── ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/domain/ledger/
├── involvement.ts       # NEW: HistorySubject, involves, involvedGroupIds, filterSections, focusBreakdown
└── lastRun.ts           # NEW: LastRun, lastRuns, lastRun
src/ui/
├── nav.ts               # Screen: table.reopen, history.subject/focus/back
├── App.tsx              # pass screen params to History and Table
├── screens/History.tsx  # filtered mode, focus, back target
├── screens/Table.tsx    # seed open sheet from reopen
├── sheets/HolderSheet.tsx / PlayerSheet.tsx / CompanySheet.tsx  # "Historial" button; last run block
└── components/CompanyCard.tsx                                   # last run in trains row
src/i18n/contract/ui.ts, src/i18n/es/ui/*, src/i18n/en/ui/*      # new keys
src/ui/styles/*          # .history-mine
docs/spec.md             # History, sheets, company card sections

tests/domain/involvement.test.ts   # NEW
tests/domain/lastRun.test.ts       # NEW
tests/domain/perf.test.ts          # extend
tests/ui/history.test.tsx, playerSheet.test.tsx, rotla.test.tsx  # extend
tests/ui/companyCard.test.tsx      # NEW
e2e/entity-history.spec.ts         # NEW
```

**Structure Decision**: The existing single project. The domain queries go next to their
siblings in `src/domain/ledger/` (`breakdown.ts`, `rounds.ts`, `operatingPhase.ts`). The UI
reuses the History screen rather than adding a new one.

## Complexity Tracking

No violations to justify.
