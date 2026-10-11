import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../../eval/voice/load";
import { VoiceProviderError } from "../../src/voice/errors";
import { createGeminiInterpreter, geminiReply, toVoiceProviderError } from "../../src/voice/providers/gemini";
import { systemPromptEs } from "../../src/voice/prompt";

/** Feature 005 T021: the Gemini adapter against a stubbed fetch (contracts/voice-provider.md §4). */

const KEY = "AIzaTEST-not-a-real-key";
const raw = (name: string): unknown => JSON.parse(readFileSync(new URL(`./recorded/gemini/${name}.json`, import.meta.url), "utf8"));
const { session } = loadFixture("eval/voice/fixtures", "1830-or");

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Replies in order (the last one repeats); records every call. */
function stubFetch(...replies: (Response | Error | (() => Promise<Response>))[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (next instanceof Error) return Promise.reject(next);
    if (typeof next === "function") return next();
    return Promise.resolve(next.clone());
  });
  return calls;
}

const googleError = (code: number, status: string, message: string, details: unknown[] = []) => ({ error: { code, message, status, details } });
const quotaDetails = (quotaId: string, retryDelay?: string) => [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_requests", quotaId }] },
  ...(retryDelay ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }] : []),
];

async function kindOf(promise: Promise<unknown>): Promise<VoiceProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(VoiceProviderError);
    return error as VoiceProviderError;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Runs the interpreter while letting retry waits elapse. */
async function run<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  const r = await settled;
  if (!r.ok) throw r.e;
  return r.v;
}

describe("Gemini request", () => {
  it("POSTs to generateContent with the key only in the x-goog-api-key header", async () => {
    const calls = stubFetch(json(200, raw("payout")));
    await run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "Transcripción: «240, paga»"));
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [Call];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain(KEY);
    expect(url).not.toContain("key=");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("x-goog-api-key")).toBe(KEY);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("URL-encodes the model id", async () => {
    const calls = stubFetch(json(200, raw("payout")));
    await run(createGeminiInterpreter(KEY, "gemini x/y")(session, "m"));
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini%20x%2Fy:generateContent");
  });

  it("body: stable prefix first, ANY mode, 1024 tokens, the shared system prompt, no safetySettings", async () => {
    const calls = stubFetch(json(200, raw("payout")));
    await run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "the user turn"));
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["systemInstruction", "tools", "toolConfig", "contents", "generationConfig"]);
    expect(body["systemInstruction"]).toEqual({ parts: [{ text: systemPromptEs(session) }] });
    expect(body["toolConfig"]).toEqual({ functionCallingConfig: { mode: "ANY" } });
    expect(body["contents"]).toEqual([{ role: "user", parts: [{ text: "the user turn" }] }]);
    expect(body["generationConfig"]).toEqual({ maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } });
    expect(body).not.toHaveProperty("safetySettings");
  });

  it.each([
    ["gemini-3.8-flash", "low"],
    ["gemini-3.6-flash", "minimal"],
    ["gemini-3-flash-preview", "minimal"],
    ["gemini-3.5-flash-lite", "minimal"],
    ["gemini-unknown", undefined],
  ])("%s thinking level: %s", async (model, level) => {
    const calls = stubFetch(json(200, raw("payout")));
    await run(createGeminiInterpreter(KEY, model, { cache: false })(session, "m"));
    const config = (JSON.parse(calls[0]!.init.body as string) as { generationConfig: Record<string, unknown> }).generationConfig;
    expect(config).toEqual(level ? { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: level } } : { maxOutputTokens: 1024 });
  });

  it("the serialized systemInstruction + tools prefix is byte-identical across commands", async () => {
    const calls = stubFetch(json(200, raw("payout")));
    const interpret = createGeminiInterpreter(KEY, "gemini-3.8-flash");
    await run(interpret(session, "primera"));
    await run(interpret(session, "segunda orden, distinta"));
    const prefix = (c: Call) => (c.init.body as string).slice(0, (c.init.body as string).indexOf('"toolConfig"'));
    expect(prefix(calls[0]!)).toBe(prefix(calls[1]!));
    expect(prefix(calls[0]!).length).toBeGreaterThan(1000);
  });
});

