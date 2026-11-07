# Quickstart: Validating Whisper Speech Recognition (Groq)

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

## Prerequisites

- Node 22+, `npm ci`.
- **For the manual and paid checks only**: a Groq key (<https://console.groq.com/keys>) and an
  AI provider key (Anthropic or Gemini), as today.
- **Real-device checks**: the app served over HTTPS or `localhost`, since `getUserMedia` needs a
  secure context. `npm run build && npm run preview -- --host` with a tunnel, or the deployed
  preview.

## 1. Automated gates (free, no keys)

```bash
npm run typecheck
npm run lint
npm test                 # unit + UI: engine, recorder fakes, Groq client (mocked fetch), settings, controller, Settings/mic UI
npm run build && npm run test:e2e   # includes e2e/whisper.spec.ts: mocked Groq endpoint; fake mic (Chromium phone), media stub (WebKit tablet)
```

Stop any preview server already running on :4173 before `npm run test:e2e`. Playwright reuses
it locally, and one started from a plain `npm run build` has Whisper hidden (`.env.production`
keeps `VITE_WHISPER_LANGUAGES` empty until a language passes its audio check). The e2e web server
rebuilds with `VITE_WHISPER_LANGUAGES=es,en`.

Expected: all pass. The Spanish and English suites from feature 014 pass unchanged (the browser
engine path is untouched).

Key automated scenarios, mapped to the spec:

| Scenario | Proves |
|---|---|
| Toggle off by default; saving a Groq key leaves it off; nothing hits the Groq route | FR-003, US2-1 |
| Toggle on + key → hold, release → "Transcribiendo…" → card → confirm applies | US1-1, US1-3, FR-011 |
| Toggle off with key kept → next command uses browser engine; on again needs no key | US2-2 |
| Whisper on, no key → mic disabled with "add your Groq key" reason | FR-004 |
| No recognizer + toggle off → reason suggests turning on Whisper | US1-2 |
| 401 / 429 / timeout / offline mocked → matching message, no state change, touch usable, "use the browser's recognition" button | US3-1, US3-2, US3-4, FR-014, FR-016, SC-004 |
| Release after 200 ms, or a silent fake device → "No escuché nada", no request | US3-3, FR-009 |
| Hold past 30 s (fake timers) → auto-stop, transcribed, "cut" hint | FR-008 |
| Cancel while transcribing → request aborted, nothing proposed | Edge case |
| Hidden page while recording → tracks stopped | FR-013 |
| Request carries `language`, the vocabulary `prompt` (≤ 400 chars, ≤ 180 estimated tokens), `verbose_json` | FR-010, US2-3, US2-4 |
| Production build with `VITE_WHISPER_LANGUAGES` empty → no Whisper toggle, no Groq call even with `whisper: true` stored; dev build → toggle shown | FR-018 |
| "sí" through Whisper confirms the open card | Edge case |
| Export and logs contain no Groq key | FR-002, SC-005 |

## 2. Manual check (one real key, a few cents at most)

1. In Settings, enter the Groq key with the toggle **off**. Make one voice command and confirm it
   doesn't appear in Groq's usage page (<https://console.groq.com/dashboard/usage>).
2. Turn the toggle **on**. Check that the privacy note now names Groq.
3. In a session, hold the mic and say: "Ana compra una del B&O" (or "Ana buys one B&O"). Check
   the ring moves while you speak, "Transcribiendo…" shows on release, and the card follows in
   about 4 s or less.
4. Say a command with a nickname alias and a company alias. Check the spelling matches the
   session.
5. Deny mic permission in the browser's site settings, then try again: you get the explanatory
   message and touch keeps working.
6. Turn on airplane mode: the mic is disabled with the offline reason.
7. Enter a wrong key: you get "Groq: la clave no es válida…", plus the "Usar el reconocimiento
   del navegador" button in Chrome.
8. Repeat steps 2–3 on each browser in SC-001:
   - desktop: Chrome, Edge, Firefox, Safari;
   - mobile: Chrome Android, Safari iOS, both in a tab and as an installed PWA.

## 3. Audio check set (the release gate, paid, user-run)

1. In a dev build (`npm run dev`), turn on Settings → "Grabar clips de control". Keep the toggle
   **off** in Chrome.
2. Play or simulate a game. After each command's card, tap "Guardar para eval". Aim for 20–30
   commands per language. About half should name players or companies, and some should be said
   over table noise.
3. Collect them: `npm run eval:audio:collect -- ~/Downloads`
4. Run the check:
   `GROQ_API_KEY=… ANTHROPIC_API_KEY=… npm run eval:audio -- --lang all`
   - **On Groq's free plan** the defaults already pace Groq at 18 requests a minute. With a
     free Gemini key as the resolver, add `--free`:
     `GROQ_API_KEY=… GEMINI_API_KEY=… npm run eval:audio -- --lang all --free`.
     That takes about 15 minutes for 60 clips, mostly Gemini's pacing.
   - **Re-runs** reuse cached transcripts and spend no Groq quota. Use `--transcripts fresh` for
     the latency numbers of the gate.
   - If a run stops on a daily quota, it saves a partial report; run it again the next day and it
     resumes from the cache.
   - Optional comparison: `--model whisper-large-v3` (a second set of Groq calls).
5. Check the gate in [contracts/audio-check.md](contracts/audio-check.md#gate-release-of-whisper-in-a-language)
   per language, and record the result file in `tasks.md`.

## 4. Docs

`docs/spec.md` and `README.md` describe the toggle, the Groq key, the billing note and the
privacy line. The version is 0.3.0.
