# Data Model: Delete Past Sessions

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This feature adds **no new stores, fields, events or DB version**. It only removes rows that already exist. This page lists what a delete touches and the rules it must keep.

## 1. Stored data affected by a delete

| IndexedDB store | Key | Rows removed for session `id` | Owner |
|---|---|---|---|
| `sessions` | `id` | The one `SessionMeta` row, which holds the name, frozen game, options, players, wallet mode, chip set, timestamps and entryCount | `SessionRepo` |
| `entries` | `[sessionId, seq]`, index `bySession` | Every log entry of the session | `SessionRepo` |
| `snapshots` | `[sessionId, seq]`, index `bySession` | Every snapshot of the session | `SessionRepo` |
| `settings` | `key` | The `lastSessionId` row, **only if** its value is `id` | `SettingsRepo` |

These stores are **not touched**:
- `games` (custom game definitions). A session embeds its own frozen copy of its game, so a custom game stays after the sessions that used it are deleted.
- Every other `settings` row.
- Every row of any other session.

## 2. Rules

- **Atomic (FR-006)**: the `sessions`, `entries` and `snapshots` rows go in one `readwrite` transaction with `durability: "strict"` (the existing `SessionRepo.deleteSession`). Either all of them are gone, or none are.
- **Isolated (FR-005)**: rows are selected by session id only, through the meta key and the `bySession` index.
- **Pointer after delete (FR-007)**: the pointer is cleared only after the session transaction has committed, and only if it equals `id`. If clearing it fails, the leftover pointer refers to a missing session, which Home already ignores (see [research R3](research.md#r3-one-delete-operation-that-also-clears-the-pointer)).
- **No log entry**: a delete appends nothing to any session's log, and nothing about it is stored after it finishes.
- **Re-import**: once a session is deleted, `loadSession(id)` returns `undefined`. Importing its file then follows the "not on this device" path (spec edge case).

## 3. State of a session row on Home

A delete moves one row through these states:

```text
listed ──tap "Eliminar"──▶ confirming ──"Cancelar" / ✕ / Esc / backdrop──▶ listed
                              │  ▲
                 "Exportar antes"│  │ export done or failed (message shown)
                              ▼  │
                           exporting
                              │
                         "Eliminar"
                              ▼
                           deleting ──ok──▶ gone (sheet closes, list reloads)
                              │
                            error ──▶ confirming + "No se pudo eliminar la partida."
```

- While the row is in `exporting` or `deleting`, the sheet's buttons are disabled.
- Only one row can be in a non-`listed` state at a time, because there is one sheet.
