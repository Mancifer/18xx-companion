---

description: "Task list for 010 Reliable Play History"
---

# Tasks: Reliable Play History

**Input**: Design documents from `specs/010-reliable-play-history/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI (test-first) and the plan require domain, store, UI and voice changes to be test-first. Write each test task first and confirm it fails before the matching implementation task.

**Organization**: Tasks are grouped by user story. All three stories are P1; they are ordered US1 → US2 → US3 because US2 builds on US1's store operation, and US3 is independent of both.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (undo latest), US2 (undo back to here), US3 (breakdown)
- Paths are from the repository root (single-project PWA: `src/`, `tests/`, `eval/`)

---

## Phase 1: Setup

**Purpose**: Record the baseline before changing the ledger.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the current tree and note any pre-existing failures in the task notes so they are not attributed to this feature; locate the 2026-10-11 voice eval result under `eval/voice/results/` to use as the accuracy baseline for T062 — Baseline 2026-10-12: typecheck and lint pass; tests 1529/1539, the 10 failures are pre-existing stale eval fixtures in `tests/eval/voice.test.ts` (chip set changed by feature 008; regenerated in T049). Eval baseline: `eval/voice/results/2026-10-11-gemini-3.6-flash-cache.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The new `undo` ledger entry kind, its replay semantics, snapshot invalidation, the undo range, and the export format. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests (write first, must fail)

- [X] T002 [P] Add tests in `tests/domain/ledger.test.ts` for the `undo` entry kind: `track()` marks every listed group `reverted` "whatever its versions" (an amended group becomes `reverted` as a whole, not un-corrected); `GroupHistory.undoneBy` equals the seq of the `undo` entry, and also of a legacy `revert` entry that reverted a group; `effectiveLog` drops undone groups; a legacy log with an out-of-order `revert` and an `amend` replays to the same state and statuses as before (R7)
- [X] T003 [P] Add tests in `tests/domain/snapshots.test.ts`: `invalidatedBy` on an `undo` entry invalidates every snapshot with `seq >= min(seq of groupIds)` (data-model §1), same as a `revert` aimed at its oldest group (R4)
- [X] T004 [P] Create `tests/domain/undo.test.ts` for `undoRangeOf(log, targetId)`: returns `undefined` for an unknown id, an already reverted group and the `createSession` group; for the newest effective group returns `count === 1`; for an older group returns the target plus every later effective group "newest first", with `oldest` = target and `newest` = the latest group; groups reverted out of order by a legacy `revert` are skipped; amended groups count as effective
- [X] T005 [P] Add tests in `tests/persistence/export.test.ts`: `EXPORT_VERSION` is 2; a session with `undo` entries round-trips (entries deep-equal, group statuses and `stateHash` equal, FR-019); a version-1 file imports unchanged (identity upgrade); `revert` and `amend` entries still import; an `undo` entry with empty `groupIds` is rejected ("at least one", contracts/export-format.md); a version-3 file is refused with the existing "versión más nueva" message

### Implementation

- [X] T006 Add `UndoEntry { readonly kind: "undo"; readonly seq: number; readonly at: string; readonly groupIds: readonly GroupId[] }` ("newest first; length ≥ 1") to the `LogEntry` union in `src/domain/ledger/entries.ts`; mark `RevertEntry` and `AmendEntry` as legacy (read-only, never written after this feature) in their doc comments
- [X] T007 Extend `track()` in `src/domain/ledger/effectiveLog.ts` to apply `undo` entries in the same seq-ordered walk (mark each listed group `reverted`, whatever its versions) and add `undoneBy?: number` to `GroupHistory`, set by the first `undo` or legacy `revert` entry that reverted the group; keep legacy `revert`/`amend` semantics exactly as today (depends on T006)
- [X] T008 [P] Extend `invalidatedBy` in `src/domain/ledger/snapshots.ts` so an `undo` entry invalidates snapshots with `seq >= min(seq of its groupIds)` (depends on T006)
- [X] T009 [P] Create `src/domain/ledger/undo.ts` exporting `UndoRange { targetId; groups (newest first); count; oldest; newest }` (data-model §3), `isSetup(group)` (`action.type === "createSession"`), `newestUndoable(log)` and `undoRangeOf(log, targetId)` computed from `effectiveLog` (every effective group with `seq >= target.seq`) (depends on T007)
- [X] T010 [P] In `src/persistence/exportImport.ts` bump `EXPORT_VERSION` from 1 to 2, add `{ kind: "undo", seq, at, groupIds: z.array(z.string().min(1)).min(1) }` to `EntrySchema`, and add an identity upgrade step from v1 to v2 (depends on T006)

