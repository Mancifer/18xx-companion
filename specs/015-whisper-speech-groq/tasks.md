---

description: "Task list for feature 015 — Whisper Speech Recognition (Groq)"
---

# Tasks: Whisper Speech Recognition (Groq)

**Input**: Design documents from `specs/015-whisper-speech-groq/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/speech-engine.md](contracts/speech-engine.md), [contracts/groq-transcription.md](contracts/groq-transcription.md), [contracts/ui.md](contracts/ui.md), [contracts/audio-check.md](contracts/audio-check.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first logic, and the spec's acceptance scenarios are checked by tests (quickstart §1). Write each test task first, and watch it fail before doing the matching implementation task.

**Organization**: tasks are grouped by user story in spec priority order:
- **US1 (P1)**: voice through Whisper in a browser without built-in recognition. This is the
  whole recording → Groq → card path, the toggle and the key.
- **US2 (P2)**: better recognition. Vocabulary hint, transcript clean-up, toggling between engines
  where both exist, and the audio check set.
- **US3 (P3)**: graceful failure. The full Groq error mapping, retry, and the "use the browser's
  recognition" way out.

US1 is the MVP. US2 and US3 both build on US1 and can then go in parallel.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US3)

## Path Conventions

Single-project PWA: `src/`, `tests/`, `docs/`, `eval/` and `e2e/` at the repository root.

## Testing notes

- **Browser engine untouched**: every existing voice test (`tests/voice/speech.test.ts`,
  `tests/ui/voice.test.tsx`, `tests/ui/voiceGate.test.tsx`, `tests/ui/languageSwitch.test.tsx`
  and the others that build a `FakeRecognizer`) must pass **with no edits**. That's the
  regression proof for the browser engine. The only allowed edit is mechanical: if `VoiceDeps`
  gains a field, give it a default in `defaultVoiceDeps` so existing `deps()` helpers still
  type-check, or add it to those helpers.
- **Media fakes**: jsdom has no `MediaRecorder`, `getUserMedia` or `AudioContext`. All whisper
  code takes them through `MediaDeps` (contracts/speech-engine.md). T005 builds one shared fake
  in `tests/helpers/fakeMedia.ts`:
  - `FakeMediaRecorder` with `isTypeSupported` per test, `start`/`stop`, and `dataavailable` then
    `stop` events;
  - a `getUserMedia` that resolves a stream of `FakeTrack`s with a `stopped` flag, or rejects
    with a named `DOMException`;
  - a `FakeAnalyser` fed a scripted array of RMS levels.
- **Groq is never called in tests**:
  - unit tests pass a `fetch` stub to the transcriber;
  - UI tests inject a fake `Transcriber` through `VoiceDeps`;
  - e2e mocks `https://api.groq.com/openai/v1/audio/transcriptions` with `page.route`.
- **Fake timers** (`vi.useFakeTimers()`) for the 30 s limit, the 8 s timeout and the retry wait.
- **UI helpers**: `openSeededTable({ game, actions, settings })`, `openMenuItem` and `byLine` in
  `tests/ui/helpers.tsx`. Seed `settings: { whisper: true, groqKey: "gsk_test" }` once T009
  exists.
- **Language**: tests are Spanish-pinned by `tests/setup.ts` (feature 014). English assertions
  seed `settings: { language: "en" }`.
- **Spanish strings**: new Spanish strings use Uruguayan Spanish as written in contracts/ui.md and
  contracts/groq-transcription.md. Don't reword existing strings.
- **No auto-commit**: leave changes uncommitted for review. Ignore any "commit after each task"
  habit.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: config and baselines that every story relies on.

- [X] T001 Record the baselines before any change: run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build && npm run test:e2e` (remember to build first: the :4173 preview may serve an old `dist/`). Write the pass counts and durations under **Baselines** at the end of this file.
- [X] T002 [P] Add `eval/audio/clips/`, `eval/audio/fixtures/`, `eval/audio/transcripts/` and `eval/audio/results/` to `.gitignore`. Keep `eval/audio/manifest.jsonl` tracked (contracts/audio-check.md, "Clips policy").
- [X] T003 [P] Test first: in `tests/security.test.ts`, change the "production CSP" expectation to `["'self'", "https://api.anthropic.com", "https://generativelanguage.googleapis.com", "https://api.groq.com"]`. (The assertion on the Groq endpoint in `groq.ts` belongs to T017, so the suite stays green through Phase 2.) Then add `https://api.groq.com` to the `connect-src` in `vite.config.ts` and update the comment above it. Check that `public/_headers` already has `microphone=(self)` and leave it unchanged.
- [X] T004 [P] In `playwright.config.ts`:
  - give the `phone` project `launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }`. The `tablet` project (iPad descriptor, WebKit) gets no args;
  - add `env: { VITE_WHISPER_LANGUAGES: "es,en" }` to `webServer`. The e2e build is a production build, where `.env.production` keeps Whisper off until its gate passes. Process env overrides `.env` files in Vite, so the whisper e2e can run. The production default (hidden) is covered by unit and UI tests.
  Run the existing e2e suite to confirm nothing changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the engine seam, the settings rows, the shared fakes and the new message codes. No
user-visible change: with the toggle off (the default), the app behaves exactly as before.

**⚠️ CRITICAL**: no user story work starts until this phase is done.

### Tests for Phase 2 ⚠️

- [X] T005 [P] Create the shared media fakes in `tests/helpers/fakeMedia.ts`, as listed in Testing notes:
  - `FakeMediaRecorder` with a static `supported: Set<string>` for `isTypeSupported`;
  - `fakeGetUserMedia({ fail?: "NotAllowedError" | "NotFoundError" | "OverconstrainedError" | "SecurityError" | "AbortError" })`;
  - `FakeTrack.stopped`;
  - `FakeAudioContext` with `close()` tracking and `createAnalyser()` returning a `FakeAnalyser` that plays `levels: number[]`;
  - `fakeMediaDeps(options)` that bundles them as a `MediaDeps`.
  No production code.
