import { VoiceProviderError } from "../errors";
import type { Interpreter } from "../interpreter";
import { systemPromptEs } from "../prompt";
import type { ModelReply, ReplyStop, ToolCall } from "../reply";
import { buildToolSpecs, toGeminiTools, type VoiceSession } from "../tools";

/**
 * Gemini through plain `fetch` to generateContent (feature 005, research R2–R7,
 * contracts/voice-provider.md §4). The key goes only in the `x-goog-api-key` header, never in a
 * URL, a log or an error message.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/";

/** Every call must be a tool call (R4); fall back to "VALIDATED", then "AUTO", if the eval says so. */
const TOOL_MODE = "ANY";
const MAX_OUTPUT_TOKENS = 1024;
const TIMEOUT_MS = 8000;
/** The app's single retry waits at most this long (FR-010). */
const MAX_RETRY_WAIT_MS = 1000;
const DEFAULT_RETRY_WAIT_MS = 500;

/**
 * The lowest thinking level each model accepts; omitted for unknown models (R4). Checked against
 * Google's thinking docs on 2026-10-10; none of these models can turn thinking off.
 */
const THINKING_LEVEL: Readonly<Record<string, "minimal" | "low">> = {
  "gemini-3.8-flash": "low",
  "gemini-3.6-flash": "minimal",
  "gemini-3.5-flash-lite": "minimal",
  "gemini-3-flash-preview": "minimal",
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const REFUSED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);
const MALFORMED = new Set(["MALFORMED_FUNCTION_CALL", "MALFORMED_RESPONSE", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS"]);

/** finishReason → neutral stop (research R6). */
function stopOf(finishReason: string): ReplyStop {
  if (finishReason === "STOP") return "done";
  if (finishReason === "MAX_TOKENS") return "truncated";
  if (REFUSED.has(finishReason) || finishReason.startsWith("IMAGE_")) return "refused";
  if (MALFORMED.has(finishReason)) return "malformed";
  return "other";
}

/** A raw generateContent body → ModelReply. Text, thoughts and signatures are dropped. */
export function geminiReply(raw: unknown, requestedModel: string): ModelReply {
  const body = obj(raw) ?? {};
  const model = typeof body["modelVersion"] === "string" && body["modelVersion"] ? body["modelVersion"] : requestedModel;
  const meta = obj(body["usageMetadata"]);
  const usage = meta
    ? (() => {
        const cached = num(meta["cachedContentTokenCount"]);
        const thinking = num(meta["thoughtsTokenCount"]);
        return {
          input: num(meta["promptTokenCount"]) - cached,
          output: num(meta["candidatesTokenCount"]) + thinking,
          cacheRead: cached,
          cacheWrite: 0,
          thinking,
        };
      })()
    : undefined;
  const base = { provider: "gemini" as const, model, ...(usage ? { usage } : {}) };

  const blockReason = obj(body["promptFeedback"])?.["blockReason"];
  const candidate = Array.isArray(body["candidates"]) ? obj(body["candidates"][0]) : undefined;
  if (typeof blockReason === "string" || !candidate) {
    return { ...base, calls: [], stop: "refused", rawStop: typeof blockReason === "string" ? blockReason : "NO_CANDIDATES" };
  }
  const rawStop = typeof candidate["finishReason"] === "string" ? candidate["finishReason"] : "";
  const parts = obj(candidate["content"])?.["parts"];
  const calls: ToolCall[] = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    const call = obj(obj(part)?.["functionCall"]);
    if (call && typeof call["name"] === "string") calls.push({ name: call["name"], input: obj(call["args"]) ?? {} });
  }
  return { ...base, calls, stop: stopOf(rawStop), rawStop };
}

/** "34s" / "0.5s" → ms. */
function durationMs(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return match ? Math.round(Number(match[1]) * 1000) : undefined;
}

/**
 * An HTTP error → VoiceProviderError (contracts/voice-provider.md §4 "Errors"). Only the status
 * and Google's status/reason codes go in the message: never the key, headers or the body.
 */
export function toVoiceProviderError({ status, body, retryAfter }: { status: number; body: unknown; retryAfter?: string | null }): VoiceProviderError {
  const error = obj(obj(body)?.["error"]);
  const googleStatus = typeof error?.["status"] === "string" ? error["status"] : "";
  const message = typeof error?.["message"] === "string" ? error["message"] : "";
  const details = Array.isArray(error?.["details"]) ? (error["details"] as unknown[]).map(obj).filter((d): d is Json => d !== undefined) : [];
  const reasons = details.map((d) => d["reason"]).filter((r): r is string => typeof r === "string");
  const text = `Gemini HTTP ${status}${googleStatus ? ` ${googleStatus}` : ""}${reasons.length ? ` (${reasons.join(", ")})` : ""}`;
  const at = { status };

  if (status === 401 || reasons.includes("API_KEY_INVALID")) return new VoiceProviderError("auth", text, at);
  if (status === 403) return new VoiceProviderError("permission", text, at);
  if (status === 404 || (status === 400 && /model/i.test(message) && /not found|not supported|unsupported|unexpected model|invalid model/i.test(message))) {
    return new VoiceProviderError("model", text, at);
  }
  if (status === 429) {
    const retryInfo = details.find((d) => String(d["@type"]).endsWith("RetryInfo"));
    const retryAfterMs = durationMs(retryInfo?.["retryDelay"]) ?? (retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined);
    const quotaIds = details.flatMap((d) => (Array.isArray(d["violations"]) ? (d["violations"] as unknown[]) : [])).map((v) => obj(v)?.["quotaId"])
      .filter((id): id is string => typeof id === "string");
    const quota = quotaIds.some((id) => id.includes("PerDay")) ? "day" : quotaIds.some((id) => id.includes("PerMinute")) ? "minute" : undefined;
    return new VoiceProviderError("rateLimit", text, { ...at, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}), ...(quota ? { quota } : {}) });
  }
  if (status === 504) return new VoiceProviderError("timeout", text, at);
  return new VoiceProviderError("service", text, at);
}

