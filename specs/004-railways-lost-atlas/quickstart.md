# Quickstart: Validating Railways of the Lost Atlas

**Feature**: [spec.md](spec.md) · [data-model](data-model.md) · Contracts: [actions](contracts/actions.md), [game definition](contracts/game-definition.md), [ui](contracts/ui.md)

## Prerequisites

```sh
npm install
npm run typecheck && npm run lint && npm test   # must pass before and after
npm run eval:voice                              # needs an API key; compare with the last report
npm run dev                                     # for the manual checks
```

## Automated checks

Each row is a test written before its code (constitution VI). The file names are the planned locations.

| Scenario | Where | Expected result |
|---|---|---|
| Definition parses and validates; each `mode` × player count gives the FR-005 train stack (Long 3p: 7/5/4/3/2/7∞; Long 4p: 7/6/4/3/3/7∞; Short 2p: 6/4/3/2/1/7∞; Micro 2p: 3/3/3) | `tests/games/rotla.test.ts` | `validateDefinition` ok. Asset counts match. |
| Starting cash per mode and player count (US1) | `tests/games/rotla.test.ts` | 3p Long: 300 each. 2p Short: 450. Micro: 225. |
| `applyOptions` patch, `removeCompanies`, `companySubset` | `tests/games/options.test.ts` | Short has 8 minors without ADP, BRG, OVN or SPC. A subset leaves only the marked minors. 1830, 1848 and 21Moon copies are unchanged. |
| Launch at 140 / 165 / 200 / 210 in yellow (US2, Diagram 3) | `tests/domain/launch.test.ts` | Prices 70 / 80 / 90 (capped, warning) / 90. Treasury = bid. 3 units in `company:X`. The token is at the bottom of its stack. |
| SC-002, Diagram 3: three launches at 80, 80 and 70 | `tests/games/rotla.test.ts` | The second 80 operates after the first. |
| Bid 115 or 142 | `tests/domain/launch.test.ts` | Warnings `minBid`, `bidStep`. The group is still produced. |
| Buy from the treasury, buy from the pool, sell 2 (per sale, then per share) (US3) | `tests/domain/stock.test.ts` | Money to the company or the bank. The price moves 1 or 2 steps down. |
| Warnings: 2 shares in one buy, > 60%, pool > 50%, sale before operating | `tests/domain/limits.test.ts` | One warning each, never `unavailable`. |
| End of SR: sold out +1, with a treasury share 0 (US4) | `tests/domain/roundEnd.test.ts` | Applied once inside `startOR`. |
| Payout 310 at 70 (SC-002, Diagram 8) | `tests/domain/payout.test.ts` | 62 per share, the treasury share pays the minor, up 2 to 90. |
| Payout 60 at 100 | `tests/domain/payout.test.ts` | 6 per share. `restack`: same price, now last at 100 in the operating order. |
| Withhold 200 at 100; zero run | `tests/domain/payout.test.ts` | Down 1 to 90. |
| Issue at 80; redeem at 80 (US5) | `tests/domain/issue.test.ts` | 80 from the bank and down to 70; 80 to the bank with no move. A second issue in the same OR warns. 21Moon issue is unchanged. |
| Tunneling mountain (US5-7) | `tests/domain/traits.test.ts` | −40 and +60 lines in one group (one undo). A major formed from Tunneling also gets the payment. |
| First 3 / 4 / 5 / 6 / 7 bought (US6) | `tests/domain/trains.test.ts` | The phase ids and limits of the contract's phase table. 2s rust at the 4, 3s at the 6, 4s at the 7. Over-limit companies are listed. |
| ∞ with a 5 traded in | `tests/domain/trains.test.ts` | Pays 800. The 5 goes to `removed` (it leaves the game). |
| First 7/∞ bought as ∞ while trading in a 4 | `tests/domain/trains.test.ts` | Rust first: the 4 rusts with the other 4s and goes to `removed`. Trade-in warning; the price is 1,000. |
| Forced purchase: treasury 150, train 300, president 400 | `tests/domain/forcedPurchase.test.ts` | One group: president → company 150, then the purchase. |
| Forced purchase with sales of two companies (one of them 2 shares) | `tests/domain/forcedPurchase.test.ts` | Each company moves down exactly once, after all sales, even with `perShare`. |
| Resourceful at the 4 | `tests/domain/traits.test.ts` | Its 2s stay with a `rusted:` counter and are not counted for the limit. `discardTrain` sends them to `removed`. |
| Spacious one over the normal limit | `tests/domain/traits.test.ts` | Not listed by `overLimitCompanies`. |
| Merger 80 + 70; Ana 3+0, Bruno 2+3 (US7 independent test) | `tests/domain/merger.test.ts` | Bruno is president. Ana has 3 units. Price 70, at the bottom of the stack. Treasury and trains are summed. Minors are `closed`. Share and money invariants hold. |
| Merger, same president; tied 5–5 | `tests/domain/merger.test.ts` | Same president: 2 + 8 units. Tie: the president of the earlier operating minor. |
| Merger, then undo | `tests/domain/merger.test.ts` | Reduced state equals the state before the merger (deep equal). |
| Merger with 5 trains in green4 | `tests/domain/merger.test.ts` | `trainLimit` warning, and the major is in `overLimitCompanies`. |
| Merger Round due or not (US7-6) | `tests/domain/cycles.test.ts` | Yellow after OR 2: `startMR` unavailable. Green after OR 2 (first 3 bought or exported earlier): available. The export that starts green comes after the MR slot, so the first MR is in the next cycle. |
| Export: a 2 on top / the first 3 / the first 4 / only 7/∞ left / Micro (US8) | `tests/domain/export.test.ts` | All 2s removed / phase green / 2s rust / one 7 asset to `removed` / no export. Undo restores the stack, the phase and the rusted trains. |
| Last cycle of Short | `tests/domain/cycles.test.ts` | `cyclesComplete` fires after OR 4.2 (or MR4). `finalScores` excludes treasuries and applies the tie rule. |
| Dissolution at 0 (US9-1), including during a forced sale | `tests/domain/dissolution.test.ts` | In the same group: shares to `removed`, treasury to the bank, trains to the pool, out of the operating order. No game-end trigger without Bank Break. |
| Player bankruptcy, `liquidatePresided` (US9-2) | `tests/domain/dissolution.test.ts` | A player presiding over two companies goes bankrupt: both are closed, other holders are paid the price × units by the bank, leftover shares go to the pool and cash to the bank, and the player is eliminated (hidden from pickers, last on the scores). With Bank Break, the end triggers fire. |
| Landmarks: Rock Formation then payout 160 at 80 (US11-1) | `tests/domain/landmarks.test.ts` | 80 → 100 → 110. A second Rock Formation warns. |
| Cliff with a 5; Canyon after the 4; Manufacturing launch for 140 | `tests/domain/landmarks.test.ts` | +225 and the 5 to the pool. A rusted 2 counted as permanent. Treasury 90 and holds M2. |
| Random walk over RotLA actions | `tests/domain/randomGames.test.ts` (add RotLA) | No invariant violation over 1,000 seeded games (SC-005). |
| Full scripted Short game, 4 cycles (SC-001) | `tests/games/rotla.playthrough.test.ts` | Ends with final scores. Every group's flows trace to History entries. No manual corrections. |
| Old games unchanged (SC-007) | the existing suite | All existing tests pass unchanged. 1830, 1848 and 21Moon replay logs are equal byte for byte. |
| Voice: RotLA fixtures and cases (US10, FR-031) | `eval/voice/fixtureSpecs.ts`, `cases.jsonl`, `tests/eval/voice.test.ts` | Fixtures `rotla-sr`, `rotla-or` and `rotla-mr` build. `npm run eval:voice` gives ≥ 90% on RotLA common OR commands, and the other games show no drop. |
| UI: launch, merger, issue/redeem, score sheet (SC-003, SC-004) | `tests/ui/rotla.test.tsx` | Tap counts within the limits. No 48 px violations. |

