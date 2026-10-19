# Implementation Plan: UI Readability Polish and RotLA Major Names

**Branch**: `013-ui-readability-polish` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-ui-readability-polish/spec.md`

## Summary

This feature makes four presentation changes and one data correction. It adds no new action,
no event and no storage change.

- **Company badges in text (US1)**: summary strings gain opt-in **mention markers**
  (`SummaryContext.marks`). A new `RichText` component turns each marker into a `CompanyBadge`.
  The text shown is identical, so `textContent` and every plain caller (voice, snapshot) are
  unchanged. Screens that print a short name directly render the badge instead
  ([R1](research.md#r1-getting-company-badges-into-summary-sentences-fr-001fr-006),
  [R2](research.md#r2-inventory-of-plain-text-company-mentions-fr-001-sc-001),
  [R3](research.md#r3-badge-legibility-in-text-and-in-both-themes-fr-004-edge-cases)).
- **Train cards (US2)**: a pure `companyTrains` feeds a new `TrainCards` component, used in the
  company card and the reworked operate-view `TrainsLine`
  ([R4](research.md#r4-train-cards-fr-007fr-011)).
- **Share sources (US3)**: a pure `shareSources` feeds a tile row in `StockSheet` that replaces
  the inline availability line ([R5](research.md#r5-buy-shares-view-fr-012fr-014)).
- **RotLA identities (US4)**: the real second names and aliases go into `grotla.ts`, the
  companies are marked verified, and the voice snapshots and fixtures are regenerated, with new
  eval cases ([R6](research.md#r6-rotla-second-identities-fr-015fr-019)).
- **Market without closed companies (US5, added 2026-10-15)**: the Market screen leaves out
  companies whose status is `closed`, both on the track and in the "Sin ficha en el mercado" row.
  The filter is in the screen's view only, so undo brings tokens back
  ([R8](research.md#r8-market-without-closed-companies-fr-020fr-022)).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022. Node.js 24 for tooling.

**Primary Dependencies**: The existing react 19, zod 4 and idb 8. Nothing new.

**Storage**: N/A. Everything is derived at render time. Saved sessions pick up the new RotLA
names from the definition with no migration.

**Testing**:
- **Domain**: Vitest, test-first. New files: `mentions.test.ts`, `companyTrains.test.ts` and
  `shareSources.test.ts`. The plain/marked equivalence property is added to `randomGames.test.ts`.
- **UI**: Testing Library. Extend `history`, `income`, `operate`, `stock`, `rotla` and `voice`.
- **Voice**: regenerate the prompt and tool snapshots. Run the paid eval on the regenerated
  fixtures.

**Target Platform**: Installable PWA (Chrome Android, Safari iOS 17+, desktop), phone portrait and
tablet landscape, light and dark themes.

**Project Type**: Single-project web app (PWA), no backend.

**Performance Goals**: no measurable change.
- `splitMentions` is linear in string length.
- History rendering stays within the existing perf test budget.

**Constraints**:
- **Plain text where read or sent**: voice prompts, snapshots, replies and `aria-label`s stay
  plain (FR-005).
- **Taps**: the number of taps per action is unchanged (FR-014, SC-006).
- **Accessibility**: badges always show text, and rusted and empty states carry text cues
  (Principle V).
- **Language**: Uruguayan Spanish labels.

**Scale/Scope**:
- **Domain**:
  - New `src/domain/i18n/mentions.ts`.
  - `src/domain/i18n/es.ts`: the `marks` flag in the three name helpers, plus `companyTrains`.
  - `src/domain/actions/expand/stock.ts`: `shareSources`.
  - `src/domain/games/grotla.ts`.
- **UI**:
  - New `RichText.tsx` and `TrainCards.tsx`.
  - `CompanyBadge.tsx` gets the `inline` size and the `label` prop.
  - `TrainsLine.tsx`, `CompanyCard.tsx`.
  - `History.tsx`, `IncomeSheet.tsx`, `OperateSheet.tsx`, `UndoToast.tsx`,
    `UndoRangeSheet.tsx`, `BatchSheet.tsx`, `ConfirmationCard.tsx`.
  - `Table.tsx`, `Results.tsx`, `Market.tsx`, `StockSheet.tsx`, `MergerSheet.tsx`.
  - `Market.tsx` again for US5: closed companies are filtered out of `tokensAt` and `unplaced`.
  - `components.css`.
- **Voice/eval**: prompt and tool snapshots, `eval/voice/fixtures/rotla-*.json`, and 2 new
  cases.
- **Docs**: `docs/spec.md`, and R14 in `specs/004-railways-lost-atlas/research.md`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* (Constitution v2.0.0)

| Principle | Check | Status |
|---|---|---|
| I. Event-Sourced Ledger | Nothing is written. Badges, train cards, share sources and the market filter (US5) are views of derived state. Merger events store only `identity`, so renamed identities replay unchanged. | PASS |
| II. Money Is Conserved | No money logic changes. `shareSources` reuses `sharePrice` and `unitsOf`. | PASS |
| III. Rules as Data | US5 hides only by status, the same in every game, with no per-game code path. A closed company's price stays overridable through the manual actions. The names are definition data. The source is the user's physical copy (2026-10-15), so `verification.companies` becomes `verified`. No per-game code path is added. | PASS |
| IV. Propose, Confirm, Undo | The confirmation card shows the same summary with badges. The proposal, validation and undo flows are untouched. | PASS |
| V. Voice/Touch Parity, Minimal Screen Time | Color is never the only cue: badges show the short or full name, rusted cards say "oxidado", and empty sources say "agotada". Tap counts are unchanged. Train cards and tiles wrap on phone portrait. | PASS |
| VI. Test-First Domain Logic | `mentions`, `companyTrains` and `shareSources` are written test-first, with a property test for plain/marked equivalence. The RotLA alias change changes the voice prompt, so the eval set MUST be re-run before merging. This needs the user's API key, so it is tracked as a user task. | PASS (eval pending) |
| VII. Local-First Simplicity | No dependency, no storage, no backend. The marker approach was chosen over a structured-summary rewrite (YAGNI). | PASS |

**Post-design re-check**: still PASS. The design adds three pure functions and three
presentation components and changes one definition file. There are no violations, so Complexity
Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-ui-readability-polish/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ui.md
│   └── game-data.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── i18n/
│   │   ├── mentions.ts          # NEW: markMention, splitMentions, stripMentions
│   │   └── es.ts                # marks flag in name helpers; companyTrains; trainsLineEs on top
│   ├── actions/expand/stock.ts  # shareSources
│   └── games/grotla.ts          # real second identities, verified
├── ui/
│   ├── components/
│   │   ├── RichText.tsx         # NEW
│   │   ├── TrainCards.tsx       # NEW
│   │   ├── CompanyBadge.tsx     # inline size, label prop, outline
│   │   ├── TrainsLine.tsx       # header + cards + warn + Corregir
│   │   ├── CompanyCard.tsx      # TrainCards sm
│   │   ├── ConfirmationCard.tsx, UndoToast.tsx, UndoRangeSheet.tsx
│   ├── screens/History.tsx, Table.tsx, Results.tsx, Market.tsx
│   ├── sheets/IncomeSheet.tsx, OperateSheet.tsx, BatchSheet.tsx, StockSheet.tsx, MergerSheet.tsx
│   └── styles/components.css    # badge inline/outline, train-card, share-sources
tests/
├── domain/mentions.test.ts, companyTrains.test.ts, shareSources.test.ts, randomGames.test.ts
├── games/rotla.test.ts, customGame.test.ts
├── ui/history, income, operate, stock, rotla, voice
└── voice/__snapshots__/          # regenerated
eval/voice/fixtures/rotla-*.json, eval/voice/cases.jsonl
```

**Structure Decision**: this is the existing single-project PWA layout. Domain helpers stay pure
under `src/domain`, and presentation stays under `src/ui`.

## Complexity Tracking

No violations.