**Checkpoint**: T002–T005 pass. The ledger can read and replay `undo` entries; nothing writes them yet.

---

## Phase 3: User Story 1 - Undo the latest action (Priority: P1) 🎯 MVP

**Goal**: Only the newest action can be undone on its own, with no confirmation, restoring the exact prior state. Out-of-order undo and correcting (amend) are removed everywhere, which removes the stale-market bug.

**Independent Test**: RotLA: issue a TUN share (80 → 70), run and pay out, then `undoLast()` twice. Price is 80 and treasury/player cash equal the pre-issue values; no older History entry shows "Deshacer" (quickstart §2).

### Tests for User Story 1 (write first, must fail)

- [X] T011 [P] [US1] Add `undoLast` tests in `tests/app/sessionStore.test.ts`: appends exactly one `UndoEntry { groupIds: [newest] }` and returns `{ ok: true, entry, undone: [target] }`; state deep-equals the state before the newest group; with only the setup group returns `notFound` "No hay nada que deshacer"; an amended (legacy) newest group is reverted as a whole; undoing past an automatic game end reopens the game and recomputes `gameEnd`/`autoEndGroups`/outcome (feature 007), and undoing an end-of-round group undoes its end step (FR-007); a persist failure leaves log, state and snapshots unchanged and returns `persist`; snapshots with `seq >= target.seq` are dropped in memory and IndexedDB
- [X] T012 [P] [US1] Add the SC-002 regression to `tests/games/rotla.test.ts`: issue 1 TUN share (price 80 → 70), run and pay out, `undoLast()` twice → price 80, TUN treasury and every player's cash equal the pre-issue values (replace any `store.revert(...)` calls in this file with `undoLast`)
- [X] T013 [P] [US1] Add tests in `tests/voice/resolve.test.ts`: `undo` with `groupId` null or the newest effective non-setup id gives `{ kind: "undo" }`; `amendLast` with any arguments gives `notUnderstood` with "Para corregir, deshacé hasta esa entrada y volvé a anotarla." and no `amend` result kind exists (FR-008); remove the existing `amend` resolution tests
- [X] T014 [P] [US1] Update `tests/ui/history.test.tsx`: only the newest effective non-setup entry shows "Deshacer" and tapping it calls `undoLast` without confirmation; older active entries show no "Deshacer" on the row; no "Corregir" or "Deshacer corrección" anywhere; the setup entry has no undo action; a legacy amended entry still shows "corregida" with the original struck through and the latest version
- [X] T015 [P] [US1] Update `tests/ui/voice.test.tsx`: a voice "deshacer" calls `undoLast` directly as today; a voice "no, eran 260" shows the undo instruction and changes nothing; no amend card is rendered

### Implementation for User Story 1