- [X] T006 [P] Write `tests/voice/engine.test.ts`. `browserEngine(factory)` wrapping the existing `FakeRecognizer` pattern (copy the class from `tests/ui/voice.test.tsx`):
  - `supported()` follows `speechAvailable`;
  - `start` emits `{ kind: "started" }` right after `recognizer.start()`, then one `{ kind: "interim", text }` per result;
  - `stop()` resolves `{ kind: "text", text }` with `assembleTranscript`'s output, or `{ kind: "empty", reason: "silence" }` for "";
  - `cancel()` calls `abort()` and makes the pending `stop()` resolve `{ kind: "empty", reason: "cancelled" }`.
- [X] T007 [P] Write `tests/persistence/settingsWhisper.test.ts` against `SettingsRepo` with fake-indexeddb, following `tests/persistence/settingsRepo.test.ts`:
  - **`whisper`**:
    - defaults to `false`;
    - a non-boolean stored value reads as `false`;
    - setting `groqKey` never writes the `whisper` row, and setting `whisper` never writes `groqKey`;
    - with `rememberKey: false`, `whisper` is still stored and survives a new `SettingsRepo` on the same db.
  - **`groqKey`**:
    - "Trimmed; blank = removed";
    - with `rememberKey: false` it lives only in memory, the `groqKey` row is deleted, and a new `SettingsRepo` on the same db reads no key;
    - turning `rememberKey` back on stores it again.
  - **`checkClips`**: reads as `false` when `import.meta.env.DEV` is false (stub it), whatever is stored.
  - **`apiKeys`, `provider`, `models`**: unchanged by any of the above.
