/**
 * A provider failure with a neutral kind (feature 005, data-model §4, research R7). resolveError
 * maps the kind to the shared Spanish message. The message never carries the key or the request.
 */

export type ProviderErrorKind = "auth" | "permission" | "model" | "rateLimit" | "timeout" | "connection" | "service";

export interface VoiceProviderErrorDetails {
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly quota?: "minute" | "day";
}

export class VoiceProviderError extends Error {
  override readonly name = "VoiceProviderError";
  readonly kind: ProviderErrorKind;
  /** HTTP status. */
  readonly status?: number;
  /** From Retry-After / RetryInfo; used by the eval's backoff only. */
  readonly retryAfterMs?: number;
  /** From 429 details when present; used by the eval's stop rule only. */
  readonly quota?: "minute" | "day";

  constructor(kind: ProviderErrorKind, message: string, details: VoiceProviderErrorDetails = {}) {
    super(message);
    this.kind = kind;
    if (details.status !== undefined) this.status = details.status;
    if (details.retryAfterMs !== undefined) this.retryAfterMs = details.retryAfterMs;
    if (details.quota !== undefined) this.quota = details.quota;
  }
}
