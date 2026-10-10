---

description: "Task list for feature 007: Game Results Screen"
---

# Tasks: Game Results Screen

**Input**: Design documents from `specs/007-game-results/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/domain.md](contracts/domain.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle VI (test-first domain logic) and research R15 require them. Write each test task first and confirm it fails before the implementation task that follows it.

**Organization**: Tasks are grouped by user story. US1 and US2 are P1; US3 and US4 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: The user story the task belongs to (US1–US4)
- Paths are relative to the repository root (single-project PWA: `src/`, `tests/`, `e2e/`, `eval/`)

---

## Phase 1: Setup

**Purpose**: Establish a green baseline. No new dependency or project structure is needed (plan: "No new dependency").

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the current tree and note any pre-existing failures in the Notes section at the end of specs/007-game-results/tasks.md, so later failures can be attributed to this feature

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Scoring data on game definitions, the `scheduleComplete` trigger, the data-driven `gameOver`, the two action schemas, and the derived game-end fold in replay, snapshots and the store. Every user story reads the end status from here.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation (write first, must fail)

- [X] T002 [P] Add schema tests in tests/games/schema.test.ts: `scoring` is optional on `GameDefinition`; `scoring.autoEnd` accepts only `"cyclesComplete" | "scheduleComplete" | "bankBroken" | "bankruptcy"` and rejects duplicate values ("`autoEnd` holds distinct values"); `bankruptPlayers` is `"eliminated" | "scored"`; `tieBreak` is `"shared" | "presidentEarliest"`; `shareBonus.perUnit` must be a positive integer ("`perUnit` is a positive integer"); `{ type: "scheduleComplete" }` is a valid end trigger
- [X] T003 [P] Add end-trigger tests in tests/domain/endTriggers.test.ts (contracts/domain.md §3): `scheduleComplete` fires for 21Moon when the schedule is `fixed`, `turn.scheduleIndex` is the last slot, `turn.round` is `"OR"` and `orSetComplete(state)` holds (after OR 5.3) with message "Fin de la partida: se jugó la última ronda de operaciones."; it does not fire after OR 5.2; `gameOver` is true for RotLA after the last cycle's OR 2 with no MR due and for RotLA + Bank Break with bank ≤ 0 and the OR set complete (unchanged results), true for 21Moon after OR 5.3, false after 5.2, and always false for 1830 and 1848; `scoringOf` (research R16) returns `game.scoring` when present, otherwise the `scoring` of the built-in game with id `basedOn ?? id` (cover a built-in RotLA copy with `scoring` deleted and a custom game with `basedOn: "rotla"` and no `scoring`), and only otherwise the defaults `{ autoEnd: [], bankruptPlayers: "eliminated", tieBreak: "shared" }` (an unknown id must not throw); `gameOver` is still true for a RotLA definition with `scoring` deleted after the last cycle (no regression for sessions created before this feature); a 21Moon definition with `scoring` deleted and no `scheduleComplete` in its `endTriggers` is not over after OR 5.3
- [X] T004 [P] Add definition tests in tests/games/definitions.test.ts: every built-in (1830, 1848, 21Moon, RotLA) has a `scoring` block matching the data-model §1 table and `verification.scoring === "verified"`; `hasUnverified` reports a definition with no `scoring` block as unverified only when no built-in matches its `basedOn ?? id` (FR-011, research R16), so a built-in game's stored copy without `scoring` is not flagged; a custom game created with `createCustomGame` inherits its base's `scoring` (also cover in tests/games/customGame.test.ts)
- [X] T005 [P] Create tests/domain/gameEnd.test.ts for `stepGameEnd` and `gameEndStatus` (research R2/R7/R8, data-model §5 transition table), building log entries directly (groups whose `action.type` is `endGame` or `reopenGame` with a single `note` event, plus `revert` entries): a manual end sets `end` with `auto: false` and its undo clears it; `reopenGame` while finished clears `end` and undoing the reopen restores the same end; `reopenGame` while open is a no-op; for an `autoEnd` game the group where `gameOver` goes false→true sets `end` with `auto: true` and the triggers that fired, and is added to `autoEndGroups`; after a reopening `end` is null but `autoEndGroups` still holds that group; no automatic end happens while `over` stays true, and a new false→true transition (undo the last dividend, re-record it) ends again and adds the new group to `autoEndGroups`; a reverted auto-ending group disappears from `autoEndGroups`; an `endGame` while already finished moves the end to the new group; a legacy RotLA log with no end entries that reached the end is finished, replayed with a RotLA definition whose `scoring` block is deleted (research R16; using the current definition would hide the regression); `end.eliminationOrder` is the order at the end group and a bankruptcy recorded after the end does not change it; `laterEntries` counts active groups with `seq > end.seq` and is 0 when open; `end.state` is the state right after the end group (later groups do not change it); `eliminationOrder` lists players whose `bankrupt` counter goes from 0 to above 0, in order, without duplicates, and a reverted bankruptcy disappears
- [X] T006 [P] Extend tests/domain/snapshots.test.ts: a snapshot written after this feature stores `over`, `end`, `eliminationOrder` and `autoEndGroups`, and `replayFromSnapshot` returns the same end status as a full `replay`; a stored snapshot without these fields (pre-feature shape) is skipped by `rebuild`, which replays from the start and returns an identical result
- [X] T007 [P] Extend tests/app/sessionStore.test.ts: `StoreSnapshot` exposes `gameEnd: GameEndStatus`, `eliminationOrder` and `autoEndGroups`; the `ActionContext` passed to `runPipeline` carries `gameEnd`; reopening the store from IndexedDB gives the same `gameEnd`

### Implementation for the foundation

- [X] T008 Add `ScoringSchema` and the optional `scoring` field to `GameDefinition`, and `{ type: "scheduleComplete" }` to `EndTriggerSchema`, in src/domain/games/schema.ts: `autoEnd: Array<"cyclesComplete" | "scheduleComplete" | "bankBroken" | "bankruptcy">` refined to distinct values, `bankruptPlayers: "eliminated" | "scored"`, `tieBreak: "shared" | "presidentEarliest"`, optional `shareBonus: { counter: string; perUnit: number }` with `perUnit` a positive integer; export the `Scoring` and `EndTriggerType` types (makes T002 pass)
- [X] T009 [P] Add `scoring: { autoEnd: [], bankruptPlayers: "scored", tieBreak: "shared" }` and `verification.scoring: "verified"` to src/domain/games/g1830.ts, with a comment citing 1830 rules C-2.5 note p. 28 and §8.0
- [X] T010 [P] Add `scoring: { autoEnd: [], bankruptPlayers: "eliminated", tieBreak: "shared" }` and `verification.scoring: "verified"` to src/domain/games/g1848.ts, citing 1848 §13.1–13.2
- [X] T011 [P] Add `scoring: { autoEnd: ["scheduleComplete"], bankruptPlayers: "eliminated", tieBreak: "shared", shareBonus: { counter: "eastWestTokens", perUnit: 50 } }` and `verification.scoring: "verified"` to src/domain/games/g21moon.ts, and change its `endTriggers` to `[lastRound, scheduleComplete, bankruptcy]`, citing 21Moon §11.8.1 and §13
- [X] T012 [P] Add `scoring: { autoEnd: ["cyclesComplete", "bankBroken", "bankruptcy"], bankruptPlayers: "eliminated", tieBreak: "presidentEarliest" }` and `verification.scoring: "verified"` to src/domain/games/grotla.ts, citing RotLA base rules p. 17 and p. 19
- [X] T013 In src/domain/mechanics/endTriggers.ts: evaluate the `scheduleComplete` trigger (data-model §2); add `scoringOf(game)` resolving `game.scoring`, then the `scoring` of the built-in with id `game.basedOn ?? game.id` (look it up with `builtInGames.find`, never `getBuiltInGame`, which throws), then the defaults (research R16); rewrite `gameOver(game, state)` to return true when a fired trigger is listed in `scoringOf(game).autoEnd`, with `bankBroken` counting only once `orSetComplete(state)` holds, removing the RotLA-only `cyclesComplete` hard-coding (makes T003 pass)
- [X] T014 In `hasUnverified` in src/domain/games/index.ts, treat a definition with no `scoring` block as `verification.scoring = "unverified"` only when no built-in game matches its `basedOn ?? id` (the same lookup as `scoringOf`; FR-011, research R16; makes T004 pass)
- [X] T015 Add `endGameAction` (`{ type: "endGame", triggers: EndTriggerType[] | null }`) and `reopenGameAction` (`{ type: "reopenGame" }`) to the action union in src/domain/actions/schemas.ts exactly as in contracts/domain.md §1, and add their History summaries to src/domain/i18n/es.ts: `endGame` → "Fin de la partida" plus "(sin condición de fin)" or the localized condition list; `reopenGame` → "Partida reabierta" (handlers come in US1/US4)
- [X] T016 Add `at` (the group's time) to `EffectiveGroup` in src/domain/ledger/effectiveLog.ts
- [X] T017 Create src/domain/mechanics/gameEnd.ts with the `GameEnd` (including its frozen `eliminationOrder`) and `GameEndStatus` interfaces from data-model §5, the pure `stepGameEnd(game, prev, group, before, after)` fold step (research R2 pseudo-code plus the R8 elimination scan, maintaining `autoEndGroups`) and `gameEndStatus(cursor, effective)` (contracts/domain.md §2; makes T005 pass)
- [X] T018 In src/domain/ledger/replay.ts: add `over: boolean`, `end: GameEnd | null`, `eliminationOrder: readonly PlayerId[]` and `autoEndGroups: readonly GroupId[]` to `ReplayCursor` (initial `over` from `gameOver` on the start state, `end: null`, `[]`, `[]`); change `advance(game, cursor, group)` to take `{ id, seq, at, action, events }` and call `stepGameEnd`; return the new fields in `ReplayResult` from `replay()` and `replayFromSnapshot()`
- [X] T019 In src/domain/ledger/snapshots.ts: store `over`, `end`, `eliminationOrder` and `autoEndGroups` in `Snapshot`, and make `rebuild` skip a stored snapshot that lacks them (research R9; makes T006 pass)
- [X] T020 Update the remaining `advance` callers to the new group shape in src/domain/ledger/snapshots.ts (`rebuild` and `replayFromSnapshot`), src/domain/ledger/amend.ts and src/app/SessionStore.ts (all already pass `EffectiveGroup`/`GroupEntry`; ensure `at` and `action` are present)
- [X] T021 Add optional `gameEnd?: GameEndStatus` to `ActionContext` in src/domain/actions/context.ts (absent = "not finished"), and in src/app/SessionStore.ts expose `gameEnd`, `eliminationOrder` and `autoEndGroups` on `StoreSnapshot` and pass `gameEnd` into the `runPipeline` context (makes T007 pass)
- [X] T022 Run `npm test -- tests/domain tests/games tests/app` (tests/domain includes tests/domain/perf.test.ts) and confirm the 1,000-entry replay stays inside the existing perf budget with the added fold

**Checkpoint**: The end status is derived on every replay, stored in snapshots and visible on `StoreSnapshot`. RotLA `gameOver` behaves exactly as before.

---

## Phase 3: User Story 1 - See the final ranking when a game ends (Priority: P1) 🎯 MVP

**Goal**: Any game can be ended with "Terminar partida" (touch and voice); RotLA and 21Moon end on their own; a results screen ranks every player by cash plus shares at final prices, marks the winner, applies tie-breaks, and replaces the RotLA-only `ScoreSheet`.

**Independent Test**: In a 1830 game where the bank has broken, tap the end banner's "Terminar partida" → "Terminar" (2 taps). The results screen opens with every player's cash, share value and total in rank order, the leader marked "🏆 Ganador", and totals matching a hand count. Undo on the toast makes the game open again.

### Tests for User Story 1 (write first, must fail)

- [X] T023 [P] [US1] Create tests/domain/actions/gameEnd.test.ts for `endGame` (contracts/domain.md §1): with no trigger fired it produces one `note` event "Fin de la partida" and the info warning `noEndCondition` "Todavía no se cumplió ninguna condición de fin de partida."; with triggers fired and `triggers: null` the stored action has `triggers` set to the fired types in definition order; while already finished (`ctx.gameEnd.end` set) it is accepted with the info warning `alreadyEnded`; money, shares and invariants are unchanged; `buildAmend` on an `endGame` group is refused with "No hay nada que corregir: deshazlo"
- [X] T024 [P] [US1] Replace the `finalScores` tests with `finalResults(game, players, state, eliminationOrder)` tests in tests/domain/scores.test.ts (data-model §6 rules 1, 2, 5, 6): total = cash + Σ units × (price + bonus); company treasuries, trains, privates and loans never count; unpriced companies count 0; negative cash and totals are not clamped; 21Moon share value adds 50 × `eastWestTokens`; 1848 BoE shares are valued at the BoE loan-track price via `priceOf`; a 1848 dividend paid from a broken (negative) bank shows up in the total (research R14); `shared` ties give equal ranks and the next rank skips (1, 1, 3); RotLA `presidentEarliest` output is unchanged apart from the new `status` and `winner` fields; `winner` is set on every rank-1 row
- [X] T025 [P] [US1] Extend tests/games/21moon.test.ts: recording the entry that completes OR 5.3 (the 11th OR) ends the game automatically (`end.auto === true`, triggers include `scheduleComplete`); completing OR 5.2 does not
- [X] T026 [P] [US1] Create tests/ui/results.test.tsx (contracts/ui.md §1–§2): Menú → "Terminar partida" opens the "¿Terminar la partida?" sheet listing fired conditions, or "Todavía no se cumplió ninguna condición de fin de partida." when none; "Terminar" dispatches `{ type: "endGame", triggers: null }` and navigates to the results screen (FR-006); with an end condition fired, the end-banner "Terminar partida" → "Terminar" reaches the results in exactly 2 taps (SC-003), while the menu route takes 3 and is accepted; a voice `endGame` on an already finished game (the end moves to a new group) also navigates to the results, and opening the Table of a game that was already finished does not; the heading is "Resultados" with the subtitle `{game} · terminó {date}` plus "automático" or the conditions; the table has columns Puesto, Jugador, Dinero, Acciones, Total; the rank-1 row carries the "🏆 Ganador" text badge in its accessible text; shared ranks show "=n"; the tie-break note reads `{name} · desempate: presidente de {short}`; Menú → "Clasificación" before the end shows the heading "Clasificación provisional" and "La partida no terminó todavía."; after an end, one later entry shows "Hay 1 entrada posterior al final que no cuenta en esta clasificación." and two show "Hay 2 entradas posteriores al final que no cuentan en esta clasificación.", and values stay frozen, including when the later entry is a player bankruptcy (the ranking uses `end.eliminationOrder`); the `UndoToast` for the end group undoes it in one tap and the game is open again; with end triggers fired the Table's end banner shows a `primary` "Terminar partida" button; a finished game on the Table shows "Partida completa · Ver resultados"
- [X] T027 [P] [US1] Update tests/ui/rotla.test.tsx: an automatic RotLA end navigates to the results screen (no `ScoreSheet`); `CycleControls` after the last cycle shows "Ver resultados" when finished; Menú shows "Clasificación" (not "Puntuación")
- [X] T028 [P] [US1] Extend tests/voice/tools.test.ts: `endGame` is in `ACTION_TOOLS` with description "Terminar la partida (fin del juego). Sin argumentos." and an input schema with no fields; the resolved action is `{ type: "endGame", triggers: null }`; `reopenGame` is not a voice tool

### Implementation for User Story 1

- [X] T029 [US1] Add the `endGame` handler to src/domain/actions/expand/flow.ts: always available; expands to `[{ t: "note", text: "Fin de la partida" }]`; fills `triggers` from `endTriggers(game, state)` in definition order when `null`; emits info warning `noEndCondition` when none fired and `alreadyEnded` when `ctx.gameEnd?.end` is set; add both warning texts to src/domain/i18n/es.ts (makes T023 pass except amend)
- [X] T030 [US1] Refuse amending `endGame` and `reopenGame` groups in src/domain/ledger/amend.ts with "No hay nada que corregir: deshazlo", and hide the "Corregir" button for those groups in src/ui/screens/History.tsx
- [X] T031 [US1] Replace `finalScores` with `finalResults(game, players, state, eliminationOrder): PlayerResult[]` in src/domain/mechanics/scores.ts, with `PlayerResult` exactly as data-model §6 and rules 1, 2, 5, 6 driven by `scoringOf(game)` (share value = `priceOf` + `shareBonus.perUnit × counter`, only when priced; `tieBreak` `shared` vs `presidentEarliest`); keep the current RotLA eliminated-last behavior so US2 can generalize it; update the caller in tests/games/rotla.playthrough.test.ts (makes T024 pass)
- [X] T032 [US1] Add `{ name: "results"; from: "table" | "home" }` to `Screen` in src/ui/nav.ts and route it in src/ui/App.tsx, falling back to Home when no session is open (data-model §8)
- [X] T033 [P] [US1] Add results-screen styles to src/ui/styles/components.css: `score-table` layout that fits 360 px portrait by stacking Dinero and Acciones under the player name below a breakpoint, a two-column-friendly tablet landscape layout, text badges ("Ganador", "Quiebra", "Completa"), and action buttons with `min-height: var(--tap)` (≥ 48 px, FR-013)
- [X] T034 [US1] Create src/ui/screens/Results.tsx (contracts/ui.md §1): reads `gameEnd`, `eliminationOrder` and the live state from the session; when finished ranks with `finalResults(game, players, gameEnd.end.state, gameEnd.end.eliminationOrder)`, otherwise with the live state and live `eliminationOrder`; heading, subtitle and later-entries notice per the contract (singular "Hay 1 entrada posterior al final que no cuenta en esta clasificación.", plural "Hay N entradas posteriores al final que no cuentan en esta clasificación."); ranking table with the winner badge, "=n" shared ranks and tie-break notes; "Volver" goes to the Table when `from: "table"`; shows `UndoToast` for the end group when the end was recorded in this visit (makes T026 pass together with T035)
- [X] T035 [US1] Update src/ui/screens/Table.tsx: end-banner `primary` "Terminar partida" button when end triggers fire and the game is open; Menú "Terminar partida" (open game), "Clasificación" (every game, replaces the RotLA-only "Puntuación") and "Resultados" (finished game) navigating to `results` with `from: "table"`; the "¿Terminar la partida?" `ConfirmSheet` with the fired-condition list or "Todavía no se cumplió ninguna condición de fin de partida." and confirm label "Terminar" dispatching `{ type: "endGame", triggers: null }`; the bankruptcy `scoreAfter` next step opens the same sheet; RotLA `CycleControls` after the last cycle shows "Terminar partida" when open and "Ver resultados" when finished; auto-navigate to `results` when `gameEnd.end?.groupId` changes to a new non-null value while the Table is shown (not when the Table opens on an already finished game), replacing the `scoreShown` logic; non-blocking "Partida completa · Ver resultados" banner on a finished game
- [X] T036 [US1] Delete src/ui/sheets/ScoreSheet.tsx and remove every remaining reference (`grep -rn "ScoreSheet\|finalScores\|scoreShown" src tests e2e` returns nothing)
- [X] T037 [US1] Tag every group in `autoEndGroups` with "Fin de la partida (automático)" in src/ui/screens/History.tsx (contracts/ui.md §4), not only the current `gameEnd.end`, so an end that was later reopened keeps its tag; extend tests/ui/history.test.tsx for the tag and the `endGame` text
- [X] T038 [US1] Add `endGame` to `ACTION_TOOLS` in src/voice/tools.ts with description "Terminar la partida (fin del juego). Sin argumentos." and no input fields, mapping to `{ type: "endGame", triggers: null }`; make the confirmation card summary "Terminar la partida" plus the fired conditions (via the es.ts summary from T015); regenerate tests/voice/__snapshots__/tools-*.json and prompt-*.txt with `npm test -- tests/voice -u` and review the diff (makes T028 pass)
- [X] T039 [P] [US1] Add eval cases "terminamos la partida", "fin del juego" and "damos por terminada la partida" expecting `endGame` to eval/voice/cases.jsonl, and rebuild the fixtures with eval/voice/buildFixtures.ts so eval/voice/fixtures/* reflect the new expander and tool list
- [X] T040 [US1] Update e2e/rotla.spec.ts so the score-sheet steps assert the results screen ("Resultados", winner badge) and run `npx playwright test e2e/rotla.spec.ts`

**Checkpoint**: Every game can be ended and shows a correct final ranking; RotLA and 21Moon end on their own; one results view exists.

---

## Phase 4: User Story 2 - Eliminated players ranked by each game's rules (Priority: P1)

**Goal**: Bankrupt players are placed per each game's `scoring.bankruptPlayers`: removed games list them last as "Eliminado" (latest first, no rank or total); 1830 scores them on the cash and shares they kept and marks them "Quiebra".

**Independent Test**: In a 21Moon game, declare a player bankrupt and end the game: that player is last, "Eliminado", with "—" for rank and total. In a 1830 Classic game, declare a player bankrupt and end the game: the player keeps their unsold shares, is ranked by them, and shows "Quiebra".

### Tests for User Story 2 (write first, must fail)

- [X] T041 [P] [US2] Extend tests/domain/scores.test.ts (data-model §6 rules 3, 4, 6): with `bankruptPlayers: "scored"` a bankrupt player is ranked by cash + held shares with `status: "bankrupt"`; with `"eliminated"` bankrupt players come after every ranked player with `total: null`, `rank: null`, `status: "eliminated"`, ordered by `eliminationOrder` reversed (latest first); a player listed in `eliminationOrder` whose `bankrupt` counter is 0 in the given state is ranked as active (data-model §6 rule 3); when every player but one is eliminated, that player is the only `winner` (US2-4)
- [X] T042 [P] [US2] Replace the 1830 Classic bankruptcy expectation in tests/games/1830.test.ts: declaring a player bankrupt emits only `counterChange player:<id> bankrupt +1`; their cash, shares and privates stay with them (remove the old "shares to the pool" expectation); ending the game ranks them by those holdings
- [X] T043 [P] [US2] Extend tests/games/21moon.test.ts: after a player bankruptcy (`toPool`, §11.8.1) and an end, `finalResults` lists the player last as eliminated; with two bankruptcies the later one is listed first
- [X] T044 [P] [US2] Extend tests/ui/results.test.tsx: an eliminated row shows "—" for Puesto and "Eliminado" in the Total cell; a scored bankrupt row shows the "Quiebra" text badge; both markers are text, not only color (FR-013)

### Implementation for User Story 2

- [X] T045 [P] [US2] Add `playerMode: "keepHoldings"` to the `CorporateBankruptcyConfig` enum in src/domain/mechanics/custom/corporateBankruptcy.ts; in that mode a player bankruptcy emits only `counterChange player:<id> bankrupt +1` and moves no cash, shares or privates (data-model §3)
- [X] T046 [US2] Set `playerMode: "keepHoldings"` in the 1830 Classic option's `corporateBankruptcy` config in src/domain/games/g1830.ts (makes T042 pass; depends on T045)
- [X] T047 [US2] Generalize bankrupt-player handling in `finalResults` in src/domain/mechanics/scores.ts by `scoringOf(game).bankruptPlayers`, treating a player as bankrupt only when their `bankrupt` counter is above 0 in the given state: `scored` → ranked with `status: "bankrupt"`; `eliminated` → appended after ranked rows in reversed `eliminationOrder` with null rank and total (makes T041 and T043 pass)
- [X] T048 [US2] Render the eliminated and "Quiebra" row markers in src/ui/screens/Results.tsx per contracts/ui.md §1 row-kind table (makes T044 pass)

**Checkpoint**: Every game places bankrupt players per its rulebook; no false winners.

---

## Phase 5: User Story 3 - Finished games recognizable on Home and reopened to their results (Priority: P2)

**Goal**: Home shows a "Completa" badge and winner names for finished games without replaying them; tapping a finished row or "Continuar" opens its results; the status survives reloads and export/import.

**Independent Test**: Finish a game, return to Home and reload. The row shows "Completa" and "Ganó {name}". Tapping it opens the results with the same values; "Ver mesa" opens the Table and "Volver" returns to Home.

### Tests for User Story 3 (write first, must fail)

- [X] T049 [P] [US3] Extend tests/persistence/sessionRepo.test.ts: `appendEntry(id, entry, metaPatch)` merges `metaPatch` into the meta row in the same strict transaction as the entry (an aborted transaction writes neither); without `metaPatch` the meta row is unchanged
- [X] T050 [P] [US3] Extend tests/app/sessionStore.test.ts: after an entry that ends the game, the store writes `outcome: { endedAt, winners }` (endedAt = the end group's `at`, winners = rank-1 players); after undoing it writes `outcome: null`; amending an entry before the end so that a different player wins writes the new `winners`; an entry that doesn't change the outcome passes no `metaPatch`
- [X] T051 [P] [US3] Extend tests/persistence/export.test.ts: export of a finished session contains no `outcome` and `EXPORT_VERSION` stays 1; importing it into a fresh DB writes the same `outcome` computed from the import replay (FR-018, SC-005)
- [X] T052 [P] [US3] Extend tests/app/sessions.test.ts for `backfillOutcome(repo, meta)`: a meta without an `outcome` key (a legacy finished RotLA session whose stored `game` has no `scoring` block, research R16) gets the outcome from a replay via `updateMeta` and the new meta is returned; an unfinished one gets `outcome: null`; a load or replay failure leaves the row unchanged and does not throw
- [X] T053 [P] [US3] Add `outcomeOf` tests to tests/domain/gameEnd.test.ts (data-model §7): `null` when `status.end` is null; for a finished status, `endedAt` is `end.at` and `winners` are the rank-1 players of `finalResults` on `end.state` and `end.eliminationOrder`, in `players` order; a shared win lists every tied rank-1 player; an eliminated player is never a winner; a different live state after the end does not change the result
- [X] T054 [P] [US3] Extend tests/ui/home.test.tsx (contracts/ui.md §3): a finished row shows the "Completa" text badge and "Ganó {name}" ("Ganaron A y B" on a shared win); unfinished rows look as before; tapping a finished row opens the results screen with `from: "home"` in 1 tap (SC-004); "Continuar" on a finished last session opens the results; an unfinished row opens the Table; a row with no `outcome` key is re-rendered with the marker after the backfill; on the results screen opened from Home, "Ver mesa" opens the Table and "Volver" closes the session and returns to Home; after "Ver mesa", undoing the `endGame` group on the Table makes the game open and Home no longer shows "Completa" (US3-3); the "Eliminar" flow is unchanged

### Implementation for User Story 3

- [X] T055 [P] [US3] Add `outcome?: { readonly endedAt: string; readonly winners: readonly PlayerId[] } | null` to `SessionMeta` in src/domain/session.ts (absent = predates the feature, `null` = not finished), and keep it out of the public `updateMeta` patch type used by UI callers (data-model §7)
- [X] T056 [US3] Add the pure `outcomeOf(game, players, status)` helper to src/domain/mechanics/gameEnd.ts (data-model §7), built on `finalResults`; it is the only place the outcome is computed, and the store, import and backfill all call it (makes T053 pass)
- [X] T057 [US3] Add the optional `metaPatch?: { outcome }` parameter to `SessionRepo.appendEntry` in src/persistence/sessionRepo.ts, merged into the meta row inside the same strict transaction as the entry (makes T049 pass)
- [X] T058 [US3] In `SessionStore.persist` in src/app/SessionStore.ts, compute the outcome from the new cursor with `outcomeOf` (data-model §7), compare with the current meta, and pass it as `metaPatch` to `appendEntry` only when it changed (makes T050 pass)
- [X] T059 [P] [US3] In `importSession` in src/persistence/exportImport.ts, write `outcome` computed with `outcomeOf` from the replay `parseImport` already runs; leave the export format unchanged (makes T051 pass)
- [X] T060 [P] [US3] Add `backfillOutcome(repo, meta)` to src/app/sessions.ts per contracts/domain.md §6, computing the outcome with `outcomeOf` (makes T052 pass)
- [X] T061 [US3] Update src/ui/screens/Home.tsx: "Completa" badge and "Ganó {names}" / "Ganaron A y B" on finished rows; tapping a finished row or "Continuar" opens the session and navigates to `results` with `from: "home"`; run `backfillOutcome` once for metas with no `outcome` key and re-render the rows
- [X] T062 [US3] Add "Ver mesa" (shown when `from: "home"`, goes to the Table) and the `from: "home"` "Volver" behavior (closes the session and goes to Home) to src/ui/screens/Results.tsx (makes T054 pass)

**Checkpoint**: Finished games are visible and reachable from Home in one tap, across reloads and export/import.

---

## Phase 6: User Story 4 - Reopen a game that was ended by mistake (Priority: P2)

**Goal**: "Reabrir partida" on the results screen makes a finished game open again as its own undoable history entry; an automatically ended game does not end again until a new entry reaches the end.

**Independent Test**: Finish a RotLA game (it ends on its own), tap "Reabrir partida" → "Reabrir". The Table opens and the game does not end again. Undo the last dividend, record it with a different amount: the game ends on its own again and the results reflect the new dividend. History shows the end, the reopening and the new end.

### Tests for User Story 4 (write first, must fail)

- [X] T063 [P] [US4] Extend tests/domain/actions/gameEnd.test.ts for `reopenGame` (contracts/domain.md §1): while finished it produces one `note` event "Partida reabierta" and the game is open; while open it is `unavailable` with "La partida no está terminada"; money and shares are unchanged; `buildAmend` on a `reopenGame` group is refused with "No hay nada que corregir: deshazlo"
- [X] T064 [P] [US4] Extend tests/games/rotla.test.ts with the US4 scenario through `SessionStore`: automatic end → `reopenGame` → no automatic end (FR-005c): `gameEnd.end` is null while `endTriggers(game, state)` is still non-empty, so the Table keeps suggesting "Terminar partida" (the banner itself is covered by T026) → undo the last dividend and record a different amount → the game ends automatically again with results from the new dividend; undoing the `reopenGame` group instead restores the original end and results
- [X] T065 [P] [US4] Extend tests/ui/results.test.tsx: "Reabrir partida" is shown only on a finished game; it opens the "¿Reabrir la partida?" sheet with "La partida deja de estar completa y se pueden registrar o corregir entradas. El final queda en el historial."; Cancelar, ✕ and the backdrop leave the game finished with the same results (US4-5); "Reabrir" dispatches `reopenGame` and navigates to the Table, and "Reabrir partida" → "Reabrir" takes exactly 2 taps from the results screen (SC-006); a store failure shows its message and stays; reopening from a results screen opened from Home also works and Home then no longer shows "Completa"
- [X] T066 [P] [US4] Extend tests/ui/history.test.tsx: a reopened game shows both the "Fin de la partida" entry and the "Partida reabierta" entry, and earlier entries are unchanged (US4-3); for a RotLA game that ended on its own, after the reopening the group that reached the end still carries "Fin de la partida (automático)", and after a new automatic end both groups carry it

### Implementation for User Story 4

- [X] T067 [US4] Add the `reopenGame` handler to src/domain/actions/expand/flow.ts: `available` only when `ctx.gameEnd?.end` is set (otherwise unavailable "La partida no está terminada"); expands to `[{ t: "note", text: "Partida reabierta" }]` (makes T063 and T064 pass)
- [X] T068 [US4] Add the "Reabrir partida" button (finished only, ≥ 48 px) and its confirmation `Sheet` (title "¿Reabrir la partida?", body text from contracts/ui.md §1, buttons Cancelar / Reabrir) to src/ui/screens/Results.tsx; on confirm dispatch `{ type: "reopenGame" }` and navigate to the Table, on failure show the store's message and stay (makes T065 pass)

**Checkpoint**: All four stories work independently; a wrong end can always be reversed without losing history.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, full validation and the user-run gates.

- [X] T069 [P] Update docs/spec.md: §5.2 (the `scoring` block and `scheduleComplete` trigger, `keepHoldings` bankruptcy mode), §6 (the `endGame`/`reopenGame` actions and the derived end status), §9.1 (Results screen, Table controls, Home rows), §10 (the `outcome` cache)
- [X] T070 Run the automated checks from specs/007-game-results/quickstart.md §1 (`npm run typecheck`, `npm run lint`, the listed `npm test` groups, full `npm test`, `npx playwright test e2e/rotla.spec.ts`) and fix any failures not listed in T001's notes
- [X] T071 Voice eval gate (needs the user's API key): ask the user to run `npm run eval:voice` with the new "terminar la partida" cases and report accuracy for the default provider and model before merging
- [ ] T072 Manual validation (needs the user): ask the user to walk through specs/007-game-results/quickstart.md §2 on a phone (360×740) and a tablet in landscape, covering 1830 end, undo, 1830 Classic bankruptcy, 21Moon automatic end with elimination and East-West bonus, RotLA reopen and fix, Home, export/import, old sessions (a finished RotLA, a RotLA in progress, a 1830) and entries after the end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks every user story.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after Foundational; its `finalResults` and Results.tsx tasks (T047, T048) build on US1's T031 and T034.
- **US3 (Phase 5)**: after Foundational; `outcomeOf` (T056) uses `finalResults` (T031) for winners, and T061/T062 use the results screen (T032, T034).
- **US4 (Phase 6)**: after Foundational; T068 extends Results.tsx from US1 (T034), and the Home part of T065 uses US3.
- **Polish (Phase 7)**: after the stories you intend to ship.

### User Story Dependencies

- **US1 (P1)**: independent; the MVP.
- **US2 (P1)**: needs US1's `finalResults` and Results screen; the domain part (T041–T043, T045–T047) can proceed alongside US1's UI work.
- **US3 (P2)**: needs US1's results screen and `finalResults`; persistence tasks (T049–T053, T055–T060) are independent of US1's UI.
- **US4 (P2)**: needs US1's results screen; its domain tasks (T063, T064, T067) depend only on Foundational.

### Within Each Phase

- Test tasks before their implementation tasks; confirm they fail first.
- schema.ts (T008) before the game definitions (T009–T012) and endTriggers.ts (T013).
- effectiveLog.ts (T016) and gameEnd.ts (T017) before replay.ts (T018), then snapshots.ts (T019), then callers (T020) and the store (T021).
- scores.ts (T031) before Results.tsx (T034); nav (T032) before Results.tsx and Table.tsx (T035); T035 before deleting ScoreSheet (T036).
- `outcomeOf` (T056) before its callers: the store (T058), import (T059) and backfill (T060).
- Tasks touching the same file run in sequence: gameEnd.ts (T017 → T056), flow.ts (T029 → T067), scores.ts (T031 → T047), Results.tsx (T034 → T048 → T062 → T068), SessionStore.ts (T020 → T021 → T058), g1830.ts (T009 → T046), History.tsx (T030 → T037).

### Parallel Opportunities

- Phase 2 tests T002–T007 all run in parallel.
- Game definitions T009–T012 run in parallel after T008.
- US1 tests T023–T028 run in parallel; T033 (CSS) and T039 (eval cases) run in parallel with other US1 work; T037 (History) runs after T030, which edits the same file.
- US2 tests T041–T044 run in parallel; T045 runs in parallel with US1's UI tasks.
- US3 tests T049–T054 run in parallel; T055 and T056 run in parallel; after T056, T059 and T060 run in parallel.
- US4 tests T063–T066 run in parallel.

---

## Parallel Example: Foundational

```text
Task: "Schema tests for scoring and scheduleComplete in tests/games/schema.test.ts"          (T002)
Task: "scheduleComplete and gameOver tests in tests/domain/endTriggers.test.ts"            (T003)
Task: "Fold tests in tests/domain/gameEnd.test.ts"                                         (T005)
Task: "Snapshot tests in tests/domain/snapshots.test.ts"                                   (T006)