- [X] T008 [P] Write the Whisper language gate tests in `tests/domain/whisperLanguages.test.ts` (next to `tests/domain/lang.test.ts`) (data-model §2, "Whisper language gate"), following the existing `voiceLanguages` tests (find them with a search for `voiceLanguages(` under `tests/`):
  - `whisperLanguages("")` and `whisperLanguages(undefined)` → `[]` in a production build: **no language is always on**.
  - `"es,en"` → `["es", "en"]`; unknown entries are dropped; a language not in `voiceLanguages()` is dropped.
  - With `import.meta.env.DEV` true (`vi.stubEnv("DEV", true)` or the project's existing way of stubbing it), every voice language is returned, whatever `raw` is.
  - `whisperOffered(lang)` follows the list.

### Implementation for Phase 2

- [X] T009 Add `whisper: boolean`, `groqKey?: string` and `checkClips: boolean` to `Settings`, and `whisper?`, `groqKey?: string | undefined` and `checkClips?` to `SettingsPatch`, in `src/persistence/settingsRepo.ts` (data-model §1).
  - `DEFAULT_SETTINGS` gets `whisper: false, checkClips: false`.
  - `read()` validates the rows.
  - `set()` writes `whisper`/`checkClips` only when they're in the patch, and handles `groqKey` exactly like `apiKeys`: under `rememberKey`, with a `memoryGroqKey` copy, in the same transaction.
  - Make T007 pass.
- [X] T010 [P] Create `src/voice/engine.ts` with the types from contracts/speech-engine.md (`SpeechEngineId`, `CaptureUpdate`, `CaptureOutcome`, `SpeechCaptureSession`, `SpeechEngine`) and `browserEngine(factory: RecognizerFactory): SpeechEngine`, which wraps the unchanged `SpeechCapture` from `src/voice/speech.ts`. Make T006 pass.
- [X] T011 [P] Create `src/voice/transcription/errors.ts` with `TranscriptionError extends Error`:
  - `name = "TranscriptionError"`, `kind: ProviderErrorKind | "audio"` (import `ProviderErrorKind` from `src/voice/errors.ts`), optional `status` and `retryAfterMs`;
  - doc comment: "The message never carries the key, the prompt or the audio".
  In `src/voice/recorder.ts` (stub file for now), export `MicError extends Error` with `kind: "denied" | "noDevice" | "other"`.
- [X] T012 Add the new message codes to `src/i18n/contract/messages/voice.ts`: `voice.transcription { kind }`, `voice.micDenied`, `voice.noMic`, `voice.heardNothing`, `voice.cut`, `voice.noRecorder`, `voice.noSpeechTryWhisper`, `voice.noGroqKey`. Add their texts to `src/i18n/es/messages/voice.ts` and `src/i18n/en/messages/voice.ts`, exactly as in contracts/groq-transcription.md §4–§6 and contracts/ui.md §1. `voice.noGroqKey` is "Add your Groq key in Settings" / "Agregá tu clave de Groq en Ajustes". Add a sample per new code to `tests/helpers/messageSamples.ts`, so the catalog test covers them in both languages.
- [X] T013 Change `src/app/voiceController.ts` to take `engine: SpeechEngine` instead of `recognizer` in `VoiceEnvironment`, read at `press()` time. In `src/app/useVoice.ts`:
  - `VoiceDeps` gets `engines: { browser: SpeechEngine; whisper?: SpeechEngine }`;
  - the default builds `browser` from `recognizer`. Keep `recognizer` in `VoiceDeps` so existing test helpers still work: when `engines` is absent, derive `browser` from `recognizer`;
  - the controller uses `engines.browser` for every command; T027 later adds the Whisper engine, chosen by `settings.whisper && whisperOffered(displayLang)`.
  `press()` only shows `listening` on the `started` update. Behavior with the browser engine is unchanged: the whole existing suite passes with no test edits (T001 counts).
- [X] T014 [P] Implement the Whisper language gate:
  - `whisperLanguages(raw = envWhisperLanguages())` and `whisperOffered(lang)` in `src/i18n/lang.ts`, next to `voiceLanguages()`, with the same `import.meta.env?.` access pattern so the eval runner (tsx) works;
  - `readonly VITE_WHISPER_LANGUAGES?: string` in `src/vite-env.d.ts`;
  - in `.env.production`, add `VITE_WHISPER_LANGUAGES=` (empty) with the comment `# Whisper (feature 015): add a language only after its audio check gate passes (T054).`
  Make T008 pass.

**Checkpoint**: the app behaves as before; settings, the engine seam and the messages are in place.

---

## Phase 3: User Story 1 - Voice commands in a browser without built-in speech recognition (Priority: P1) 🎯 MVP

**Goal**: with Whisper on and a Groq key, holding the mic records, releasing sends the clip to
Groq, and the transcript reaches the usual confirmation card, in any browser that can record.

**Independent Test**: in a browser with no built-in speech recognition (jsdom in UI tests;
Firefox for real), turn Whisper on with a Groq key, hold the mic, say a command, release, and
confirm the action (quickstart §1–§2).

### Tests for User Story 1 ⚠️

- [X] T015 [P] [US1] Write `tests/voice/recorder.test.ts` with `fakeMediaDeps` (T005):
  - **Type choice**: `pickMimeType` goes in the order `audio/webm;codecs=opus` → `audio/ogg;codecs=opus` → `audio/mp4` with extensions `webm`/`ogg`/`mp4`, and returns `undefined` when none is supported.
  - **Start**: `getUserMedia` is called with `{ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }`; `started` fires only after the recorder's `start` event.
  - **Release**: `stop()` resolves a `Blob` of the chosen type, then every `FakeTrack.stopped` is true and the `AudioContext` is closed.
  - **Exits** (FR-013): `cancel()` during acquiring and during recording stops every track.
  - **Mic errors**: `NotAllowedError`/`SecurityError` → `MicError("denied")`; `NotFoundError`/`OverconstrainedError` → `"noDevice"`; anything else → `"other"`.
  - **Level**: `level` updates follow the analyser's levels.
  - **Limit**: at 30 000 ms (fake timers), it emits `limit` and stops by itself with `cut: true` (FR-008).
- [X] T016 [P] [US1] Write `tests/voice/speechGate.test.ts` for `hasSpeech({ durationMs, frameMs: 50, levels })`:
  - false under 400 ms;
  - false with fewer than 250 ms of frames above the threshold;
  - the threshold is set relative to the quietest 10% of frames, so a constant noise floor with no peaks gives false;
  - true for a short spoken burst over that floor.
  Use table cases (data-model §3, "Speech gate").
- [X] T017 [P] [US1] Write `tests/voice/groq.test.ts` for the transcriber's happy path and request shape, with a `fetch` stub:
  - **Request**: a POST to `https://api.groq.com/openai/v1/audio/transcriptions` with `Authorization: Bearer gsk_test`. The `FormData` has `file` (named `command.webm` for a webm blob, `command.mp4` for mp4), `model` = `GROQ_TRANSCRIPTION_MODEL` (`whisper-large-v3-turbo`), `language` `es`/`en`, `prompt`, `response_format` `verbose_json` and `temperature` `"0"`.
  - **Response**: a 200 with `segments` gives `{ kind: "text", text }`, joined and trimmed; with no `segments` it uses `text`.
  - **Empty**: a blank result gives `empty/noSpeech`.
  - **Timeout**: after 8 s (fake timers) it gives `error` with `kind: "timeout"`.
  - **Cancel**: an aborted caller `signal` gives `empty/cancelled`, never an error.
  - **Never rejects** (contracts/groq-transcription.md §1–§3).
  - **Endpoint in source** (moved from T003, analyze I1): in `tests/security.test.ts`, assert that `src/voice/transcription/groq.ts` contains `"https://api.groq.com/openai/v1/audio/transcriptions"`, so the CSP and the client can't drift apart.
- [X] T018 [P] [US1] Write `tests/voice/whisperEngine.test.ts` for `whisperEngine({ media, transcribe })` with fakes:
  - **Start**: `started` comes from the recorder.
  - **Empty**: a recording that fails `hasSpeech` resolves `empty/short` or `empty/silence`, and `transcribe` is **not** called (FR-009).
  - **Order**: tracks are stopped **before** `transcribe` is called (FR-013).
  - **Arguments**: `transcribe` gets the blob, the display language, `hint()` and an `AbortSignal`.
  - **Cancel**: `cancel()` while transcribing aborts that signal and resolves `empty/cancelled`.
  - **Mic errors**: `MicError` comes back as `{ kind: "error" }`.
  - **Support**: `supported()` is false without `MediaRecorder`, without `getUserMedia`, or with no supported type.
- [X] T019 [P] [US1] Write `tests/app/voiceControllerWhisper.test.ts`, the controller with a fake whisper `SpeechEngine` (data-model §6):
  - **Release**: release → `transcribing` → `interpreting` with the transcript → `result`.
  - **Interpreter input**: the interpreter receives the same `snapshotAndTranscript` input as for a browser transcript (FR-011).
  - **Level**: updates set `listening.level`.
  - **"sí"**: a "sí" transcript with a card open confirms it (edge case "voice confirmation").
  - **Empty**: an empty outcome returns to the previous card or `idle` with `hint: "empty"`. `cancelled` gives no hint.
  - **Limit**: the `limit` update triggers release and the result carries `hint: "cut"`.
  - **Cancel**: `cancel()` during `transcribing` → `idle`. A late outcome from an older press (generation id) is ignored.
  - **Errors**: a `MicError("denied")` outcome → a not-understood result with `voice.micDenied` and no transcript.
  - **Engine choice**: the engine is read at `press()`, so switching it mid-command doesn't affect the command in flight.
  - **Release-to-card timing** (analyze A2): with an injected `now()` and a `log` spy, a 700 ms transcription followed by the interpreter gives a `voz: N ms hasta la tarjeta` line whose N includes the transcription, i.e. it's measured from the start of `release()`.
- [X] T020 [P] [US1] Write `tests/app/voiceAvailability.test.ts` for the order in data-model §2. Use table cases with `settings.whisper` on and off, `whisperOffered(lang)` true and false (stub `VITE_WHISPER_LANGUAGES`), recorder support on and off, recognizer on and off, online on and off, and a Groq key and AI key present or absent:
  1. Voice not offered in the display language → unavailable, mic hidden (unchanged).
  1b. `settings.whisper: true` but `whisperOffered(lang)` false → treated as Whisper **off**. The browser engine is checked, and no Groq-key reason is ever given.
  2. `voice.noRecorder`;
  3. `voice.noSpeech`, or `voice.noSpeechTryWhisper` only when the recorder is supported **and** `whisperOffered(lang)`;
  4. `voice.offline`;
  5. `voice.noGroqKey`, with Whisper on and no key, even when the browser recognizer exists (no silent fallback, FR-004);
  6. `voice.noKey`.
- [X] T021 [P] [US1] Write `tests/ui/whisper.test.tsx` with `openSeededTable` and `VoiceDeps` carrying a fake whisper engine built on a fake `Transcriber`, in Spanish plus one English case:
  - **Settings**:
    - the toggle "Usar Whisper (Groq) para reconocer la voz" is off by default;
    - the "Clave de Groq" field is shown with the toggle off;
    - the billing note text (contracts/ui.md §1);
    - saving a key leaves the toggle off;
    - the privacy line switches to the Groq text when the toggle is on (FR-005).
  - **No browser recognizer**:
    - toggle off: the mic is disabled with "Este navegador no reconoce la voz. Activá Whisper para usar la voz" (US1-2);
    - toggle on and key set: the mic is enabled (US1-1).
  - **Command**: hold, then "Escuchando…" with the ring's `--mic-level` style; release, then "Transcribiendo…" with "Cancelar"; then the card; confirm applies the action and the cash changes (US1-3).
  - **Mic denied**: shows `voice.micDenied` and the touch menus still open (US1-4).
  - **Empty**: shows "No escuché nada" and no card.
  - **Hidden page** (FR-013, analyze U1): while listening, set `document.visibilityState` to `"hidden"` (`Object.defineProperty` on `document`) and dispatch `visibilitychange`. The phase goes back to idle (the mic shows "Mantén pulsado para hablar" again), every `FakeTrack.stopped` is true, and the fake `Transcriber` is not called. Do the same while transcribing: its `AbortSignal` is aborted and no card appears.
  - **Language gate** (FR-018): with `VITE_WHISPER_LANGUAGES` stubbed to `""` and a production `DEV` stub, Settings shows no Whisper toggle, while the "Clave de Groq" field stays. With `whisper: true` seeded, a command goes through the `FakeRecognizer` and the fake `Transcriber` is never called.
  - Touch-target size is checked in the e2e (T031), since jsdom doesn't lay out CSS.

### Implementation for User Story 1

- [X] T022 [P] [US1] Implement `src/voice/transcription/groq.ts`:
  - `GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"`;
  - the `Transcriber` type, and `createGroqTranscriber({ fetch = globalThis.fetch })`;
  - the multipart request in contracts/groq-transcription.md §1;
  - the zod `passthrough` response schema `{ text: string, segments?: { text, no_speech_prob, avg_logprob }[] }`;
  - the 8 s `AbortController` per attempt, merged with the caller's `signal`; a caller abort resolves `empty/cancelled`.
  For now map every non-2xx to `TranscriptionError("service")`; US3 completes the mapping. Leave the segment filter as a plain join (US2 adds it). Make T017 pass.
- [X] T023 [P] [US1] Implement `src/voice/speechGate.ts`: `hasSpeech({ durationMs, frameMs, levels })`, with exported constants `MIN_DURATION_MS = 400`, `MIN_VOICED_MS = 250` and the relative-threshold factor. Make T016 pass.
- [X] T024 [US1] Implement `src/voice/recorder.ts`:
  - `MediaDeps` (`getUserMedia`, `MediaRecorder`, `AudioContext`);
  - `browserMediaDeps()` that reads them from `globalThis`, or returns `undefined`;
  - `pickMimeType`, `AudioRecorder` with the states in data-model §3, the ~50 ms analyser sampling and the 30 s limit (`MAX_RECORDING_MS = 30_000`);
  - `MicError` mapping, and stopping the tracks and closing the `AudioContext` on every exit.
  Make T015 pass.
- [X] T025 [US1] Implement `src/voice/whisperEngine.ts`: `whisperEngine({ media, transcribe, apiKey: () => string | undefined })`, as in contracts/speech-engine.md. It combines `AudioRecorder` and `hasSpeech`, stops the tracks before calling `transcribe(blob, { apiKey, lang, prompt: hint(), fileName: "command." + extension, signal })`, and turns the result into a `CaptureOutcome`. Make T018 pass.
- [X] T026 [US1] Add the `transcribing` phase, `listening.level`, `result.hint`, the generation id, `limit` handling and the outcome mapping (contracts/speech-engine.md, "Controller rules") to `src/app/voiceController.ts`. Map `MicError` in `resolveError` in `src/voice/resolve.ts`: `denied` → `voice.micDenied`, `noDevice` → `voice.noMic`, `other` → `voice.unexpected`; a `TranscriptionError` → `voice.transcription { kind }`; the result has no transcript. Set `releasedAt` at the **start** of `release()`, before awaiting the engine. Today it's set after `capture.stop()` resolves, which with Whisper would leave out the transcription time. Then the dev log `voz: N ms hasta la tarjeta` is a true release-to-card time for both engines (analyze A2; the browser engine's number barely changes). Make T019 pass, including its timing case.
- [X] T027 [US1] In `src/app/useVoice.ts`:
  - **Engine**: build the default whisper engine from `browserMediaDeps()`, `createGroqTranscriber()` and `settings.groqKey`. Pass `engines.whisper` to the controller while `settings.whisper && whisperOffered(displayLang)` (data-model §2, `activeEngine`), read at press time.
  - **Hint**: until US2, `hint: () => ""`.
  - **Availability**: make `voiceAvailability(deps, settings, lang)` engine-aware in the order of data-model §2.
  - **Hidden page**: register `visibilitychange` → `controller.cancel()` when the page is hidden (FR-013).
  Make T020 pass.