describe("geminiReply", () => {
  it("compound: calls in order, text and signatures dropped, usage normalized", () => {
    const reply = geminiReply(raw("compound"), "gemini-3.8-flash");
    expect(reply).toEqual({
      provider: "gemini",
      model: "gemini-3.8-flash",
      calls: [
        { name: "buyTrain", input: { company: null, trainType: "4", variant: null, from: "bank", seller: null, price: null, tradeIn: null } },
        { name: "runAndPayout", input: { company: null, parts: [{ part: "revenue", amount: 290 }], mode: "full" } },
      ],
      stop: "done",
      rawStop: "STOP",
      usage: { input: 6340 - 6112, output: 85 + 52, cacheRead: 6112, cacheWrite: 0, thinking: 52 },
    });
  });

  it("a call without args becomes {}", () => {
    expect(geminiReply(raw("no-args"), "m").calls).toEqual([{ name: "undo", input: {} }]);
    expect(geminiReply(raw("confirm"), "m").calls).toEqual([{ name: "confirmProposal", input: {} }]);
  });

  it("text and thought parts are dropped; only the call remains", () => {
    const reply = geminiReply(raw("text-and-call"), "m");
    expect(reply.calls.map((c) => c.name)).toEqual(["runAndPayout"]);
    expect(JSON.stringify(reply)).not.toContain("La PRR paga 240.");
  });

  it.each([
    ["STOP", "done"],
    ["MAX_TOKENS", "truncated"],
    ["SAFETY", "refused"],
    ["PROHIBITED_CONTENT", "refused"],
    ["BLOCKLIST", "refused"],
    ["SPII", "refused"],
    ["RECITATION", "refused"],
    ["IMAGE_SAFETY", "refused"],
    ["MALFORMED_FUNCTION_CALL", "malformed"],
    ["MALFORMED_RESPONSE", "malformed"],
    ["UNEXPECTED_TOOL_CALL", "malformed"],
    ["TOO_MANY_TOOL_CALLS", "malformed"],
    ["OTHER", "other"],
    ["LANGUAGE", "other"],
    ["FINISH_REASON_UNSPECIFIED", "other"],
    ["SOMETHING_NEW", "other"],
  ])("finishReason %s → %s", (finishReason, stop) => {
    const body = { candidates: [{ content: { role: "model", parts: [] }, finishReason }] };
    expect(geminiReply(body, "m")).toMatchObject({ stop, rawStop: finishReason });
  });

  it("a blocked prompt or no candidates is refused with no calls", () => {
    expect(geminiReply(raw("blocked-prompt"), "m")).toMatchObject({ stop: "refused", rawStop: "PROHIBITED_CONTENT", calls: [] });
    expect(geminiReply({ candidates: [] }, "m")).toMatchObject({ stop: "refused", calls: [] });
    expect(geminiReply({}, "m")).toMatchObject({ stop: "refused", calls: [] });
  });

  it("the model falls back to the requested one; missing usage fields count as 0", () => {
    const reply = geminiReply({ candidates: [{ finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } }, "gemini-x");
    expect(reply.model).toBe("gemini-x");
    expect(reply.usage).toEqual({ input: 10, output: 3, cacheRead: 0, cacheWrite: 0, thinking: 0 });
  });

  it.each([
    "amend",
    "bad-input",
    "blocked-prompt",
    "buy-private",
    "clarification",
    "compound",
    "confirm",
    "malformed-call",
    "max-tokens",
    "next-company",
    "no-args",
    "no-tool",
    "not-understood",
    "payout",
    "query",
    "refusal",
    "text-and-call",
    "undo",
    "unknown-entity",
  ])("%s maps to a reply", (name) => {
    const reply = geminiReply(raw(name), "gemini-3.8-flash");
    expect(reply.provider).toBe("gemini");
    expect(reply.model).toBe("gemini-3.8-flash");
  });
});

describe("Gemini errors", () => {
  it.each([
    [400, googleError(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }]), "auth"],
    [401, googleError(401, "UNAUTHENTICATED", "Request had invalid authentication credentials."), "auth"],
    [403, googleError(403, "PERMISSION_DENIED", "Permission denied."), "permission"],
    [404, googleError(404, "NOT_FOUND", "models/gemini-nope is not found for API version v1beta."), "model"],
    [400, googleError(400, "INVALID_ARGUMENT", "* GenerateContentRequest.model: unexpected model name format"), "model"],
    [400, googleError(400, "INVALID_ARGUMENT", "models/gemini-old is not supported for generateContent."), "model"],
    [429, googleError(429, "RESOURCE_EXHAUSTED", "Quota exceeded."), "rateLimit"],
    [504, googleError(504, "DEADLINE_EXCEEDED", "Deadline exceeded."), "timeout"],
    [500, googleError(500, "INTERNAL", "Internal error."), "service"],
    [503, googleError(503, "UNAVAILABLE", "Overloaded."), "service"],
    [400, googleError(400, "INVALID_ARGUMENT", "Invalid JSON payload received. Unknown name \"format\"."), "service"],
  ])("HTTP %s → %s", (status, body, kind) => {
    const error = toVoiceProviderError({ status, body });
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it("429: retryAfterMs from RetryInfo; quota day when the violated quota id contains PerDay", () => {
    const day = toVoiceProviderError({ status: 429, body: googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "34s")) });
    expect(day).toMatchObject({ kind: "rateLimit", retryAfterMs: 34000, quota: "day" });
    const minute = toVoiceProviderError({ status: 429, body: googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "0.5s")) });
    expect(minute).toMatchObject({ kind: "rateLimit", retryAfterMs: 500, quota: "minute" });
  });

  it("a non-JSON error body is a service error", () => {
    expect(toVoiceProviderError({ status: 502, body: undefined }).kind).toBe("service");
  });

  it("a 200 with a body that is not JSON is a service error", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 200 }));
    expect((await kindOf(run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m")))).kind).toBe("service");
  });

  it("fetch TypeError → connection", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    expect((await kindOf(run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m")))).kind).toBe("connection");
  });

  it("aborts after 8 s → timeout, without a retry", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const promise = createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m");
    const settled = promise.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(7999);
    expect(calls[0]!.init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = (await settled) as VoiceProviderError;
    expect(error.kind).toBe("timeout");
    expect(calls).toHaveLength(1);
  });

  it("error messages never contain the key", async () => {
    stubFetch(json(400, googleError(400, "INVALID_ARGUMENT", `API key not valid: ${KEY}`, [{ "@type": "x", reason: "API_KEY_INVALID" }])));
    const error = await kindOf(run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m")));
    expect(error.message).not.toContain(KEY);
    expect(JSON.stringify(error)).not.toContain(KEY);
  });
});

describe("Gemini retry (FR-010)", () => {
  const ok = () => json(200, raw("payout"));

  it.each([
    ["rateLimit", json(429, googleError(429, "RESOURCE_EXHAUSTED", "q"))],
    ["service 500", json(500, googleError(500, "INTERNAL", "x"))],
    ["service 503", json(503, googleError(503, "UNAVAILABLE", "x"))],
    ["timeout 504", json(504, googleError(504, "DEADLINE_EXCEEDED", "x"))],
    ["connection", new TypeError("Failed to fetch")],
  ])("retries %s exactly once", async (_name, first) => {
    const calls = stubFetch(first, ok());
    const reply = await run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m"));
    expect(reply.calls[0]?.name).toBe("runAndPayout");
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["auth", json(401, googleError(401, "UNAUTHENTICATED", "x"))],
    ["permission", json(403, googleError(403, "PERMISSION_DENIED", "x"))],
    ["model", json(404, googleError(404, "NOT_FOUND", "models/x is not found"))],
    ["bad request", json(400, googleError(400, "INVALID_ARGUMENT", "Invalid JSON payload"))],
  ])("never retries %s", async (_name, first) => {
    const calls = stubFetch(first, ok());
    await kindOf(run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m")));
    expect(calls).toHaveLength(1);
  });

  it("at most two requests per command", async () => {
    const calls = stubFetch(json(500, googleError(500, "INTERNAL", "x")));
    expect((await kindOf(run(createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m")))).kind).toBe("service");
    expect(calls).toHaveLength(2);
  });

  it("waits at most 1 s, or the server's retryDelay when it is shorter", async () => {
    const calls = stubFetch(json(429, googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("PerMinute", "0.2s"))), ok());
    const promise = createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m");
    await vi.advanceTimersByTimeAsync(199);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    await promise;

    const later = stubFetch(json(503, googleError(503, "UNAVAILABLE", "x")), ok());
    const second = createGeminiInterpreter(KEY, "gemini-3.8-flash")(session, "m");
    await vi.advanceTimersByTimeAsync(1000);
    expect(later).toHaveLength(2);
    await second;
  });
});
