# Contract: Speech Engine

**Feature**: [../spec.md](../spec.md) | **Research**: R3–R5, R9 | **Data model**: §2, §3, §6

The seam between the mic button and the rest of the voice pipeline. Both engines implement it.
`VoiceController` depends only on this interface.

## Interface (`src/voice/engine.ts`)

```ts
export type SpeechEngineId = "browser" | "whisper";

export type CaptureUpdate =
  | { readonly kind: "started" }                    // recorder/recognizer is live: show "listening"
  | { readonly kind: "interim"; readonly text: string }   // browser engine
  | { readonly kind: "level"; readonly level: number }    // whisper engine, 0–1, ~20 per second
  | { readonly kind: "limit" }                      // 30 s reached; stop() follows on its own
  | { readonly kind: "failed" };                    // capture failed before `started` (mic refused or
                                                    // missing): the controller calls stop() at once to
                                                    // show the error, even while still held (FR-017)

export type CaptureOutcome =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "empty"; readonly reason: "short" | "silence" | "noSpeech" | "hallucination" | "cancelled" }
  | { readonly kind: "error"; readonly error: unknown };   // TranscriptionError or MicError

export interface SpeechCaptureSession {
  /** Begins capture; updates arrive on `onUpdate`. False if the engine can't start at all. */
  start(onUpdate: (update: CaptureUpdate) => void): boolean;
  /** Ends capture. Whisper: tracks are stopped before the upload starts. */
  stop(): Promise<CaptureOutcome>;
  /** Aborts capture or an upload in flight; the pending stop() resolves `{ kind: "empty", reason: "cancelled" }`. */
  cancel(): void;
}

export interface SpeechEngine {
  readonly id: SpeechEngineId;
  /** Whether this browser can run the engine (availability check 2a/2b). */
  supported(): boolean;
  /** One session per mic hold. */
  open(options: { lang: string; displayLang: Lang; hint: () => string }): SpeechCaptureSession;
}
```

## Engines

- **`browserEngine(factory: RecognizerFactory)`** wraps today's `SpeechCapture`:
  - `started` is sent right after `recognizer.start()`, which matches today's behavior;
  - `interim` is sent on each result;
  - `stop()` resolves `text`, or `empty/silence` when the transcript is "";
  - `assembleTranscript` is unchanged.
- **`whisperEngine(deps: { media: MediaDeps; transcribe: Transcriber })`**:
  - records with `AudioRecorder` (data-model §3) and checks the speech gate;
  - then calls `transcribe(blob, { displayLang, prompt: hint() , signal })`.
  - `MediaDeps` holds `getUserMedia`, `MediaRecorder` and `AudioContext`, injected so tests use
    fakes.
  - `MicError` kinds are `denied`, `noDevice` and `other` (research R4).

## Controller rules

- `VoiceEnvironment` gains `engine: SpeechEngine`, read at `press()` time, like `lang`, and
  `hint?: () => string`.
- **As built**: `VoiceDeps` gains `media?: () => MediaDeps | undefined` and
  `transcriber?: Transcriber`, not prebuilt engines. `useVoice` builds both engines itself, because
  only it has the settings (Groq key) and the session (hint) they need. Test helpers that pass only
  `recognizer` keep working: without `transcriber`, Whisper is unsupported.
- `press()`:
  - opens a session and calls `start`;
  - sets `listening` only on `started`;
  - while acquiring, a `release()` calls `cancel()` and returns to the prior state.
- **`release()` with the browser engine**: the same phases as today.
- **`release()` with the Whisper engine**: `transcribing`, then:
  - `text` → the existing "sí" shortcut or `interpret(text)`;
  - `empty` → the prior card or `idle`, with `hint: "empty"` unless the reason is `cancelled`;
  - `error` → a not-understood result with the mapped message (contracts/groq-transcription.md
    §4), or the mic messages for `MicError`, and no transcript.
- `limit` → the controller calls `release()` itself and the next result carries `hint: "cut"`.
- `cancel()` from `listening` or `transcribing` → `session.cancel()`, then `idle`. Each press bumps
  a generation id, and any outcome from an older generation is ignored.
- **Page hidden** (`document.visibilityState === "hidden"`) → `cancel()`. `useVoice` registers
  the listener.
- **No new route to state**: the outcome text enters `interpret`, which uses the same snapshot,
  interpreter, `resolveResponse` and dispatch as today.

## Dev check clips (research R11)

The signature becomes `browserEngine(factory, options?: { clipRecorder?: () => MediaDeps | undefined })`.
`useVoice` passes `clipRecorder` only when `import.meta.env.DEV && settings.checkClips`. When it's
given, `browserEngine` also runs an `AudioRecorder` on the same hold and keeps the last clip's `Blob` in memory, so `SaveForEval` can download it. A
Whisper session keeps its uploaded `Blob` the same way. Nothing of this exists in a production
build (`import.meta.env.DEV` guards, tree-shaken).
