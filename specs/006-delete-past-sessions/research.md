# Research: Delete Past Sessions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-10

The Technical Context had no open questions: the stack, storage and test setup are the same as in earlier features. These are the design decisions, each checked against the current code.

## R1. Where the delete control goes on Home

**Decision**: Each session row becomes a two-control row:
- the existing `session-item` button, which opens the session and fills the width;
- a separate `button.danger` labelled "Eliminar". It is at least `--tap` (48 px) square, its accessible name is `Eliminar partida «{name}»`, and it sits at the right with a `--space-2` gap.

The row is a `<div className="session-row">` inside the existing `<li>`, so the delete button is never nested inside the open button.

**Rationale**:
- One tap to choose delete plus one tap to confirm meets SC-001 (2 taps).
- Two sibling buttons with their own hit areas and a gap meet FR-010. A tap meant to open a session can't land on delete, and even if it did, the confirmation catches it (SC-003).
- A visible word ("Eliminar") with a danger border is more than color alone (FR-009, Principle V).
- The pattern matches the existing "Borrar" button on custom games ([CustomGame.tsx:130](../../src/ui/screens/CustomGame.tsx#L130)).

**Alternatives considered**:
- *Swipe-to-delete or long-press*: hidden gestures with no touch-visible affordance, they are hard to test, and long-press clashes with text selection on Android.
- *An "Editar lista" mode with checkboxes*: an extra tap (3 total) and the start of bulk delete, which is out of scope.
- *A per-row "⋯" menu*: 3 taps, and a new menu component nobody else uses.
- *An icon-only 🗑 button*: emoji rendering varies, and a word is clearer at a glance. The accessible name covers screen readers either way.

## R2. The confirmation dialog

**Decision**: Reuse `Sheet` (backdrop tap and Escape already close it, which means cancel). It shows:
- **Title**: `¿Eliminar «{name}»?`
- **Body**: `{game.name} · {players joined} · {entryCount} entradas`, then `Esta acción no se puede deshacer.`
- **Buttons**, in a `row`: `Cancelar` · spacer · `Exportar antes` · `Eliminar` (`primary danger`).

While a delete or export is running, all three buttons are disabled so a double tap can't fire twice. Focus does not go to "Eliminar" by default.

**Rationale**:
- `Sheet` is the app's one dialog pattern, used for import on this same screen, and it already handles phone and tablet layouts.
- The game name and players are not shown in the list row today. Putting them in the confirmation tells the player which "1830 · 07/10" they are about to remove (FR-002).

**Alternatives considered**:
- *`window.confirm`*: no styling, it can't hold the export button, and some PWA standalone modes suppress it.
- *Typing the session name to confirm*: too heavy for a phone at a game table, and export already covers the risk of losing data.

## R3. One delete operation that also clears the pointer

**Decision**: Add `deleteSession(repo, settings, id)` to [src/app/sessions.ts](../../src/app/sessions.ts), next to `startSession`. It does two things in order:
1. Await `repo.deleteSession(id)`, which is already one strict transaction over `sessions`, `entries` and `snapshots`.
2. If `(await settings.get()).lastSessionId === id`, call `settings.set({ lastSessionId: undefined })`.

Home calls this function and then reloads its list and pointer from storage.

**Rationale**:
- Step 1 already gives FR-004, FR-005 and FR-006. IndexedDB aborts the whole transaction on any failed request, so a session can never be left half deleted. No new storage code is needed.
- The pointer lives in the `settings` store, which `SettingsRepo` owns. Folding it into the session transaction would mean `SessionRepo` writing settings rows directly, which breaks that ownership for no gain.
- A pointer to a missing session is already harmless:
  - Home computes `last` from the listed sessions ([Home.tsx:62](../../src/ui/screens/Home.tsx#L62)), so a missing session gives no "Continuar".
  - The app always starts on Home ([App.tsx:72](../../src/ui/App.tsx#L72)) and never auto-opens `lastSessionId`.
  - `openSession` returns `false` for a missing id.

  So if step 2 failed after step 1 succeeded, nothing breaks. Step 2 just keeps settings clean (FR-007).
- Putting the function in `src/app` (not in the component) lets it be unit-tested without the UI, the way `startSession` is.

**Alternatives considered**:
- *One transaction across four stores*: couples the repos, as described above.
- *Clearing the pointer before deleting*: if the delete then failed, "Continuar" would vanish for a session that still exists.

## R4. Exporting from Home without opening the session

**Decision**: Move the body of `useExportSession` into a plain function in [src/ui/useExport.ts](../../src/ui/useExport.ts):

```ts
exportSessionFile(repo, sessionId): Promise<void>
```

It calls `buildExport` and then `downloadJson`. `useExportSession()` calls it with the open session's id, so its behaviour doesn't change. The confirmation's "Exportar antes" calls it with the target id and leaves the sheet open (FR-008).

**Rationale**:
- `buildExport` already takes any session id. The only thing tying export to an open session is the hook reading `useSession()`.
- One code path means the same file format, the same file name, and the same guarantee that settings and keys are never read (FR-092, Principle VII).

**Alternatives considered**:
- *Opening the session, exporting, then closing it*: changes `lastSessionId` as a side effect and does pointless work.
- *Exporting automatically on every delete*: an unwanted download on every cleanup.

## R5. When an export or a delete fails

**Decision**:
- **Delete fails**: the sheet stays open and shows `No se pudo eliminar la partida.` (`role="alert"`). The list is reloaded from storage, so it shows the truth, which per R3 is the full session.
- **Export fails**: the sheet shows `No se pudo exportar la partida.` and nothing is deleted.

The player can retry or cancel in both cases.

**Rationale**: This gives FR-006's "short message" and keeps the player in control. Keeping the sheet open lets them retry or cancel without having to find the row again.

## R6. Keeping the list in sync after a delete

**Decision**: After a successful delete, close the sheet and re-run the same `Promise.all([listSessions(), settings.get()])` load that Home runs on mount, pulled out into a `reload()` callback.

**Rationale**:
- Storage stays the single source of truth, so the list after a delete matches what a reload shows (SC-002).
- The list is small (dozens of rows), so the re-query costs nothing.

**Alternative considered**: filtering the deleted row out of local state. It's faster, but it can drift from storage.

## R7. Tests

**Decision**:
- `tests/persistence/sessionRepo.test.ts`, which already had no `deleteSession` test, adds coverage that:
  - deleting one of two sessions removes its meta, entries and snapshots;
  - the other session reloads identically (FR-005);
  - a deleted id then imports as new.
- `tests/app/sessions.test.ts` (new) tests `deleteSession`:
  - it clears the pointer only when the pointer matches the deleted id;
  - with a repo whose `deleteSession` rejects, the error propagates and the pointer is untouched (FR-006, SC-004 at the boundary we own).
- `tests/ui/home.test.tsx` (new) renders `App` on a seeded fake IndexedDB:
  - every session row has an "Eliminar partida «…»" button;
  - cancel, Escape and the backdrop keep everything;
  - confirm removes the row and it stays gone after re-render on the same DB name;
  - deleting the "Continuar" session hides that button;
  - "Exportar antes" triggers a download and keeps the sheet open;
  - a failing delete shows the alert.

**Rationale**:
- The storage atomicity itself is IndexedDB's guarantee, already relied on by import and by the rollback in `startSession`. We test our side of the boundary: what we call, and what we do when a call fails.
- This is UI and persistence wiring, not domain logic (Principle VI's test-first scope), but the tests are still written first because they are cheap here.

## R8. Voice and the rest of the app

**Decision**: There is no voice action, no new event type, and no change to `SessionStore`, the reducer, actions or game definitions. Delete is never offered inside an open session.

**Rationale**:
- Voice runs only on the Table, where a session is open (FR-011).
- A session that is deleted is never open, so no live `SessionStore` ever points at deleted rows.
- Principle I governs the log of a session that exists. Removing a whole session adds nothing to any log and rewrites none ([spec Background](spec.md#background)).
