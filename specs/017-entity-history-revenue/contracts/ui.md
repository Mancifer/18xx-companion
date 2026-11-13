# Contract: UI

## Entry points

| Where | Control | Action |
|---|---|---|
| Player sheet (via `HolderSheet` actions) | "Historial" / "History" | `go({ name: "history", subject: { kind: "player", id }, back: { name: "table", reopen: { kind: "player", id } } })` |
| Company sheet (via `HolderSheet` actions) | "Historial" / "History" | the same, with `kind: "company"` |

Both buttons sit in the sheet's action row and are at least 48 px tall (FR-020). They are shown in
finished sessions too (read-only).

## History screen, filtered (`subject` set)

- **Title**:
  - player: "Historial · Ana";
  - company: "Historial · " plus the badge and name (FR-007).
- **Top bar**: back (→ `back ?? { name: "table" }`) and Export, unchanged.
- **List**:
  - involved groups only, in the full view's round sections;
  - empty sections are left out;
  - undone entries are marked "deshecha" and struck through, as today.
- **Empty**: "No hay movimientos de <subject> todavía." / "Nothing involving <subject> yet."
  (FR-009).
- **No undo** (FR-008, SC-007):
  - no "Deshacer" on any row;
  - no "Deshacer hasta acá" in any panel;
  - no `UndoToast`;
  - the invariant banner still shows.
- **Panel**: the breakdown via `focusBreakdown`. The subject's lines come first with the
  `.history-mine` class (bold plus a marker). Then the transcript, the warnings, and "Ver en el
  historial completo".
- **"Ver en el historial completo"** → `go({ name: "history", focus: groupId, back: <this screen> })`.

## History screen, full (`subject` unset)

- Unchanged, plus:
  - with `focus`, the matching item opens expanded and is scrolled into view on mount;
  - the back arrow uses `back` when set (US4 #3), otherwise goes to the table.

## Table

- `reopen` reopens the player or company sheet on mount.
- **Company card**: when the display rules in data-model §6 hold, the trains row also shows
  "Última corrida <amount>" / "Last run <amount>". It uses `data-testid="last-run-<id>"` and the
  `.money` class. The row now renders when the company has trains, loans or a last run. On large
  screens the label is named, as with trains (feature 016).

## Company sheet

- In the info block, below the price line: "Última corrida: 160 · repartió · OR 2.1". In 21Moon
  it is followed by one line per part ("Local 80 · Puerto espacial 40"). Not shown when the
  display rules do not hold.

## Text (es / en)

| Key | es | en |
|---|---|---|
| sheet button | Historial | History |
| filtered title | Historial · {subject} | History · {subject} |
| empty | No hay movimientos de {subject} todavía. | Nothing involving {subject} yet. |
| show in full | Ver en el historial completo | Show in full history |
| card label | Última corrida | Last run |
| mode full / withhold / half | repartió / retuvo / mitad | paid out / withheld / half |

The Spanish follows Uruguayan usage (memory: user region). `englishLeak` and `spanishGolden`
tests must cover the new keys.

## Tests

| Test file | What it covers |
|---|---|
| `tests/ui/history.test.tsx` (extend) | Filtered list and empty state; no undo controls; "Ver en el historial completo" focuses the entry; back returns to the filtered view, then to the table with the sheet reopened |
| `tests/ui/playerSheet.test.tsx` (extend) | The "Historial" button navigates with the player subject |
| `tests/ui/companyCard.test.tsx` (new) or `operate.test.tsx` | Last run on the card after a run, hidden before the first run, 0 shown, gone after undo, hidden when closed |
| `tests/ui/rotla.test.tsx` (extend) | Merged major shows no last run until it runs |
| `e2e/` (one spec) | Tile → sheet → Historial → entry → full history, on phone portrait |