## Manual check (10 minutes, `npm run dev`)

1. **New game.** Pick **Railways of the Lost Atlas**, Modo **Corto**, 3 players.
   - Each player has 300.
   - The Minors checklist shows 8.
   - The train preview reads "2×6 · 3×4 · 4×3 · 5×2 · 6×1 · 7/∞".
   - Change to 5 players: a warning appears, and "Empezar" stays enabled.
2. **SR 1.** Launch Tunneling for 140 (price 70), Express for 165 (price 80), and another minor for 160 (price 80).
   - On the Market strip, the second 80 sits below the first.
   - Buy one Express share from its treasury: the treasury rises by 80.
3. **Start OR 1.** Express is first. Pay out 310: each share gets 62, and the price goes to 90 (+2).
   - On Tunneling, tap **Emitir**: +70 from the bank, and the price drops to 60.
   - Tap **Montaña**: −40 and +60.
   - Pay 30 (below the price): the price stays, and Tunneling now operates after the other 60s.
4. **Buy the first 3-train.** The phase shows **Verde**. The Trains view shows "Límite: minor 2 · major 4".
5. **After OR 2.** The button reads **Ronda de fusiones**. Merge Express and Tunneling into Union.
   - The preview shows the president, the price (rounded down to the track) and the summed treasury.
   - Confirm.
   - Open History: one entry with every transfer.
   - Undo: both minors are back with their exact prices.
   - Redo the merger.
6. **Export.** Tap **Exportar y nueva RA**. The subtitle named the exported train, and History shows it inside the SR start entry.
7. **Speed up to the end** (or use `setTurn`). After cycle 4, **Ver puntuación** lists cash plus shares, without treasuries.
8. **Voice** (with a key): say "Ana abre Suburban por 150", then "emite una acción", then "Express y Agricultural se fusionan en Conglomerate". Each confirmation card shows the bid and price, the issue, and the merger preview with the alt identity.
