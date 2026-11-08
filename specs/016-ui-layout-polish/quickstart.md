# Quickstart: validating UI Layout Polish (016)

## Prerequisites

- `npm install`; `npm run dev` for manual checks.
- Before local Playwright runs, `npm run build` (the :4173 preview server may serve an old dist).
- Devices: a phone in portrait (or devtools at 360×740) and a tablet in landscape (or a
  1280×800 window). For §3, Firefox for Android (no Web Speech API).

## Automated gates

```
npm run typecheck
npm run lint
npm test
npm run build && npm run test:e2e
```

Expected: all pass. Domain tests for `certificateStatus` cover: president + ordinary shares
(40% → 3 cert.), 1830 zone-exempt company, game without a limit, `at`/`over` levels, and
`holdingWarnings` still warning exactly when over.

## Manual checks

1. **History (US1)** — In each round type, tap "Historial" in the action row: History opens in one
   tap; back returns to the board. On a 360 px phone, every action-row button stays visible and
   tappable (the row may wrap to one more line; nothing is covered or pushed off-screen). In a stock round, "Lote de acciones" is not in the row; ☰ →
   "Lote de acciones" opens the batch and records as before.
2. **Holdings (US2)** — 1830, 4 players. Give a player the PRR presidency + 2 shares and shares
   in 4 more companies. Open the player on a 360 px phone: one row each, PRR "40% ★ 3 cert.", no
   horizontal scroll; in a stock round "Vender 1 · $X" on a row sells one share of that company;
   in an operating round "Vender…" on a row opens the count picker with that company selected.
   Total reads "N / 16"; with a company in 1830's yellow zone the row says "no cuenta" and the
   total adds "(N en total)". Push the player to 16 and 17 certificates: "en el límite", then "sobre el límite";
   buying still works with the usual warning.
3. **Mic (US3)** — Firefox for Android, Whisper off: no mic or voice text on the board; every
   control is tappable without lag. Home shows the notice; "Abrir ajustes" opens Settings. Turn
   Whisper on with a Groq key, go back to the board: the mic is there and works. Offline in
   Chrome with voice set up: the disabled mic and "Sin conexión" still show.
4. **Panes (US4)** — Tablet landscape, a new game (only "Disponibles" on the right) and a game in
   progress ("En juego" first): the first player card and first company card tops line up; no
   tabs. Phone portrait: tabs as before, no "Jugadores" title.
5. **Trains label (US6)** — Tablet landscape: cards with trains show "Trenes"; phone: no label.
6. **Settings (US5)** — Phone: five groups in order; "No recordar" and the clips checkbox (dev)
   look the same (plain checkboxes); language, provider and the speech engine ("Del navegador" /
   "Whisper (Groq)") look the same; then the region, then the Groq key block, unindented; help
   lines sit right under what they explain, with no large gaps;
   "Guardar" stays visible while scrolling. Change key, model and region → Guardar → reload: values
   kept. Switch to English: same layout, all text translated.
7. **Certificates at a glance (US7)** — 1830, 4 players. Give a player the PRR presidency + 2
   shares, 2 B&O shares and 1 share of a company in the yellow zone. Tile: companies in a column,
   donut beside them, "5" in the center (the exempt share is a dimmed arc and not counted), empty
   track for the rest of the 16. Sheet: "5 / 16 cert. (6 en total)" next to cash; with "bank
   only" wallet mode it is still there. Bring the player to 16 and then 17: warn and then danger
   cue on the tile, "en el límite" / "sobre el límite" on the sheet. Phone 360 px: tiles don't
   overflow. TalkBack/VoiceOver reads "5 de 16 certificados".
8. **Company choices (US8)** — 1848: open "Abrir menor" on a phone (portrait) and a tablet
   (landscape): every choice has the badge above the name. Same in the merger sheet.