- [X] T016 [US1] In `src/app/SessionStore.ts` add `undoLast(): Promise<UndoResult>` (target from `newestUndoable`; one `appendEntry` per call; goes through the store queue; uses the existing persist/rebuild path with `deleteSnapshotsFrom(target.seq)`; recomputes game end as for any entry) and the `UndoResult`/`UndoOptions { confirmed?: boolean }` types from data-model §4; remove `revert(groupId?)`, `amend(...)`, `dependentsOf(...)`, the `dependents` error, `AmendStoreResult`, `RevertResult` and `ConfirmOptions` (depends on T009)
- [X] T017 [US1] Delete `src/domain/ledger/amend.ts`, `src/domain/ledger/dependencies.ts`, `tests/domain/amend.test.ts` and `tests/domain/dependencies.test.ts`; move any still-needed legacy reading of `amend` entries into `effectiveLog.ts` (already there via `track`) and fix imports (depends on T016)
- [X] T018 [US1] In `src/app/useSession.ts` replace `revert`/`amend` on `useDispatch` with `undoLast()`, which pushes feedback `{ kind: "reverted", groups }` on success and `{ kind: "error", messageEs }` on failure (depends on T016)
- [X] T019 [US1] In `src/app/AppProvider.tsx` change the `reverted` feedback to `{ kind: "reverted"; groups: readonly GroupEntry[] }` and remove the `amended` feedback kind (depends on T018)
- [X] T020 [US1] In `src/ui/components/UndoToast.tsx` make the applied-group toast's "Deshacer" call `undoLast()`, show "Deshecho: <summary>" for a single undone group (add or reuse that string in `src/domain/i18n/es.ts`), and remove the `amended` toast and its string (depends on T019)
- [X] T021 [US1] In `src/ui/screens/History.tsx` show "Deshacer" only on the newest effective non-setup entry (calls `undoLast()`); remove "Corregir", "Deshacer corrección", the `AmendSheet` and `DependentsDialog` usage; keep the legacy "corregida" rendering; no undo action on the setup entry (depends on T018)
- [X] T022 [P] [US1] Delete `src/ui/sheets/AmendSheet.tsx` and `src/ui/components/DependentsDialog.tsx`, and drop amend-only helpers (`isAmendable`, `buildAmend`, and anything else only they used) from `src/ui/actionFields.ts` (depends on T021)
- [X] T023 [US1] In `src/voice/resolve.ts` remove `kind: "amend"` from `VoiceResult`; resolve `amendLast` to `notUnderstood("Para corregir, deshacé hasta esa entrada y volvé a anotarla.")`; keep `undo` with null or newest id → `{ kind: "undo" }`
- [X] T024 [US1] In `src/app/voiceController.ts` and `src/app/useVoice.ts` change the effects interface to `undoLast(): Promise<{ ok: boolean }>`, remove `amend`, and route `{ kind: "undo" }` to `undoLast()` (depends on T018, T023)
- [X] T025 [US1] In `src/ui/components/VoicePanel.tsx` remove the amend card and its handlers (depends on T024)
- [X] T026 [P] [US1] Migrate the remaining test callers of the removed store API: `store.revert(...)` → `undoLast()` in `tests/domain/perf.test.ts` and `tests/persistence/export.test.ts`; remove or rewrite the `amend(...)` usage in `tests/games/21moon.test.ts` (undo and re-dispatch instead); delete the old `revert`/`amend`/`dependentsOf`/`dependents`-error tests in `tests/app/sessionStore.test.ts` that T011 replaces. Then grep `src/` and `tests/` for `revert(`, `amend(`, `dependentsOf`, `AmendSheet`, `DependentsDialog`, `"amended"` and fix any leftovers (depends on T016)

**Checkpoint**: T011–T015 pass; `npm run typecheck` and `npm test` are green. The latest action is one-tap undoable by touch and voice, and no path can undo out of order or correct an entry.

---

## Phase 4: User Story 2 - Undo back to a chosen entry (Priority: P1)

**Goal**: "Deshacer hasta acá" on any older active entry undoes it and every later entry in one confirmed step, by touch and by voice.

**Independent Test**: Play 10 actions, choose "Deshacer hasta acá" on the 4th: the sheet reads "¿Deshacer 7 entradas?" with Desde/Hasta; Cancelar changes nothing; "Deshacer 7" gives the state before the 4th action and entries 4–10 show "deshecha" (quickstart §3).

### Tests for User Story 2 (write first, must fail)

