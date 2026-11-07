# Bug Fix: Browser speech recognition hears nothing while check clips are on (Chrome Android)

- **Slug**: browser-speech-regression
- **Fixed**: 2026-11-07
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

On Android, the dev-only check-clip recorder no longer opens the microphone next to Chrome's
recognizer, so browser voice works with "Grabar clips de control" on. Settings explains, on
Android, that check clips have to be recorded on a computer. The investigation also turned up two
other changes: the Whisper toggle now saves as soon as it's tapped, and two dev-only `voz:`
diagnostics were added.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/voice/engine.ts` | modified | New `canRecordAlongsideRecognizer(userAgent)`, false on Android. `browserEngine` skips `clipRecorder` when it's false. |
| `src/ui/screens/Settings.tsx` | modified | A muted note under "Grabar clips de control" on Android (dev only). Separately, the Whisper toggle saves at once through `saveWhisper`, saving only the toggle. |
| `src/i18n/es/ui/settings.ts`, `src/i18n/en/ui/settings.ts` | modified | New `whisper.checkClipsAndroid` string (Uruguayan Spanish, plus English). |
| `src/app/useVoice.ts` | modified | Dev-only logs: `voz: ajustes recargados, whisper=…` on every settings reload, and `voz: motor <id> (toggle whisper=…, idioma …, ofrecido …)` on every press. |
| `tests/voice/engine.test.ts` | added tests | The user-agent check; on Android no `getUserMedia` call and the recognizer runs; on desktop the clip is still recorded. |
| `tests/ui/whisper.test.tsx` | added tests | The Android note shows, desktop has no note, and the toggle saves at once without Guardar. |

## Diff Highlights

```ts
// src/voice/engine.ts
export function canRecordAlongsideRecognizer(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return !/\bAndroid\b/i.test(userAgent);
}
…
// On Android a clip would silence the recognizer: the hold goes on without one.
const media = import.meta.env.DEV && canRecordAlongsideRecognizer() ? options.clipRecorder?.() : undefined;
```

## Tests Added or Updated

- `tests/voice/engine.test.ts` › "Chrome Android can't share the microphone with its recognizer; desktop can": the Android, desktop and empty user agents.
- `tests/voice/engine.test.ts` › "on Android the hold records no clip…": `getUserMedia` is never called, the recognizer starts, and `started` is reported.
- `tests/voice/engine.test.ts` › "on desktop the same hold is still recorded": the desktop check-clip path is unchanged.
- `tests/ui/whisper.test.tsx` › "on Android, Settings says check clips can't be recorded…" and "on desktop there is no such note".
- `tests/ui/whisper.test.tsx` › "the toggle saves at once…": unchecking without Guardar stores `whisper: false`, a key typed but not saved stays a draft, and the next command uses the browser recognizer.

## Local Verification

- Commands run:
  - New tests first: `npx vitest run tests/voice/engine.test.ts` → red (2 failed), then green after the fix.
  - `npm test` → 123 files, 2473 passed.
  - `npm run typecheck` → clean.
  - `npm run lint` → clean.
- Manual checks:
  - **Confirming the cause**, by the user before the fix, on Chrome Android over the dev tunnel: unchecking "Grabar clips de control" made browser voice work again. The dev logs showed the engine choice was right (`motor browser`, `whisper=false`).
  - **The fix itself** hasn't been checked on the device yet; that's `/speckit-bug-test`.

## Deviations from Assessment

- **Scope expanded with the user's agreement**: the Whisper toggle now saves at once, in `Settings.tsx` with a test. The user first suspected that turning Whisper off didn't stick. Guardar sits off screen below the toggle on a phone, and the user chose "save at once". This changes contracts/ui.md §1 for feature 015, which said "save `whisper` with the existing save flow". contracts/ui.md §1 is updated to match.
- **Dev diagnostics kept**: the assessment left this open. The two `voz:` lines are kept. They print only the toggle state, the engine id and the language, never keys, and the security tests pass.
- **Detection by user agent**, not by capability: no browser API reports that the microphone can't be shared. If another platform turns out to have the same conflict, `canRecordAlongsideRecognizer` is the one place to change.

## Follow-ups

- ~~Update contracts/ui.md §1~~: done; it now covers saving at once and the Android note.
- `/speckit-bug-test slug=browser-speech-regression`: on Chrome Android with check clips on, browser voice gives live text and a card, the Settings note shows, and "Guardar para eval" saves the JSON without audio.
- The two earlier desktop episodes, which a refresh fixed, were most likely a stale HMR page. Reopen this bug if one comes back with check clips off.
