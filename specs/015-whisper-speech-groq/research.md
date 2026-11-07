# Research: Whisper Speech Recognition (Groq)

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-07

Facts about Groq below were checked on 2026-11-07 against
[Groq speech-to-text](https://console.groq.com/docs/speech-to-text),
[rate limits](https://console.groq.com/docs/rate-limits),
[errors](https://console.groq.com/docs/errors) and the
[API reference](https://console.groq.com/docs/api-reference). CORS was checked with a preflight
request to the endpoint (R1).

---

## R1. Calling Groq from the device: plain `fetch`, no SDK

**Decision**: `POST https://api.groq.com/openai/v1/audio/transcriptions` with `fetch` and a
`FormData` body, `Authorization: Bearer <groq key>`, straight from the browser. No new dependency.

**Rationale**:
- **CORS is open.** A preflight with `Origin: https://example.app` returned `204` with
  `access-control-allow-origin: *` and `access-control-allow-headers: authorization,content-type`.
  A key-less POST returned `401` with the same allow-origin header. So the browser can read both
  successes and errors, as with the Gemini adapter.
- **The request is tiny.** One multipart POST and one JSON response. The `groq-sdk` package would
  add a dependency (and needs `dangerouslyAllowBrowser`) to save about 40 lines. The Gemini adapter
  already shows the house pattern: `fetch`, `AbortController` timeout, error mapping, one retry.
- **Key exposure** is the same accepted trade-off as the AI provider keys: the key is the user's,
  stays on their device, and is sent only to its own service (Principle VII).

**Alternatives considered**:
- `groq-sdk` with `dangerouslyAllowBrowser: true`: rejected, adds a dependency for no capability.
- A backend proxy: rejected, the constitution forbids a backend in v1 and CORS makes it unneeded.

---

## R2. Model: `whisper-large-v3-turbo` by default, fixed in code

**Decision**: the app uses one model constant, `whisper-large-v3-turbo`. The audio check (R10) is
also run with `whisper-large-v3`; if it is clearly better on the check set, the constant changes.
The player can't pick the model (spec assumption).

**Rationale**:
- Both models are multilingual, accept `language`, and are offered on Groq. Turbo costs
  $0.04/hour of audio and large-v3 $0.111/hour. Turbo is also faster, which matters for the
  4-second target (SC-003). Large-v3 is only worth it if it is clearly more accurate.
- **Cost is tiny either way.** Groq bills at least 10 s per request. A full game is about 160
  commands (feature 010, SC-004), so 160 × 10 s ≈ 27 minutes billed ≈ $0.02 with turbo, $0.05 with
  large-v3. The opt-in toggle (FR-003) still lets the player avoid it.
- **Free tier limits** (per model, as listed on the rate-limits page): 20 requests/minute, 2,000
  per day, 7,200 audio seconds per hour, 28,800 per day. At a 10-second billed minimum that is
  720 commands an hour, far above a table's pace. The page doesn't say clearly whether the table
  is the Free or Developer plan; either way a game stays inside it. A 429 is handled like any
  other rate limit (R7).

**Alternatives considered**: a model setting per player, rejected for v1 (YAGNI; one more thing
to explain). `distil-whisper-large-v3-en` is English-only and no longer listed; rejected.

---

## R3. Recording: `MediaRecorder` in the browser's native format, no conversion

**Decision**: record with `MediaRecorder` and send the browser's own container as is. Pick the
first type the browser supports, in this order:

| MIME type | Typical browser | File name sent |
|---|---|---|
| `audio/webm;codecs=opus` | Chrome, Edge, Firefox, Android | `command.webm` |
| `audio/ogg;codecs=opus` | Firefox | `command.ogg` |
| `audio/mp4` | Safari (macOS, iOS) | `command.mp4` |

If none is supported (or `MediaRecorder` / `getUserMedia` is missing), Whisper is **unavailable in
this browser**: the toggle is shown disabled with the reason (spec edge case "format the service
doesn't accept").

**Rationale**:
- Groq accepts `flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm`, so every native container above
  is accepted. Groq downsamples to 16 kHz mono itself, so client-side resampling buys nothing.
- **Size is a non-issue.** Opus at the browser's default bitrate is roughly 4–8 KB/s; a 30-second
  maximum recording (FR-008) is under 250 KB, far below the 25 MB limit.
- Groq notes that WAV gives lower latency, but a 16 kHz mono WAV of a 4-second command is about
  128 KB against about 20 KB of Opus, so on a phone connection the upload would cost what decoding
  saves. Not worth a conversion step. Revisit only if the audio check shows transcription latency
  as the bottleneck.
- The file name's extension is what Groq uses to recognize the type, so it must match the
  container.

**Alternatives considered**:
- Converting to WAV/FLAC with Web Audio (or a WASM encoder): rejected, more code (or a dependency)
  for no accuracy gain.
- Streaming chunks while speaking: Groq's endpoint is file-based; rejected.

---

## R4. Microphone lifecycle and push-to-talk timing

**Decision**:
- **Press**: `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression:
  true, autoGainControl: true } })`, then start the recorder. The button shows "listening" only
  once the recorder has started, so the player sees when to speak.
- **Release**: stop the recorder, wait for its final data, then **stop every track** (the browser's
  mic indicator turns off, FR-013) and transcribe.
- **Release before the recorder started** (for example a quick tap, or the first-use permission
  prompt still open): cancel quietly, as an empty recording.
- **Page hidden** (`visibilitychange` → hidden) while recording or transcribing: cancel and stop
  the tracks.
- **Limit**: a 30-second timer stops the recording and transcribes it, with a "cut at 30 s" hint
  (FR-008).
- **Errors** from `getUserMedia`: `NotAllowedError` / `SecurityError` → "voice needs the
  microphone" (FR-017); `NotFoundError` / `OverconstrainedError` → "no microphone found";
  anything else → the generic unexpected-error message.

**Rationale**:
- The mic is not kept open between commands. A warm stream would avoid the 100–300 ms start-up,
  but it keeps the browser's recording indicator on for the whole game, against FR-013 and the
  privacy note. The "listening" cue covers the start-up instead. If the audio check shows clipped
  first words, the fallback is a short pre-roll (start the recorder on press, but only stop the
  tracks after release, as today), not a warm mic.
- The browser's own noise suppression and echo cancellation help at a noisy table and cost
  nothing.
- **iOS** asks for mic permission again on each PWA launch in some versions. The first press then
  only opens the prompt, which is the "release before start" case.

**Alternatives considered**: voice-activity auto-stop (no button hold). Rejected: push-to-talk
only (constitution).

---

## R5. "Picking up audio" and empty-recording detection: one analyser

**Decision**: while recording, an `AnalyserNode` on the same stream samples the RMS level about
every 50 ms. It does two jobs:
- **Level cue** (FR-007): the level drives a ring on the mic button, so the player sees that
  sound is being picked up (there's no live text with Whisper).
- **Speech gate** (FR-009): a recording is uploaded only if it lasts at least **400 ms** and has at
  least **250 ms** of frames above a speech threshold. The threshold is set relative to the
  quietest frames of the same recording, so a constant fan or crowd noise doesn't count as speech.
  Otherwise the app shows "didn't hear anything" and nothing is sent. The defaults are constants,
  tuned with the audio check recordings.

**Rationale**: this saves a billed request (at least 10 s each) and a round trip for an accidental
tap or silence. It is also the first defense against Whisper's known hallucinations on
near-silence (R6).

**Alternatives considered**: always upload and rely on `no_speech_prob`. Rejected: it costs a
request and adds 0.5–1 s before telling the player nothing was heard. A VAD library: rejected, adds
a dependency for a simple threshold.

---

## R6. Request shape and transcript clean-up

**Decision**: each request sends:

| Field | Value |
|---|---|
| `file` | the recording (R3) |
| `model` | `whisper-large-v3-turbo` (R2) |
| `language` | `es` or `en`, from the display language (FR-010) |
| `prompt` | the vocabulary hint (R8) |
| `response_format` | `verbose_json` |
| `temperature` | `0` |

The transcript is the joined text of the segments that survive two filters:
1. **No speech**: drop a segment whose `no_speech_prob` is above 0.6 and whose `avg_logprob` is
   below −1.0 (both signals together, so a confident short "sí" is never dropped).
2. **Known hallucinations**: if the whole remaining text, normalized (case, accents, punctuation),
   is one of a short per-language list, treat it as empty. For example "gracias por ver el
   video", "subtítulos realizados por la comunidad de amara.org", "thank you for watching",
   "thanks for watching", "you". The lists live with the language's voice text.

If nothing survives, the result is "didn't hear anything" (spec edge case). Otherwise the
transcript goes to the controller like a browser transcript (FR-011). Anything subtler is left to
the AI provider and the confirmation card.

**Rationale**:
- `verbose_json` is the only way to get the per-segment confidence fields. It costs no extra time
  (no word timestamps are requested).
- `temperature: 0` is the documented default and gives repeatable results for the audio check.
- Groq documents segments with `id, seek, start, end, text, tokens, temperature, avg_logprob,
  compression_ratio, no_speech_prob`. It doesn't document the top-level fields, so the parser
  reads `segments` when present and falls back to `text`, and is validated with zod like other
  external input.

---

## R7. Errors, timeout and retry

**Decision**: a Groq-specific error with the same neutral kinds the AI providers use, plus one
for audio:

| Groq response | Kind | Shown as |
|---|---|---|
| 401 | `auth` | "Groq: the key isn't valid. Check it in Settings" |
| 403 | `permission` | "Groq: this key has no access to the model" |
| 404 (model) | `model` | "Groq: model not available" |
| 429 | `rateLimit` | "Groq: rate limit reached, wait a moment" |
| 400 / 413 / 422 | `audio` | "Groq couldn't read the recording" |
| 5xx | `service` | "Groq isn't responding, try again" |
| timeout (8 s) | `timeout` | "Groq took too long" |
| network failure | `connection` | "No connection to Groq" |

- **Timeout**: 8 s, with an `AbortController` (FR-015), as in the Gemini adapter.
- **Retry**: at most one automatic retry on 429 (when `retry-after` is 1 s or less), on 5xx and
  on network errors, after the server's delay or 0.5 s. A cancel aborts the request in flight,
  retry included.
- **Messages**: the error is a `TranscriptionError` (new class, next to `VoiceProviderError`).
  `resolveError` maps it to a new `voice.transcription` message `{ kind }` that names Groq, in the
  display language (FR-014). The result is the existing "not understood" card with no transcript,
  so touch stays available (Principle IV).
- **Switching off**: when the browser has its own recognizer, the card adds a "Use the browser's
  recognition" button that turns the toggle off (FR-016). That is a setting change, never a ledger
  event.
- **Security**: error text never includes the key, the audio or the request body, same as
  `VoiceProviderError` (Principle VII).

**Alternatives considered**: reusing `VoiceProviderError` and `voice.provider`. Rejected: those
messages name the AI provider ("Anthropic …"), and the player must be able to tell which key or
service failed (spec edge case: "the message names the missing one").

---

## R8. Vocabulary hint (Whisper `prompt`)

**As built** (data-model §4): company **aliases are left out**, since they are phonetic forms for
the AI resolver ("pe erre erre") and Whisper copies the prompt's spelling. Company short and full
names are used instead, and terms are chosen by priority across sections (names before aliases).
The original decision follows.

**Decision**: build the prompt from the session, in the display language, as a short natural
sentence followed by a list of terms, in priority order:
1. player names and their aliases;
2. company short names and their aliases (e.g. "B&O", "PRR", "Erie");
3. the game's train names ("2", "3", "4", "D", "diésel");
4. a few game words from the language's voice text ("dividendos", "retiene", "compra",
   "vende"…).

The prompt is cut to fit two budgets, dropping whole terms from the end of the list: 400
characters, and 180 tokens by a conservative estimate (data-model §4). Name lists with symbols
("B&O", "C&O") and numbers can be close to one or two characters per token, so a plain character
budget isn't a safe proxy for Groq's 224-token limit. What Groq does with a prompt that's too long
isn't documented: it may truncate it, or answer 400, which would show as "couldn't read the
recording". The estimate keeps clear of both. T054 watches for 400s on the longest-hint game
(RotLA with landmarks).

Example (Spanish):
`Partida de 1830. Jugadores: Ana, Manuel, Mauro. Compañías: B&O, PRR, NYC, Erie, C&O. Trenes: 2,
3, 4, 5, 6, D. Paga dividendos, retiene, compra, vende.`

**Rationale**:
- Whisper uses the prompt as preceding context, so names in it tend to be transcribed with the
  same spelling. That's exactly the jargon problem in the spec. Groq notes that the prompt guides
  style and context, not actions, and should be in the audio's language, so it is built per
  language from the same voice text catalogs.
- The hint is derived from session state for each command and is never stored (Key Entities).
- Players, companies and trains come first, so the budget drops the generic game words before
  any name. Truncation is deterministic and unit-tested on all four built-in games.

**Alternatives considered**: sending the AI provider's whole context snapshot. Rejected: it's far
over 224 tokens, and long prompts make Whisper copy prompt text into the transcript.

---

## R9. One speech-engine interface; the controller gains a "transcribing" phase

**Decision**: a small `SpeechEngine` interface that both engines implement. Its `start` gives live
updates (interim text or input level). Its `stop` resolves to a transcript, "empty", or an error.
- `browserEngine` wraps today's `SpeechCapture` unchanged. The `assembleTranscript` logic and its
  tests stay as they are.
- `whisperEngine` combines `AudioRecorder` (R3–R5) and `GroqTranscriber` (R1, R6–R8).

`VoiceController` takes `engine` from its environment, read when the button is pressed (like
`lang` today), so a toggle change applies to the next command. `VoicePhase` gains:
- `{ phase: "listening", interim, level? }`: `level` is set by Whisper; `interim` stays "" for it;
- `{ phase: "transcribing" }`: between release and the transcript; it can be cancelled (FR-007).

After the transcript, the path is today's: the "sí"/"confirm" shortcut, `interpret`, the card
(FR-011). A cancel during transcribing aborts the request and a generation counter drops any late
result.

**Rationale**:
- One branch point (which engine), chosen at press time, keeps the rest of the voice pipeline
  identical for both engines (constitution: "no engine gets its own route to state").
- Tests already inject `recognizer` through `VoiceDeps`. The same seam takes an engine factory,
  so UI tests use a fake Whisper engine with no media APIs.

**Alternatives considered**: a separate controller for Whisper. Rejected: it would duplicate the
confirm, clarification and undo logic and drift.

---

## R10. Settings and availability

**Decision**: two new device-local rows in the `settings` store:
- `whisper: boolean` (default `false`), the opt-in toggle (FR-003). It is always stored, even when
  keys are not remembered (spec edge case).
- `groqKey: string`. It follows `rememberKey` exactly like `apiKeys`: kept in memory only when
  the player doesn't want keys remembered, and dropped from storage when that option is turned on.

They are separate from `apiKeys`: that map is keyed by AI provider (`ProviderId`), and
`activeCredentials`, the provider registry and the eval all treat its entries as resolvers. Groq
isn't one.

`voiceAvailability` becomes engine-aware. The checks run in order and the first failure is the
reason shown:
1. voice offered in the display language (unchanged gate);
2. the engine is supported: Whisper on needs `MediaRecorder` and `getUserMedia` and a supported
   type (R3); Whisper off needs the browser recognizer;
3. online;
4. Whisper on needs the Groq key (no silent fallback, FR-004);
5. the AI provider key (unchanged).

In a browser with no recognizer and Whisper off, the reason suggests turning Whisper on.

**Language gate** (FR-018, constitution "Platform"): Whisper is offered in a language only when
it's in `VITE_WHISPER_LANGUAGES`. This mirrors feature 014's `VITE_VOICE_LANGUAGES`, but no
language is on by default. `.env.production` starts with it empty, and each language is added
once its audio check passes. Dev builds offer every voice language, so the check can be recorded.
Where Whisper isn't offered, the toggle is hidden and a stored `whisper: true` has no effect
(data-model §2).

**Rationale**: keeps the AI provider code untouched and the opt-in rule easy to test. Settings are
already never exported (Principle VII). A test asserts the Groq key is absent from exports and
logs (SC-005).

---

## R11. The audio check set (FR-018)

**Decision**: a manual, paid check under `eval/audio/`, next to the existing `eval/voice/`.

**Collecting clips** (dev builds only, behind `import.meta.env.DEV`), extending the existing
"Guardar para eval" button (feature 001 T137, `SaveForEval` in `VoicePanel.tsx`):
- **Today** that button downloads `candidate-<stamp>.json` with the transcript, a fixture of the
  session and the confirmed action.
- **New**: a dev-only "record check clips" switch in Settings. While it's on, a browser-engine mic
  hold also records the same audio with `MediaRecorder` (Chrome allows both on one microphone).
  So the clip and the browser's live transcript come from the same speech.
- **Saving**: "Guardar para eval" then also downloads `candidate-<stamp>.<ext>` and adds
  `audio: "<file name>"` and `engine: "browser"` to the JSON. The confirmed action becomes the
  expected action, so nothing is typed by hand.
- With Whisper on, the same button saves the clip with `engine: "whisper"`. Those clips have no
  browser baseline, but they count toward Whisper's own accuracy.

**Building the set**: `npm run eval:audio:collect -- <folder>` moves downloaded pairs into
`eval/audio/clips/` (ignored by git; the constitution says recordings stay out unless speakers
agree). It writes their entries, without audio, to `eval/audio/manifest.jsonl`, which can be
committed. The fixtures go next to the voice eval's fixtures.

**Running**: `npm run eval:audio -- --lang es|en|all [--model whisper-large-v3-turbo]
[--resolver <ai model>]`:
1. transcribes each clip with Groq (the same `GroqTranscriber` and hint builder as the app, run in
   Node, where `fetch`, `FormData` and `Blob` are built in);
2. resolves both transcripts (Whisper and browser) with the same AI model and grader as
   `eval:voice`;
3. reports per language: actions correct per engine, the same on clips that mention a player or
   company (SC-002), Whisper latency p50/p90, and the Groq cost.

**Rationale**:
- It reuses the voice eval's fixtures, grader and report style, so the AI-step numbers stay
  comparable.
- Recording the browser transcript live is the only fair baseline: the Web Speech API can't be fed
  a file or run in Node.
- It costs Groq and AI-provider calls, so it isn't run in CI and the paid runs are the user's
  (same as `eval:voice`).
- **Free tier**: the user will run it on Groq's free plan. Only the 20 requests/minute limit
  binds for a check set of about 60 clips. The run reuses `eval:voice`'s pacer, backoff and
  daily-quota stop, with a separate Groq pacer (18 per minute by default). It caches transcripts
  per clip, model, language and hint, so re-runs that change only the AI model spend no Groq
  quota. Latency counts only the Groq request, never pacing waits. Details in
  [contracts/audio-check.md](contracts/audio-check.md#free-tier-limits).

**Alternatives considered**: scoring the transcript text (WER) only. Rejected as the main metric:
the spec measures "reaches the expected action". WER is still printed as a secondary column,
for tuning the hint.

---

## R12. Test strategy

- **Unit (Vitest, test-first)**:
  - hint builder: priority and budget truncation per game and language;
  - segment filter and hallucination list;
  - Groq response parsing (zod), and error mapping per status and timeout, with `fetch` mocked;
  - retry rule;
  - MIME type selection;
  - speech gate (frame levels → upload or empty);
  - settings repo: toggle default, Groq key under `rememberKey` both ways, the key never touches
    the toggle;
  - `voiceAvailability` order;
  - controller phases: listening with level, transcribing, cancel while transcribing, auto-stop at
    30 s, hidden page, "sí" through Whisper.
- **Recorder**: tested against small fakes of `MediaRecorder`, `getUserMedia` and the analyser
  (jsdom has none of them), injected like `RecognizerFactory` today.
- **UI (Testing Library)**:
  - Settings toggle and key field, billing note, privacy note per engine;
  - mic reasons per FR-004;
  - level ring and transcribing state;
  - error card with "use the browser's recognition";
  - both languages.
- **E2E (Playwright)**: one spec, with the Groq endpoint mocked through `page.route`, so it needs
  no key and costs nothing.
  - **Phone project** (Pixel 7, Chromium): launched with `--use-fake-ui-for-media-stream` and
    `--use-fake-device-for-media-stream`, so the real recorder, upload, card and confirm path run.
  - **Tablet project** (iPad descriptor, WebKit): those flags don't exist there. An
    `addInitScript` stub of `getUserMedia` and `MediaRecorder` returns a tiny blob, which covers
    the flow and the landscape layout.
- **Security test**: extended so the Groq key, like AI keys, never appears in an export.
- **Manual**: the audio check set (R11) and a real-device pass on Firefox, Safari macOS, Safari
  iOS (installed PWA) and Chrome Android (SC-001).

---

## R13. Product docs and version

- `docs/spec.md`, updated in the same change:
  - §2 scope;
  - §3 tech stack (speech-to-text);
  - §8.1 flow ("shown live" only with the browser engine; transcribing step);
  - §8.2 failure modes (Groq errors);
  - settings and privacy (the toggle, the Groq key, the billing note, where audio goes);
  - "later iterations": other transcription hosts.
- `README.md`: Groq as an optional speech engine, with where to get a key.
- Version **0.3.0** (new user-facing capability): `package.json` and `src/app/version.ts`.
- `.gitignore`: `eval/audio/clips/`, `eval/audio/transcripts/` and `eval/audio/results/`.
