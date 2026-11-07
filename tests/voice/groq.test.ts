import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroqTranscriber, GROQ_TRANSCRIPTION_MODEL, GROQ_TRANSCRIPTION_URL } from "../../src/voice/transcription/groq";
import { TranscriptionError } from "../../src/voice/transcription/errors";

/** Feature 015 T017 (contracts/groq-transcription.md §1–§3): the request and the happy path. */

type FetchArgs = [input: string, init: RequestInit];

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** A fetch stub; `reply` may be a Response or a function of the call. */
function stubFetch(...replies: (Response | ((init: RequestInit) => Promise<Response>))[]) {
  const calls: FetchArgs[] = [];
  const fetch = vi.fn((input: string, init: RequestInit) => {
    calls.push([input, init]);
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
    return typeof reply === "function" ? reply(init) : Promise.resolve(reply!.clone());
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

/** Never answers; rejects like fetch does when its signal aborts. */
const hang = (init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

const opts = { apiKey: "gsk_test", lang: "es" as const, prompt: "Jugadores: Ana, Bruno.", fileName: "command.webm" };
const webm = () => new Blob(["audio"], { type: "audio/webm;codecs=opus" });

afterEach(() => {
  vi.useRealTimers();
});

describe("Groq transcriber: request (contracts §1)", () => {
  it("POSTs multipart to the transcription endpoint with the key as a bearer token", async () => {
    const { fetch, calls } = stubFetch(json({ text: "Ana compra una del B&O." }));
    await createGroqTranscriber({ fetch })(webm(), opts);
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(GROQ_TRANSCRIPTION_URL).toBe(url);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer gsk_test");
    // The browser sets the multipart boundary itself.
    expect(new Headers(init.headers).get("content-type")).toBeNull();
  });

  it("sends the file, model, language, prompt, verbose_json and temperature 0", async () => {
    const { fetch, calls } = stubFetch(json({ text: "hola" }));
    await createGroqTranscriber({ fetch })(webm(), opts);
    const form = calls[0]![1].body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("command.webm");
    expect(file.type).toBe("audio/webm;codecs=opus");
    expect(form.get("model")).toBe(GROQ_TRANSCRIPTION_MODEL);
    expect(GROQ_TRANSCRIPTION_MODEL).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("es");
    expect(form.get("prompt")).toBe("Jugadores: Ana, Bruno.");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("temperature")).toBe("0");
  });

  it("names an mp4 recording command.mp4 and sends English as `en`", async () => {
    const { fetch, calls } = stubFetch(json({ text: "hi" }));
    await createGroqTranscriber({ fetch })(new Blob(["a"], { type: "audio/mp4" }), { ...opts, lang: "en", fileName: "command.mp4" });
    const form = calls[0]![1].body as FormData;
    expect((form.get("file") as File).name).toBe("command.mp4");
    expect(form.get("language")).toBe("en");
  });

  it("an empty prompt is not sent", async () => {
    const { fetch, calls } = stubFetch(json({ text: "hi" }));
    await createGroqTranscriber({ fetch })(webm(), { ...opts, prompt: "" });
    expect((calls[0]![1].body as FormData).has("prompt")).toBe(false);
  });

  it("the eval may pick another model", async () => {
    const { fetch, calls } = stubFetch(json({ text: "hi" }));
    await createGroqTranscriber({ fetch })(webm(), { ...opts, model: "whisper-large-v3" });
    expect((calls[0]![1].body as FormData).get("model")).toBe("whisper-large-v3");
  });
});

describe("Groq transcriber: response (contracts §2)", () => {
  it("joins the segments' text, trimmed", async () => {
    const { fetch } = stubFetch(
      json({
        text: " Ana compra una del B&O. Y paga.",
        segments: [
          { text: " Ana compra una del B&O.", no_speech_prob: 0.01, avg_logprob: -0.2 },
          { text: " Y paga.", no_speech_prob: 0.02, avg_logprob: -0.3 },
        ],
      }),
    );
    const result = await createGroqTranscriber({ fetch })(webm(), opts);
    expect(result).toMatchObject({ kind: "text", text: "Ana compra una del B&O. Y paga." });
  });

  it("without segments it uses `text`", async () => {
    const { fetch } = stubFetch(json({ text: "  Bruno vende dos.  " }));
    expect(await createGroqTranscriber({ fetch })(webm(), opts)).toMatchObject({ kind: "text", text: "Bruno vende dos." });
  });

  it("reports how long the request took", async () => {
    const { fetch } = stubFetch(json({ text: "x" }));
    const result = await createGroqTranscriber({ fetch, now: (() => { let t = 0; return () => (t += 640); })() })(webm(), opts);
    expect(result).toEqual({ kind: "text", text: "x", ms: 640 });
  });

  it("a blank transcript is empty/noSpeech", async () => {
    const { fetch } = stubFetch(json({ text: "   ", segments: [] }));
    expect(await createGroqTranscriber({ fetch })(webm(), opts)).toEqual({ kind: "empty", reason: "noSpeech" });
  });
});

describe("Groq transcriber: timeout and cancel (contracts §3)", () => {
  it("gives up after 8 s with a timeout error", async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch(hang);
    const pending = createGroqTranscriber({ fetch })(webm(), opts);
    await vi.advanceTimersByTimeAsync(8000);
    const result = await pending;
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.error).toBeInstanceOf(TranscriptionError);
    expect(result.kind === "error" && result.error.kind).toBe("timeout");
  });

  it("a caller abort resolves empty/cancelled, never an error", async () => {
    const { fetch } = stubFetch(hang);
    const caller = new AbortController();
    const pending = createGroqTranscriber({ fetch })(webm(), { ...opts, signal: caller.signal });
    caller.abort();
    expect(await pending).toEqual({ kind: "empty", reason: "cancelled" });
  });

  it("an already-aborted signal sends nothing", async () => {
    const { fetch, calls } = stubFetch(json({ text: "x" }));
    const caller = new AbortController();
    caller.abort();
    expect(await createGroqTranscriber({ fetch })(webm(), { ...opts, signal: caller.signal })).toEqual({ kind: "empty", reason: "cancelled" });
    expect(calls).toHaveLength(0);
  });

  it("never rejects, even when fetch throws something odd", async () => {
    const fetch = (() => Promise.reject(new Error("boom"))) as unknown as typeof globalThis.fetch;
    await expect(createGroqTranscriber({ fetch })(webm(), opts)).resolves.toMatchObject({ kind: "error" });
  });
});

const groqError = (status: number, headers: Record<string, string> = {}) =>
  json({ error: { message: "Invalid API Key", type: "invalid_request_error" } }, status, headers);
const kindOf = (r: Awaited<ReturnType<ReturnType<typeof createGroqTranscriber>>>) => (r.kind === "error" ? r.error.kind : r.kind);

describe("Groq transcriber: error mapping (015 T043, contracts §4)", () => {
  it.each([
    [401, "auth"],
    [403, "permission"],
    [404, "model"],
    [400, "audio"],
    [413, "audio"],
    [422, "audio"],
  ] as const)("%i → %s, with no retry", async (status, kind) => {
    const { fetch, calls } = stubFetch(groqError(status));
    const result = await createGroqTranscriber({ fetch })(webm(), opts);
    expect(kindOf(result)).toBe(kind);
    expect(result.kind === "error" && result.error.status).toBe(status);
    expect(calls).toHaveLength(1);
  });

  it("429 → rateLimit with retry-after, after one quick retry", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = stubFetch(groqError(429, { "retry-after": "1" }));
    const pending = createGroqTranscriber({ fetch })(webm(), opts);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;
    expect(kindOf(result)).toBe("rateLimit");
    expect(result.kind === "error" && result.error.retryAfterMs).toBe(1000);
    expect(calls).toHaveLength(2);
  });

  it("a 429 with a long retry-after is not retried", async () => {
    const { fetch, calls } = stubFetch(groqError(429, { "retry-after": "30" }));
    expect(kindOf(await createGroqTranscriber({ fetch })(webm(), opts))).toBe("rateLimit");
    expect(calls).toHaveLength(1);
  });

  it("a 5xx is retried once after 0.5 s; a second failure is service", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = stubFetch(groqError(503));
    const pending = createGroqTranscriber({ fetch })(webm(), opts);
    await vi.advanceTimersByTimeAsync(500);
    expect(kindOf(await pending)).toBe("service");
    expect(calls).toHaveLength(2);
  });

  it("a retry that succeeds returns the text", async () => {
    vi.useFakeTimers();
    const { fetch } = stubFetch(groqError(502), json({ text: "Ana paga 30." }));
    const pending = createGroqTranscriber({ fetch })(webm(), opts);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toMatchObject({ kind: "text", text: "Ana paga 30." });
  });

  it("a network TypeError → connection, retried once", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetch = (() => {
      n += 1;
      return Promise.reject(new TypeError("Failed to fetch"));
    }) as unknown as typeof globalThis.fetch;
    const pending = createGroqTranscriber({ fetch })(webm(), opts);
    await vi.advanceTimersByTimeAsync(500);
    expect(kindOf(await pending)).toBe("connection");
    expect(n).toBe(2);
  });

  it("a body that fails the schema → service, not retried", async () => {
    const { fetch, calls } = stubFetch(json({ nope: true }));
    expect(kindOf(await createGroqTranscriber({ fetch })(webm(), opts))).toBe("service");
    expect(calls).toHaveLength(1);
  });

  it("a timeout is not retried", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = stubFetch(hang);
    const pending = createGroqTranscriber({ fetch })(webm(), opts);
    await vi.advanceTimersByTimeAsync(8000);
    expect(kindOf(await pending)).toBe("timeout");
    expect(calls).toHaveLength(1);
  });

  it("a cancel during the retry wait resolves empty/cancelled", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = stubFetch(groqError(503));
    const caller = new AbortController();
    const pending = createGroqTranscriber({ fetch })(webm(), { ...opts, signal: caller.signal });
    await vi.advanceTimersByTimeAsync(100);
    caller.abort();
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toEqual({ kind: "empty", reason: "cancelled" });
    expect(calls).toHaveLength(1);
  });

  it("no error message carries the key, the prompt or the form", async () => {
    for (const status of [400, 401, 403, 404, 429, 500]) {
      const { fetch } = stubFetch(groqError(status));
      const result = await createGroqTranscriber({ fetch })(webm(), { ...opts, apiKey: "gsk_SECRET", prompt: "Jugadores: PromptSecreto." });
      const text = result.kind === "error" ? `${result.error.message} ${JSON.stringify(result.error)}` : "";
      expect(text).not.toContain("gsk_SECRET");
      expect(text).not.toContain("PromptSecreto");
      expect(text).not.toContain("Jugadores");
    }
  });
});