/** One retry, after a short wait, on 429, 5xx (504 included) and network errors (FR-010). */
function retryable(error: VoiceProviderError): boolean {
  if (error.kind === "rateLimit") return error.quota !== "day";
  if (error.kind === "connection") return true;
  if (error.kind === "timeout" || error.kind === "service") return (error.status ?? 0) >= 500;
  return false;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The Gemini interpreter. systemInstruction and tools are serialized once per session object and
 * reused, so the implicit-cache prefix is byte-identical between commands (R5, FR-011).
 */
export function createGeminiInterpreter(apiKey: string, model: string): Interpreter {
  const url = `${ENDPOINT}${encodeURIComponent(model)}:generateContent`;
  const level = THINKING_LEVEL[model];
  const tail = JSON.stringify({
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
  });
  let lastSession: VoiceSession | undefined;
  let prefix = "";

  async function attempt(body: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted) throw new VoiceProviderError("timeout", "Gemini: no response in 8 s");
      throw new VoiceProviderError("connection", `Gemini: ${error instanceof Error ? error.name : "network error"}`);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw controller.signal.aborted
        ? new VoiceProviderError("timeout", "Gemini: no response in 8 s")
        : new VoiceProviderError("connection", "Gemini: the response was cut off");
    } finally {
      clearTimeout(timer);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (!response.ok) throw toVoiceProviderError({ status: response.status, body: parsed, retryAfter: response.headers.get("retry-after") });
    if (parsed === undefined) throw new VoiceProviderError("service", `Gemini HTTP ${response.status}: the body is not JSON`, { status: response.status });
    return parsed;
  }

  return async (session, userMessage) => {
    if (session !== lastSession || !prefix) {
      lastSession = session;
      prefix =
        `{"systemInstruction":${JSON.stringify({ parts: [{ text: systemPromptEs(session) }] })}` +
        `,"tools":${JSON.stringify(toGeminiTools(buildToolSpecs(session)))}` +
        `,"toolConfig":${JSON.stringify({ functionCallingConfig: { mode: TOOL_MODE } })}`;
    }
    const body = `${prefix},"contents":${JSON.stringify([{ role: "user", parts: [{ text: userMessage }] }])},"generationConfig":${tail}}`;
    let raw: unknown;
    try {
      raw = await attempt(body);
    } catch (error) {
      if (!(error instanceof VoiceProviderError) || !retryable(error)) throw error;
      const after = error.retryAfterMs;
      await wait(after !== undefined && after <= MAX_RETRY_WAIT_MS ? after : after !== undefined ? MAX_RETRY_WAIT_MS : DEFAULT_RETRY_WAIT_MS);
      raw = await attempt(body);
    }
    return geminiReply(raw, model);
  };
}
