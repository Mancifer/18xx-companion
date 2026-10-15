# Implementation Plan: Action Menus UX

**Branch**: `011-action-menus-ux` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-action-menus-ux/spec.md`

## Summary

The feature makes five fixes to the table's menus and to History. Each can ship on its own.

1. **Player menu (US1, P1)** ([R1](research.md#r1-selling-and-buying-from-the-player-menu-fr-001-to-fr-008), [R2](research.md#r2-holdersheet-sections-fr-001-fr-003)):
   - The player sheet is split into "Jugada" and "Ajustes".
   - "Jugada" gets one-tap "Vender 1 <company>" buttons in the SR, plus "Vender acciones" and
     "Comprar acción" views.
   - All of them dispatch the existing `sellShares` and `buyShare`, so money, market moves and
     warnings are identical to the company card's. There is no domain change.
2. **Trains line (US2, P2)** ([R3](research.md#r3-train-count-in-the-operating-menu-fr-009-fr-010)):
   the operating menu shows "Trenes 2/4 · 2, 3", built from `countedTrains` and `trainLimitFor`.
3. **Train correction (US3, P2)** ([R4](research.md#r4-train-correction-action-fr-011-to-fr-017), [R5](research.md#r5-where-train-correction-lives-in-the-ui), [R6](research.md#r6-voice-fr-024)):
   - A new `correctTrain` action removes a train to the bank (with an optional refund, list price
     by default), to the pool (only in games that discard trains there), or out of the game. It
     can also give a company a train.
   - It is built only from existing primitives.
   - It is exempt from the phase trigger and the private-closing trigger.
   - It is a new voice tool.
4. **History by round (US4, P3)** ([R7](research.md#r7-history-round-sections-fr-018-to-fr-021)):
   - A pure `roundSections` folds the active groups' `turnAdvance` events into contiguous round
     sections.
   - History renders each section with a header (icon + title + "en curso" or "terminada") and an
     "Inicio" band.
5. **Round-end titles (US5, P3)** ([R8](research.md#r8-titles-for-round-ending-nextcompany-entries-fr-022-fr-023)):
   - The `nextCompany` summary reads its events and becomes "Fin de la OR 2.1 · empieza la OR 2.2"
     or "Fin de las rondas de operaciones". The end-of-set title does not name the next round,
     which is an SR or, in RotLA from green on, an MR. The `setComplete` warning is shortened to
     match.
   - Every place that uses `summaryEs` picks this up, including old sessions.

There is no new primitive event, no storage or export format change, and no new dependency.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022. Node.js 22 for tooling and the eval.

**Primary Dependencies**: Existing only: react 19, zod 4, idb 8, @anthropic-ai/sdk. Gemini is
called through `fetch`.

**Storage**: IndexedDB entries store, unchanged. A new action type sits in the existing group
entry shape. The export stays v2 ([R9](research.md#r9-export-import-and-persistence)).

**Testing**:
- Vitest for domain (`correctTrain`, triggers, `roundSections`, summaries) and UI (Testing
  Library: player sheet, operate sheet, history, taps).
- Perf in `tests/domain/perf.test.ts`.
- Voice prompt snapshots.
- The voice eval runs with `npm run eval:voice` (paid key).

**Target Platform**: Installable PWA (Chrome Android, Safari iOS 17+, desktop), phone portrait and
tablet landscape

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**:
- `roundSections` over 300 groups adds under 20 ms in Node to History's render. It is memoized on
  the log.
- The menus open with no perceptible delay. They only add a few state reads.

**Constraints**:
- One user intent = one group.
- Corrections never change the phase or close privates.
- The company-side `StockSheet` behavior is unchanged.
- Older logs show the new round titles with no rewrite.
- New UI strings in Uruguayan Spanish (voseo).

**Scale/Scope**:
- Domain:
  - `actions/schemas.ts`: `correctTrainAction`.
  - `actions/expand/manual.ts`: the `correctTrain` handler. It reuses `trainPrice` and the
    unlimited-train minting exported from `operating.ts`.
  - `actions/triggers.ts`: the `CORRECTION_ACTIONS` exemption.
  - `events/reduce.ts`: export `advanceTurn`.
  - New `ledger/rounds.ts`: `roundSections`.
  - `i18n/es.ts`: the `correctTrain` summary, the `nextCompany` round-end titles, round titles and
    icons, and the trains-line formatter.
- UI:
  - `sheets/HolderSheet.tsx`: the `gameActions` slot and the two fieldsets.
  - `sheets/PlayerSheet.tsx`: quick sell, and the sell and buy views.
  - `screens/Table.tsx`: split `playerActions` into game and adjustment actions; add "Corregir
    trenes…" to `companyActions`.
  - New `components/TrainsLine.tsx`, used by `OperateSheet.tsx` (and optionally `CompanyCard`).
  - New `sheets/TrainCorrectionSheet.tsx`.
  - `screens/History.tsx`: sections.
  - `styles/components.css`: section header and band styles, and the trains-line warning style.
- Voice:
  - `voice/tools.ts`: `correctTrain` in `ACTION_TOOLS`, its description, and its entity enums.
  - `eval/voice/cases.jsonl`: new cases.
  - Regenerate the prompt snapshots and the eval fixtures.
- Docs: `docs/spec.md` §6, §8.3 and §9.1 ([R10](research.md#r10-product-reference-fr-026)).
- Tests:
  - New `tests/domain/correctTrain.test.ts` and `tests/domain/rounds.test.ts`.
  - Extend `summaries`, `perf`, `ui/history`, `ui/operate`, `ui/stock` (or a new
    `ui/playerSheet`), `ui/taps`, `ui/rotla` and `voice` tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* (Constitution v2.0.0)

| Principle | Check | Status |
|---|---|---|
| I. Event-Sourced Ledger | `correctTrain` expands to existing primitives (`assetTransfer`, `moneyTransfer`, `counterChange`) in one group. No new primitive. Round sections and titles are derived, never stored. Nothing is rewritten. | PASS |
| II. Money Is Conserved | Refunds and payments are bank↔company `moneyTransfer`s. Sell and buy reuse the existing expansions. Tests assert the invariants after each new path (SC-007). | PASS |
| III. Rules as Data, the Table Wins | No per-game code. Rule concerns (phase starter, rusted type returned, refund off supply, bank broken) are warnings, and a refund given with a pool or out-of-game destination is recorded, not refused. Availability rejects only moves that cannot happen (a train not held, an empty supply, a malformed `to`) and the pool destination in games whose pool never holds trains (`discardedTrainsTo !== "pool"`). That last one is the shape of the game, not a rule of play, and follows the precedent of `changeTrainSupply` being unavailable in games without reserve trains. | PASS |
| IV. Propose, Confirm, Undo | Touch dispatches apply with one-tap undo, as today. A voice `correctTrain` goes through the confirmation card. Correction entries undo like any group. | PASS |
| V. Voice and Touch Parity, Minimal Screen Time | `correctTrain` is reachable by touch and by voice, through the same schema and validation. The common sale is 2 taps (SR quick sell). The company card's 2-tap buy is kept. Section bands and the trains line pair text with icons (never color alone). Buttons ≥ 48 px. | PASS |
| VI. Test-First Domain Logic | `correctTrain`, the trigger exemption, `roundSections` and the summaries are written test-first. Voice tool changes are re-evaluated on the eval set before merging (paid run, user task). | PASS |
| VII. Local-First Simplicity | No backend, no new dependency, no storage change. Collapsible sections and stored round metadata were deferred or rejected (YAGNI). | PASS |
| Quality gates | Typecheck, lint, full tests. Eval accuracy reported for the new tool. `docs/spec.md` updated. | PLANNED |

**Post-design re-check**: PASS. The design kept the 2-tap sale (quick-sell buttons) to stay within
Principle V, rather than relying on the spec's looser 3-tap target. Nothing needs complexity
tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-action-menus-ux/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R10
├── data-model.md        # Phase 1: correctTrain, round sections, titles, player sections
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── actions.md       # correctTrain schema, availability, warnings, summaries, voice tool
│   └── ui.md            # player sheet, trains line, correction view, history sections
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── actions/
│   │   ├── schemas.ts            # + correctTrainAction
│   │   ├── triggers.ts           # + CORRECTION_ACTIONS exemption
│   │   └── expand/
│   │       ├── manual.ts         # + correctTrain handler
│   │       └── operating.ts      # export trainPrice / next-train helper (reuse)
│   ├── events/reduce.ts          # export advanceTurn
│   ├── ledger/rounds.ts          # NEW roundSections
│   └── i18n/es.ts                # summaries, round titles/icons, trains line
├── ui/
│   ├── components/TrainsLine.tsx # NEW
│   ├── sheets/
│   │   ├── HolderSheet.tsx       # Jugada / Ajustes fieldsets
│   │   ├── PlayerSheet.tsx       # quick sell, sell view, buy view
│   │   ├── OperateSheet.tsx      # TrainsLine + "Corregir…"
│   │   └── TrainCorrectionSheet.tsx # NEW
│   ├── screens/
│   │   ├── Table.tsx             # player/company action split, "Corregir trenes…"
│   │   └── History.tsx           # round sections
│   └── styles/components.css
└── voice/tools.ts                # + correctTrain tool

tests/
├── domain/{correctTrain,rounds}.test.ts   # NEW
├── domain/{summaries,perf}.test.ts
├── ui/{history,operate,stock,taps,rotla}.test.tsx (+ playerSheet.test.tsx)
└── voice/ (prompt snapshots)

eval/voice/cases.jsonl, eval/voice/fixtures/*   # new cases, regenerated fixtures
docs/spec.md
```

**Structure Decision**: single-project PWA, following the existing `src/domain` / `src/ui` /
`src/voice` split. Domain changes stay pure and are tested first. UI changes reuse `Sheet`,
`Keypad`, `CompanyBadge` and `availabilityOf`.

## Delivery Order

The stories are independent. Suggested order:

1. US5 (titles, smallest).
2. US1 (P1).
3. US2.
4. US3 (domain, then UI, then voice).
5. US4.

US4 and US5 share `es.ts`. US2 and US3 share the trains line's "Corregir…" link, so US3's link is
added once both exist.

## Complexity Tracking

No constitution violations to justify.
