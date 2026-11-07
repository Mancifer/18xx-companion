# Bug Assessment: Browser speech recognition hears nothing while check clips are on

- **Slug**: browser-speech-regression
- **Created**: 2026-11-07
- **Source**: pasted text (plus two clarifying answers from the user)
- **Verdict**: valid (cause confirmed on Chrome Android, 2026-11-07)
- **Severity**: low (dev builds only; it blocks recording check clips on a phone, not production)

## Report (verbatim or summarized)

> Looks like voice thorugh the browser built in recognition is not working anymore

Clarified with the user:
- **Symptom**: holding the mic shows "Escuchando…", but no live text appears, and nothing happens on release.
- **Context**: `npm run dev`, with Settings → "Grabar clips de control" **on** and Whisper off. This is the setup task T054 (feature 015) asks for, to record the audio check set.

## Confirmed 2026-11-07: check clips on Chrome Android

The user reproduced it on **Chrome Android** (`npm run dev` over a tunnel) after turning Whisper
off. The dev logs added in `useVoice` show the app's side working:
`voz: ajustes recargados, whisper=false` and then
`voz: motor browser (toggle whisper=false, idioma es, ofrecido true)`.
So the settings reload and the engine choice are correct, and the browser engine was used.

With "Grabar clips de control" on, the recognizer heard nothing. With it unchecked, browser
recognition **worked again right away**. A refresh never helped because the setting persists.
This confirms the original hypothesis: the dev clip recorder's `getUserMedia` runs next to
`webkitSpeechRecognition`, and Chrome Android can't give the microphone to both.

The two earlier desktop episodes look different. A refresh fixed them, and turning check clips
off on desktop didn't. The most likely cause there is still a stale dev page (HMR), and nothing
has reproduced them since.

**Remediation chosen** (supersedes "Proposed Remediation" below):
1. **Don't record next to the browser engine on Android.** In `browserEngine`, when the user agent
   is Android, skip the clip recorder (dev only). The browser engine works and the hold just has
   no clip. Desktop keeps recording clips, which is what T054 used.
2. **Say so.** Under the "Grabar clips de control" checkbox in Settings, on Android, add a muted
   line: "En Android, el reconocimiento del navegador no puede grabar clips a la vez: grabalos en
   una computadora." (English: "On Android, the browser's recognition can't record clips at the
   same time: record them on a computer."). "Guardar para eval" then saves the JSON without
   audio, as it does with clips off.
3. **Tests**:
   - `tests/voice/engine.test.ts`: with an Android user agent and a `clipRecorder`, `getUserMedia`
     is never called and the recognizer starts; with a desktop user agent, it still records.
   - `tests/ui/whisper.test.tsx`: the Android note shows under the checkbox.
   - The DEV-guard security rule still passes.
4. **Dev logs**: keep or drop the two `voz:` diagnostics added during this investigation; they
   carry no key or setting values beyond the toggle.

The 2026-11-07 change that makes the Whisper toggle save at once (`Settings.tsx` `saveWhisper`)
came out of this investigation too. It is already in, with a test.

## Update 2026-11-07: control check failed

The user is on **desktop Chrome**. Turning "Grabar clips de control" off while in the app **made no
difference**. The option does apply live: `Settings.tsx` saves it and dispatches `SETTINGS_CHANGED`,
and `useVoice` reloads it. `createEngines`'s `clipRecorder` reads `settings.current.checkClips` on
every hold. So with it off, no second capture is opened and the browser path is the same code as
before feature 015: `SpeechCapture` is unchanged, the controller's browser flow is equivalent, and
the existing tests pass with no edits.

**The original hypothesis is weakened.** The remaining candidates, in order:

