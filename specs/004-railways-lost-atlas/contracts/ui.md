# Contract: UI (feature 004)

All UI text is Spanish; company names stay in English. Every new control has a touch target of at least 48 px, and company color always comes with its short name (constitution V). Layouts must work on phone portrait and on tablet landscape.

## New Session (US1)

- Picking RotLA shows the options as selects: Modo, Expansión, Variantes (one row each).
- **Modo**: changing it updates the starting-cash preview per player and the train-stack preview ("2×7 · 3×5 · 4×4 · 5×3 · 6×2 · 7/∞").
- **Minors en juego**: a checklist of the mode's minors with a counter ("8 de 12"). It shows a warning when the count differs from the mode's expected size.
- **Player count outside the mode's `recommendedPlayers`**: a yellow warning ("El juego corto es para 2–4 jugadores"). Starting is never blocked (US1-2).

## Round indicator

- Format: "Ciclo 2 · RO 1/2", "Ciclo 3 · RF" (Merger Round), "Ciclo 1 · RA".
- When the definition has fixed cycles, the remaining cycle count is shown ("de 6").

## Round controls on the Table (replace the SR/OR buttons for this game)

| State | Primary button | Secondary |
|---|---|---|
| SR | "Empezar RO 1" (`startOR`) | none |
| OR 1 done | "Empezar RO 2" | none |
| OR 2 done, merger due | "Ronda de fusiones" (`startMR`) | none |
| OR 2 done, no merger, not last cycle | "Exportar y nueva RA" (`startSR`), with the export preview as a subtitle ("Sale un 2 · quedan 3×3") | none |
| MR | "Exportar y nueva RA" | "Fusionar…" |
| Last cycle complete | "Ver puntuación" | none |

This is one tap per transition, the same as feature 003.

## Launch sheet (US2): from a minor's card in the SR, or from "Abrir minor"

- **Fields**: player (chips), minor (only those in play and unstarted), bid (keypad with steps of 5, prefilled with 120).
- **Live preview**: "Precio ₳70 · Tesorería ₳140 · 3 acciones en tesorería". If the price was capped, it shows a chip "Tope de fase ₳90", and tapping the price lets the table override it.
- **Confirm**: one tap. Total: open the sheet, enter the bid, confirm (SC-004 counts the bid entry as data, not a tap).
- **Chip breakdown** of what the player hands over, as in the existing confirmation card.

## Operate sheet additions (US5, US6, US11)

- **Issue and redeem**: two chips, "Emitir" and "Recomprar", each one tap. They are shown only when the game defines the matching move rule.
- **Ability chips** from effective traits:
  - "Montaña (−40 / +60)" for Tunneling: one `namedPayment`, one History entry
  - "Ficha extra (−40)" for Expansive
  - "Sede (+…)" for Headquarters, which opens the keypad
- **Landmarks chips** (expansion only): "Formación rocosa (+2)", "Acantilado", "Cañón". A chip is disabled, with a "Ya usada" label, once its counter is set; a long press still allows a repeat, which shows a warning.
- **Train purchase**: 7/∞ shows two prices (7: ₳750, ∞: ₳1.000) plus "∞ entregando…", which lists the company's non-rusted trains.
- **Forced purchase**: when the company has no train and its treasury is below the cheapest train, the purchase card says "Compra forzada". It names the president and shows their contribution, their cash, the proceeds of the sales so far and what is still missing. Below that it lists every share the president holds (company, percentage, current price), each with a −/+ count to sell that starts at 0 and stops at what they hold. The table sets the counts before confirming. If the president holds no shares, the card says so.
- **Over-limit banner**: on the Table and in the Operate sheet. It lists the companies over their limit; tapping one opens "Elegir tren al pool".
- **Resourceful trains**: rusted trains show an "Oxidado · última carrera" tag and a "Retirar" button.

## Merger sheet (US7)

1. Pick minor A, then minor B. The list is in operating order, minors only.
2. Pick the major (unstarted majors only). Each major shows both identity names as a toggle.
3. **Preview**:
   - the new president, with a "desempate por orden" tag when a tie was broken
   - per-player shares
   - the price, treasury and trains
   - an over-limit flag
4. Confirm. At most 3 taps after the minors are chosen (SC-003).

## Market screen

- `shape: "1d"` renders as a horizontal strip of 27 cells, wrapping to rows on phones. The cell for 0 is labeled "Cerrada".
- Stacked tokens are listed top to bottom inside the cell.
- The current phase's launch range is highlighted.

## Trains view

- The stack is shown top first, with remaining counts ("7/∞: ∞").
- The current phase's minor and major limits ("Límite: minor 2 · major 3").

## Score sheet (US8, US9; research R12)

- One row per player: cash, shares value, total, and rank. A tie shows "desempate: presidente de X".
- It opens automatically when the game ends (`cyclesComplete`, Bank Break, or a bankruptcy with Bank Break).
- It is also reachable from the menu ("Puntuación"). It is read-only.

## History

- `mergeCompanies` is one entry. Expanded, it lists every share, money and train transfer (US7-7).
- An export appears inside the `startSR` entry: "Exportado: 3 → fase verde; se oxidan …".