- [X] T028 [P] [US1] Add the Settings strings to `src/i18n/contract/ui.ts`, `src/i18n/es/ui/settings.ts` and `src/i18n/en/ui/settings.ts`: the toggle, help, billing note, key label, placeholder `gsk_…`, the "Get a key at console.groq.com" link text, the unsupported-browser line and the Whisper privacy line (contracts/ui.md §1–§2, verbatim). Add the mic strings ("Transcribiendo…"/"Transcribing…", "Cancelar"/"Cancel") to `src/i18n/{es,en}/ui/components.ts`.
- [X] T029 [US1] In `src/ui/screens/Settings.tsx`, add:
  - the Whisper toggle (checkbox, `draft.whisper`), with help and billing note, rendered only when `whisperOffered(lang)` (contracts/ui.md §1, "Language gate");
  - the Groq key field (`type="password"`, always shown) and the key link (`https://console.groq.com/keys`, `rel="noreferrer"`);
  - the disabled toggle with `voice.noRecorder` text when the recorder isn't supported;
  - the availability reason line;
  - the engine-dependent privacy line.
  Save `whisper` and `groqKey` with the existing save flow, and keep the existing "don't remember keys" checkbox applying to both. Saving the key never changes the toggle.
- [X] T030 [US1] In `src/ui/components/MicButton.tsx` and `src/ui/styles/components.css`:
  - **Listening with Whisper**: show "Escuchando…" and set `style={{ "--mic-level": level }}` for a ring whose **thickness** follows the level (not only color).
  - **Transcribing**: show "Transcribiendo…" with a 48 px "Cancelar" button that calls `controller.cancel()` (wire `onCancel` from `src/ui/screens/Table.tsx`).
  - **Announcements**: `aria-live` announces phase changes only.
  In `src/ui/components/VoicePanel.tsx`, show `result.hint` (`voice.heardNothing`, `voice.cut`) as a toast-sized line, styled like the undo toast. Make T021 pass.
