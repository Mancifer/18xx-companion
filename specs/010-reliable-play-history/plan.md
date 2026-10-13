# Implementation Plan: Reliable Play History

**Branch**: `010-reliable-play-history` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-reliable-play-history/spec.md`

## Summary

The table uses the history to audit the app. Today undo can leave later entries with results from a game that no longer exists (the [stale-market bug](../../.specify/bugs/undo-stale-market-move/assessment.md)), and entries don't show where the money went. This feature does three things:

1. **Undo only in order** ([R1](research.md#r1-how-an-undo-is-recorded), [R2](research.md#r2-enforcing-undo-order-fr-001-to-fr-006), [R3](research.md#r3-why-in-order-undo-fixes-the-stale-market-bug)):
   - A new ledger entry kind, `undo { groupIds }`, records one undo intent: the latest action, or "undo back to here" over the target and every later active group.
   - The store enforces the order, and asks for confirmation for a range.
   - No group can stay active after an undone one, so the stale-market bug disappears without touching events or the reducer.
2. **Correcting is removed** ([R2](research.md#r2-enforcing-undo-order-fr-001-to-fr-006), [R9](research.md#r9-voice-undo-back-to-an-entry-and-requests-to-correct-fr-005-fr-008), [R10](research.md#r10-history-ui-fr-002-fr-003-fr-010-fr-017-sc-003)):
   - `amend`, `dependentsOf`, `AmendSheet` and `DependentsDialog` go.
   - Legacy `revert` and `amend` entries stay readable ([R7](research.md#r7-sessions-saved-before-this-feature-fr-018-edge-cases)).
   - Voice "no, eran 260" now explains how to undo instead.
3. **Every entry expands to its full breakdown** ([R5](research.md#r5-deriving-the-breakdown-fr-010-to-fr-016), [R6](research.md#r6-one-line-summaries-carry-the-amount-fr-013-fr-014)):
   - A pure `entryBreakdown` derives movements and before/after balances by replaying the entry's own timeline. It is computed on demand, stored nowhere, and works for older sessions.
   - Summaries with one money movement carry the amount.

Voice gains "deshacé hasta X": the snapshot lists the last 15 entries with ids, and the existing `undo.groupId` is used. The export format goes to v2 ([R8](research.md#r8-export-and-import-fr-019)). No new dependency.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022; Node.js 22 for tooling and the eval

**Primary Dependencies**: Existing only: react 19, zod 4, idb 8, @anthropic-ai/sdk. Gemini is called through `fetch`.

**Storage**: IndexedDB entries store. There is a new entry `kind: "undo"` and no DB migration ([R7](research.md#r7-sessions-saved-before-this-feature-fr-018-edge-cases)). The export format goes from v1 to v2 ([contracts/export-format.md](contracts/export-format.md)).

**Testing**:
- Vitest for domain, store (fake-indexeddb), UI (Testing Library) and voice resolve.
- Randomized undo walks reuse `tests/helpers/randomWalk.ts`.
- Perf goes in `tests/domain/perf.test.ts`.
- The voice eval runs with `npm run eval:voice` (paid key).

**Target Platform**: Installable PWA (Chrome Android, Safari iOS 17+, desktop), phone portrait and tablet landscape

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**:
- `undoTo` back to the first entry of a 300-entry game finishes in under 2 s on a mid-range phone, including state and History on screen (SC-004). The Node budget is 500 ms.
- Expanding one entry stays under 50 ms for 300 groups (one replay).

**Constraints**:
- One `appendEntry` per undo intent (atomic).
- Older logs must replay to identical state.
- Primitive events and actions are unchanged.
- New UI strings in Uruguayan Spanish (voseo, "acá").

**Scale/Scope**:
- Domain (`src/domain/ledger/`):
  - `entries.ts`: new kind.
  - `effectiveLog.ts`: `undo` in `track`, `undoneBy`.
  - New `undo.ts`: `undoRangeOf`.
  - New `breakdown.ts`: `entryBreakdown`.
  - `snapshots.ts`: `invalidatedBy`.
  - Delete `amend.ts` and `dependencies.ts`.
- i18n (`src/domain/i18n/es.ts`): movement and balance lines, `adjustMoney` summary diff, range summaries.
- App:
  - `SessionStore.ts`: `undoLast` and `undoTo`; amend and revert removed.
  - `useSession.ts` and `AppProvider.tsx`: feedback.
  - `voiceController.ts` and `useVoice.ts`.
- UI:
  - `History.tsx`: rewritten item.
  - New `UndoRangeSheet.tsx`.
  - `UndoToast.tsx` and `VoicePanel.tsx`.
  - Delete `AmendSheet.tsx`, `DependentsDialog.tsx`, and the amend paths in `actionFields.ts`.
- Voice: `snapshot.ts`, `tools.ts` (descriptions), `prompt.ts`, `resolve.ts`. Eval cases, grading and fixtures.
- Persistence: `exportImport.ts` (v2).
- Docs:
  - `docs/spec.md`: the Undo/Amend bullets, the History screen, and the voice table row.
  - Mark the bug assessment resolved.
- Tests:
  - Replace `amend.test.ts` and `dependencies.test.ts`.
  - Extend `ledger`, `sessionStore`, `snapshots`, `summaries`, `export`, `perf` and `rotla` tests.
  - New tests for `breakdown` and `undoRandom`.

**Unknowns resolved** (all in [research.md](research.md)):

| Unknown | Resolution |
|---|---|
| How to record "undo back to here" atomically, and undo a legacy corrected entry as a whole | R1: new `undo { groupIds }` entry; legacy `revert`/`amend` read-only |
| Where order is enforced | R2: in `SessionStore` (`undoLast`, `undoTo` + `confirmRange`) |
| Does the stale-market bug need event changes | R3: no; in-order undo removes the precondition |
| Long undo performance | R4: existing snapshot invalidation + rebuild; 300-group perf test |
| Before/after balances for active and undone entries, and old sessions | R5: on-demand replay of the entry's own timeline (`undoneBy`) |
| Amount in summaries | R6: table-driven audit + `adjustMoney` diff |
| Legacy compatibility | R7: same `track` semantics for old kinds; no DB migration |
| Export compatibility | R8: v2 with identity upgrade |
| Voice targeting an older entry; correction requests | R9: ids in the snapshot, existing `undo.groupId`, `amendLast` → explanation; eval re-run |
| UI layout and confirmation | R10: one-tap expand, "Deshacer hasta acá" in panel, `UndoRangeSheet` |
| FR-009 "no change without an entry" | R11: already structural; enforced by test |
| Constitution wording on amend/one-tap undo | R12: constitution amended to v2.0.0 (MAJOR) before implementation |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Event-Sourced Ledger** | ✅ Pass (v2.0.0) | State is still reduce(effective log). The ledger stays append-only, and nothing is deleted or rewritten. `undo` is a ledger entry, not a primitive event: the vocabulary is unchanged. One intent still makes one entry. Amend is retired and legacy amend entries stay readable, as v2.0.0 requires (R12). |
| **II. Money Is Conserved** | ✅ Pass | Invariant checks are unchanged and still surfaced in History. The breakdown uses the events' integers, with a conservation test per holder (FR-016). In-order undo removes a source of silent drift (stale later entries). |
| **III. Rules as Data** | ✅ Pass | No per-game code. No `customRules` hook. |
| **IV. Propose, Confirm, Undo** | ✅ Pass (v2.0.0) | The latest action is one tap (toast or History). An older action is reached with "Deshacer hasta acá" plus one confirmation showing the count, and undo runs only newest first, as v2.0.0 requires. Voice proposals and confirmation are unchanged. A voice undo of a range is confirmed like touch. |
| **V. Voice/Touch Parity** | ✅ Pass | Undo latest and undo back to here work by both. The same store operations and the same confirmation sheet serve both. 48 px targets. Badges are text. Undoing the latest action is the common case and takes 1 tap. Undoing back to an older entry (expand, "Deshacer hasta acá", confirm: 3 taps) is a deliberate recovery step, not a common action, and the confirmation is required by IV. |
| **VI. Test-First** | ✅ Pass (plan) | Domain changes (`undo` tracking, range, breakdown, snapshots, summaries) are test-first. Voice prompt, tool description and snapshot changes need an eval re-run before merging (quickstart §5). |
| **VII. Local-First Simplicity** | ✅ Pass | No dependency, no backend. Breakdown is derived on demand, not stored. Redo, filtering and repair tools are not built (YAGNI). |
| **Workflow** | ✅ Planned | `docs/spec.md` is updated in the same change. Typecheck, lint and test gates. The eval report is attached for the voice changes. The eval re-run covers the default Gemini model only; the user accepted this on 2026-10-12. Claude models keep their earlier results until their own pending eval runs (feature 005). |

**Post-design re-check (after Phase 1)**: unchanged. The design adds one entry kind and derived views only. Removing amend shrinks surface area. No new violations.

## Project Structure

### Documentation (this feature)

```text
specs/010-reliable-play-history/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R12
├── data-model.md        # Phase 1: UndoEntry, UndoRange, EntryBreakdown, results
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── undo-store.md    # undoLast / undoTo, guarantees
│   ├── history-ui.md    # History item, UndoRangeSheet, toast
│   ├── voice-undo.md    # snapshot ids, undo/amendLast resolution, eval
│   └── export-format.md # v2
├── checklists/          # from /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── ledger/
│   │   ├── entries.ts        # + UndoEntry
│   │   ├── effectiveLog.ts   # track(): undo kind; GroupHistory.undoneBy
│   │   ├── undo.ts           # NEW: undoRangeOf, isSetup
│   │   ├── breakdown.ts      # NEW: entryBreakdown, timelineOf
│   │   ├── snapshots.ts      # invalidatedBy(): undo kind
│   │   ├── amend.ts          # DELETE
│   │   └── dependencies.ts   # DELETE
│   └── i18n/es.ts            # movementLineEs, balanceLineEs, adjustMoney diff, range texts
├── app/
│   ├── SessionStore.ts       # undoLast, undoTo; revert/amend/dependentsOf removed
│   ├── useSession.ts         # useDispatch: undoLast, undoTo
│   ├── AppProvider.tsx       # Feedback "reverted" → groups[]; "amended" removed
│   ├── voiceController.ts    # undoTo flow; amend removed
│   └── useVoice.ts
├── ui/
│   ├── screens/History.tsx   # expandable items, Deshacer / Deshacer hasta acá
│   ├── components/UndoRangeSheet.tsx  # NEW
│   ├── components/UndoToast.tsx       # range toast; undoLast
│   ├── components/VoicePanel.tsx      # undoTo sheet; amend card removed
│   ├── components/DependentsDialog.tsx # DELETE
│   ├── sheets/AmendSheet.tsx           # DELETE
│   └── actionFields.ts                 # drop amend-only helpers if unused
├── voice/
│   ├── snapshot.ts           # 15 recent entries with ids
│   ├── tools.ts              # undo / amendLast descriptions
│   ├── prompt.ts             # undo / amend rule line
│   └── resolve.ts            # undoTo kind; amendLast → notUnderstood
└── persistence/exportImport.ts # v2, undo entry schema

