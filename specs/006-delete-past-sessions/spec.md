# Feature Specification: Delete Past Sessions

**Feature Branch**: `006-delete-past-sessions`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "I want to add an option to delete previous matches so they don't clutter the main screen"

## Background

The Home screen lists every session ("Partidas") stored on the device, newest first, with no limit. Each entry shows the session name, its players, and its entry count. Sessions are only ever added: by starting a new game, importing a file, or importing a copy. Over time the list fills with finished games, test sessions, and duplicate imports, and the session the player actually wants is harder to find.

Today there is no way for a player to remove a session. This feature adds one.

Deleting a whole session is not the same as deleting events inside a session. The constitution's "events are never deleted" rule (Principle I) governs the log of a session that exists. Removing a session the player no longer wants, together with its whole log, does not rewrite any game's history. It removes that game from the device.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Delete one finished session from Home (Priority: P1)

A player opens the app and sees a long list of old sessions on Home. They pick an old one, choose to delete it, and confirm. The session disappears from the list and does not come back after a reload.

**Why this priority**: This is the whole request. On its own it is enough to clean up the list one session at a time.

**Independent Test**: With three sessions stored, delete one from Home and confirm. Only two remain in the list, also after reloading the app. Opening either remaining session still works and shows its full state.

**Acceptance Scenarios**:

1. **Given** Home lists several sessions, **When** the player chooses delete on one session, **Then** a confirmation appears that names the session (name, game, players) and says the deletion cannot be undone.
2. **Given** the confirmation is showing, **When** the player confirms, **Then** the session is removed from the list right away and stays removed after a reload or app restart.
3. **Given** the confirmation is showing, **When** the player cancels or dismisses it, **Then** nothing is deleted and the list is unchanged.
4. **Given** a session was deleted, **When** the player looks at the other sessions, **Then** they are unchanged: same names, players, entry counts, and state when opened.

---

### User Story 2 - Delete the session shown under "Continuar" (Priority: P2)

The player deletes the session that Home offers to resume (the last session they had open). After deleting it, Home no longer offers to resume it.

**Why this priority**: The resume button is the most visible thing on Home. Leaving it pointing at a deleted session would be a broken state, but this is only reached when the player deletes that particular session.

**Independent Test**: Open session A, go back to Home, delete A. The "Continuar" button is gone (or does not point at A), and reloading the app does not try to reopen A.

**Acceptance Scenarios**:

1. **Given** session A is the last session and is shown under "Continuar", **When** the player deletes A, **Then** the "Continuar" button for A disappears from Home.
2. **Given** A was the last session and was deleted, **When** the app is reloaded, **Then** it opens Home normally with no error and no attempt to load A.

---

### User Story 3 - Keep a copy before deleting (Priority: P3)

Before deleting a session they might want later (for example, a finished game they want to keep a record of), the player can export it from the same place they delete it, so deleting never has to mean losing the game for good.

**Why this priority**: Export already exists inside a session. Offering it next to delete is a safety net, not a core need.

**Independent Test**: From the delete confirmation, export the session to a file, then confirm the delete. Importing that file later brings the session back with the same state.

**Acceptance Scenarios**:

1. **Given** the delete confirmation for a session is showing, **When** the player chooses to export first, **Then** the session file is saved using the existing export format and the confirmation stays open so the player can still delete or cancel.
2. **Given** a session was exported and then deleted, **When** the player imports that file, **Then** the session comes back with the same state and history.

---

### Edge Cases

- **Only one session stored**: deleting it leaves Home with no session list and no "Continuar" button, the same as a fresh install. New session and import still work.
- **Deleting a session while it is open elsewhere in the app**: delete is only offered from Home, where no session is open, so the open session is never deleted from under the player.
- **Deletion fails partway** (for example, storage error): the session either stays complete and listed, or is fully removed. A half-deleted session (listed but missing its log, or the reverse) must never be left. On failure the player sees a short message and the session stays in the list.
- **Accidental tap**: a single tap never deletes. A confirmation step is always required.
- **Very long list**: the delete control is reachable for every session in the list, not only the first few.
- **Re-importing a deleted session**: importing a file of a deleted session works as a fresh import (not as "already on this device").

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Home MUST offer a delete control for each session in the session list.
- **FR-002**: Choosing delete MUST show a confirmation that names the session (its name, game, and players) and states that the deletion is permanent. The session MUST be deleted only after the player explicitly confirms.
- **FR-003**: Cancelling or dismissing the confirmation MUST leave all sessions unchanged.
- **FR-004**: Confirming MUST remove the session and its whole history (all entries and saved snapshots) from the device, so it no longer appears on Home and cannot be opened, including after a reload or app restart.
- **FR-005**: Deleting a session MUST NOT change any other session.
- **FR-006**: A deletion MUST be all-or-nothing. If it fails, the session MUST remain complete and listed, and the player MUST see a short message saying it could not be deleted.
- **FR-007**: If the deleted session is the one Home offers to resume, Home MUST stop offering it, and the app MUST NOT try to reopen it on the next launch.
- **FR-008**: The delete confirmation MUST offer to export the session first, using the existing session export, without closing the confirmation.
- **FR-009**: The delete control MUST be reachable by touch, meet the 48 px minimum touch target, and be distinguishable from the "open session" action by more than color alone (for example, a label or icon with an accessible name such as "Eliminar partida").
- **FR-010**: The delete control MUST NOT sit where a tap meant to open a session could trigger it instead (a delete is never one accidental tap away from opening).
- **FR-011**: Deleting sessions MUST NOT be offered by voice. It is a Home-screen housekeeping action outside a game, where voice commands do not run.
- **FR-012**: The product reference (`docs/spec.md`, Home screen and Persistence sections) MUST be updated to describe session deletion.

### Key Entities

- **Session**: a game stored on the device: its name, frozen game definition, players, chip set, creation and last-update times, and entry count, plus its full history (entries and saved snapshots). Deleting a session removes all of these together.
- **Last session pointer**: the device's record of which session Home offers under "Continuar". It must never point at a deleted session in a way that breaks Home or startup.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can delete any one session from Home in at most 2 taps (choose delete, confirm) and under 10 seconds.
- **SC-002**: 100% of deleted sessions stay gone after a reload or app restart, and 0 other sessions change as a result.
- **SC-003**: 0 sessions are deleted without an explicit confirmation step.
- **SC-004**: After a simulated storage failure during delete, 100% of affected sessions are either fully present and openable or fully absent; none are partly deleted.
- **SC-005**: A session exported from the delete confirmation and then deleted can be re-imported with identical state 100% of the time.

## Assumptions

- **Delete means permanent removal from this device.** There is no backend and no trash bin. Exporting first (User Story 3) is the way to keep a copy. An "archive"/"hide" option that keeps sessions but hides them from the list is out of scope; it can be a later feature if wanted.
- **One session at a time.** Selecting several sessions to delete at once is out of scope for this feature; it can be added later if one-by-one turns out to be slow.
- **Home only.** Deletion is offered on Home, not inside an open session, so the open session can never be deleted from under the player.
- **No automatic cleanup.** The app does not delete or hide old sessions on its own (for example, by age or count).
- **Deletion is outside the event log.** It does not add events to any session and is not undoable through the in-game undo; the confirmation step and the export option are the safeguards.
- **The device's storage already supports removing a session and its history in one step** (it is used today to roll back a failed new session and a replaced import), so no new kind of storage is needed.
- **Spanish UI**, consistent with the rest of the app (for example "Eliminar partida", "Esta acción no se puede deshacer", "Exportar antes").