- [X] T031 [US1] Write `e2e/whisper.spec.ts`. It is the first e2e spec that runs voice, so it mocks both services:
  - **Groq mock**: `page.route("https://api.groq.com/openai/v1/audio/transcriptions", …)` returns a fixed `verbose_json` whose text matches a recorded command for the seeded game.
  - **AI provider mock**: `page.route("https://api.anthropic.com/v1/messages", …)` fulfills with the matching recorded `Anthropic.Message` JSON from `tests/voice/recorded/` (pick one whose transcript and seeded players fit, e.g. a share purchase).
  - **Seeding**: use the helpers in `e2e/helpers.ts`. Set the settings rows `whisper: true`, `groqKey`, and an Anthropic key in IndexedDB the way those helpers seed data. If they have no settings seeding, add a `seedSettings(page, rows)` helper there.
  - **Flow**: hold the mic for about 1 s, release, see "Transcribiendo…", then the card, confirm, and see the cash change. Assert the Groq route was called once, with `language` and `response_format=verbose_json` in the multipart body.
  - **Touch targets** (analyze U3): delay the mocked Groq response (about 1 s) so "Transcribiendo…" stays on screen. Assert that `boundingBox()` of the mic button and of the "Cancelar" button are both at least 48 px high and wide, on phone and tablet.
  - **Build**: Whisper is on in this build only because T004 passes `VITE_WHISPER_LANGUAGES` to the e2e web server. Locally, Playwright reuses a preview server that's already running on :4173, which may come from a plain `npm run build` with Whisper hidden (analyze I4). So each test first opens Settings and checks the Whisper toggle exists. If it doesn't, the test fails with: `Whisper isn't offered in this build: stop the preview server on :4173 and re-run npm run test:e2e, so it rebuilds with VITE_WHISPER_LANGUAGES`. Use `expect(toggle, message).toBeVisible()`.
  - **Phone** (Chromium): uses the fake media device (T004).
  - **Tablet** (WebKit): `page.addInitScript` stubs `navigator.mediaDevices.getUserMedia` and `MediaRecorder` with a tiny `audio/mp4` blob.
  - **Toggle off**: a second test seeds Whisper **off** with a Groq key saved, opens Settings and a session, presses and releases the mic once (whatever the browser engine does headless is irrelevant), and asserts the Groq route was **never** called (FR-003).

**Checkpoint**: US1 works on its own: Whisper voice in a browser without recognition, opt-in, the
mic released after each command, nothing sent while the toggle is off.

---

## Phase 4: User Story 2 - Better recognition of table jargon in any browser (Priority: P2)

**Goal**: names come out as the session spells them, Whisper's hallucinations on silence are
dropped, the player can switch engines without losing the key, and Whisper is measured against
the browser engine on recorded speech.

**Independent Test**: in a browser that has both engines, the audio check set reports both
engines on the same clips (contracts/audio-check.md). In tests: the request carries the hint and
language, and toggling engines keeps the key.

### Tests for User Story 2 ⚠️

- [X] T032 [P] [US2] Write `tests/voice/hint.test.ts` for `buildHint(session, lang)` on each built-in game fixture (1830, 1848, 21Moon, RotLA) in `es` and `en`:
  - **Order**: lead-in with the game name, players and aliases, companies' short names and aliases, train names, then the language's hint words.
  - **De-duplication**: case-insensitive.
  - **Budgets**: the result is "≤ 400 chars and ≤ 180 estimated tokens" (data-model §4). Test the estimate on its own: `estimateTokens("B&O, C&O, 2, 3, 4")` counts each `&`, `,` and digit as 1 and each word as `ceil(length / 3)`. Truncation drops whole terms from the end until both budgets hold, never cuts a term, and is deterministic. A synthetic session with 8 players and long aliases still keeps every player name and drops game words first.
  - **Snapshot**: one inline snapshot per language for the 1830 fixture.
- [X] T033 [P] [US2] Write `tests/voice/clean.test.ts` for `cleanTranscript(response, lang)`:
  - **Segment filter**: a segment is dropped only when `no_speech_prob > 0.6 && avg_logprob < -1.0`, so a confident short "sí" with a high `no_speech_prob` is kept.
  - **Hallucinations**: the whole normalized transcript matching the language's list (contracts/groq-transcription.md §7) → `empty/hallucination`. "gracias, Ana paga 30" is kept, and matching is never by substring.
  - **Normalization**: lower case, no accents, no punctuation, collapsed spaces.
- [X] T034 [P] [US2] Extend `tests/ui/whisper.test.tsx` with US2-1, US2-2, US2-3 and US2-4:
  - **US2-1**: with a `FakeRecognizer` present and Whisper off, saving a Groq key keeps the browser engine, so the fake `Transcriber` is never called.
  - **US2-2**: turning Whisper off makes the next command use the recognizer; turning it on again uses the transcriber with no key re-entry; the toggle survives a reload of settings.
  - **US2-3**: the fake `Transcriber` receives a `prompt` containing the seeded players' names and the companies' short names.
  - **US2-4**: it receives `lang` `es`, or `en` with `settings.language: "en"`.
