# Implementation Plan: Delete Past Sessions

**Branch**: `006-delete-past-sessions` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-delete-past-sessions/spec.md`

## Summary

Players can remove old sessions from the Home list ("Partidas") so it stops filling up. Each session row gets its own "Eliminar" button. Tapping it opens a confirmation sheet that:
- names the session, its game and its players;
- warns that the delete can't be undone;
- offers "Exportar antes".

Confirming removes the session and its whole history, and stops "Continuar" from pointing at it.

The storage side already exists. `SessionRepo.deleteSession` removes the meta, entries and snapshots in one strict IndexedDB transaction, and the code already uses it for import replace and for the `startSession` rollback. The work is:

1. **App function** ([R3](research.md#r3-one-delete-operation-that-also-clears-the-pointer)): `deleteSession(repo, settings, id)` in `src/app/sessions.ts`. It deletes the session, then clears `lastSessionId` if that pointer was the deleted session.
2. **Export of any session** ([R4](research.md#r4-exporting-from-home-without-opening-the-session)): `exportSessionFile(repo, id)` is pulled out of `useExportSession`, so Home can export a session without opening it. Format and behaviour are unchanged.
3. **Home UI** ([R1](research.md#r1-where-the-delete-control-goes-on-home), [R2](research.md#r2-the-confirmation-dialog), [R5](research.md#r5-when-an-export-or-a-delete-fails), [R6](research.md#r6-keeping-the-list-in-sync-after-a-delete)): a two-button `.session-row`, plus a `Sheet` confirmation with Cancelar / Exportar antes / Eliminar. Error lines show if something fails, buttons are disabled while work runs, and the list reloads from storage afterwards.
4. **Docs**: `docs/spec.md` §9.1 (Home) and §10 (Persistence).

There is no new dependency, store, field, event, action or voice tool, and the DB version stays the same.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022

**Primary Dependencies**: react 19, idb 8 (existing). No new dependency.

**Storage**: IndexedDB, with the existing stores `sessions`, `entries`, `snapshots` and `settings`. Rows are deleted only, and there is no schema or version change ([data-model.md](data-model.md)).

**Testing**: Vitest with fake-indexeddb (persistence and app units), Testing Library (Home UI on the real `App`). The Playwright e2e and voice eval are unaffected.

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus desktop browsers.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: A delete takes 2 taps and finishes in under 10 s (SC-001). In practice the IndexedDB delete of a session with about 1,000 entries takes tens of milliseconds.

**Constraints**:
- The delete is all-or-nothing (FR-006).
- Delete is offered only on Home and never by voice (FR-011).
- Touch targets are at least 48 px, and color is never the only cue (FR-009).
- The UI text is Spanish.

**Scale/Scope**:
- 3 source files changed: `Home.tsx`, `sessions.ts`, `useExport.ts`.
- 1 CSS rule added (`.session-row`).
- 1 existing test file extended and 2 new test files.
- 1 docs file updated.

**Unknowns**: none. Every design choice is recorded in [research.md](research.md) (R1–R8).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Constitution v1.1.0.

| Principle / Rule | Status | Notes |
|---|---|---|
| I. Event-Sourced Ledger | ✅ | No session's log is edited. A delete removes a whole session (log, snapshots and meta) and appends to none. "Never deleted or rewritten" governs the events of a session that exists. Removing a game the player no longer wants rewrites no history ([spec Background](spec.md#background), [R8](research.md#r8-voice-and-the-rest-of-the-app)). No open `SessionStore` can refer to a deleted session, because delete exists only on Home. |
| II. Money Is Conserved | ✅ | Untouched. No reduce, and no money or shares move. |
| III. Rules as Data | ✅ | No game logic or game definitions are involved. Custom games in `games` are kept. |
| IV. Propose, Confirm, Undo | ✅ (n/a for undo) | This is not an in-game action, so in-game undo doesn't apply. It follows the principle's intent: an explicit confirmation sheet, with export as the way back ([spec Assumptions](spec.md#assumptions)). No AI is involved. |
| V. Voice and Touch Parity | ✅ | This is a touch-only housekeeping action outside a game, where voice doesn't run (FR-011). It is not a game capability voice would need. It takes 2 taps (SC-001). The delete button is at least 48 px, has the visible label "Eliminar" and an accessible name, and color is not the only cue ([R1](research.md#r1-where-the-delete-control-goes-on-home)). |
| VI. Test-First | ✅ | This isn't domain logic, but `deleteSession`, the repo isolation and the Home flow are still written test-first ([R7](research.md#r7-tests)). No voice change, so no eval re-run is needed. |
| VII. Local-First Simplicity | ✅ | Device-only, with no backend. The export helper never reads settings or keys (FR-092). No archive, trash or bulk delete is built ahead of need. |
| Platform: new dependencies | ✅ | None. |
| Workflow: `docs/spec.md` | ✅ | Planned: §9.1 Home and §10 Persistence (FR-012). |

**Post-design re-check (after Phase 1)**: still all ✅. The design adds one app function, one extracted helper and UI. It adds no store, field, event or code path that changes a session's state, and the reviewer check "no code path changes state outside the event pipeline" holds. Removing a session isn't a state change within any session.

## Project Structure

### Documentation (this feature)

```text
specs/006-delete-past-sessions/
├── plan.md                    # This file
├── research.md                # Phase 0: R1–R8
├── data-model.md              # Phase 1: rows a delete touches, rules, row states
├── quickstart.md              # Phase 1: automated and manual validation
├── contracts/
│   └── home-delete-ui.md      # deleteSession, exportSessionFile, Home row and sheet
├── checklists/
│   └── requirements.md        # from /speckit-specify
└── tasks.md                   # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/
├── app/
│   └── sessions.ts            # + deleteSession(repo, settings, id)
├── persistence/
│   └── sessionRepo.ts         # unchanged (deleteSession already atomic)
└── ui/
    ├── useExport.ts           # + exportSessionFile(repo, id); useExportSession delegates
    ├── screens/
    │   └── Home.tsx           # session rows with "Eliminar", confirmation Sheet, reload()
    └── styles/
        └── components.css     # + .session-row (flex, gap, delete button ≥ --tap)

tests/
├── persistence/
│   └── sessionRepo.test.ts    # + deleteSession isolation / re-import as new
├── app/
│   └── sessions.test.ts       # new: pointer clearing, failure leaves pointer
└── ui/
    └── home.test.tsx          # new: row button, cancel paths, confirm, Continuar, export, failure

docs/
└── spec.md                    # §9.1 Home, §10 Persistence
```

**Structure Decision**: This is the existing single-project PWA layout. The delete logic lives in `src/app/sessions.ts`, next to `startSession`: it is app orchestration across two repos, testable without the UI. The UI lives in the Home screen that already owns the session list.

## Complexity Tracking

There are no constitution violations to justify.
