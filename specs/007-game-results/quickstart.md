# Quickstart: Validating Game Results

**Feature**: [spec.md](spec.md) | **Contracts**: [domain](contracts/domain.md), [ui](contracts/ui.md) | **Data model**: [data-model.md](data-model.md)

## 1. Automated checks (no keys needed, run in CI)

```sh
npm run typecheck
npm run lint
npm test -- tests/domain/gameEnd.test.ts tests/domain/scores.test.ts tests/domain/endTriggers.test.ts tests/domain/snapshots.test.ts
npm test -- tests/games tests/persistence tests/ui/results.test.tsx tests/ui/home.test.tsx tests/ui/rotla.test.tsx
npm test -- tests/voice          # tool and prompt snapshots regenerated on purpose (endGame tool)
npm test                         # full suite
npx playwright test e2e/rotla.spec.ts
```

| Test file | Proves |
|---|---|
| `tests/domain/gameEnd.test.ts` | The FR-004 manual end and its undo. `autoEndGroups` keeps an automatic end after a reopening. A legacy RotLA definition with no `scoring` block still ends on its own (R16). The FR-005a/b reopening and its undo. The automatic end at the false→true transition (FR-001). No automatic end after a reopening until a new transition (FR-005c, US4-2). A legacy log with no end entries is finished. Later entries are counted (FR-012). Elimination order. |
| `tests/domain/scores.test.ts` | Totals = cash + shares × (price + bonus) (FR-007, SC-001). 1830 `scored` vs `eliminated` (FR-010). Shared ranks vs the RotLA tie-break (FR-009). The 21Moon East-West bonus. BoE valued on its loan track. Unpriced companies count 0. Negative values are not clamped. The last player standing wins (US2-4). |
| `tests/domain/endTriggers.test.ts` | `scheduleComplete` fires after 21Moon OR 5.3 and not after 5.2. RotLA `gameOver` results are unchanged. 1830 and 1848 never end on their own. |
| `tests/games/1830.test.ts` | A Classic bankruptcy keeps the player's cash and unsold shares (research R6). |
| `tests/games/definitions.test.ts` | Every built-in game has a verified `scoring` block. A definition without one gets the defaults and is flagged unverified (FR-011). |
| `tests/domain/snapshots.test.ts` | Snapshots carry the end status. A snapshot from before this feature is skipped and the result is identical. |
| `tests/persistence/*` | `outcome` is written in the same transaction as the entry. It survives a reload. Export → import on a fresh DB shows the same outcome (FR-018, SC-005). An old meta is backfilled. |
| `tests/ui/results.test.tsx` | End → results screen (FR-006). The winner badge, "Eliminado" and "Quiebra" are shown as text (FR-013). Reopen → cancel keeps the game finished. Reopen → confirm opens the Table (US4). The provisional heading shows before the end (FR-014). The later-entries notice shows (FR-012). |
| `tests/ui/home.test.tsx` | The "Completa" badge and winner names show (FR-015). A finished row and "Continuar" open the results (FR-016). "Ver mesa" and "Volver" work (FR-017). |

**Voice eval** (needs the user's API key, constitution gate): `npm run eval:voice` with the new "terminar la partida" cases. Report the accuracy for the default provider and model before merging.

## 2. Manual checks on a phone

Run `npm run dev`, and use a phone or a 360×740 device toolbar. Then repeat the results screen on a tablet in landscape.

1. **1830, ended by the table** (US1):
   1. Start a 1830 game and record a few SR/OR actions.
   2. Open Menú → "Clasificación". The heading reads "Clasificación provisional".
   3. Before any end condition has fired, open Menú → "Terminar partida" and confirm (3 taps; the confirmation says no condition has fired). Undo it, then break the bank: the end banner offers "Terminar partida", and banner → "Terminar" is 2 taps (SC-003).
   4. The results screen opens. Check each total against a hand count of cash plus shares × price. The rank-1 row shows "🏆 Ganador".
2. **Undo the end** (US1-6): tap "Deshacer" on the toast. The game is open again, and Home no longer shows "Completa".
3. **1830 Classic bankruptcy** (US2): declare a player bankrupt and continue to "Terminar partida". The player keeps their unsold shares, is ranked by them, and shows "Quiebra".
4. **21Moon, automatic end and elimination** (US1-1, US2-1):
   1. Bankrupt one player during the game.
   2. Play to the end of OR 5.3. The results open by themselves.
   3. The bankrupt player is last, marked "Eliminado", with no rank or total.
   4. Companies holding East-West tokens are valued at price + 50 per token.
5. **RotLA, reopen and fix** (US4):
   1. Finish a RotLA game. The results open by themselves.
   2. Tap "Reabrir partida", then Cancelar. Nothing changes.
   3. Tap "Reabrir partida" again and confirm. The Table opens, and the game doesn't end again on its own.
   4. Undo the last dividend and record it with a different amount. The game ends on its own, and the results reflect the new dividend.
   5. In History, the end, the reopening and the new end are all shown.
6. **Home** (US3):
   1. Go back to Home. The finished games show "Completa" and the winner, and unfinished games look as before.
   2. Reload the app. The markers are unchanged.
   3. Tap a finished game. The results open with the same values (SC-004). "Ver mesa" opens the Table, and "Volver" returns to Home.
   4. Make a finished game the last session. "Continuar" opens its results.
7. **Export and import** (US3-6, SC-005): export a finished game, delete it, and import the file. It shows as "Completa" with the same winner and values.
8. **Old sessions** (edge case, research R16):
   1. A RotLA session that finished before this feature: Home marks it "Completa" with the right winner after the backfill.
   2. A RotLA session still in progress from before this feature: finishing its last cycle still ends it on its own.
   3. A 1830 session from before this feature: it is not flagged as unverified, and its provisional ranking scores a bankrupt player.
9. **Entries after the end** (FR-012):
   1. On a finished game, record a money adjustment from the Table.
   2. The results values don't change.
   3. The screen says one entry exists after the end.