- [X] T035 [P] [US2] Write `tests/eval/audioCheck.test.ts` for the pure parts of `eval/audio/` (no network):
  - **Args**: parsing `--lang`, `--model`, `--resolver`, `--only`, `--groq-rpm` (default 18), `--rpm`, `--free` and `--transcripts cached|fresh` (default `cached`); a bad `--groq-rpm` throws.
  - **Cache key**: SHA-256 of clip bytes + model + language + hint; changing any one changes the key.
  - **Cache writes**: only `text`/`empty` results are cached, never errors.
  - **Summary**:
    - correct/total per engine on clips that have both engines;
    - the `mentionsName` subset;
    - latency p50/p90 counting only measured (non-cached) requests, with the measured count reported;
    - billed seconds use the 10 s minimum per request;
    - free-tier cost shows `$0.00 (free tier)` plus the paid equivalent.
  - **Gate check** (contracts/audio-check.md, "Gate"): Whisper `correct` ≥ browser, names subset +10 points, p90 sum ≤ 4 000 ms. *(Relaxed in T054 on 2026-11-07: accuracy −10 points, names −15 points, speed only when measured.)*
  - **Collect**: maps a `candidate-*.json` + clip pair to a manifest line with the next id (`es-a001`…) and a derived `mentionsName`.

### Implementation for User Story 2

- [X] T036 [P] [US2] Add `hintWords: readonly string[]` and `hallucinations: readonly string[]` to `VoiceText` in `src/i18n/contract/voice.ts`, with the values in `src/i18n/es/voice.ts` and `src/i18n/en/voice.ts`. The hint words are "dividendos, retiene, compra, vende, paga, mitad" / "dividends, withholds, buys, sells, pays, half"; the hallucinations are the lists in contracts/groq-transcription.md §7. The Spanish prompt and tools must stay byte-identical: the existing `tests/voice/__snapshots__` must not change.
- [X] T037 [US2] Implement `src/voice/transcription/hint.ts` (`buildHint`, `estimateTokens`, `HINT_MAX_CHARS = 400`, `HINT_MAX_TOKENS = 180`), reading names and aliases from the `VoiceSession` and train names from the game definition the way `src/voice/prompt.ts` does. Make T032 pass.
- [X] T038 [US2] Implement `src/voice/transcription/clean.ts` (`cleanTranscript`, `NO_SPEECH_PROB = 0.6`, `MIN_AVG_LOGPROB = -1.0`) and call it from `src/voice/transcription/groq.ts` in place of the plain join. Make T033 pass and keep T017 green.
- [X] T039 [US2] In `src/app/useVoice.ts`, pass `hint: () => buildHint(controllerContext(), displayLangRef.current)` to the whisper engine, built from the same context the interpreter gets. Make T034 pass.
- [X] T040 [US2] Dev check clips (contracts/speech-engine.md, "Dev check clips"; research R11), all under `import.meta.env.DEV`:
  - **Setting**: the "Grabar clips de control" / "Record check clips" checkbox in `src/ui/screens/Settings.tsx` (`checkClips`), with its strings in `src/i18n/{es,en}/ui/settings.ts`.
  - **Recording**: change the signature to `browserEngine(factory, options?: { clipRecorder?: () => MediaDeps | undefined })` (contracts/speech-engine.md). `useVoice` passes `clipRecorder` only when `import.meta.env.DEV && settings.checkClips`, and then `browserEngine` also runs an `AudioRecorder` on the same hold. This is the dev exception constitution VII allows. Both engines keep the last clip `{ blob, extension, engine }` on the controller (`controller.lastClip`).
  - **Saving**: `SaveForEval` in `src/ui/components/VoicePanel.tsx` also downloads `candidate-<stamp>.<ext>` and adds `audio`, `engine` and `lang` to the JSON.
  - **Tests**: add a UI test to `tests/ui/whisper.test.tsx` with `import.meta.env.DEV` true. In `tests/security.test.ts`, assert that every source line that reads `checkClips` or `lastClip` sits in a file or block guarded by `import.meta.env.DEV`, using the same source-scan style as the existing rules there.
- [X] T041 [US2] Implement `eval/audio/collect.ts` (`npm run eval:audio:collect -- <folder>`). It moves clips to `eval/audio/clips/` and session exports to `eval/audio/fixtures/`, and appends to `eval/audio/manifest.jsonl` the fields in data-model §7 (`id`, `lang`, `audio`, `fixture`, `browserTranscript?`, `expect`, `mentionsName`). Candidates without `audio` are skipped with a message. Create an empty `eval/audio/manifest.jsonl`.
- [X] T042 [US2] Implement `eval/audio/cli.ts` and `eval/audio/run.ts` (`npm run eval:audio`), reusing `createPacer`, `withBackoff` and `sleep` from `eval/voice/cli.ts`, plus the voice eval's resolver, fixture loading and grader:
  - **Pacers**: one Groq pacer at `--groq-rpm` and the AI pacer per `--rpm`/`--free`.
  - **Transcription**: through the app's `createGroqTranscriber` and `buildHint`, using the transcript cache in `eval/audio/transcripts/`.
  - **Resolving**: both transcripts per clip.
  - **Stops**: a daily-quota 429 (or retries exhausted) stops the run and writes a **partial** report.
  - **Report**: printed and written to `eval/audio/results/<stamp>.json` as in contracts/audio-check.md (both engines, names subset, p50/p90 of measured requests only, billed seconds, cost, WER secondary, failed ids with both transcripts).
  - **Keys**: `GROQ_API_KEY` plus the resolver's key from the environment; a missing key stops before any request.
  - **Scripts**: add `"eval:audio"` and `"eval:audio:collect"` to `package.json` (`tsx eval/audio/run.ts`, `tsx eval/audio/collect.ts`).
  Make T035 pass.

**Checkpoint**: US2 works on its own: hints and clean-up on every Whisper request, engines
switchable without losing the key, and the audio check ready to run.

---

## Phase 5: User Story 3 - Graceful failure and fallback (Priority: P3)

**Goal**: every Groq or mic failure gives a plain message in the display language, proposes
nothing, keeps touch available, and offers the browser engine when there is one.

**Independent Test**: simulate bad key, rate limit, timeout, no connection and empty audio, and
check the message, that no state changes, and that touch works (quickstart §1, US3 rows).

### Tests for User Story 3 ⚠️

- [X] T043 [P] [US3] Extend `tests/voice/groq.test.ts` with the full mapping table in contracts/groq-transcription.md §4:
  - **Status mapping**: 401 → `auth`, 403 → `permission`, 404 → `model`, 429 → `rateLimit` (with `retryAfterMs` from `retry-after` seconds), 400/413/422 → `audio`, 5xx and a body failing the schema → `service`, 8 s → `timeout`, `TypeError` from fetch → `connection`.
  - **Retry**: at most one retry, after `min(retry-after, 1 s)` or 0.5 s, only for a 429 with `retry-after` ≤ 1 s (or none), 5xx and network errors. Never for 400/401/403/404/413/422 or a timeout.
  - **Cancel**: a caller abort during the retry wait resolves `empty/cancelled`.
  - **Secrets**: no error `message` contains the key, the prompt or `FormData` contents.
