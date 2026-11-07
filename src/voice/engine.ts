import type { Lang } from "../i18n/lang";
import { AudioRecorder, type MediaDeps, type Recording } from "./recorder";
import { SpeechCapture, speechAvailable, type RecognizerFactory } from "./speech";

/**
 * The seam between the mic button and the rest of the voice pipeline (feature 015,
 * contracts/speech-engine.md). Both engines implement it; the controller only sees this.
 */

export type SpeechEngineId = "browser" | "whisper";

export type CaptureUpdate =
  /** The recognizer or recorder is live: show "listening". */
  | { readonly kind: "started" }
  /** Browser engine: the live transcript. */
  | { readonly kind: "interim"; readonly text: string }
  /** Whisper engine: the input level, 0–1, about 20 per second. */
  | { readonly kind: "level"; readonly level: number }
  /** The 30 s limit was reached; the controller releases on its own. */
  | { readonly kind: "limit" }
  /**
   * Capture failed before `started` (the microphone was refused or missing): the controller calls
   * stop() at once to get the error, so the player sees why even while still holding (FR-017).
   */
  | { readonly kind: "failed" };

export type EmptyReason = "short" | "silence" | "noSpeech" | "hallucination" | "cancelled";

export type CaptureOutcome =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "empty"; readonly reason: EmptyReason }
  /** A TranscriptionError or a MicError. */
  | { readonly kind: "error"; readonly error: unknown };

export interface SpeechCaptureSession {
  /** Begins capture; updates arrive on `onUpdate`. False if the engine can't start at all. */
  start(onUpdate: (update: CaptureUpdate) => void): boolean;
  /** Ends capture. Whisper: the tracks are stopped before the upload starts. */
  stop(): Promise<CaptureOutcome>;
  /** Aborts capture or an upload in flight; a pending stop() resolves `empty/cancelled`. */
  cancel(): void;
}

export interface OpenOptions {
  /** The speech region (BCP 47), for the browser recognizer. */
  readonly lang: string;
  /** The display language, for Whisper's `language` and hint. */
  readonly displayLang: Lang;
  /** The vocabulary hint, built when the recording is sent. */
  readonly hint: () => string;
}

export interface SpeechEngine {
  readonly id: SpeechEngineId;
  /** Whether this browser can run the engine. */
  supported(): boolean;
  /** One session per mic hold. */
  open(options: OpenOptions): SpeechCaptureSession;
}

export interface BrowserEngineOptions {
  /**
   * Dev check clips only (research R11, constitution VII's dev exception): when this returns media
   * APIs, the same hold is also recorded, so the clip and the browser's transcript come from the
   * same speech. Production code never passes it.
   */
  readonly clipRecorder?: () => MediaDeps | undefined;
  readonly onClip?: (recording: Recording) => void;
}

/**
 * Whether the page can record the microphone while the browser's recognizer listens. Chrome
 * Android can't give the microphone to both: with a page recording open, the recognizer hears
 * nothing (bug browser-speech-regression, 2026-11-07). Desktop browsers share it.
 */
export function canRecordAlongsideRecognizer(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return !/\bAndroid\b/i.test(userAgent);
}

const NO_HANDLERS ={ onStarted: () => undefined, onLevel: () => undefined, onLimit: () => undefined };

/** The browser's recognizer, behind the seam; `SpeechCapture` and its transcript logic are unchanged. */
export function browserEngine(factory: RecognizerFactory, options: BrowserEngineOptions = {}): SpeechEngine {
  return {
    id: "browser",
    supported: () => speechAvailable(factory),
    open: ({ lang }) => {
      const capture = new SpeechCapture(factory, lang);
      let cancelled = false;
      let clip: AudioRecorder | undefined;
      return {
        start: (onUpdate) => {
          const started = capture.start((text) => onUpdate({ kind: "interim", text }));
          if (started) {
            onUpdate({ kind: "started" });
            // On Android a clip would silence the recognizer: the hold goes on without one.
            const media = import.meta.env.DEV && canRecordAlongsideRecognizer() ? options.clipRecorder?.() : undefined;
            if (media) {
              clip = new AudioRecorder(media);
              void clip.start(NO_HANDLERS).catch(() => undefined);
            }
          }
          return started;
        },
        stop: async () => {
          const text = await capture.stop();
          if (clip?.state === "recording") {
            const recording = await clip.stop().catch(() => undefined);
            if (recording && !cancelled) options.onClip?.(recording);
          } else {
            clip?.cancel();
          }
          if (cancelled) return { kind: "empty", reason: "cancelled" };
          return text ? { kind: "text", text } : { kind: "empty", reason: "silence" };
        },
        cancel: () => {
          cancelled = true;
          clip?.cancel();
          capture.cancel();
        },
      };
    },
  };
}
