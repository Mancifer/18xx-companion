# Implementation Plan: Whisper Speech Recognition (Groq)

**Branch**: `015-whisper-speech-groq` (feature dir; not yet created as a git branch) | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/015-whisper-speech-groq/spec.md`

## Summary

Voice gets a second, opt-in speech-to-text engine. With the Whisper toggle on, holding the mic
records the audio in the browser's native format. Releasing it stops the microphone and sends the
clip to Groq's Whisper (`whisper-large-v3-turbo`). The request includes the display language and
a vocabulary hint built from the session's player, company and train names. The transcript then
enters the existing voice path unchanged: the AI provider, validation, the confirmation card.

The toggle is off by default in every browser and is separate from the Groq key. Saving a key
never turns Whisper on, and turning it off never clears the key. While it's off, nothing goes to
Groq (FR-003).

How it's built:
- **Groq call**: a plain `fetch` call, no SDK. CORS was verified open, and the house pattern
  (8 s timeout, one retry, neutral error kinds) is reused
  ([R1](research.md#r1-calling-groq-from-the-device-plain-fetch-no-sdk),
  [R7](research.md#r7-errors-timeout-and-retry)).
- **Recording**: `MediaRecorder` with no conversion
  ([R3](research.md#r3-recording-mediarecorder-in-the-browsers-native-format-no-conversion)).
- **One analyser** both drives a "picking up audio" ring and blocks silent or accidental
  recordings before they cost a request
  ([R5](research.md#r5-picking-up-audio-and-empty-recording-detection-one-analyser)).
- **Transcript clean-up**: a segment filter and a hallucination list drop Whisper's known
  inventions on silence
  ([R6](research.md#r6-request-shape-and-transcript-clean-up)).
- **One engine seam**: both engines sit behind a single `SpeechEngine` interface, picked at press
  time. The controller gains one phase, `transcribing`
  ([R9](research.md#r9-one-speech-engine-interface-the-controller-gains-a-transcribing-phase)).
- **Settings**: two device-only rows, `whisper` and `groqKey`
  ([R10](research.md#r10-settings-and-availability)).

Release in each language is gated on an audio check set. It extends the existing dev
"Guardar para eval" button to save clips alongside the browser's live transcript, and a paid
`eval:audio` run compares both engines on the same speech
([R11](research.md#r11-the-audio-check-set-fr-018)).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022. Node.js 22+ for tooling.

**Primary Dependencies**: the existing react 19, zod 4, idb 8 and @anthropic-ai/sdk. **No new
dependency**: Groq is plain `fetch`, recording is `MediaRecorder`, levels are Web Audio (R1, R3,
R5).

**Storage**: IndexedDB `settings` store gains `whisper`, `groqKey` and the dev-only `checkClips`
rows (data-model §1). No session, event or export change. Audio is in memory only (FR-012).

**Testing**:
- **Domain/voice**: Vitest, test-first. Hint builder, segment filter, Groq client (mocked
  `fetch`), retry rule, MIME selection, speech gate, settings, availability, controller phases.
- **Recorder**: tested with injected fakes of `getUserMedia`, `MediaRecorder` and the analyser.
- **UI**: Testing Library in both languages.
- **E2E**: Playwright, with the Groq route mocked:
  - the phone project (Chromium) uses Chromium's fake media device, so the real recorder runs;
  - the tablet project uses the iPad descriptor, which runs WebKit, where those flags don't
    exist. It gets a small `addInitScript` stub of `getUserMedia` and `MediaRecorder` and checks
    the flow and layout.
- **Audio check**: a manual, paid run, as with `eval:voice` (R12).

**Target Platform**: Installable PWA. SC-001 targets:
- desktop: Chrome, Edge, Firefox, Safari;
- mobile: Chrome Android, Safari iOS (tab and installed PWA).

`getUserMedia` requires a secure context, which the PWA already has.

**Project Type**: Single-project web app (PWA), no backend.

**Performance Goals**:
- **Release to confirmation card**: under 4 s for 90% of Whisper commands (SC-003). Budget:
  upload of about 20 KB plus turbo transcription ≈ 0.5–1 s, then the existing under-3 s
  transcript-to-card.
- **Mic start-up**: "listening" appears when the recorder is live, typically 100–300 ms after
  press (R4).

**Constraints**:
- **Toggle off means nothing goes to Groq** (FR-003).
- **Mic released** on every exit path (FR-013).
- **Never persisted**: audio, the hint and the Groq key never appear in exports or logs (FR-002,
  FR-012, SC-005).
- **Browser engine unchanged**: the existing voice tests pass untouched.
- **Spanish strings in Uruguayan Spanish.**
- **Touch targets** stay at least 48 px.

**Scale/Scope**:
- about 10 new source files (engine, recorder, gate, Groq client, hint, filter, errors, eval
  scripts);
- about 8 changed files (controller, `useVoice`, settings repo, Settings screen, `MicButton`,
  `VoicePanel`, catalogs, `resolve.ts`);
- about 30 new strings per language;
- 20–30 recorded check clips per language (the user's).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Checked against
constitution **2.2.0** (amended 2026-11-07 for this feature).

| Principle | Check | Status |
|---|---|---|
| **I. Event-Sourced Ledger** | No event, action or ledger change. The Whisper transcript enters `interpret` exactly as a browser transcript; the toggle and "use the browser's recognition" are setting writes, never events. | ✅ Pass |
| **II. Money Is Conserved** | Untouched: the money path doesn't change. | ✅ Pass |
| **III. Rules as Data** | The vocabulary hint reads names, aliases and train names from game definitions and session data. No per-game code. | ✅ Pass |
| **IV. Propose, Confirm, Undo** | Whisper only produces a transcript; the AI's tool calls and confirmation are unchanged. Mic denial, every Groq failure and empty recordings end in a message with touch available (the constitution's 2.2.0 extension). | ✅ Pass |
| **V. Voice and Touch Parity** | The same actions and validation path for both engines and both languages. The push-to-talk gesture is unchanged; new controls are at least 48 px; the level cue changes ring thickness, not only color. | ✅ Pass |
| **VI. Test-First** | All new logic (hint, filter, gate, client, errors, settings, controller phases) is written test-first. The audio check set (R11) is the speech-engine gate the constitution requires, per language, before Whisper is offered. | ✅ Pass, with release gated on the user's audio check runs |
| **VII. Local-First Simplicity** | No backend and no new dependency. The Groq key is device-only and follows `rememberKey`. Audio is memory-only. Only one transcription host, with a fixed model (YAGNI). | ✅ Pass |
| **Platform: speech-to-text** | Both engines are push-to-talk; Whisper on Groq is called from the device with the user's key and the session hints. Whisper is opt-in, off by default, separate from the key, and nothing is sent while it's off. Both engines go through one path; errors use the shared messages. | ✅ Pass |
| **Platform: voice languages** | Whisper uses the display language and existing voice languages only. `VITE_WHISPER_LANGUAGES` (empty in `.env.production`, every voice language in dev) hides the toggle and keeps the browser engine in any language that hasn't passed its audio check (data-model §2; fixed after `/speckit-analyze` C1). | ✅ Pass |
| **VII: audio never stored** | Production code holds audio only for the current command. The dev-only check-clip save uses the exception constitution VII allows (fixed after `/speckit-analyze` C2), and a source-scan test keeps it behind `import.meta.env.DEV`. | ✅ Pass |
| **Workflow: voice eval report** | `resolve.ts` changes only `resolveError`'s mapping; the prompt and tool snapshots stay byte-identical. The final gates still run one `eval:voice` pass and record it (analyze G1). | ✅ Planned |
| **Platform: performance** | Release-to-card under 4 s for 90% (SC-003) is measured in the audio check report. | ✅ Planned |
| **Workflow: docs** | `docs/spec.md` and `README.md` are updated in the same change (R13). | ✅ Planned |

**Post-design re-check (after Phase 1)**: the data model and contracts add only settings rows,
in-memory types and dev and eval tooling. The table above is unchanged. No violations, so
Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/015-whisper-speech-groq/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R13
├── data-model.md        # Phase 1: settings rows, engine, recording, hint, result, phases, check set
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── speech-engine.md       # SpeechEngine interface, engines, controller rules, dev check clips
│   ├── groq-transcription.md  # Wire request/response, retry, error and message mapping
│   ├── ui.md                  # Settings toggle and key, privacy line, mic states, voice card
│   └── audio-check.md         # collect / eval:audio commands, report, release gate
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── voice/
│   ├── engine.ts              # NEW  SpeechEngine, CaptureUpdate, CaptureOutcome; browserEngine (wraps SpeechCapture)
│   ├── speech.ts              # unchanged (SpeechCapture, assembleTranscript)
│   ├── recorder.ts            # NEW  AudioRecorder, MediaDeps, pickMimeType, MicError
│   ├── speechGate.ts          # NEW  frame levels → hasSpeech (R5)
│   ├── whisperEngine.ts       # NEW  recorder + gate + transcriber behind SpeechEngine
│   ├── transcription/
│   │   ├── groq.ts            # NEW  Transcriber, GROQ_TRANSCRIPTION_MODEL, response schema, retry
│   │   ├── hint.ts            # NEW  buildHint(session, lang)
│   │   ├── clean.ts           # NEW  segment filter, hallucination match
│   │   └── errors.ts          # NEW  TranscriptionError
│   └── resolve.ts             # CHANGED  resolveError maps TranscriptionError / MicError
├── app/
│   ├── voiceController.ts     # CHANGED  engine from env; transcribing phase; level; hints; generation id
│   ├── useVoice.ts            # CHANGED  VoiceDeps.engines; engine-aware voiceAvailability; visibility cancel
│   └── version.ts             # CHANGED  0.3.0
├── persistence/
│   └── settingsRepo.ts        # CHANGED  whisper, groqKey (rememberKey rules), checkClips (dev)
├── vite-env.d.ts              # CHANGED  VITE_WHISPER_LANGUAGES
├── i18n/
│   ├── lang.ts                # CHANGED  whisperLanguages(), whisperOffered(lang) (FR-018 gate)
│   ├── contract/              # CHANGED  new message codes; voice text gains hint words + hallucination list
│   ├── es/, en/               # CHANGED  messages/voice.ts, ui/settings.ts, ui/components.ts, voice.ts
├── ui/
│   ├── screens/Settings.tsx   # CHANGED  toggle, Groq key, billing note, privacy line, dev checkClips
│   ├── components/MicButton.tsx   # CHANGED  level ring, transcribing + cancel
│   ├── components/VoicePanel.tsx  # CHANGED  "use the browser's recognition"; hints; SaveForEval saves clip
│   └── styles/components.css  # CHANGED  ring styles
eval/
└── audio/                     # NEW  collect.ts, run.ts, manifest.jsonl (clips/, fixtures/, results/ ignored)
tests/                         # NEW  voice/{engine,recorder,speechGate,groq,hint,clean}.test.ts,
                               #      app/voiceController.whisper.test.ts, persistence/settings.whisper.test.ts,
                               #      ui/whisper.test.tsx; security.test.ts extended
e2e/
└── whisper.spec.ts            # NEW  mocked Groq route; Chromium fake mic (phone), media stub (tablet/WebKit)
playwright.config.ts           # CHANGED  fake-media launch args on the Chromium (phone) project
.env.production                # CHANGED  VITE_WHISPER_LANGUAGES= (empty until a language passes)
docs/spec.md, README.md, package.json, .gitignore   # CHANGED  (R13)
```

**Structure Decision**: the existing single-project layout. Transcription gets its own
`src/voice/transcription/` folder, so the AI resolver code (`providers/`) stays untouched and Groq
is never mistaken for a resolver. The browser engine stays in `speech.ts`, and the new seam is
`engine.ts`. Imports keep their direction (domain ← voice ← app ← ui).

## Complexity Tracking

No constitution violations, so nothing is recorded here.
