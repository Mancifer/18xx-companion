# Quickstart: Validating Multi-Language Support

How to check that feature 014 works end to end. Contracts and the data model hold the details;
this guide only says what to run and what to expect.

## Prerequisites

- Node.js 24, and `npm install` done.
- For the voice checks: an Anthropic and/or Gemini API key, a microphone, and Chrome (Web Speech
  API).
- Before running Playwright locally, run `npm run build`. The preview server on :4173 can serve
  an old `dist`.

## 1. Automated gates

```sh
npm run typecheck   # a missing key in en or es is a type error (SC-004)
npm run lint
npm test            # Spanish-pinned suite unchanged (SC-002), English tests, catalog checks, leak sweep (SC-001)
npm run build && npm run test:e2e   # existing es-ES specs + the new en-US spec (SC-005)
```

What to expect:
- Every existing test passes with no assertion changes, apart from the one-line language pin in
  the shared helpers.
- The voice snapshots for Spanish are unchanged, and new English snapshots are added.

## 2. First launch (FR-002, SC-008)

1. In Chrome DevTools, choose **Sensors → Location → Locale** `en-US`. Open the app in a fresh
   profile. It should be in English.
2. Clear site data and set the locale to `es-UY`, then reload. It should be in Spanish.
3. Pick **English** in Settings, then reload with the `es-UY` locale. It should stay in English,
   because the saved choice wins.

## 3. Full English session (US1, SC-001)

For each of 1830, 1848, 21Moon and RotLA:
1. Create a session in English and play an SR and an OR set by touch.
2. Open History, the OR income summary and the Market, then end the game and open Results.
3. Look for Spanish text. Only company, private and player names, and text you typed, may appear.
4. Check that money shows with `,` thousands separators (for example `$1,200`) and that round
   labels read "SR 1", "OR 1.1" and, for 21Moon, "Cycle 2 of 6".

## 4. Switching mid-game (US2, US3)

1. Play a few actions in Spanish. In Settings, type a new API key without saving it.
2. Switch to English in the same Settings screen. Check that:
   - the text changes at once;
   - the open session and the unsaved key are still there;
   - `document.documentElement.lang` is `en`.

   A card that is open while the language changes can only happen in a test, because the selector
   lives on the Settings screen. The UI suite covers it by changing the context with a card open.
3. Open History. The Spanish-era entries now read in English, including "Game over" if the game
   was ended. Your own notes are unchanged.
4. Export the session, switch to Spanish and import it. It replays to the same state and reads in
   Spanish.

## 5. Sessions from before this feature (SC-006)

Import a session exported by version 0.1.0, such as `eval/voice/fixtures/1830-or.json` or an
export of your own. Check that:
- it replays to the same state (the conservation banner stays clean);
- History reads in both languages;
- in English, warnings saved before this feature that take values may still show their Spanish
  text, as recorded in research R3.

## 6. Voice in both languages (US4)

1. In English with an `en-US` region, hold the mic and say:
   - "Pennsylvania pays 80, full dividend";
   - "buy a 3 for 180";
   - "how much cash does the B&O have?"

   The card and the answer should be in English, with the same proposal a touch user would build.
2. Turn the network off and give a command. You should see an English error message, the
   transcript, and the touch fallback.
3. Switch to Spanish and repeat today's Spanish commands. They should behave as before.

## 7. Eval gate (SC-007, constitution 2.1.0)

These are paid runs, so the user runs them.

```sh
npm run eval:voice -- --lang all
npm run eval:voice:compare -- <baseline> <new>
```

What to expect:
- one report section per language;
- for the default model, English accuracy within 5 points of Spanish;
- Spanish accuracy no lower than the pre-014 baseline;
- a report for both languages for each allowlisted provider/model before English voice ships.
