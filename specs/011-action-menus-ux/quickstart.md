# Quickstart: Validating Action Menus UX

**Feature**: [spec.md](spec.md) | **Contracts**: [contracts/](contracts/) | **Data model**: [data-model.md](data-model.md)

## Prerequisites

- Node 22, then `npm install`.
- For the eval (§4): the paid AI key in the environment, as in features 009 and 010.
- Before any local Playwright run, run `npm run build`. A stale `:4173` preview server can serve
  an old `dist`.

## 1. Automated gates

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all pass. The checks that matter for this feature:

| Area | Proves |
|---|---|
| Player sell from the sheet (1830, RotLA) | Same events as the company-side `sellShares`: cash, pool, market move (US1-1, FR-004) |
| Player buy from the sheet (IPO, pool, RotLA treasury) | Same events as `buyShare`. Sources with no shares are disabled with a reason (FR-006) |
| Tap counts (`taps.test.tsx`) | SR quick sell of 1 = 2 taps; "Vender acciones" with a preselected company = 3, with a choice = 4; "Comprar acción" = 4, or 3 with one company (FR-007, SC-001, constitution V) |
| Player sheet sections | The "Jugada" group comes before "Ajustes", and every adjustment is still present (FR-001, FR-003) |
| Trains line | Count/limit/types, rusted mark, "Sin trenes", over the limit, no limit (US2, FR-009, FR-010) |
| `correctTrain` remove → bank with a refund | The train is back in the bank and buyable next, the list price is refunded, the invariants hold (US3-1, SC-007) |
| `correctTrain` remove → removed / → pool | No money moves by default. A refund given anyway is recorded with `refundOffSupply`. The pool is unavailable in 1848 (US3-2, US3-3) |
| `correctTrain` on the train that started the phase | Warning `phaseStarter`, phase unchanged, no rust undone (US3-4, FR-016) |
| `correctTrain` add of a phase-triggering type | No phase change, no private closes (exempt triggers) |
| `correctTrain` add, then `undoLast` | State deep-equals the state before (US3-6) |
| `roundSections` | Sections in order, the current one unfinished, undone boundaries open nothing, empty rounds kept, setup section (US4, FR-018–FR-021) |
| `nextCompany` titles | RotLA green set end: no stock-round wording. Mid-set: "Fin de la OR 2.1 · empieza la OR 2.2". End of set: "Fin de las rondas de operaciones…". Zero run prefix. A legacy log shows them too (US5, FR-022, FR-023) |
| Perf | `roundSections` over 300 groups stays within the History budget |
| Voice prompt snapshots | Regenerated with the `correctTrain` tool. The tools are stable across states |

## 2. Manual check on a phone (or phone-sized window)

`npm run dev`, then start a 1830 session.

1. **Sell from the player (US1)**:
   - SR 1: Ana pars PRR and buys a share. Tap Ana's tile: "Jugada" shows "Vender acciones" first.
   - "Vender 1 PRR · $X" is shown in "Jugada". Tap it.
   - Ana's cash rises by X, the pool has 1 PRR, and History shows a sale line.
   - Undo, then sell again through "Vender acciones": PRR is preselected, and the sale is
     "Vender 1 · cobra $X".
2. **Trains line (US2)**: in OR 1.1, open PRR's operating menu. "Sin trenes" is shown. Buy a 2,
   reopen: "Trenes 1/4 · 2".
3. **Correct a train (US3)**:
   - Buy a second 2 by mistake, then run PRR.
   - From the trains line, tap "Corregir…" → "Quitar el 2" → "Al banco (oferta) · devolver $80".
   - PRR keeps one 2, the treasury is back to its earlier amount, and the run entry is untouched.
4. **History (US4, US5)**:
   - Advance to OR 1.2 and then to SR 2. Open History.
   - Sections read "💼 Ronda de acciones 2 · en curso", "🚂 Ronda de operaciones 1.2 · terminada"…
   - The entry that ended OR 1.1 is titled "Fin de la OR 1.1 · empieza la OR 1.2".
   - The one that ended the set is titled "Fin de las rondas de operaciones" (the next round is
     not named).
5. **Finding a round in a long session (SC-005)**: import a long session (for example a full
   RotLA game export, about 160 entries) and open History. Time how long it takes to find the
   start of "OR 3.2" (in RotLA, "Ciclo 3 · Ronda de operaciones 2/2"). Target: under 10 seconds.
6. **RotLA**: repeat step 1 in a RotLA session. The buy view offers "Tesorería" and the section
   titles carry "Ciclo N".

## 3. Regression watch

- The company card's own buy and sell (`StockSheet`) behave exactly as before.
- "Descartar tren" and the over-limit flow still send trains to the game's discard destination.
- The over-limit banner and the trains line agree.

## 4. Voice eval (needs the paid key, run by the user)

```bash
npm run eval:voice
```

Expected: the new `correctTrain` cases resolve, and overall accuracy does not drop below the last
recorded report.
