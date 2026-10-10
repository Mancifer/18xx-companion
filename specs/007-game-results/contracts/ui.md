# Contract: Results Screen, Table Controls, Home Rows, Voice

**Feature**: [spec.md](../spec.md) | **Domain contract**: [domain.md](domain.md) | **Research**: [research.md](../research.md) R11–R13

All visible text is in Spanish (Uruguayan wording, as in the rest of the app).

## 1. Results screen (`src/ui/screens/Results.tsx`, new)

`Screen = { name: "results", from: "table" | "home" }`. It needs an open session.

| Element | Finished game | Open game (provisional) |
|---|---|---|
| Heading | "Resultados" | "Clasificación provisional" |
| Subtitle | `{game} · terminó {date}` plus "automático" or the fired conditions | "La partida no terminó todavía." |
| Later-entries notice | N = 1: "Hay 1 entrada posterior al final que no cuenta en esta clasificación."; N > 1: "Hay N entradas posteriores al final que no cuentan en esta clasificación." | — |
| Values | `finalResults(…, gameEnd.end.state, gameEnd.end.eliminationOrder)` (frozen) | From the live state and the live `eliminationOrder` |

**Ranking table** (`<table className="score-table">`): Puesto, Jugador, Dinero, Acciones, Total.

| Row kind | Puesto | Total | Marker (text, not only color) |
|---|---|---|---|
| Winner (rank 1) | 1 (or "=1" when shared) | money | "🏆 Ganador" badge, part of the row's accessible text |
| Ranked | n (or "=n") | money | — |
| Scored bankrupt (1830) | n | money | "Quiebra" badge |
| Eliminated | — | — | "Eliminado" in the total cell |

Tie-break notes stay as they are today: `{name} · desempate: presidente de {short}`. Negative values are shown with their sign.

**Actions** (each button is at least 48 px):

| Button | Shown | Effect |
|---|---|---|
| "Volver" | always | `from: "home"`: closes the session and goes to Home. `from: "table"`: goes to the Table. |
| "Ver mesa" | when `from: "home"` | Goes to the Table. |
| "Reabrir partida" | finished only | Opens a confirmation Sheet. |

The confirmation Sheet is titled "¿Reabrir la partida?" and says "La partida deja de estar completa y se pueden registrar o corregir entradas. El final queda en el historial."
- **Cancelar**, ✕ or the backdrop: nothing changes (US4-5).
- **Reabrir**: dispatches `reopenGame`, then goes to the Table. On failure, it shows the store's message and stays.

After an end recorded in this visit, the screen shows `UndoToast` for the end group (FR-004, one tap).

## 2. Table (`src/ui/screens/Table.tsx`)

| Where | Element | Behavior |
|---|---|---|
| End banner (end triggers fired, game open) | "Terminar partida" button, `primary` | Opens the end confirmation. |
| Menu | "Terminar partida" (open game) | Opens the end confirmation. |
| Menu | "Clasificación" (every game; replaces RotLA-only "Puntuación") | Goes to `results` with `from: "table"`: provisional, or final when finished. |
| Menu | "Resultados" (finished game) | Same as above. |
| RotLA `CycleControls` after the last cycle | "Terminar partida" when open, "Ver resultados" when finished | Confirmation, or results. |
| Bankruptcy confirm (`scoreAfter`) | next step "Terminar partida" | Opens the end confirmation. |

**End confirmation** (`ConfirmSheet`), titled "¿Terminar la partida?":
- **Body**: the fired conditions as a list, or "Todavía no se cumplió ninguna condición de fin de partida."
- **Confirm button**: "Terminar", which dispatches `{ type: "endGame", triggers: null }`.

**Tap counts** (SC-003): once a condition has fired, banner "Terminar partida" → "Terminar" is 2 taps. Before that, Menú → "Terminar partida" → "Terminar" is 3 taps, which is accepted because it isn't a common action.

**Auto-navigation**: when `gameEnd.end?.groupId` changes to a new non-null value while the Table is shown (an automatic end, a confirmed `endGame`, or a voice `endGame` on a game that was already finished), the Table goes to `results` with `from: "table"`. Opening the Table of a game that is already finished doesn't navigate. This replaces the `scoreShown` logic. `ScoreSheet.tsx` is deleted.

**Finished game on the Table**: a non-blocking banner, "Partida completa · Ver resultados". Entries are still allowed (Principle III).

## 3. Home (`src/ui/screens/Home.tsx`)

| Session state | Row content | Tap on the row | "Continuar" |
|---|---|---|---|
| `outcome` object | name, a "Completa" badge (text), "Ganó {names}" (shared: "Ganaron A y B"), players · entries | opens the session, then `results` (`from: "home"`) | same as the row |
| `outcome: null` | as today | opens the Table | Table |
| no `outcome` key (older session) | as today until the backfill finishes, then re-rendered | by the value after the backfill | same |

The "Eliminar" button and flow are unchanged.

## 4. History (`src/ui/screens/History.tsx`, `src/domain/i18n/es.ts`)

- `endGame`: "Fin de la partida", plus "(sin condición de fin)" or the condition list.
- `reopenGame`: "Partida reabierta".
- Every group in `autoEndGroups` gets a "Fin de la partida (automático)" tag, including one whose end was later reopened. A reopened game's History therefore shows the end, the reopening and any new end (US4-3).

## 5. Voice (`src/voice/tools.ts`, `src/voice/prompt.ts`)

- `endGame` is added to `ACTION_TOOLS`. Its description is "Terminar la partida (fin del juego). Sin argumentos." Its tool input schema has no fields, because the expander sets `triggers: null`.
- The confirmation card summary is "Terminar la partida", plus the fired conditions.
- `reopenGame` isn't a voice tool.
- These snapshots are regenerated: `tests/voice/__snapshots__/tools-*.json` and `prompt-*.txt`.
- Eval cases are added to `eval/voice/cases.jsonl`: "terminamos la partida", "fin del juego", "damos por terminada la partida".