- [X] T044 [P] [US3] Extend `tests/ui/whisper.test.tsx` for US3-1, US3-2, US3-3 and US3-4:
  - **US3-1**: a fake `Transcriber` returning each error kind shows its Spanish message (and one English), with no transcript line, nothing proposed, an unchanged ledger, and a touch menu that still opens. `auth` shows "Groq: la clave no es válida. Revisala en Ajustes".
  - **US3-2**: with a `FakeRecognizer` present, the card shows "Usar el reconocimiento del navegador". Tapping it saves `whisper: false`, closes the card and adds no history entry; the next command uses the recognizer.
  - **US3-4**: without a recognizer, that button isn't shown.
  - **Mic**: `MicError("noDevice")` shows "No se encontró un micrófono".
  - **US3-3**: an empty recording shows "No escuché nada" and doesn't call the interpreter.
- [X] T045 [P] [US3] Add one e2e case to `e2e/whisper.spec.ts`: the Groq route returns 401, and the card shows the auth message. Assert the "Usar el reconocimiento del navegador" button only when `await page.evaluate(() => "SpeechRecognition" in window || "webkitSpeechRecognition" in window)` is true, and assert its absence otherwise (analyze I2: headless browsers may not expose a recognizer). Cancel, then a touch action still applies.

### Implementation for User Story 3

- [X] T046 [US3] Complete the error mapping and the single retry in `src/voice/transcription/groq.ts` per contracts/groq-transcription.md §3–§4, following the Gemini adapter's `toVoiceProviderError`, `retryable` and `retryWaitMs` in `src/voice/providers/gemini.ts`. Keep the dev-only error text `Groq: <status> <error.message>` free of key, prompt and audio. Make T043 pass.
- [X] T047 [US3] In `src/ui/components/VoicePanel.tsx`, add the "Use the browser's recognition" / "Usar el reconocimiento del navegador" button (48 px). It's shown for a `voice.transcription` error when `deps.engines.browser.supported()`; it calls `settings.set({ whisper: false })`, dispatches `SETTINGS_CHANGED` and cancels the card. It never dispatches an action. Add its string to `src/i18n/{es,en}/ui/components.ts`. Make T044 and T045 pass.

**Checkpoint**: all three stories work on their own.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T048 [P] Extend `tests/security.test.ts`:
  - **No key logging**: no `console.*` call in files that handle `groqKey` or the `Authorization` header for Groq (like the 005 `apiKeys` rule).
  - **Exports**: `buildExport` output for a session saved with `groqKey` set contains neither the key nor the word `groqKey` (SC-005).
  - **No stored audio**: no `Blob` or `audio` field is written to IndexedDB. Assert `SessionRepo`/`SettingsRepo` writes in a Whisper UI test contain no `Blob` (FR-012).
- [X] T049 [P] Update `docs/spec.md`:
  - §2 scope: Whisper as an opt-in speech engine;
  - the tech-stack speech-to-text line: two engines;
  - §8.1 flow: "shown live" only with the browser engine, the transcribing step and the vocabulary hint;
  - §8.2 failure modes: Groq errors and mic errors;
  - Settings and privacy: the toggle, the Groq key, the billing note and where audio goes;
  - later iterations: other transcription hosts.
  Follow the constitution 2.2.0 wording.
- [X] T050 [P] Update `README.md`: Groq Whisper as an optional speech engine, off by default, with where to get a key, that it may be billed on paid Groq plans, and the browsers it adds (SC-001).
- [X] T051 [P] Bump the version to 0.3.0 in `package.json` and `src/app/version.ts` (`APP_VERSION`), and update any test that pins `0.2.0` as the current version, keeping fixtures that record older versions.
- [X] T052 Run the final gates: `npm run typecheck`, `npm run lint`, `npm test` and `npm run build && npm run test:e2e`. Compare them with the T001 baselines: test counts only go up, and durations stay in line (summarize the full-suite timing output with a cheap subagent before reading it). Fix any failure.
  - **Voice eval report** (constitution workflow gate; analyze G1): `src/voice/resolve.ts` changed. Confirm the prompt and tool snapshots in `tests/voice/__snapshots__/` are byte-identical (`git diff --stat tests/voice/__snapshots__` is empty).
  - **(user)** Then run one `npm run eval:voice -- --lang all` (a free Gemini key with `--free` is enough) and record the result file and accuracy here, next to feature 014's last run.