- [X] T027 [P] [US2] Add `undoTo` tests in `tests/app/sessionStore.test.ts`: unknown id → `notFound` "Esa entrada no existe"; reverted group → `notFound` "Esa entrada ya está deshecha"; `createSession` → `notFound` "Esa entrada no se puede deshacer"; `count > 1` without `confirmed` → `{ ok: false, error: "confirmRange", messageEs: "Se van a deshacer N entradas", range }` and the log is unchanged (FR-003); with `confirmed: true` appends **one** `UndoEntry` whose `groupIds` are the range ids newest first, and state deep-equals the state before the target; `undoTo(newest)` behaves like `undoLast` with no confirmation (FR-004); 1830 sell → payout → `undoTo(sell)` restores the pre-sell price (R3)
- [X] T028 [P] [US2] Create `tests/app/undoRandom.test.ts` (SC-001): randomized walks with `tests/helpers/randomWalk.ts` over 1830, 1848, 21Moon and RotLA through `SessionStore` (fake-indexeddb); capture state before each dispatched group; interleave `undoLast()` and `undoTo(randomOlderGroup, { confirmed: true })`; after each undo, state deep-equals the captured state before that entry and no effective group exists after a reverted one (except legacy)
- [X] T029 [P] [US2] Add a perf case to `tests/domain/perf.test.ts`: `undoTo(firstNonSetupGroup, { confirmed: true })` on a 300-group game through `SessionStore` completes in under 500 ms in Node (SC-004); and `entryBreakdown` for the first group of the same 300-group game, active and after it is undone, completes in under 50 ms each (plan Performance Goals). The breakdown case runs once T054 exists
- [X] T030 [P] [US2] Create `tests/ui/undoRange.test.tsx`: `UndoRangeSheet` shows "¿Deshacer N entradas?", "Desde: <oldest summary>", "Hasta: <newest summary>", the note "Quedan en el historial marcadas como deshechas. Después volvé a anotar lo que corresponda.", "Cancelar" (closes, no store call) and primary "Deshacer N" (calls `undoTo(range.targetId, { confirmed: true })` then closes); shows the transcript above the title when given
- [X] T031 [P] [US2] Extend `tests/ui/history.test.tsx`: expanding an older active entry shows "Deshacer hasta acá"; tapping it opens `UndoRangeSheet` on `confirmRange`; confirming marks the range "deshecha" and leaves them visible and expandable (FR-017); the toast reads "Deshechas N entradas: desde <oldest> hasta <newest>"; reverted entries offer no actions
- [X] T032 [P] [US2] Extend `tests/voice/resolve.test.ts`: `undo` with an older effective non-setup id → `{ kind: "undoTo", transcript, groupId, range }`; unknown, reverted or setup id → `notUnderstood("No encontré esa entrada. Usá el historial.")`
- [X] T033 [P] [US2] Extend `tests/voice/prompt.test.ts`: the snapshot block header is "Últimas entradas (id entre corchetes, la más nueva al final):" and lists up to 15 effective, non-setup groups, oldest to newest, each as `- [<id>] <summaryEs>`; the cached prefix (system prompt and tools) is byte-identical across two snapshots with different entries (feature 009); the prompt contains the new undo/amend rule line; in `tests/voice/tools.test.ts` assert the new `undo` and `amendLast` descriptions
- [X] T034 [P] [US2] Extend `tests/ui/voice.test.tsx`: a voice `undoTo` result opens `UndoRangeSheet` with the transcript; "Cancelar" changes nothing; "Deshacer N" calls `undoTo(groupId, { confirmed: true })`

### Implementation for User Story 2

