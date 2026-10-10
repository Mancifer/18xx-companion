---

description: "Task list for Delete Past Sessions"
---

# Tasks: Delete Past Sessions

**Input**: Design documents from `specs/006-delete-past-sessions/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/home-delete-ui.md](contracts/home-delete-ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. The plan's Constitution Check (VI. Test-First) and research R7 require `deleteSession`, repo isolation and the Home flow to be written test-first. Write each test task first and confirm it fails before the matching implementation task.

**Organization**: Tasks are grouped by user story so each story can be built and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: Which user story the task belongs to (US1, US2, US3)

## Path Conventions

Single-project PWA: `src/`, `tests/`, `docs/` at the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nothing to initialize. There is no new dependency, store, field, event or DB version (plan, data-model §1).

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the unchanged tree and note any pre-existing failures, so later failures can be attributed to this feature (baseline for quickstart §1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pin down the storage guarantee every story relies on. `SessionRepo.deleteSession` (`src/persistence/sessionRepo.ts:96`) already exists and stays unchanged; it has no test yet.

**⚠️ CRITICAL**: Finish before the user story phases.

- [X] T002 Add a `describe("deleteSession")` block to tests/persistence/sessionRepo.test.ts that, on a fresh fake IndexedDB with two sessions A and B (each with several entries and at least one snapshot): (a) after `repo.deleteSession(A.id)`, `loadSession(A.id)` is `undefined`, `listSessions()` no longer includes A, and no `entries` or `snapshots` rows with `sessionId === A.id` remain (query the `bySession` index); (b) B's meta, entries and snapshots reload identical to before (FR-005); (c) `repo.deleteSession("missing-id")` resolves and changes nothing; (d) after deleting A, importing A's `buildExport` file through `parseImport` + `importSession` follows the "not on this device" path (`loadSession` was `undefined` beforehand) and restores the same entryCount (spec edge case "Re-importing a deleted session")
- [X] T003 Run tests/persistence/sessionRepo.test.ts. T002 should pass against the existing `SessionRepo.deleteSession` (it characterizes existing code). If it fails, fix `src/persistence/sessionRepo.ts` so the delete stays one `readwrite` transaction over `sessions`, `entries` and `snapshots` with `durability: "strict"` (data-model §2 "Atomic")

**Checkpoint**: Storage delete is proven atomic-by-design and isolated. Story work can begin.

---

## Phase 3: User Story 1 - Delete one finished session from Home (Priority: P1) 🎯 MVP

**Goal**: Each Home session row gets an "Eliminar" button that opens a confirmation sheet; confirming removes the session and its history for good, cancelling changes nothing.

**Independent Test**: With three sessions stored, delete one from Home and confirm. Only two remain, also after re-rendering `App` on the same DB name; the remaining sessions still open with their full state.

### Tests for User Story 1 ⚠️

> Write these first and confirm they FAIL before T007–T011.

- [X] T004 [P] [US1] Create tests/app/sessions.test.ts with a `describe("deleteSession")` for the new `deleteSession(repo, settings, id)` from src/app/sessions.ts, on a fresh fake IndexedDB (`openCompanionDb(freshDbName())` from tests/helpers/session): (a) deleting an existing session that is not the pointer removes it from `listSessions()` and leaves `settings.get().lastSessionId` unchanged; (b) deleting a missing id resolves; (c) with a stub repo whose `deleteSession` rejects (e.g. `{ deleteSession: () => Promise.reject(new Error("boom")) }` cast to `SessionRepo`), the call rejects with that error and `settings.set` is never called / `lastSessionId` is unchanged (contract §1 row 4, FR-006)
- [X] T005 [P] [US1] Create tests/ui/home.test.tsx with a local seeding helper modelled on `openSeededTable` in tests/ui/helpers.tsx: seed three sessions (distinct names, e.g. via `startSession` with the `name` field of `NewSessionInput`, different players) in one fresh DB, close it, then `render(<App dbName={dbName} />)` and stay on Home (do NOT click "Continuar"). Tests: (a) every row has a button with accessible name `Eliminar partida «{name}»` and visible text `Eliminar`, separate from the open button (FR-001, FR-009, FR-010); (b) tapping "Eliminar" opens a dialog titled `¿Eliminar «{name}»?` that shows `{game.name} · {players comma-separated} · {entryCount} entradas` and `Esta acción no se puede deshacer.` (FR-002); (c) closing via "Cancelar", via Escape, and via the backdrop each leaves all three rows listed (FR-003); (d) confirming with the sheet's "Eliminar" removes that row, then `unmount()` + re-render `App` on the same `dbName` still shows only the other two (FR-004, SC-002); (e) after the delete, opening a remaining session reaches the Table (`findByRole("button", { name: "Menú" })`) (FR-005)
- [X] T006 [P] [US1] Add a failure test to tests/ui/home.test.tsx: make the delete reject (e.g. `vi.spyOn(SessionRepo.prototype, "deleteSession").mockRejectedValueOnce(new Error("boom"))`), confirm the delete, and assert the sheet stays open with an element of `role="alert"` reading `No se pudo eliminar la partida.` and the row is still listed (FR-006, research R5)

### Implementation for User Story 1

- [X] T007 [US1] Add to src/app/sessions.ts, next to `startSession`, `export async function deleteSession(repo: SessionRepo, settings: SettingsRepo, id: string): Promise<void>` with the JSDoc from contracts/home-delete-ui.md §1: first `await repo.deleteSession(id)` (if it rejects, let the error propagate and do not touch settings); then if `(await settings.get()).lastSessionId === id`, `await settings.set({ lastSessionId: undefined })`. Never clear the pointer before the delete (research R3). Make T004 pass
- [X] T008 [P] [US1] Add a `.session-row` rule to src/ui/styles/components.css after `.session-item`: `display: flex; align-items: stretch; gap: var(--space-2);` with `.session-row .session-item { flex: 1; min-width: 0; }` and the delete button `min-width: var(--tap); min-height: var(--tap);` (FR-009). If plain `button.danger` (non-primary) has no visible danger cue today, give `.session-row .danger` a `border-color: var(--danger); color: var(--danger);` so the button reads as destructive by label and border, not color alone
- [X] T009 [US1] In src/ui/screens/Home.tsx, pull the mount load (`Promise.all([sessions.listSessions(), settings.get()])` → `setList` / `setLastId`) into a `reload` callback (`useCallback`) that the mount `useEffect` calls, keeping the existing `cancelled` guard behaviour (research R6)
- [X] T010 [US1] In src/ui/screens/Home.tsx, change each `<li>` in "Partidas" to hold `<div className="session-row">` with the existing `.session-item` open button (unchanged) and a sibling `<button className="danger" aria-label={`Eliminar partida «${s.name}»`} onClick={() => setToDelete(s)}>Eliminar</button>` (never nested in the open button; FR-001, FR-010, contract §3). Add state `toDelete: SessionMeta | null`, `busy: "export" | "delete" | null` and `deleteError: string | null`
- [X] T011 [US1] In src/ui/screens/Home.tsx, render a `Sheet` when `toDelete` is set, per contract §4: title `¿Eliminar «{name}»?`; a `muted` line `{toDelete.game.name} · {players.map(p => p.name).join(", ")} · {entryCount} entradas`; `<p>Esta acción no se puede deshacer.</p>`; an optional `<p className="toast-warning" role="alert">` with `deleteError`; a `row` with `Cancelar` · `<span className="spacer" />` · `Eliminar` (`className="primary danger"`). "Cancelar" and the Sheet's `onClose` (✕, Escape, backdrop) clear `toDelete` and `deleteError` and write nothing. "Eliminar" sets `busy = "delete"`, calls `deleteSession(sessions, settings, toDelete.id)` from src/app/sessions.ts; on success closes the sheet and `await reload()`; on failure sets `deleteError = "No se pudo eliminar la partida."`, keeps the sheet open and `await reload()`; always clears `busy`. All sheet buttons are `disabled={busy !== null}`; no `autoFocus` on "Eliminar" (research R2). Make T005 and T006 pass

**Checkpoint**: US1 is fully usable: any session can be deleted from Home in 2 taps, cancel paths are safe, failures show an alert.

---

## Phase 4: User Story 2 - Delete the session shown under "Continuar" (Priority: P2)

**Goal**: Deleting the last-opened session removes the "Continuar" button and clears the pointer so the next launch does not refer to it.

**Independent Test**: Open session A, return to Home, delete A. "Continuar · A" disappears and stays gone after re-rendering `App` on the same DB; `lastSessionId` is unset.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Add to tests/app/sessions.test.ts: when `lastSessionId === id`, `deleteSession` resolves and afterwards `settings.get().lastSessionId` is `undefined`; when the pointer is another session's id, it is left unchanged (contract §1 rows 1–2, FR-007)
- [X] T013 [P] [US2] Add to tests/ui/home.test.tsx: seed sessions so one (A) is the `lastSessionId` (the last `startSession` sets it), assert `Continuar · {A.name}` is shown, delete A through "Eliminar" → "Eliminar", then assert no button matching `/^Continuar/` remains; unmount and re-render `App` on the same `dbName` and assert Home renders with no "Continuar" and no error (US2 scenarios 1–2). Also cover the single-session edge case: deleting the only session leaves no "Partidas" heading and no "Continuar", while "Nueva partida" and "Importar partida" are still shown

### Implementation for User Story 2

- [X] T014 [US2] Verify T012 and T013 pass with T007 and T011 as built (the pointer clearing in `deleteSession` and `reload()` re-reading `settings.get()` should already cover them). Fix src/app/sessions.ts or src/ui/screens/Home.tsx only if a test fails

**Checkpoint**: US1 and US2 both work; "Continuar" never points at a deleted session.

---

## Phase 5: User Story 3 - Keep a copy before deleting (Priority: P3)

**Goal**: The delete confirmation offers "Exportar antes", which downloads the session in the existing export format and keeps the sheet open.

**Independent Test**: From the confirmation, export, then delete. Importing the downloaded file brings the session back with the same state.

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] Add to tests/ui/home.test.tsx: stub `URL.createObjectURL` / `URL.revokeObjectURL` and spy on `HTMLAnchorElement.prototype.click`; open the delete sheet for a session, tap "Exportar antes", and assert one download click whose anchor `download` equals `exportFileName(...)` for that session, and that the dialog is still open with "Eliminar" enabled (FR-008, US3 scenario 1). Add a failure case: make `buildExport` reject (e.g. spy on `SessionRepo.prototype.loadSession` to reject once) and assert `role="alert"` reads `No se pudo exportar la partida.` and the session is still listed (research R5)
- [X] T016 [P] [US3] Add to tests/persistence/sessionRepo.test.ts (or the existing export/import test file under tests/persistence/ if one covers `buildExport`): build an export of session A, `deleteSession(A.id)`, re-import the file with `importSession`, and assert the reloaded meta (`name`, `entryCount`, players) and entries match the originals (SC-005, US3 scenario 2)

### Implementation for User Story 3

- [X] T017 [US3] In src/ui/useExport.ts, add `export async function exportSessionFile(repo: SessionRepo, sessionId: string): Promise<void>` with JSDoc "Builds the export of any stored session and saves it as a download. Never reads settings." that runs `buildExport(repo, sessionId, { appVersion: APP_VERSION })` then `downloadJson(exportFileName(file), file)`. Make `useExportSession()` keep its signature and return `() => exportSessionFile(sessions, meta.id)` (contract §2, research R4). Existing export tests must still pass unchanged
- [X] T018 [US3] In src/ui/screens/Home.tsx, add an `Exportar antes` button to the delete sheet's row between the spacer and "Eliminar". On tap: set `busy = "export"`, clear `deleteError`, `await exportSessionFile(sessions, toDelete.id)` from src/ui/useExport.ts; on failure set the alert text to `No se pudo exportar la partida.`; never close the sheet; always clear `busy`. It is `disabled={busy !== null}` like the other buttons. Make T015 pass

**Checkpoint**: All three stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Docs, full-suite verification and manual check.

- [X] T019 [P] Update docs/spec.md §9.1 Screens (Home): each session row has an "Eliminar" button (≥ 48 px, accessible name `Eliminar partida «name»`) that opens a confirmation sheet with the game, players and entry count, the "no se puede deshacer" warning, and Cancelar / Exportar antes / Eliminar; delete is Home-only and never by voice (FR-011, FR-012)
- [X] T020 [P] Update docs/spec.md §10 Persistence & Data: deleting a session removes its `sessions`, `entries` and `snapshots` rows in one strict transaction, then clears `lastSessionId` if it pointed at it; custom games in `games` and other sessions are untouched; nothing is logged; a deleted session's file re-imports as new (FR-012, data-model §1–2)
- [X] T021 Run quickstart.md §1: `npm run typecheck`, `npm run lint`, `npm test -- tests/persistence/sessionRepo.test.ts tests/app/sessions.test.ts tests/ui/home.test.tsx`, then the full `npm test`; compare against the T001 baseline and fix any regression
- [X] T022 Manual check per quickstart.md §2 on a phone or a 360×740 device toolbar (cancel paths, export then delete then re-import, "Continuar" session, last session, 48 px target and screen-reader name, two-tap delete). Needs the user

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup. Blocks the story phases.
- **US1 (Phase 3)**: after Foundational.
- **US2 (Phase 4)**: after US1 (it reuses `deleteSession` from T007 and the sheet from T011; it adds tests and, if needed, fixes).
- **US3 (Phase 5)**: T016 and T017 can start after Foundational; T015 and T018 need the sheet from T011.
- **Polish (Phase 6)**: after the stories you intend to ship. T019/T020 can be written any time after the design is fixed.

### User Story Dependencies

- **US1 (P1)**: independent; it is the MVP.
- **US2 (P2)**: builds on US1's delete flow (there is no other way to delete the "Continuar" session); testable on its own once US1 exists.
- **US3 (P3)**: builds on US1's sheet for the button; the `exportSessionFile` extraction (T017) is independent.

### Within Each User Story

- Tests first, confirmed failing.
- `src/app/sessions.ts` before `src/ui/screens/Home.tsx`.
- Home.tsx tasks (T009 → T010 → T011 → T018) are sequential: same file.

### Parallel Opportunities

- T004, T005, T006 (different files / independent tests) in parallel; T008 (CSS) in parallel with T007.
- T012 and T013 in parallel.
- T015, T016 and T017 in parallel (different files).
- T019 and T020 touch the same file but different sections; do them together or one after the other.

---

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "deleteSession unit tests in tests/app/sessions.test.ts"         # T004
Task: "Home delete flow tests in tests/ui/home.test.tsx"                # T005, T006

# Then, in parallel:
Task: "deleteSession in src/app/sessions.ts"                            # T007
Task: ".session-row rule in src/ui/styles/components.css"               # T008
```

## Parallel Example: User Story 3

```bash
Task: "Export-from-sheet tests in tests/ui/home.test.tsx"               # T015
Task: "Export → delete → re-import test in tests/persistence/"          # T016
Task: "exportSessionFile extraction in src/ui/useExport.ts"             # T017
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (baseline) and Phase 2 (repo delete tests).
2. Phase 3: US1.
3. **Stop and validate**: delete a session from Home, re-render, confirm it's gone and the others are intact.

### Incremental Delivery

1. Setup + Foundational → storage delete is pinned by tests.
2. US1 → delete from Home works (MVP).
3. US2 → "Continuar" and the pointer are cleaned up.
4. US3 → "Exportar antes" safety net.
5. Polish → docs, full suite, manual phone check.

---

## Notes

- [P] tasks = different files, no dependency on an unfinished task.
- No voice tool, event type, `SessionStore`, reducer or game-definition change (research R8); if a task seems to need one, stop and re-check the plan.
- Leave changes uncommitted for review.
