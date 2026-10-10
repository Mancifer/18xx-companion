# Quickstart: Validating Delete Past Sessions

**Feature**: [spec.md](spec.md) | **Contract**: [contracts/home-delete-ui.md](contracts/home-delete-ui.md)

## 1. Automated checks (no keys needed, run in CI)

```sh
npm run typecheck
npm run lint
npm test -- tests/persistence/sessionRepo.test.ts tests/app/sessions.test.ts tests/ui/home.test.tsx
npm test            # full suite: nothing else may change
```

Expected results:

| Test file | Proves |
|---|---|
| `tests/persistence/sessionRepo.test.ts` | Deleting A removes its meta, entries and snapshots. B reloads identically (FR-004, FR-005). A's file then imports as new. |
| `tests/app/sessions.test.ts` | The pointer is cleared only for the matching id (FR-007). A rejecting repo propagates the error and leaves the pointer alone (FR-006). |
| `tests/ui/home.test.tsx` | Each row has "Eliminar partida «…»". Cancel, Escape and the backdrop keep everything (FR-003). Confirm removes the row, and it stays gone after re-render (SC-002). The "Continuar" session hides its button when deleted (US2). "Exportar antes" downloads and keeps the sheet open (FR-008). A failure shows "No se pudo eliminar la partida." (FR-006). |

## 2. Manual check on a phone

Run `npm run dev`, then open the app on a phone (or use the browser device toolbar at 360×740).

1. **Set up**: create three sessions (A, B, C) and record a few actions in each. Open A, then go back to Home. "Continuar · A" shows.
2. **Cancel** (US1, FR-003): tap "Eliminar" on B. The sheet names B, its game and its players, and says it can't be undone. Dismiss it each way in turn: tap "Cancelar", press ✕, then tap the backdrop. All three sessions are still listed.
3. **Export, then delete** (US3, SC-005):
   1. On B, tap "Eliminar", then "Exportar antes". A `18xx-…json` file downloads and the sheet stays open.
   2. Tap "Eliminar". B disappears.
   3. Reload. B is still gone.
   4. Import the downloaded file. B comes back with no "Ya tienes esta partida" prompt, the same entry count, and the same table state.
4. **The "Continuar" session** (US2, FR-007):
   1. Delete A. The "Continuar · A" button disappears.
   2. Reload. Home opens normally, with no error and no "Continuar" for A.
5. **Last session** (edge case): delete the remaining sessions. Home looks like a fresh install. "Nueva partida" and "Importar partida" still work.
6. **Touch and accessibility** (FR-009, FR-010):
   - The "Eliminar" button is at least 48×48 px and clearly separate from the row. Tapping the session name never opens the sheet.
   - With a screen reader, the button reads as "Eliminar partida «name»".
7. **Two taps** (SC-001): from Home, a delete takes exactly two taps: "Eliminar", then "Eliminar".

## 3. Docs

`docs/spec.md` §9.1 Home and §10 Persistence describe deleting a session (FR-012). Check them in the same change.
