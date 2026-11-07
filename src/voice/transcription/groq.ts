import { z } from "zod";
import type { Lang } from "../../i18n/lang";
import { cleanTranscript } from "./clean";
import { TranscriptionError } from "./errors";

/**
 * Groq Whisper transcription (feature 015, research R1/R2/R6, contracts/groq-transcription.md):
 * one multipart POST straight from the device with the user's key. CORS is open on this endpoint.
 * Used by the app and by `eval:audio`. Never rejects: failures come back as `{ kind: "error" }`.
 */

export const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

/** Each attempt's budget (FR-015). */
export const TRANSCRIPTION_TIMEOUT_MS = 8000;

export interface TranscribeOptions {
  readonly apiKey: string;
  readonly lang: Lang;
  /** The vocabulary hint; not sent when empty. */
  readonly prompt: string;
  /** `command.<webm|ogg|mp4>`: Groq reads the type from the extension. */
  readonly fileName: string;
  readonly signal?: AbortSignal;
  /** The eval may compare models; the app always uses GROQ_TRANSCRIPTION_MODEL. */
  readonly model?: string;
}

export type TranscriptionResult =
  | { readonly kind: "text"; readonly text: string; readonly ms: number }
  | { readonly kind: "empty"; readonly reason: "noSpeech" | "hallucination" | "cancelled" }
  | { readonly kind: "error"; readonly error: TranscriptionError };

export type Transcriber = (audio: Blob, options: TranscribeOptions) => Promise<TranscriptionResult>;

const Segment = z.looseObject({ text: z.string(), no_speech_prob: z.number().optional(), avg_logprob: z.number().optional() });
export const GroqResponse = z.looseObject({ text: z.string(), segments: z.array(Segment).optional() });
export type GroqResponse = z.infer<typeof GroqResponse>;

export interface GroqTranscriberDeps {
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
}

class Aborted extends Error {}
class TimedOut extends Error {}

/** One attempt: the 8 s timer and the caller's signal both abort the request. */
type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

async function attempt(
  fetchFn: FetchFn,
  form: FormData,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = { hit: false };
  const timer = setTimeout(() => {
    timeout.hit = true;
    controller.abort();
  }, TRANSCRIPTION_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetchFn(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new Aborted();
    if (timeout.hit) throw new TimedOut();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function formOf(audio: Blob, options: TranscribeOptions): FormData {
  const form = new FormData();
  form.append("file", new File([audio], options.fileName, { type: audio.type }));
  form.append("model", options.model ?? GROQ_TRANSCRIPTION_MODEL);
  form.append("language", options.lang);
  if (options.prompt) form.append("prompt", options.prompt);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  return form;
}

/** The longest server delay the app's single retry will wait for (FR-015). */
const MAX_RETRY_WAIT_MS = 1000;
const DEFAULT_RETRY_WAIT_MS = 500;

/** Groq's own error text, for the dev log only; anything key-shaped is masked. */
async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    const message = typeof body.error?.message === "string" ? body.error.message : "";
    return message.replace(/gsk_\w+/g, "gsk_…").slice(0, 120);
  } catch {
    return "";
  }
}

/** contracts/groq-transcription.md §4: status → neutral kind. */
async function toTranscriptionError(response: Response): Promise<TranscriptionError> {
  const status = response.status;
  const text = `Groq: ${status} ${await errorText(response)}`.trim();
  const at = { status };
  if (status === 401) return new TranscriptionError("auth", text, at);
  if (status === 403) return new TranscriptionError("permission", text, at);
  if (status === 404) return new TranscriptionError("model", text, at);
  if (status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter !== null && /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : undefined;
    return new TranscriptionError("rateLimit", text, { ...at, ...(seconds !== undefined ? { retryAfterMs: seconds * 1000 } : {}) });
  }
  if (status === 400 || status === 413 || status === 422) return new TranscriptionError("audio", text, at);
  return new TranscriptionError("service", text, at);
}

/** One retry on a 429 the server says is brief, on 5xx and on a network failure (FR-015). */
function retryWaitMs(error: TranscriptionError): number | undefined {
  if (error.kind === "rateLimit") {
    const after = error.retryAfterMs;
    return after === undefined ? DEFAULT_RETRY_WAIT_MS : after <= MAX_RETRY_WAIT_MS ? after : undefined;
  }
  if (error.kind === "service" && (error.status ?? 0) >= 500) return DEFAULT_RETRY_WAIT_MS;
  if (error.kind === "connection") return DEFAULT_RETRY_WAIT_MS;
  return undefined;
}

/** Waits `ms`, or resolves early (false) when the caller aborts. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createGroqTranscriber(deps: GroqTranscriberDeps = {}): Transcriber {
  // Resolved at call time, so a test or the eval can swap the global fetch.
  const fetchFn: FetchFn = (input, init) => (deps.fetch ?? globalThis.fetch)(input, init);
  const now = deps.now ?? (() => Date.now());

  /** One attempt, mapped to a result (never throws). */
  const once = async (audio: Blob, options: TranscribeOptions, started: number): Promise<TranscriptionResult> => {
    try {
      const response = await attempt(fetchFn, formOf(audio, options), options.apiKey, options.signal);
      if (!response.ok) return { kind: "error", error: await toTranscriptionError(response) };
      const body = GroqResponse.safeParse(await response.json());
      if (!body.success) return { kind: "error", error: new TranscriptionError("service", "Groq: unexpected response") };
      const cleaned = cleanTranscript(body.data, options.lang);
      return cleaned.kind === "text" ? { kind: "text", text: cleaned.text, ms: now() - started } : cleaned;
    } catch (error) {
      if (error instanceof Aborted || options.signal?.aborted) return { kind: "empty", reason: "cancelled" };
      if (error instanceof TimedOut) return { kind: "error", error: new TranscriptionError("timeout", "Groq: no response in 8 s") };
      if (error instanceof TypeError) return { kind: "error", error: new TranscriptionError("connection", "Groq: no connection") };
      return { kind: "error", error: new TranscriptionError("service", "Groq: request failed") };
    }
  };

  return async (audio, options) => {
    if (options.signal?.aborted) return { kind: "empty", reason: "cancelled" };
    const started = now();
    const first = await once(audio, options, started);
    if (first.kind !== "error") return first;
    const ms = retryWaitMs(first.error);
    if (ms === undefined) return first;
    if (!(await wait(ms, options.signal))) return { kind: "empty", reason: "cancelled" };
    return once(audio, options, started);
  };
}
