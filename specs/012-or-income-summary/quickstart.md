# Quickstart: validating the income summary

## Automated

```sh
npm run typecheck
npm run lint
npx vitest run tests/domain/operatingPhase.test.ts tests/ui/income.test.tsx
npx vitest run tests/domain/randomGames.test.ts tests/domain/perf.test.ts
npm test            # full suite before merging
```

What these prove:

- **Domain guarantees G1–G7**: see [contracts/operating-phase.md](contracts/operating-phase.md).
- **UI contract**: see [contracts/ui.md](contracts/ui.md).
- **Perf**: the summary computes in under 20 ms on the 300-group log.

## Manual check (phone, portrait)

Run `npm run build`, then start the preview. Rebuild first: a stale `:4173` server can serve an
old `dist`.

1. **No summary outside the ORs.** Start an 1830 session with 4 players and play the first SR.
   Expected: no "Ingresos de las ORs" button, and no entry for it in the menu.
2. **Summary during the ORs.** Start OR 1.1. Note each player's cash. Pay out with two
   companies, and record private income.
   Expected:
   - "Ingresos de las ORs" is in the round controls;
   - one tap opens it;
   - each player shows "Al empezar" (the cash noted), "Ahora", and "Cobra del banco $X" with
     chips;
   - the rule text is shown.
3. **Movements by OR.** Expand a player. Expected: the payouts and "Ingresos de las privadas"
   are listed under "OR 1.1" and add up to the amount.
4. **Money put into a company (US2).** In OR 1.2, make a company buy a train it can't afford, with
   its president paying the difference (a forced purchase, or "Pagar…" from the player to the
   company followed by the purchase). Expected: that president's amount drops by the
   contribution. If the contribution is larger than their earnings, the summary shows "Paga al
   banco $Y".
5. **Undo.** Undo the last payout. Expected: the amounts update at once.
6. **End of the ORs (FR-010).** Finish the last company of the last OR. Expected:
   - "Ingresos de las ORs" is highlighted as primary;
   - "Empezar ronda de acciones" still works in one tap, with nothing in between.
7. **After the SR starts.** Start the SR. Expected: the button and the menu entry are gone. Undo
   the SR start, and both come back with the same amounts.
8. **Other games.** Repeat steps 2 and 6 in RotLA and 21Moon:
   - RotLA: between RO 1 and RO 2 the button is shown but not highlighted.
   - 21Moon: the CR ends the phase like an SR.
9. **Tablet.** Repeat step 2 in landscape. Expected: the layout fits, and the rows are easy to
   tap.
