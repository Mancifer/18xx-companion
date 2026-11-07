import type { CaptureOutcome, CaptureUpdate, SpeechEngine } from "./engine";
import { AudioRecorder, MicError, pickMimeType, type MediaDeps, type Recording } from "./recorder";
import { speechVerdict } from "./speechGate";
import { TranscriptionError } from "./transcription/errors";
import type { Transcriber } from "./transcription/groq";

/**
 * Whisper on Groq behind the engine seam (feature 015, contracts/speech-engine.md): record while
 * held, check the speech gate, stop the microphone, then transcribe. The transcript then goes
 * through the same path as a browser transcript (FR-011).
 */

export interface WhisperEngineDeps {
  /** The browser's media APIs, or undefined where it can't record. */
  readonly media: () => MediaDeps | undefined;
  readonly transcribe: Transcriber;
  /** The Groq key, read when a recording is sent. */
  readonly apiKey: () => string | undefined;
  /** Dev check clips (research R11): receives each recording that reached the transcriber. */
  readonly onClip?: (recording: Recording) => void;
}

export function whisperEngine(deps: WhisperEngineDeps): SpeechEngine {
  return {
    id: "whisper",
    supported: () => {
      const media = deps.media();
      return media !== undefined && pickMimeType(media.MediaRecorder) !== undefined;
    },
    open: ({ displayLang, hint }) => {
      const media = deps.media();
      const recorder = media ? new AudioRecorder(media) : undefined;
      const upload = new AbortController();
      let starting: Promise<unknown> | undefined;
      let failure: unknown;
      const session = { cancelled: false };
      // A call, so TypeScript doesn't carry an earlier check's narrowing across the awaits.
      const isCancelled = () => session.cancelled;
      let stopping: Promise<CaptureOutcome> | undefined;

      const finish = async (): Promise<CaptureOutcome> => {
        if (!recorder) return { kind: "empty", reason: "short" };
        // Released before the recorder was live (a tap, or the permission prompt still open):
        // cancel now, so a late grant never starts a recording nobody is holding.
        const early = recorder.state === "idle" || recorder.state === "acquiring";
        if (early) recorder.cancel();
        await starting;
        if (isCancelled()) return { kind: "empty", reason: "cancelled" };
        if (failure !== undefined) return { kind: "error", error: failure };
        if (early) return { kind: "empty", reason: "short" };
        let recording: Recording;
        try {
          recording = await recorder.stop();
        } catch {
          recorder.cancel();
          return { kind: "empty", reason: "short" };
        }
        if (isCancelled()) return { kind: "empty", reason: "cancelled" };
        const verdict = speechVerdict(recording);
        if (verdict !== "speech") return { kind: "empty", reason: verdict };
        const apiKey = deps.apiKey();
        if (!apiKey) return { kind: "error", error: new TranscriptionError("auth", "Groq: no key") };
        deps.onClip?.(recording);
        const result = await deps.transcribe(recording.blob, {
          apiKey,
          lang: displayLang,
          prompt: hint(),
          fileName: `command.${recording.extension}`,
          signal: upload.signal,
        });
        if (isCancelled()) return { kind: "empty", reason: "cancelled" };
        if (result.kind === "text") return { kind: "text", text: result.text };
        if (result.kind === "empty") return { kind: "empty", reason: result.reason };
        return { kind: "error", error: result.error };
      };

      return {
        start: (onUpdate: (update: CaptureUpdate) => void) => {
          if (!recorder) return false;
          starting = recorder
            .start({
              onStarted: () => onUpdate({ kind: "started" }),
              onLevel: (level) => onUpdate({ kind: "level", level }),
              onLimit: () => onUpdate({ kind: "limit" }),
            })
            .catch((error: unknown) => {
              failure = error instanceof MicError ? error : new MicError("other", "recorder failed");
              if (!session.cancelled) onUpdate({ kind: "failed" });
            });
          return true;
        },
        stop: () => (stopping ??= finish()),
        cancel: () => {
          session.cancelled = true;
          recorder?.cancel();
          upload.abort();
        },
      };
    },
  };
}