- [X] T035 [US2] In `src/app/SessionStore.ts` add `undoTo(groupId: string, options?: UndoOptions): Promise<UndoResult>` per contracts/undo-store.md: refusals as in T027, `confirmRange` with the `UndoRange` when `count > 1` and not confirmed (nothing written), otherwise one `appendEntry` of `UndoEntry { groupIds: range.groups.map(g => g.id) }`, `deleteSnapshotsFrom(range.oldest.seq)`, rebuild and game-end recompute in the same transaction; serialized through the store queue; add `{ error: "confirmRange"; messageEs; range: UndoRange }` to `StoreError`
- [X] T036 [US2] In `src/app/useSession.ts` add `undoTo(groupId, { confirmed? })` to `useDispatch`: pushes `{ kind: "reverted", groups }` on success, nothing on `confirmRange`, `{ kind: "error", messageEs }` on other errors (depends on T035)
- [X] T037 [P] [US2] Add range texts to `src/domain/i18n/es.ts`: sheet title "¿Deshacer N entradas?", "Desde: …", "Hasta: …", the muted note, button "Deshacer N", and the toast "Deshechas N entradas: desde <oldest> hasta <newest>" (Uruguayan voseo, FR-020)
- [X] T038 [US2] Create `src/ui/components/UndoRangeSheet.tsx` per contracts/history-ui.md, built on the existing `Sheet` component, 48 px targets, optional transcript prop (depends on T036, T037)
- [X] T039 [US2] In `src/ui/screens/History.tsx` add "Deshacer hasta acá" inside the expanded panel of every effective non-setup entry other than the newest; it calls `undoTo(id)` and opens `UndoRangeSheet` on `confirmRange` (depends on T038)
- [X] T040 [US2] In `src/ui/components/UndoToast.tsx` show the range toast when `feedback.groups.length > 1` (depends on T037)
- [X] T041 [P] [US2] In `src/voice/snapshot.ts` change the recent-entries block to the last 15 effective, non-setup groups with ids, under the header "Últimas entradas (id entre corchetes, la más nueva al final):"; keep it in the volatile suffix only
- [X] T042 [P] [US2] In `src/voice/tools.ts` set the `undo` description to "Deshacer. Sin destino (null) = la última entrada. «deshacé hasta …» = el id de esa entrada en Últimas entradas. «deshacer» · «borrá eso» · «deshacé hasta la compra del tren de la EXP»." and the `amendLast` description to "Pedido de corregir una cantidad o una entrada anterior. La app no corrige: explica cómo deshacer. «no, eran 260» · «perdón, 300»." (schemas unchanged)
- [X] T043 [P] [US2] In `src/voice/prompt.ts` replace the undo/amend rule line with "«deshacer» → undo (groupId null); «deshacé hasta X» → undo con el id de X; «no, eran 260» → amendLast. «sí» / «confirmar» con una propuesta en pantalla → confirmProposal."
- [X] T044 [US2] In `src/voice/resolve.ts` add `{ kind: "undoTo"; transcript; groupId; range: UndoRange }` to `VoiceResult`, resolved with `undoRangeOf`; unknown, reverted or setup ids → `notUnderstood("No encontré esa entrada. Usá el historial.")`
- [X] T045 [US2] In `src/app/voiceController.ts` and `src/app/useVoice.ts` add `undoTo(groupId, { confirmed: true }): Promise<{ ok: boolean }>` to the effects interface and expose the pending `undoTo` result so the panel can confirm or cancel it (depends on T036, T044)
- [X] T046 [US2] In `src/ui/components/VoicePanel.tsx` open `UndoRangeSheet` with the transcript for an `undoTo` result; only "Deshacer N" calls the controller's `undoTo` (depends on T038, T045)
- [X] T047 [US2] Add at least 4 cases to `eval/voice/cases.jsonl`: "deshacé hasta la compra del tren de la EXP" → `undo { groupId: <that id> }`; "volvé a antes de que la TUN emitiera" → `undo { groupId: <id> }`; "deshacer" with history present → `undo { groupId: null }`; "no, eran 260" → `amendLast`; add any fixture spec these cases need in `eval/voice/fixtureSpecs.ts`
- [X] T048 [US2] In `eval/voice/grade.ts` grade `undo.groupId` exactly, accepting both null and the newest effective id for a bare «deshacer»; cover it in `tests/eval/voice.test.ts`
- [X] T049 [US2] Regenerate eval fixtures with `npx tsx eval/voice/buildFixtures.ts` (snapshot text changed); check `tests/eval/voice.test.ts` still passes (depends on T041, T047)

**Checkpoint**: T027–T034 pass. "Deshacer hasta acá" works by touch and voice with one confirmation; SC-001 random walks and the 300-group perf budget pass.

---

## Phase 5: User Story 3 - See exactly where the money went (Priority: P1)

**Goal**: Every entry, active or undone, expands to its movements and before/after balances, and single-movement summaries show the amount.

**Independent Test**: In 1830, a company with shares held by 2 players, 1 in the pool and 1 in its treasury pays out; expanding the entry shows one money line per recipient, each balance before → after, and the price change; values match a hand calculation (quickstart §4).

### Tests for User Story 3 (write first, must fail)