tests/
├── domain/ledger.test.ts, snapshots.test.ts, summaries.test.ts, perf.test.ts
├── domain/undo.test.ts        # NEW (range, legacy logs)
├── domain/breakdown.test.ts   # NEW (movements, balances, payouts, unlimited bank, undone timeline)
├── domain/amend.test.ts, dependencies.test.ts  # DELETE (replaced)
├── app/sessionStore.test.ts   # undoLast/undoTo/confirmRange/persist failure
├── app/undoRandom.test.ts     # NEW (SC-001 randomized walks through SessionStore, all built-in games)
├── app/everyChangeHasEntry.test.ts  # NEW (FR-009)
├── persistence/export.test.ts # v2, undo entries, v1 upgrade
├── persistence/resume.test.ts # legacy-session fixture (SC-006)
├── games/rotla.test.ts        # SC-002 regression
├── ui/                        # History, UndoRangeSheet, toast
└── voice/                     # resolve undo/undoTo/amendLast, snapshot ids

eval/voice/cases.jsonl, grade.ts, fixtures/  # new undo-to cases, groupId grading, regenerated fixtures
docs/spec.md                                  # Undo/History/voice table updated
.specify/bugs/undo-stale-market-move/assessment.md  # status → resolved by 010
```

**Structure Decision**: This is the existing single-project PWA layout. The work sits in the ledger (domain), the store (app), History (UI) and voice resolve. There are no new top-level directories.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| *(Resolved)* Constitution 1.1.0 IV required one-tap undo for every action, and I described amend. Only the latest action is one tap now. Older ones need "Deshacer hasta acá" plus a confirmation, and amend is removed. | Out-of-order undo and amend leave later entries computed from a game that no longer exists (the stale-market bug, high severity). The table chose order over convenience (spec clarifications, 2026-10-12). **Resolved** by amending the constitution to v2.0.0 (MAJOR, 2026-10-12) before implementation: I and IV now require in-order undo, one tap for the latest action, and a confirmed range for older ones. | *Re-expanding later groups after an out-of-order undo or amend* (the assessment's fix): later entries can become invalid, which needs flags and manual repair, and the user ruled it out. *Relative market moves*: fix only the price, and payout tiers and other derived amounts stay stale. |
