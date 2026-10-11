# Quickstart: Validating Chip Inventory and Bank Setup

**Feature**: [spec.md](spec.md) | **Contracts**: [domain](contracts/domain.md), [ui](contracts/ui.md) | **Data model**: [data-model.md](data-model.md)

## 1. Automated checks (no keys needed)

```sh
npm run typecheck
npm run lint
npm test -- tests/domain/chips.test.ts tests/domain/chipSetup.test.ts
npm test -- tests/games tests/persistence tests/ui/chips.test.tsx tests/ui/chipSetup.test.tsx
npm test                         # full suite
npm run build                    # before Playwright: the :4173 preview may serve an old dist
npx playwright test e2e/a11y.spec.ts
```

| Test file | Proves |
|---|---|
| `tests/domain/chipSetup.test.ts` (new) | The contract table in [domain.md](contracts/domain.md#srcdomainmechanicschipsetupts-new): 1830 and 1848 worked examples (US3-1..3), unlimited bank (US3-4), the missing chips and their warning text (US5-1, US5-4), count 0, every count unlimited, exact totals for every game and player count (SC-002, SC-003), and the timing (SC-004). |
| `tests/domain/chips.test.ts` | Default breakdowns 287, 50, 30 and 7 (US1-2..4). Counts are ignored mid-game (US2-5, FR-013). The `chipLabel` tests are removed. |
| `tests/games/definitions.test.ts` | Every built-in `chipPreset` equals `DEFAULT_CHIPS` (FR-001, FR-004). |
| `tests/games/customGame.test.ts` | A new custom game copies the new defaults. A saved one keeps its chips (FR-003). |
| `tests/persistence/export.test.ts` | An export with labelled chips still imports. Values and colors are unchanged (SC-005). |
| `tests/ui/chips.test.tsx` | Editor rows have Valor and Cantidad but no Etiqueta (US2-1). Swapped values change the discs (US2-2). A stored label is not shown (US2-4). The toast shows the new breakdown. |
| `tests/persistence/*` | `bankPins` survives a reload and an export → import. An export without it imports with no pins (FR-022d). |
| `tests/ui/chipSetup.test.tsx` (new) | New session: plan and warning, live update on count, player and option changes (US5-2, FR-024), "Empezar" still enabled. Bank steppers: + on green pins it and red refills (US3-6). "Restablecer" (US3-8). The "de más" warning (US3-9). No steppers for an unlimited bank. Pins reach the start notice and the chips sheet (US3-7). Table: start notice with "Cada jugador" and "Banco", gone after "Entendido" or the first action (US4). Chips sheet: "Preparación" with the warning (US3-5, US5-3). "Volver al juego" on an old session restores the new defaults. |

Voice is unaffected, so there is no eval run.

## 2. Manual check (phone, `npm run dev`)

1. **Defaults (US1)**: New game → 1830 with 4 players. "Fichas" shows 500 · 100 · 25 · 5 · 1 in
   green, red, black, blue and white. Open "Editar": each row shows color, Valor and Cantidad
   (50, 150, 50, 100, 150), with no Etiqueta.
2. **Plan (US3)**: Below the chips, "Cada jugador $600" shows 1×500 and 1×100. "Banco $9.600"
   shows 77×100, 50×25, 100×5 and 150×1. "Apartadas" shows 46×500 and 69×100.
3. **Adjust the bank (US3-6, US3-8, US3-9)**: In the "Banco" rows, tap + on green 6 times.
   Green shows 6 and "fijada", red drops to 47, and the bank still totals $9.600. Type 20 in
   green: the warning says "El banco tiene $400 de más". Tap "Restablecer": the suggestion
   returns.
4. **Warning (US5)**: Make sure no bank row says "fijada" (tap "Restablecer" if one does). In
   the chip editor ("Fichas" → "Editar"), not in the "Banco" rows, set **Cantidad** of green to
   10 and of red to 10. The warning shows "Faltan 8 fichas verdes (500), 1 roja (100)", and the
   bank row marks those chips as "faltan". Change green's **Cantidad** to 50: the warning goes
   away at once.
5. **Start anyway (FR-025)**: In the chip editor, change green's **Cantidad** from 50 to 10 again
   so the warning comes back, then tap "Empezar". The table shows "Fichas iniciales" with "Cada
   jugador" and "Banco", and the missing chips are marked. Tap "Entendido".
6. **Reopen and adjust mid-game (US3-5, US3-7, US5-3)**: Menu → "Fichas". "Preparación" shows
   the same plan and warning. In the chip editor, set green's **Cantidad** to 50 and red's to 150 (the warning goes away). Then, in the
   "Banco" rows, tap + on green until it shows 6, and tap "Guardar". Reload the app and open
   "Fichas" again: green is still pinned at 6 and red is 47.
7. **Mid-game (US2-5)**: Tap a player → "Cobrar del banco" → 2000 → "Cobrar". The toast (the
   notice with "Deshacer") shows "El banco paga a {player} $2.000:" followed by one green disc
   labelled 4×500, even though the bank is pinned at 6 greens.
8. **Unlimited bank**: New game → 21Moon with 3 players. "Cada jugador $540" shows 1×500, 1×25
   and 3×5. The bank row lists every remaining chip and has no steppers.
9. **Dark mode**: Switch the phone to dark mode. Black discs have a visible ring. On a light
   background, white discs do too.
10. **Old session (FR-003)**: Open a session from before the update. Its chips are unchanged and
    any label shows as the value. "Volver al juego" loads the five new chips.
