# Contract: Session Deletion (Home UI and App Function)

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md)

## 1. App function

In `src/app/sessions.ts`:

```ts
/**
 * Removes a session with its whole log and snapshots (one strict transaction), then forgets it
 * as the last session if it was. Rejects, with the pointer untouched, when the delete fails.
 */
export function deleteSession(repo: SessionRepo, settings: SettingsRepo, id: string): Promise<void>;
```

| Situation | Result |
|---|---|
| `id` exists and is the `lastSessionId` | The session rows are gone, `lastSessionId` is removed, and the call resolves. |
| `id` exists and is not the pointer | The session rows are gone, the pointer is unchanged, and the call resolves. |
| `id` doesn't exist | Nothing is removed, and the call resolves (the repo delete is a no-op). The pointer is cleared only if it equals `id`. |
| The repo delete rejects | The call rejects with that error, and `settings` is not written. |

## 2. Export helper

In `src/ui/useExport.ts`:

```ts
/** Builds the export of any stored session and saves it as a download. Never reads settings. */
export function exportSessionFile(repo: SessionRepo, sessionId: string): Promise<void>;
```

`useExportSession()` keeps its current signature and behaviour and delegates to this helper. The file name and format are unchanged (`exportFileName`, `buildExport`).

## 3. Home: session row

Each session in "Partidas" renders:

| Element | Role and accessible name | Behaviour |
|---|---|---|
| Open button (existing `.session-item`) | button, its visible text: name plus `players · N entradas` | Opens the session (unchanged). |
| Delete button | button, `Eliminar partida «{name}»`, visible text `Eliminar` | Opens the confirmation sheet for this session. Never deletes by itself. |

Layout rules:
- Both buttons are siblings inside a `.session-row` flex row, with a gap of `--space-2` or more.
- The delete button is at least `--tap` (48 px) in both dimensions.
- It uses the `danger` style, and its visible label means color is not the only cue.

## 4. Home: confirmation sheet

`Sheet` with title `¿Eliminar «{name}»?`, showing:

1. `{game.name} · {player names, comma-separated} · {entryCount} entradas` (muted).
2. `Esta acción no se puede deshacer.`
3. An optional alert line (`role="alert"`) holding one of:
   - `No se pudo eliminar la partida.`
   - `No se pudo exportar la partida.`
4. A button row: `Cancelar` · spacer · `Exportar antes` · `Eliminar` (`primary danger`).

| Input | Effect |
|---|---|
| `Cancelar`, ✕, Escape, backdrop tap | The sheet closes. Nothing is written. |
| `Exportar antes` | `exportSessionFile(sessions, id)`. The sheet stays open. On failure, the export alert shows. |
| `Eliminar` | `deleteSession(sessions, settings, id)`. On success, the sheet closes and the list and pointer reload from storage. On failure, the sheet stays open with the delete alert, and the list reloads. |
| Any button while exporting or deleting | Disabled (no double submit). |

## 5. What is not part of this contract

- No voice tool or action. Delete is not added to the voice tool specs.
- No delete entry point on the Table, History, Settings, or inside an open session.
- No bulk select and no undo.