# After T008:
Task: "scoring block in src/domain/games/g1830.ts"    (T009)
Task: "scoring block in src/domain/games/g1848.ts"    (T010)
Task: "scoring block in src/domain/games/g21moon.ts"  (T011)
Task: "scoring block in src/domain/games/grotla.ts"   (T012)
```

## Parallel Example: User Story 1

```text
Task: "endGame action tests in tests/domain/actions/gameEnd.test.ts"   (T023)
Task: "finalResults tests in tests/domain/scores.test.ts"              (T024)
Task: "21Moon automatic end test in tests/games/21moon.test.ts"        (T025)
Task: "Results screen tests in tests/ui/results.test.tsx"              (T026)
Task: "endGame voice tool tests in tests/voice/tools.test.ts"          (T028)
```

## Parallel Example: User Story 3

```text
Task: "appendEntry metaPatch test in tests/persistence/sessionRepo.test.ts"  (T049)
Task: "import outcome test in tests/persistence/export.test.ts"              (T051)
Task: "backfillOutcome test in tests/app/sessions.test.ts"                   (T052)
Task: "outcomeOf test in tests/domain/gameEnd.test.ts"                       (T053)
Task: "Home rows test in tests/ui/home.test.tsx"                             (T054)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: baseline.
2. Phase 2: foundation (end status derived on replay).
3. Phase 3: US1. Every game can be ended, and the results screen ranks players correctly.
4. **Stop and validate** with US1's independent test and the RotLA e2e.

### Incremental Delivery

1. Setup + Foundational → end status derived, nothing visible changes.
2. US1 → end any game and see results (MVP).
3. US2 → correct placement of bankrupt players (completes the P1 scope; ship US1 + US2 together if possible, since a wrong winner undermines the feature).
4. US3 → Home markers and one-tap results, persistent across reloads and import.
5. US4 → reopening.
6. Polish → docs, full suite, user-run eval and manual checks.

---

## Notes

- [P] tasks touch different files and have no dependency on an incomplete task.
- Leave changes uncommitted for the user's review (project preference); do not commit after each task.
- T071 and T072 need the user (API key, a phone); report them as pending rather than skipping silently.
- Baseline failures (T001, 2026-10-10): none. `npm run typecheck` and `npm run lint` clean; `npm test` 74 files, 1,260 tests passed.
- Voice eval (T071, 2026-10-10, gemini-3.6-flash, the default): 98.8% overall (82/83), held-out 100%; the 3 new endGame cases pass. The one failure, cp-01 (compound), also failed before this feature (compound 80% in both runs). Results: eval/voice/results/2026-10-10-gemini-3.6-flash.json.
