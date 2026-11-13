# Quickstart: Validating Feature 017

## Automated

```sh
npm run typecheck
npm run lint
npm test -- involvement lastRun history playerSheet rotla perf
npm test
npm run build && npm run test:e2e   # build first: the :4173 preview may serve an old dist
```

Expected: all green. The domain guarantees are in [contracts/domain.md](./contracts/domain.md).
The UI behavior is in [contracts/ui.md](./contracts/ui.md).

## Manual check (phone portrait, then tablet landscape)

1. **Company history (US1)**: new 1830 session with 4 players.
   1. Par the PRR and the B&O, then buy shares, including one PRR share from the pool.
   2. Play an OR: PRR runs 100 and pays out, buys a train; B&O withholds.
   3. Tap the PRR card, then "Historial".
   4. Expected:
      - only PRR entries are listed: par, buys including the pool buy, the run, the train and
        the turn passing to the PRR;
      - no B&O entries;
      - expanding the run puts the PRR lines first, in bold.
2. **Last run (US2)**: after step 1:
   - the PRR card reads "Última corrida 100";
   - the B&O card shows its run amount;
   - the PRR sheet reads "100 · repartió · OR 1.1".
   Then:
   - start OR 1.2: the cards still show the OR 1.1 values;
   - undo the PRR run: its card shows no last run.
3. **Player history (US3)**: open a player's sheet, then "Historial".
   - Expected: their buys and dividends are listed, plus one "Fijar dinero" adjustment made
     beforehand.
   - Not listed: payouts of companies they don't hold.
4. **To the full History (US4)**:
   1. In a filtered history, expand an older entry and choose "Ver en el historial completo".
      Expected: the full History opens with that entry expanded, and "Deshacer hasta acá" is
      available there.
   2. Go back: you return to the filtered history.
   3. Go back again: you return to the Table with the sheet open.
   4. Check that no undo control appears anywhere in the filtered view.
5. **RotLA merger (FR-017)**: run two minors, merge them in the MR.
   - Expected: the major's card shows no last run until its first run.
6. **21Moon**: run a company with local and space port parts.
   - Expected: the card shows the total, and the sheet lists both parts.
7. **English**: switch to English and repeat steps 1–2.
   - Expected: "History", "Last run", "paid out", with no Spanish left.