- [X] T050 [P] [US3] Create `tests/domain/breakdown.test.ts` for `entryBreakdown(game, players, log, groupId)`: payout with 2 players, pool and treasury shares gives one money line per recipient and balances matching a hand calculation, plus a price movement with old and new price (FR-012); half pay and withhold split treasury vs. shareholders; `adjustMoney setTo` shows before, after and delta with the bank as the other side (FR-013); share buy shows price, receiver, share movement and buyer balance; train buy with trade-in shows train, seller, price and treasury before/after; same-direction money transfers between the same pair are summed but opposite directions are never netted; unlimited-bank game gives `before: null, after: null` for the bank only (FR-011); balances are ordered players by seat → companies in definition order → bank/pool/other; a reverted group uses its timeline as of `undoneBy` and shows the same breakdown it had while active; a legacy amended group uses its latest version; a private transfer (sale to a company) shows the private moving from player to company plus the money line and both balances (FR-010); a company closure shows the status change and any shares, trains and treasury money returned; automatic and system groups (private income, end of round, game end, bankruptcy, merger) get the same breakdown, each with at least one case using a game whose definition supports it (FR-015); conservation over random games from `tests/helpers/randomWalk.ts`: for every non-bank holder, Σ money in − Σ money out === `balance.delta` (FR-016)
- [X] T051 [P] [US3] Extend `tests/domain/summaries.test.ts` with a table-driven audit (R6): for every action type whose expansion yields exactly one money flow, `summaryEs` contains `formatMoney(amount)` (FR-014); `adjustMoney setTo` reads like "Ana: dinero fijado en $520 (+$40)"; add `movementLineEs` cases ("$240: Banco → Ana", "2 PRR: IPO → Ana (presidencia)", "tren 3: Banco → PRR", "privada CS: Ana → PRR", "PRR: $100 → $112", restack/receivership/closed-cell labels as `effectsEs`, "EXP: flotó → cerrada", "deuda de VH: +$100") and `balanceLineEs` cases ("Ana: $480 → $720 (+$240)", unlimited bank "Banco: −$240")
- [X] T052 [P] [US3] Create `tests/app/everyChangeHasEntry.test.ts` (FR-009, R11): for every action type in `ActionSchema` that has a fixture, dispatching through `SessionStore` appends exactly one group and the state equals the replay of the log; a source scan asserts no module under `src/` other than `src/app/SessionStore.ts` (and the repository that defines it) calls `appendEntry`
- [X] T053 [P] [US3] Extend `tests/ui/history.test.tsx`: tapping a row expands it (one tap, SC-003) with "Movimientos", "Saldos", the transcript «…» for voice entries, and warnings, omitting empty sections; undone entries expand with the same sections and the "deshecha" badge; the old `MULTI_STEP` special case is gone (every entry is expandable)

### Implementation for User Story 3

- [X] T054 [US3] Create `src/domain/ledger/breakdown.ts` exporting `EntryBreakdown`, `Movement`, `BalanceChange` exactly as data-model §5 and `entryBreakdown(game, players, log, groupId)` plus `timelineOf(log, groupId)`: timeline = current effective log for effective groups, `effectiveLog(log.filter(e => e.seq < undoneBy))` for reverted ones; before state = replay timeline groups with `seq < group.seq` from `startCursor`; after = `reduceAll(before, version.events)`; one movement per primitive event in event order (money summed only for same-direction repeats; price `from` from the before state, `to` from the event cell, `null` when there is no price; turn/phase markers as one `turn` line; notes skipped); balances for each holder whose cash differs, with `before`/`after` `null` for the bank in unlimited-bank games
- [X] T055 [P] [US3] In `src/domain/i18n/es.ts` add `movementLineEs(movement, ctx)` and `balanceLineEs(change, ctx)` using the game's currency format, and add the difference to the `adjustMoney setTo` summary from its event ("dinero fijado en $520 (+$40)"); fix any action summaries the T051 audit shows lacking the amount
- [X] T056 [US3] In `src/ui/screens/History.tsx` make every row a `<details>` that expands in one tap to sections "Movimientos" (`movementLineEs`), "Saldos" (`balanceLineEs`), the transcript and warnings, computing `entryBreakdown` lazily only when opened (memoized per group); keep "Deshacer hasta acá" at the bottom of the panel; remove the `MULTI_STEP` special case; undone entries keep sections 1–4 (depends on T054, T055)