- [X] T053 Delete the Sync Impact Report comment at the top of `.specify/memory/constitution.md` before the constitution is committed (it's amendment scratch material). Commit order for the user: constitution 2.2.0, then spec/plan/tasks, then the implementation.
- [X] T054 **(user)** Audio check set (quickstart §3; contracts/audio-check.md):
  - **Result (2026-11-07)**: 46 clips (23 es, 23 en, one speaker), resolver `gemini-3.6-flash`, model `whisper-large-v3-turbo`.
    - **Fresh run** `eval/audio/results/2026-11-07T20-18-55-whisper-large-v3-turbo.json`, used for speed: Whisper p90 561 ms (es) and 587 ms (en), resolver p90 2,374 ms, so about 2.9–3.0 s in total. No Groq errors and no 400s on long hints.
    - **Cached re-run** `eval/audio/results/2026-11-07T20-49-31-whisper-large-v3-turbo.json`, used for accuracy, after the grader fixes (`reason` not graded, mergers in either order) and two manifest corrections (es-a009 → `startOR`, en-a023 has no spoken price):

      | Language | Engine | Correct | Names |
      |---|---|---|---|
      | es | browser | 20/23 | 15/17 |
      | es | whisper | 21/23 | 15/17 |
      | en | browser | 21/23 | 17/19 |
      | en | whisper | 19/23 | 15/19 |

    - **Gate**: the original gate (≥ browser, +10 points on names) failed in both languages; desktop Chrome already gets 88–94% on names. The user relaxed SC-002 to accuracy −10 points and names −15 points. es passes (+4 / 0) and en passes (−8.7 / −10.5), so both are added to `VITE_WHISPER_LANGUAGES`.
    - **What Whisper got wrong**: mostly English names and numbers ("Spice" for buys, "Kolek, Tuenli" for "collect twenty", 40 for "four"). The user suspects their accent.
    - **Not done**: the optional `--model whisper-large-v3` run, and a second speaker. No sign of clipped first words, so R4's pre-roll isn't applied.
  - record 20–30 clips per language with "Grabar clips de control" in Chrome, Whisper off;
  - run `npm run eval:audio:collect`;
  - run `npm run eval:audio -- --lang all` (with `--free` for a Gemini free key) and once with `--transcripts fresh` for latency;
  - optionally run `--model whisper-large-v3`.
  Record the result files and whether each language passes the gate here.
  - **Pass**: for each language that passes, add it to `VITE_WHISPER_LANGUAGES` in `.env.production`, with a comment giving the date and the result file. Until then production keeps Whisper hidden in that language (FR-018).
  - **Model**: if large-v3 clearly wins, change `GROQ_TRANSCRIPTION_MODEL`.
  - **Clipped first words**: apply research R4's pre-roll fallback.
  - **Errors**: check the run's errors for 400s on the longest-hint fixture (RotLA). If there are any, lower `HINT_MAX_TOKENS` (research R8).
- [X] T055 **(user)** Manual check (quickstart §2) with a real Groq key:
  - **Done (2026-11-07, as reported by the user)**:
    - the phone with Groq works well;
    - steps 1–8 in the browsers listed below;
    - SC-003 on a phone, with the timing check done (the per-command counts weren't recorded here);
    - Groq's usage page shows nothing sent while the toggle was off (FR-003);
    - browser voice on Chrome Android after bug `browser-speech-regression` was fixed.
  - **I3 (voseo in the existing mic labels)**: decided to keep them as they are. Voice recognition accepts both forms, and the user prefers the UI to stay neutral.
  - steps 1–7 in Chrome;
  - step 8 on desktop Chrome, Edge, Firefox and Safari, and mobile Chrome Android and Safari iOS (tab and installed PWA) (SC-001);
  - confirm in Groq's usage page that nothing was sent while the toggle was off;
  - **SC-003 on a phone** (analyze A2): on Chrome Android with `npm run dev` over a tunnel (Whisper offered in dev), make at least 20 Whisper commands on a mobile connection. Copy the `voz: N ms hasta la tarjeta` log lines (remote DevTools) and record here how many are under 4,000 ms. SC-003 needs 90%.
  - Result from test: We ran 30 commands, all of them completed in under 4000 ms

---

## Baselines

*(filled by T001, 2026-11-07, on unchanged code)*

| Gate | Result | Duration |
|---|---|---|
| typecheck | pass | 7 s |
| lint | pass | 18 s |
| unit + UI (`npm test`) | 110 files; 2265 passed, 1 failed (pre-existing timing flake: `tests/domain/perf.test.ts` "replays a 1500-group RotLA log with mergers in under 50 ms", measured 50.87 ms) | 23.4 s (Vitest), 24.4 s wall |
| e2e (`npm run build && npm run test:e2e`) | 44 passed (phone 22, tablet 22), no retries | 37.1 s (Playwright), 46.4 s wall |

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. T001 runs first, on unchanged code.
- **Foundational (Phase 2)**: after Setup. It blocks every story.
- **US1 (Phase 3)**: after Phase 2. T020, T021, T027 and T029 use `whisperOffered` from T014.
- **US2 (Phase 4)**: after US1's T022, T025 and T027 (it extends the transcriber, engine and `useVoice`). T035, T041 and T042 (eval) only need T022 and T037.
- **US3 (Phase 5)**: after US1's T022 and T030. It is independent of US2.
- **Polish (Phase 6)**: after the stories it documents. T054 and T055 need everything.

### Within each story

- Tests before implementation; each test must fail first.
- In US1: transcriber, gate and recorder (T022–T024) → engine (T025) → controller (T026) → `useVoice` (T027) → strings and UI (T028–T030) → e2e (T031).

### Parallel Opportunities

- **Setup**: T002, T003 and T004.
- **Phase 2**: tests T005, T006, T007 and T008 together; then T010, T011 and T014 in parallel.
- **US1**: all tests T015–T021 together; T022, T023 and T028 in parallel.
- **US2**: tests T032–T035 together; T036 in parallel with T041.
- **US3**: tests T043–T045 together. All of US3 can run in parallel with US2 after US1.
- **Polish**: T048–T051 together.

---

## Parallel Example: User Story 1

```text
# Tests together:
T015 tests/voice/recorder.test.ts        T016 tests/voice/speechGate.test.ts
T017 tests/voice/groq.test.ts            T018 tests/voice/whisperEngine.test.ts
T019 tests/app/voiceControllerWhisper.test.ts
T020 tests/app/voiceAvailability.test.ts T021 tests/ui/whisper.test.tsx

# Then, in parallel:
T022 src/voice/transcription/groq.ts     T023 src/voice/speechGate.ts
T028 src/i18n/{es,en}/ui/settings.ts + components.ts
```

## Parallel Example: US2 alongside US3

```text
US2: T032 hint tests → T037 hint.ts → T039 wire hint      T035 eval tests → T041/T042 eval scripts
US3: T043 groq error tests → T046 mapping + retry         T044 UI error tests → T047 browser fallback button
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1, with T001 on unchanged code.
2. Phase 2: the app is unchanged with the toggle off.
3. Phase 3 (US1).
4. **Stop and validate**: run `tests/ui/whisper.test.tsx` and `e2e/whisper.spec.ts`. Then try `npm run dev` in Firefox with a real Groq key (one command costs a fraction of a cent, or nothing on the free plan).

### Incremental Delivery

1. Setup + Foundational: no visible change.
2. US1: Whisper voice everywhere a browser can record, opt-in (MVP).
3. US2: better names, hallucination clean-up, the audio check tooling.
4. US3: full error mapping and the browser fallback.
5. Polish: docs, 0.3.0, gates, then the user's audio check (T054) and manual check (T055). Whisper
   is released in a language only after its audio check gate passes.

---

## Notes

- [P] tasks touch different files and have no dependencies on incomplete tasks.
- The AI provider code (`src/voice/providers/`) and the Spanish prompt and tool snapshots don't
  change.
- No auto-commit. Paid and real-device checks (T054, T055) are the user's.
