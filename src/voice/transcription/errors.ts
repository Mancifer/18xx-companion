import type { ProviderErrorKind } from "../errors";

/**
 * A speech-to-text failure (feature 015, contracts/groq-transcription.md §4). Same neutral kinds
 * as the AI providers, plus `audio` (the service couldn't read the recording). resolveError maps
 * the kind to `voice.transcription`, which names Groq.
 *
 * The message never carries the key, the prompt or the audio.
 */
export type TranscriptionErrorKind = ProviderErrorKind | "audio";

export class TranscriptionError extends Error {
  override readonly name = "TranscriptionError";
  readonly kind: TranscriptionErrorKind;
  readonly status?: number;
  /** From `retry-after` on a 429. */
  readonly retryAfterMs?: number;

  constructor(kind: TranscriptionErrorKind, message: string, details: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.kind = kind;
    if (details.status !== undefined) this.status = details.status;
    if (details.retryAfterMs !== undefined) this.retryAfterMs = details.retryAfterMs;
  }
}
