# Quickstart: Validating Reliable Play History

**Feature**: [spec.md](spec.md) | **Contracts**: [contracts/](contracts/) | **Data model**: [data-model.md](data-model.md)

## Prerequisites

- Node 22, then `npm install`.
- For the eval (§5): a Gemini API key in the environment, as for feature 009.
- Before any local Playwright run, run `npm run build`. A stale `:4173` preview server can serve an old `dist`.

## 1. Automated gates

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all pass. The checks that matter for this feature:

| Area | Proves |
|---|---|
| RotLA stale-market regression (issue → run and pay out → undo back to the issue) | Price back at 80; treasury and player cash equal the pre-issue values (SC-002) |
| 1830 sell → payout → `undoTo(sell)` | Price equals the pre-sell price |
| Randomized undo walk over 1830, 1848, 21Moon and RotLA | After each `undoLast` / `undoTo`, state deep-equals the state captured before that entry (SC-001) |
| `undoTo` without `confirmed` | Returns `confirmRange` with count, oldest and newest; the log is unchanged (FR-003) |
| Breakdown conservation | For every group in random games, the money movements per holder sum to that holder's balance delta (FR-016) |
| Payout breakdown | One money line per recipient (players, the company's own shares, pool where the game pays it); balances match a hand calculation (FR-012) |
| Summary amounts | Every action type with one money flow shows its amount in the summary (FR-014) |
| Legacy log | A log with out-of-order `revert` and `amend` entries replays to the same state as before; an amended group undone with `undoLast` becomes reverted as a whole (FR-018) |
| Export v2 round trip | Entries, statuses and state hash are preserved; v1 files still import (FR-019) |
| Perf | `undoTo` back to the first group of a 300-group game completes within budget (SC-004) |
| Voice resolve | `undo` with an older id gives `undoTo`; an unknown id gives `notUnderstood`; `amendLast` gives `notUnderstood` with the undo instruction |

## 2. Manual: undo in order (US1)

1. `npm run dev`. Create a RotLA game with 3 players.
2. Launch TUN and EXP, start the OR, issue 1 TUN share (price 80 → 70), then run TUN for 50 and pay out.
3. Tap "Deshacer" in the toast, then open History and tap "Deshacer" on the newest entry.
4. **Expected**: TUN at 80. Treasury and player cash equal the values before the issue. No confirmation was asked.
5. **Expected**: no older entry shows a "Deshacer" button. They show "Deshacer hasta acá" only when expanded.

## 3. Manual: undo back to here (US2)

1. Play 10 actions in any game.
2. In History, expand the 4th entry from the oldest, then tap "Deshacer hasta acá".
3. **Expected**: the sheet "¿Deshacer 7 entradas?" names the 4th entry as "Desde" and the 10th as "Hasta".
4. Tap "Cancelar". **Expected**: nothing changed.
5. Repeat and tap "Deshacer 7". **Expected**: the state equals the state before the 4th action, and entries 4 to 10 show "deshecha" with their breakdown still expandable.
6. The toast reads "Deshechas 7 entradas: desde … hasta …".
7. On the setup entry, **expected**: no undo action.
8. SC-004 on a real device: on the phone the table plays on (the reference mid-range device for SC-004), import or play a session with about 300 entries and undo back to the first non-setup entry. **Expected**: the updated state and History are on screen in under 2 s, timed from the "Deshacer N" tap.

## 4. Manual: breakdown (US3)

1. In 1830, have a company with shares held by 2 players, 1 in the pool and 1 in its own treasury pay out.
2. Expand the entry. **Expected**:
   - The summary shows the total and the per-share amount.
   - Movimientos lists one money line per recipient.
   - Saldos shows each player's and the company's before → after.
   - The price line shows the old and new price.
3. Set a player's money to a fixed amount. **Expected**: the summary shows the difference, and Saldos shows "previous → new (±diff)" with the bank as the other side.
4. In an unlimited-bank game, **expected**: the bank shows only the amount moved.

## 5. Voice (US2-5, FR-008)

1. Regenerate the eval fixtures, then run the eval on the default model with cache on:

   ```bash
   npx tsx eval/voice/buildFixtures.ts
   npm run eval:voice -- --cache on
   ```

   **Expected**: the new undo-to cases pass, and overall accuracy does not regress from the 2026-10-11 baseline.
2. In the app, say "deshacé hasta la compra del tren de la EXP". **Expected**: the same range sheet as touch, with the transcript shown.
3. Say "no, eran 260". **Expected**: "Para corregir, deshacé hasta esa entrada y volvé a anotarla." Nothing changes.

## 6. Older sessions (FR-018, SC-006)

1. Before switching branches, export a session that has an undone entry and a corrected entry, or use the legacy fixture in tests.
2. On this branch, open it and import it. **Expected**:
   - It loads with the same state.
   - The corrected entry shows "corregida" with its latest version.
   - "Deshacer" works on the newest entry.
   - Every entry expands to a breakdown.