1. **Recognizer errors that the app swallows**: `SpeechCapture` resolves `onerror` with the text so far and
   drops `event.error`, e.g. `network` (Google's speech service), `audio-capture`, `not-allowed` or
   `language-not-supported`. That's been true since the MVP, so whatever Chrome reports is invisible.
   This is the most likely explanation of "listens, no text".
2. **Environment**: Chrome's chosen input device changed, another app holds the mic, or Chrome's
   speech service is unreachable. It isn't a code change.
3. **Leftover mic state from earlier check-clip holds**: a stream that wasn't released until the page was
   reloaded. That's unlikely given `AudioRecorder`'s release paths, but a full reload rules it out.

Diagnostics to run before any fix:
- Reload the page (or restart Chrome) and retry with check clips off.
- In the app's DevTools console, run the recognizer on its own, without the app:
  `const r = new webkitSpeechRecognition(); r.lang = "es-ES"; r.interimResults = true; r.onresult = e => console.log(e.results[0][0].transcript); r.onerror = e => console.log("error", e.error); r.onend = () => console.log("end"); r.start();`
  then speak. If this also fails, it isn't the app.
- Compare with `main`: `git worktree add ../companion-main main`, then `npm ci && npm run dev` there.

Whatever the cause, one fix is worth making: in dev, log `event.error` from `SpeechCapture`'s
`onerror` and show a not-understood message for errors like `network`/`audio-capture`, not a
silent idle. Only the browser engine changes; the transcript logic stays the same.

## Update 2026-11-07: a page refresh fixed it

After a reload, browser recognition works again. Two candidates remain, and both are dev-only:
- **Mic state left over by check-clip holds**: candidate 3 above. It would come back during T054.
- **A stale dev page**: Vite HMR kept a `VoiceController`/engine instance from before the
  feature 015 code changes, while the tab stayed open.

**Next check** (by the user): with check clips **on**, give 3–5 commands in a row. If recognition
keeps working, close this as a stale HMR page (not a bug). If it stops after some holds, it's the
check-clip capture, and the remediation below applies. The dev-only `onerror` logging is
worth adding either way.

## Symptom

With check clips on, the browser engine reaches "listening", but Chrome's recognizer returns no results. On release the transcript is empty, the controller goes back to idle with no message, and no card is shown. So "Guardar para eval" never appears and no check clip can be saved, which blocks T054.

Expected: the recognizer works exactly as it does with check clips off, and the same hold is also recorded.

## Reproduction

1. `npm run dev` and open the app in Chrome. [NEEDS CLARIFICATION: desktop Chrome or Chrome Android, and which OS/mic device]
2. In Settings, turn Whisper off and turn on "Grabar clips de control". Save.
3. Open a session, hold the mic and say a command such as "Ana compra una acción del B&O".
4. Observed: "Escuchando…" with no live text; on release, back to idle with no card.
5. Control: turn "Grabar clips de control" off and repeat. Expected: live text and a card. [NEEDS CLARIFICATION: not yet confirmed by the user, but it's the decisive check for this hypothesis]

## Suspected Code Paths

- `src/voice/engine.ts` `browserEngine().start` — right after `capture.start()` (which calls `recognizer.start()`), when `clipRecorder()` returns media it starts an `AudioRecorder` on the **same hold**. So two captures of the microphone run at once: Chrome's internal speech capture and a page `getUserMedia` stream.
- `src/voice/recorder.ts` `AudioRecorder.start` — calls `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })` and then opens an `AudioContext` analyser. Asking for mono with all three processing options can make Chrome reopen or reconfigure the input device, and in some setups the recognizer's capture then gets silence or loses the device.
- `src/app/useVoice.ts` `createEngines` — passes `clipRecorder` only when `import.meta.env.DEV && settings.checkClips`. That's why only the check-clips setup is affected.
- `src/voice/engine.ts` `browserEngine().stop` — an empty transcript becomes `{ kind: "empty", reason: "silence" }`. `src/app/voiceController.ts` `finish()` then goes back to idle with **no hint** for the browser engine. That's why the failure is silent.

Ruled out while reading:
- `SpeechCapture` (`src/voice/speech.ts`) wasn't changed by feature 015.
- The controller's browser path: `started` arrives synchronously, and press/release/stop behave as before. The existing browser voice tests pass with no edits.
- Availability: the mic is enabled, and the user reaches "listening".

## Root Cause Hypothesis

When check clips are on, the browser engine opens a second microphone capture (`getUserMedia` with mono plus echo cancellation, noise suppression and auto gain) right after `recognizer.start()`. In Chrome, the page capture and the Web Speech capture compete for the same input device. Reopening the device with different processing starves the recognizer, so it produces no results and ends with an empty transcript. Chrome Android is known to be unable to share the mic between the two at all. Desktop Chrome depends on the OS audio stack and the device. The unit tests can't catch this because `FakeMediaRecorder`/`fakeGetUserMedia` don't model device contention.

**Confidence: medium-high.** The symptom appears only with the one setting that adds the second capture, and the plain browser path is unchanged in code. It still needs the control check (step 5).

## Proposed Remediation

**Preferred**: make the dev clip capture as gentle as possible, and make the failure visible.

1. **Order and constraints**: start the clip recorder's `getUserMedia` **before** `recognizer.start()`, and request `audio: true` (the device's default processing) for check clips. The likely trigger is the recognizer having to reopen its device when a stream with different processing joins mid-capture. Opening the page stream first, with defaults, gives both captures the same device configuration. Concretely:
   - `AudioRecorder` gets an optional `constraints` override (default unchanged for Whisper: mono plus the three processing options).
   - The browser engine's dev path starts the clip and calls `capture.start()` once the clip's stream is acquired, or straight away if acquiring fails. `started` stays emitted after `recognizer.start()`.
   This applies only under `import.meta.env.DEV`, so production behavior and the Whisper path don't change.
2. **Visible failure**: when check clips are on and the browser transcript comes back empty while the clip passes `hasSpeech`, show the existing "No escuché nada" hint, with a dev-only console line saying the recognizer got no audio while the clip did. Then the player knows the clip setup is at fault, not their speech.

Then verify by hand in Chrome on the user's device (desktop, and Android if they use it). If the recognizer still hears nothing, fall back to one of the alternatives below.

**Alternatives**:
- **Feed the recognizer the clip's track**: newer Chrome versions accept `SpeechRecognition.start(audioTrack)`, a `MediaStreamTrack` overload. Then there's one capture and both engines get identical audio. It's the cleanest fix, but it depends on the browser version, needs feature detection, and keeps the current dual capture as the fallback. [NEEDS CLARIFICATION: confirm the Chrome version supports it before choosing this]
- **Record check clips in Whisper mode, with no browser transcript**: no contention, and `collect` already handles "whisper only" lines. But the gate compares both engines on the same clips (SC-002), and those clips would have no browser side. This breaks the comparison, so use it only as a last resort.
- **Document it as a limitation** (desktop-only, a specific mic) and record check clips on a setup where both captures coexist. That's cheap, but it leaves T054 fragile.

**Files likely to change**:
- `src/voice/engine.ts` (dev clip ordering, empty-transcript-with-speech hint)
- `src/voice/recorder.ts` (optional constraints override)
- `src/app/voiceController.ts` (only if the hint needs a new outcome reason, e.g. passing the hint for the browser engine in this dev case)
- `tests/voice/engine.test.ts`, `tests/voice/recorder.test.ts`, `tests/helpers/fakeMedia.ts`

**Tests to add or update**:
- `tests/voice/engine.test.ts`: with a `clipRecorder`, `getUserMedia` is requested before `recognizer.start()`, and `started` still fires after `recognizer.start()`. If `getUserMedia` rejects, the recognizer still starts and the command works with no clip.
- `tests/voice/recorder.test.ts`: the constraints override is passed through, and the default constraints don't change (the Whisper path).
- `tests/voice/engine.test.ts`: an empty recognizer transcript with a clip that passes `hasSpeech` resolves to an outcome the controller shows as "No escuché nada" in dev.
- Existing guard: the `tests/security.test.ts` rule that every `checkClips`/`lastClip` read sits under `import.meta.env.DEV` must still pass.
- Manual check (required, since the fakes can't model contention): Chrome with check clips on gives a live transcript and a card, and the saved `.webm` plays back with the command.

## Risks & Considerations

- **Production impact: none expected.** `clipRecorder` is passed only in dev builds with check clips on, and the security test enforces the DEV guard. The bug blocks the audio check (T054) and so the Whisper release gate. It's not a user-facing regression.
- **Clip fidelity**: clips recorded with default processing instead of the Whisper constraints sound slightly different from what Whisper gets in production. That's a small bias in the audio check. Note it in the report, or keep the Whisper constraints if the reorder alone fixes the issue.
- **Start latency**: waiting for `getUserMedia` before `recognizer.start()` adds the acquire time to "listening" in dev check-clip mode. That's acceptable for a dev tool, and it doesn't affect the normal path.
- **Platform variance**: Chrome Android may never allow both captures. If the user records clips on a phone, only the `start(audioTrack)` alternative or a desktop session will work.

## Open Questions

- ~~Does voice work with check clips off?~~ No (desktop Chrome). See the update above.
- [NEEDS CLARIFICATION: Which error, if any, does the console snippet log? Does `main` work in the same Chrome?]
- [NEEDS CLARIFICATION: Which microphone (built-in, USB or Bluetooth headset)?]
- [NEEDS CLARIFICATION: Does the Chrome version in use support `SpeechRecognition.start(MediaStreamTrack)`? It decides whether the single-capture alternative is available.]