**Checkpoint**: T050–T053 pass. Every entry shows where the money went.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T057 [P] Add a legacy-session fixture test in `tests/persistence/resume.test.ts` (SC-006, FR-018): a stored log with an out-of-order `revert` and an `amend` loads with the same state, the amended entry shows its latest version, `undoLast` works on the newest entry, and every entry yields an `entryBreakdown`
- [X] T058 [P] Update `docs/spec.md`: replace the Undo/Amend bullets with in-order undo ("Deshacer" on the latest, "Deshacer hasta acá" with confirmation, no correcting), update the History screen description (expandable breakdown, saldos), and the voice table row (undo with id, amendLast explains)
- [X] T059 [P] Set the status of `.specify/bugs/undo-stale-market-move/assessment.md` to resolved by feature 010, pointing at the SC-002 test in `tests/games/rotla.test.ts`
- [X] T060 Check that `undoTo` to the first entry of a 300-entry game also renders History quickly: History must not compute breakdowns for collapsed rows (verify in `src/ui/screens/History.tsx`)
- [X] T061 Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`; all pass
- [X] T062 Run the voice eval on the default model: `npm run eval:voice -- --cache on` (needs the Gemini key; ask the user); new undo-to cases pass and accuracy does not regress from the T001 baseline; attach the report. Gemini only: the user accepted on 2026-10-12 that Claude models are not re-run for this feature — Done 2026-10-12 by the user: `eval/voice/results/2026-10-12-gemini-3.6-flash-cache.json`, 87/88 (98.9%) vs. 82/83 on 2026-10-11; new cases cr-05..cr-09 all pass.
- [X] T063 Manual validation per [quickstart.md](quickstart.md) §2–§6 on a phone-sized viewport (needs the user) — Done 2026-10-12 by the user: undoing back through many actions works. Not done on a device: SC-004 with a ~300-entry game (only the Node perf test covers it, `tests/domain/perf.test.ts`, under 500 ms).
- [x] T064 Amend the constitution for principles I and IV (undo marks groups reverted newest first; one tap undoes the latest action; older actions via a confirmed range; amend retired) (R12). Done 2026-10-12 before implementation as v2.0.0 (MAJOR)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks all stories.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 (reuses `undoLast`'s persist path, the `reverted` feedback with `groups`, and the History/voice cleanup).
- **US3 (Phase 5)**: after Foundational only (`undoneBy` from T007). Can run in parallel with US1/US2, but T056 edits `History.tsx`, so sequence it after T021/T039 or merge carefully.
- **Polish (Phase 6)**: after all stories.

### Within Phases

- T006 → T007 → T009; T008 and T010 after T006.
- T016 → T017, T018 → T019 → T020; T018 → T021 → T022; T023 → T024 → T025.
- T035 → T036 → T038 → T039/T046; T044 → T045 → T046; T041 + T047 → T049.
- T054 + T055 → T056.

### Parallel Opportunities

- Foundational tests T002–T005 together; then T008, T009, T010 after T006/T007.
- US1 tests T011–T015 together; T022 and T026 alongside other US1 work once their dependencies are done.
- US2 tests T027–T034 together; T037, T041, T042, T043 in parallel.
- US3 tests T050–T053 together; T054 and T055 in parallel.
- Polish T057, T058, T059 in parallel.

---

## Parallel Example: User Story 2

```bash
# Tests first, together:
Task: "undoTo tests in tests/app/sessionStore.test.ts"            # T027
Task: "SC-001 randomized walks in tests/app/undoRandom.test.ts"    # T028
Task: "UndoRangeSheet tests in tests/ui/undoRange.test.tsx"        # T030
Task: "undoTo resolve tests in tests/voice/resolve.test.ts"        # T032

# Then independent implementation files, together:
Task: "Range texts in src/domain/i18n/es.ts"                       # T037
Task: "15 entries with ids in src/voice/snapshot.ts"               # T041
Task: "undo/amendLast descriptions in src/voice/tools.ts"          # T042
Task: "Undo rule line in src/voice/prompt.ts"                      # T043
```

## Parallel Example: User Story 3

```bash
Task: "entryBreakdown tests in tests/domain/breakdown.test.ts"     # T050
Task: "Summary audit in tests/domain/summaries.test.ts"            # T051
Task: "FR-009 test in tests/app/everyChangeHasEntry.test.ts"       # T052
# then
Task: "entryBreakdown in src/domain/ledger/breakdown.ts"           # T054
Task: "movementLineEs/balanceLineEs in src/domain/i18n/es.ts"      # T055
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1): in-order undo, amend removed. This alone fixes the stale-market bug (SC-002).
3. **Stop and validate**: quickstart §2.

### Incremental Delivery

1. Foundation → US1 (bug fixed, MVP).
2. US2: "Deshacer hasta acá" by touch and voice, eval re-run.
3. US3: breakdown and summary amounts.
4. Polish: docs, legacy fixture, eval report, manual checks. (The constitution amendment, T064, was done before implementation.)

---

## Notes

- Leave changes uncommitted for review; ignore any "commit after each task" habit.
- Voice prompt/tool/snapshot changes require fixture regeneration (T049) and an eval run (T062) before merging.
- New UI strings use Uruguayan voseo and "acá" (FR-020).
