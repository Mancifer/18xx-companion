# Contract: Income summary UI

## 1. Entry points (`src/ui/screens/Table.tsx`)

- `Open` gains `{ kind: "income" }`.
- `const phase = useMemo(() => operatingPhase(meta.game, meta.players, effective, state), [meta.game, meta.players, effective, state])`.

| Where | Shown when | Looks | Taps |
|---|---|---|---|
| `round-controls`, first button | `phase !== null` | "Ingresos de las ORs". Gets the `primary` class when `phase.over` | 1 |
| Menu sheet, `choice-grid` | `phase !== null` | "Ingresos de las ORs" | 2 |

When `phase === null`, neither button is rendered (FR-008). No other control changes: "Empezar
ronda de acciones", RotLA's `CycleControls` and "Ronda de fusiones" keep their behavior and
their own `primary` state (FR-010).

## 2. `IncomeSheet` (`src/ui/sheets/IncomeSheet.tsx`, new)

Props: `{ onClose: () => void }`. It reads `useSession()` and computes the same memoized
`operatingPhase`. If that is `null` (for example, an undo while the sheet is open), the sheet
closes itself.

Layout, top to bottom:

1. **Header**:
   - the `Sheet` title "Ingresos de las ORs";
   - a subtitle `INCOME_ES.since(firstOR)`;
   - the rule text `INCOME_ES.rule` (FR-011).
2. **All settled**: when every non-`out` player has `delta === 0`, the line
   `INCOME_ES.allSettled`.
3. **One card per player** in seat order. The card carries the only border. Inside it, a
   borderless button covers the whole card, toggles the movements, has `aria-expanded`, and is
   at least 48 px tall. Top to bottom, it shows:
   - **Head line**: the player's name on the left (with their color dot, paired with the name,
     never color alone) and the amount on the right, as a small tinted pill. The pill holds the
     direction text in words with its glyph: "↑ Cobra del banco $X" (`take`), "↓ Paga al banco $X"
     (`pay`) or "Nada que liquidar" (`none`, plain muted text) (data-model §2). The green and red
     tints are extra cues, not the only cue (FR-003).
   - **Chips**: `ChipDiscs` for `breakdown(meta.chipSet, |delta|)` when `delta !== 0` (FR-004).
     If there is no exact change, it shows "no hay cambio exacto", as `ChipStrip` does.
   - **Footnote**: "Al empezar $A → Ahora $B" in small muted text, with a ▾/▴ expand hint on the
     right.
   - **For an `out` player**: a card that is not a button, with the name and `INCOME_ES.out` in
     the amount position. It has no amount, no chips, no footnote and nothing to expand (FR-012).
4. **Expanded movements** (US3): inside the same card, below a divider. Headings `orHeading` in
   phase order. Under each heading, one line per movement: `summaryEs(action, ctx)` and the
   signed amount (`+$240` / `−$300`). The line count matches the movements. Their sum matches the
   card's amount (G1).

Nothing in the sheet dispatches an action (FR-006).

## 3. Styles (`src/ui/styles/components.css`)

- `.income-card`: the player's card (border, radius, surface background). It is the only
  bordered element, so there is no box inside a box.
- `.income-summary`: the card's content, with even padding on every side so the chips keep
  their distance from the edge, and a minimum height of 48 px. `button.income-toggle` removes
  the base button border and background.
- `.income-head`: the head line, with the name left and the amount right. It wraps on narrow
  screens.
- `.income-amount`: the pill. `.income-take` is `--ok` text on `--ok-bg`, `.income-pay` is
  `--danger` text on `--danger-bg`, and `.income-amount--none` is plain muted text.
- `.income-balances`: the muted "Al empezar → Ahora" footnote, with the expand hint.
- `.income-movements`: the expanded list inside the card, below a divider. Its OR headings
  (`.income-or`) use the muted heading style, and the amounts are right-aligned.
- `--ok-bg` (in `src/ui/styles/tokens.css`, light and dark): the soft green behind the
  "Cobra del banco" pill, next to the existing `--danger-bg`.
- The layout works in phone portrait (single column) and tablet landscape (the sheet's normal
  width) (FR-015).

## 4. Tests (`tests/ui/income.test.tsx`, new)

- **Button visibility**: no button before the first OR; the button appears after `startOR`; it
  is not primary mid-OR; it is primary when the phase is over; it is gone after `startSR`; it
  comes back after undoing `startSR`.
- **Menu**: the menu entry appears only in a phase.
- **US2**: a player with +200 in dividends who then contributes 300 shows "Paga al banco $100"
  and the chips for 100.
- **US3**: expanding a row lists the movements under "OR x.y" headings, and the amounts sum to
  the row.
- **FR-012**: a bankrupt player shows "Fuera de la partida".
- **Empty state**: with no money changes, the sheet shows "Nadie tiene nada que liquidar."
