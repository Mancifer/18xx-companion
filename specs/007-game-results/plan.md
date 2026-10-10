# Implementation Plan: Game Results Screen

**Branch**: `007-game-results` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-game-results/spec.md`

## Summary

Every game gets a results screen that ranks players by cash plus shares at final prices and follows each game's rules for bankrupt players. Games are marked finished either by the table ("Terminar partida") or on their own (RotLA, 21Moon after OR 5.3). They can be reopened. Home shows finished games with a "Completa" marker and the winner, and a finished game opens straight to its results.

The design keeps the log as the only source of truth:

1. **Two new actions, no new primitive** ([R1](research.md#r1-how-a-game-end-and-a-reopening-are-recorded)). `endGame` and `reopenGame` each expand to a single `note` event, so ending moves nothing.
2. **The finished status is derived** ([R2](research.md#r2-automatic-end-the-transition-rule)):
   - The replay cursor folds over the effective log. An `endGame` ends the game, and a `reopenGame` cancels the end.
   - For auto-ending games, a group that turns `gameOver` from false to true ends the game.
   - This one rule covers undo, FR-005c (no immediate re-end after a reopen), and RotLA sessions recorded before this feature.
   - The cursor also keeps the state at the end, which freezes the results (FR-012), and the elimination order.
3. **Scoring rules as data** ([R3](research.md#r3-which-games-end-on-their-own-data), [R4](research.md#r4-ranking-rules-as-data)): a new `scoring` block on game definitions holds `autoEnd`, `bankruptPlayers`, `tieBreak` and `shareBonus`. A new `scheduleComplete` end trigger covers 21Moon. `gameOver` reads `autoEnd` instead of hard-coding RotLA. `finalScores` becomes `finalResults`. Sessions keep their own copy of the game definition, so `scoringOf` falls back to the built-in game's `scoring` for sessions and custom games from before this feature ([R16](research.md#r16-sessions-keep-their-own-copy-of-the-game-definition-found-during-analysis)).
4. **Home cache** ([R10](research.md#r10-home-the-finished-marker-and-winners-without-opening-each-game)): `SessionMeta.outcome` is a derived cache, written in the same IndexedDB transaction as each entry. Older sessions are backfilled once, and import computes it. The export format doesn't change.
5. **UI** ([R11](research.md#r11-table-terminar-partida-and-the-provisional-ranking), [R12](research.md#r12-the-results-screen-and-navigation)):
   - a new `Results` screen (final or provisional) replaces the RotLA-only `ScoreSheet`;
   - the Table gets "Terminar partida", suggested once end conditions fire, and navigates to the results on end;
   - Home rows get the "Completa" badge and winners.
6. **Voice** ([R13](research.md#r13-voice)): an `endGame` tool, regenerated snapshots, and new eval cases.

**Two rulebook findings go beyond the spec text. The user confirmed both on 2026-10-10:**

- **21Moon East-West bonus** ([R5](research.md#r5-21moon-the-east-west-bonus-in-the-final-share-value-rule-found-during-research)): 21Moon §13 values each share at "the current share price plus 50 for each East-West bonus token the corporation holds". The plan includes it as `scoring.shareBonus`.
- **1830 Classic bankruptcy** ([R6](research.md#r6-1830-classic-the-bankrupt-player-keeps-the-shares-they-could-not-sell)): a bankrupt player currently loses their cash and every share to the pool. That makes "scored on the shares they could not sell" (C-2.5 note) always 0. The plan adds `playerMode: "keepHoldings"` for 1830 Classic.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022

**Primary Dependencies**: react 19, idb 8, zod 4 (all existing). No new dependency.

**Storage**: IndexedDB with the existing stores. There is no new store or DB version.
- `sessions` rows gain an optional derived `outcome`.
- `snapshots` rows gain the end-status fields. Older snapshots are skipped ([R9](research.md#r9-snapshots-and-replay)).

**Testing**: Vitest (domain, persistence with fake-indexeddb, UI with Testing Library), Playwright (the RotLA e2e), and the voice eval harness (`npm run eval:voice`, which needs the user's API key).

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus desktop browsers.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: The end-status fold adds one `gameOver` call per group, and only for auto-ending games. A 1,000-entry session must still replay within the existing perf test budget (`tests/domain/perf.test.ts`). Home backfill runs once per older session.

**Constraints**:
- Ending and reopening move no money (FR-005), and the invariants are untouched.
- The table always decides for 1830 and 1848 (Principle III).
- The results screen and the Home markers use touch targets of at least 48 px and text markers, never color alone (FR-013).
- UI text is Spanish.

**Scale/Scope**:
- About 14 source files changed, 2 new (`mechanics/gameEnd.ts`, `screens/Results.tsx`), 1 deleted (`sheets/ScoreSheet.tsx`).
- 4 game definitions get `scoring`, and 1830 Classic gets the new bankruptcy mode.
- About 10 test files extended or new.
- Voice snapshots and fixtures are regenerated.
- `docs/spec.md` is updated.

**Unknowns**: none. Every design choice is in [research.md](research.md) (R1–R16). The two rulebook findings above were confirmed by the user (2026-10-10).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Constitution v1.1.0.

| Principle / Rule | Status | Notes |
|---|---|---|
| I. Event-Sourced Ledger | ✅ | Ending and reopening are new **actions** that expand to the existing `note` primitive, so the vocabulary is unchanged. "Finished" is derived by reducing the log ([R1](research.md#r1-how-a-game-end-and-a-reopening-are-recorded), [R2](research.md#r2-automatic-end-the-transition-rule)). Nothing is deleted or rewritten, and a reopening is its own entry (FR-005b). `SessionMeta.outcome` is a derived cache written in the entry's own transaction. It is never read as truth: replay can always recompute it. |
| II. Money Is Conserved | ✅ | No transfers on end or reopen. The 1830 `keepHoldings` mode moves *less* money than `toPool` and only changes a counter. Final totals are display-only integers. |
| III. Rules as Data, the Table Wins | ✅ | The new `scoring` block is data, each value is cited from a rulebook ([R4](research.md#r4-ranking-rules-as-data)), and it has a `verification.scoring` key. A missing block falls back to defaults marked unverified (FR-011). `gameOver` loses its RotLA hard-coding. No `customRules` hook is added (`keepHoldings` is a config value of the existing `corporateBankruptcy` mechanic). Nothing is blocked: entries after the end are allowed, and "Terminar partida" is a suggestion. |
| IV. Propose, Confirm, Undo | ✅ | "Terminar partida" and "Reabrir partida" both need a confirmation. Both are one-tap undoable groups. The voice `endGame` goes through the normal confirmation card. |
| V. Voice and Touch Parity | ✅ | "Terminar partida" works by touch and by voice (FR-002). "Reabrir partida" is touch-only: it is a correction offered on the results screen, not a common table action ([R13](research.md#r13-voice)). End: 2 taps from the end banner once a condition has fired (SC-003), 3 from the menu before that, which is not a common action. Results from Home: 1 tap (SC-004). Reopen: 2 taps (SC-006). Targets are at least 48 px, and the markers are text. |
| VI. Test-First Domain Logic | ✅ | The fold, `gameOver`, `finalResults`, the scoring data and the bankruptcy mode are all written test-first ([R15](research.md#r15-tests-principle-vi)). The game definition tests cover each `scoring` block. The voice tool change requires an eval re-run before merge (user's API key). |
| VII. Local-First Simplicity | ✅ | No backend, and no new store or dependency. The outcome survives reloads and imports. Not built: auto-ending on "all but one bankrupt" (21Moon §13) and statistics across games. |
| Platform: new dependencies | ✅ | None. |
| Workflow: `docs/spec.md` | ✅ | Planned updates: §5.2 (the `scoring` block), §6 (the `endGame`/`reopenGame` actions), §9.1 (Results screen, Table, Home), §10 (`outcome` cache). |

**Post-design re-check (after Phase 1)**: still all ✅.

- **Snapshots**: the fold adds fields to the replay cursor and snapshots, but no write path outside the event pipeline.
- **The outcome cache**: written only by the store (with an entry), by import (from a replay) and by the backfill (from a replay). Each one derives it from the log.
- **Reviewer check**: "no code path changes state outside the event pipeline" holds.

## Project Structure

### Documentation (this feature)

```text
specs/007-game-results/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R16
├── data-model.md        # Phase 1: scoring block, actions, fold, results, outcome cache
├── quickstart.md        # Phase 1: automated and manual validation
├── contracts/
│   ├── domain.md        # actions, fold, gameOver, finalResults, store, persistence
│   └── ui.md            # Results screen, Table controls, Home rows, History, voice
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── games/
│   │   ├── schema.ts             # + ScoringSchema, + scheduleComplete end trigger
│   │   ├── g1830.ts              # + scoring (scored); Classic option playerMode keepHoldings
│   │   ├── g1848.ts              # + scoring
│   │   ├── g21moon.ts            # + scoring (autoEnd scheduleComplete, East-West bonus), + trigger
│   │   └── grotla.ts             # + scoring (autoEnd, presidentEarliest)
│   ├── actions/
│   │   ├── schemas.ts            # + endGame, reopenGame
│   │   ├── context.ts            # ActionContext.gameEnd?
│   │   └── expand/flow.ts        # handlers for endGame / reopenGame
│   ├── mechanics/
│   │   ├── endTriggers.ts        # scheduleComplete; gameOver from scoring.autoEnd; scoringOf
│   │   ├── gameEnd.ts            # NEW: stepGameEnd fold, gameEndStatus
│   │   ├── scores.ts             # finalScores → finalResults (data-driven)
│   │   └── custom/corporateBankruptcy.ts   # + playerMode keepHoldings
│   ├── ledger/
│   │   ├── replay.ts             # cursor: over, end, eliminationOrder; advance takes action/seq/at
│   │   ├── snapshots.ts          # snapshot fields; skip pre-feature snapshots
│   │   └── effectiveLog.ts       # EffectiveGroup.at
│   ├── i18n/es.ts                # History text for the new actions
│   └── session.ts                # SessionMeta.outcome?
├── app/
│   ├── SessionStore.ts           # gameEnd in snapshot and pipeline ctx; outcome meta patch
│   └── sessions.ts               # + backfillOutcome
├── persistence/
│   ├── sessionRepo.ts            # appendEntry(…, metaPatch?)
│   └── exportImport.ts           # importSession writes outcome
├── voice/tools.ts                # + endGame in ACTION_TOOLS
└── ui/
    ├── nav.ts                    # + results screen
    ├── App.tsx                   # route results (needs session)
    ├── screens/Results.tsx       # NEW
    ├── screens/Table.tsx         # Terminar partida, Clasificación, auto-navigate; drop ScoreSheet
    ├── screens/Home.tsx          # Completa badge, winners, finished → results, backfill
    ├── screens/History.tsx       # automatic-end tag
    ├── sheets/ScoreSheet.tsx     # DELETED
    └── styles/components.css     # results table, badges, phone layout

tests/
├── domain/gameEnd.test.ts        # NEW
├── domain/{scores,endTriggers,snapshots}.test.ts
├── games/{1830,21moon,rotla,definitions}.test.ts
├── persistence/{sessionRepo,export}.test.ts
├── ui/results.test.tsx           # NEW
├── ui/{home,rotla}.test.tsx
└── voice/__snapshots__/*         # regenerated

e2e/rotla.spec.ts                 # score sheet steps → results screen
eval/voice/{cases.jsonl,fixtures/*}   # endGame cases; rebuilt fixtures
docs/spec.md                      # §5.2, §6, §9.1, §10
```

**Structure Decision**: This is the existing single-project PWA layout.
- **Domain**: the fold lives next to `endTriggers.ts` in `mechanics/`. `replay.ts` calls it, so the store, export, import and amend all get the same status.
- **Persistence and app**: the outcome cache follows the existing `appendEntry` transaction.
- **UI**: the results screen is a full screen because Home has to reach it without the Table.

## Complexity Tracking

There are no constitution violations to justify.
