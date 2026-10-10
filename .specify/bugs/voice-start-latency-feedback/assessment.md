# Bug Assessment: Mic shows "listening" before the recognizer is listening

- **Slug**: voice-start-latency-feedback
- **Created**: 2026-10-10
- **Source**: pasted text (one of four issues found while testing RotLA; see also `rotla-buy-default-treasury`, `toast-obscures-voice-button`, `companies-tab-status-order`)
- **Verdict**: likely valid, needs reproduction
- **Severity**: medium

## Report (verbatim or summarized)

> Voice recognition takes a while to hit in, and sometimes you don't know when to start speaking because. Maybe this is a tradeoff of the tool, so we may not be able to do anything about this, I don't know

## Symptom

After the mic button is pressed, it turns red and says "Escuchando…" at once, but the browser recognizer only starts capturing audio some hundreds of milliseconds later. Words spoken in that gap are lost, and the user has no reliable cue for when to start speaking. Expected: the "speak now" state appears only once audio capture has actually started.

## Reproduction

1. On Chrome for Android (the user's setup, confirmed 2026-10-10), open a session with voice enabled.
2. Press and hold 🎤 and start speaking at once.
3. The first word or two are often missing from the transcript, although the button was already red.

On Android, Chrome's recognizer runs through the system speech service and usually plays its own short start sound once it is actually listening. The app's red state comes before that.

## Suspected Code Paths

- [src/app/voiceController.ts:68-78](src/app/voiceController.ts#L68-L78) `press()`: sets `phase: "listening"` right after `capture.start()` returns, before any audio event.
- [src/voice/speech.ts:84-101](src/voice/speech.ts#L84-L101) `SpeechCapture.start`: builds a new `SpeechRecognition` on every press and calls `r.start()`. It never listens to `onstart` / `onaudiostart` / `onspeechstart`, and `RecognizerLike` ([speech.ts:15-25](src/voice/speech.ts#L15-L25)) does not declare them.
- [src/ui/components/MicButton.tsx:20-27](src/ui/components/MicButton.tsx#L20-L27): shows the red "listening" style and "Escuchando…" from `phase === "listening"`. It has no intermediate "preparing" state.

## Root Cause Hypothesis

Part of this is a platform limit: Web Speech start-up time (opening the mic, and on Android a network round trip to the recognizer) is outside the app's control. The app makes it worse by telling the user it is listening before it is. The phase changes on press, not when the browser fires `onaudiostart`. Confidence: **medium**. The code path is certain. How much it helps depends on the device and needs a hands-on check.

## Proposed Remediation

**Preferred**: Add a `starting` phase. `press()` sets `{ phase: "starting" }`. `SpeechCapture` takes an `onReady` callback fired from `onaudiostart` (or `onstart` as a fallback), which moves to `listening`. `MicButton` shows a neutral "Preparando…" style (e.g. a pulsing outline) while starting, and the red "Habla ahora" only once ready. A short vibration (`navigator.vibrate(30)` where supported) on ready gives a cue without looking. A release during `starting` cancels cleanly.

**Alternatives**:
- Keep one recognizer instance alive and only call `start()` per press. The saving is small. Chrome still opens a new session per `start()`, and reuse carries state-reset risk.
- An audio "beep" on ready instead of vibration. It is audible to the table and may be picked up by the recognizer.

**Files likely to change**:
- `src/voice/speech.ts` (`RecognizerLike` gains `onstart`/`onaudiostart`, `start` gets `onReady`)
- `src/app/voiceController.ts` (new `starting` phase, release-while-starting handling)
- `src/ui/components/MicButton.tsx`, `src/ui/styles/components.css`
- `tests/voice/speech*.test.ts`, `tests/app/voiceController*.test.ts`

**Tests to add or update**:
- `SpeechCapture`: `onReady` fires on `onaudiostart`, and not before.
- `VoiceController`: press → `starting`; recognizer audio start → `listening`; release during `starting` → idle (or a pending result restored), with no interpreter call.
- `MicButton`: renders "Preparando…" in `starting` and "Escuchando…" in `listening`.

## Risks & Considerations

- Some engines may never fire `onaudiostart`. Add a fallback timeout (e.g. switch to `listening` after about 1 s) so the UI cannot stay stuck in "Preparando…".
- This does not remove the platform's start-up latency. It only makes it visible, so set expectations in the fix notes.
- Manual verification on a real phone is needed. jsdom fakes cannot measure latency.

## Open Questions

- Device/browser: Chrome on Android (answered by the user, 2026-10-10).
- [NEEDS CLARIFICATION: Are the first words being dropped from the transcript, or is the delay only uncomfortable? This can be checked during the fix's manual verification.]
