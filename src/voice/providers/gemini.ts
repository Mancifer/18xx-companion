import { VoiceProviderError } from "../errors";
import type { CacheEvent, Interpreter, InterpreterOptions } from "../interpreter";
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

/**
 * Models that use explicit context caching by default (feature 009, FR-009, research R8). A model
 * is added only after an eval with `--cache on` passes SC-001–SC-004; `options.cache` overrides.
 */
// gemini-3.6-flash: eval/voice/results/2026-10-11-gemini-3.6-flash-cache.json (2026-10-11), browser
// check passed; SC-002 accepted on session length (research R8).
export const EXPLICIT_CACHE_MODELS: ReadonlySet<string> = new Set(["gemini-3.6-flash"]);
/** Cache lifetime in seconds; extended with a PATCH when less than half is left (R4). */
export const CACHE_TTL_S = 900;
/** A cache is treated as expired this long before Google's expireTime. */
const CACHE_EXPIRY_MARGIN_MS = 30_000;
/** After a transient create failure, no new create for this long (R6). */
const CREATE_COOLDOWN_MS = 5 * 60_000;
const CACHE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/";

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

/** The single retry waits for the server's delay up to 1 s, or 0.5 s when it gives none. */
function retryWaitMs(error: VoiceProviderError): number {
  const after = error.retryAfterMs;
  return after === undefined ? DEFAULT_RETRY_WAIT_MS : Math.min(after, MAX_RETRY_WAIT_MS);
}

/** In memory only, one per interpreter at a time (feature 009 data-model §2). */
interface CacheEntry {
  /** The stable part it holds: its identity (R5). */
  readonly stable: string;
  state: "creating" | "ready";
  /** The create, shared so that nothing starts a second one; it never rejects. */
  pending?: Promise<void>;
  /** `cachedContents/…`; never logged, put in an event or exported (FR-007). */
  name?: string;
  /** Local expiry: Google's expireTime minus CACHE_EXPIRY_MARGIN_MS. */
  expiresAt?: number;
  extending?: boolean;
}

/** Each Gemini interpreter's cache disposer, kept out of the Interpreter type. */
const disposers = new WeakMap<Interpreter, () => Promise<void>>();

/**
 * Deletes the interpreter's cache, if any, after waiting for an in-flight create; never rejects.
 * For the eval and housekeeping only: the app does not call it, the TTL bounds its cost (R4).
 * The next command after it goes uncached and starts a new create.
 */
export function dispose(interpreter: Interpreter): Promise<void> {
  return disposers.get(interpreter)?.() ?? Promise.resolve();
}

/**
 * The Gemini interpreter. systemInstruction, tools and toolConfig (the stable part) are serialized
 * once per session object and reused, so they are byte-identical between commands (R5, FR-011).
 *
 * With caching on (`options.cache ?? EXPLICIT_CACHE_MODELS.has(model)`), the stable part is stored
 * with explicit context caching (feature 009, contracts/gemini-cache.md): the first command goes
 * uncached while the cache is created in the background; later commands send `cachedContent` plus
 * the same contents and generationConfig. The 15-minute TTL is extended when less than half is
 * left, and any cache error falls back to the uncached request. With caching off, requests are
 * exactly those of before.
 */
export function createGeminiInterpreter(apiKey: string, model: string, options: InterpreterOptions = {}): Interpreter {
  const url = `${ENDPOINT}${encodeURIComponent(model)}:generateContent`;
  const level = THINKING_LEVEL[model];
  const tail = JSON.stringify({
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
  });
  const caching = options.cache ?? EXPLICIT_CACHE_MODELS.has(model);
  const now = options.now ?? Date.now;
  const emit = (event: CacheEvent) => {
    try {
      options.onCacheEvent?.(event);
    } catch {
      // An observer never breaks a command.
    }
  };
  const failed = (op: "create" | "extend" | "delete", error: unknown) => {
    const e = error instanceof VoiceProviderError ? error : undefined;
    emit({ kind: "failed", op, ...(e?.status !== undefined ? { status: e.status } : {}), reason: e?.message ?? "Gemini: error", at: now() });
  };
  let lastSession: VoiceSession | undefined;
  /** `"systemInstruction":…,"tools":…,"toolConfig":…`, shared by the uncached and create bodies. */
  let stable = "";
  let entry: CacheEntry | undefined;
  /** Create failures per stable part: a time before which no create, or never again (R6). */
  const blocked = new Map<string, number | "forever">();

  async function send(method: "POST" | "PATCH" | "DELETE", target: string, body?: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(target, {
        method,
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        ...(body !== undefined ? { body } : {}),
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
    if (parsed === undefined && method === "DELETE") return {};
    if (parsed === undefined) throw new VoiceProviderError("service", `Gemini HTTP ${response.status}: the body is not JSON`, { status: response.status });
    return parsed;
  }

  /** Today's request with its single retry. */
  async function uncached(body: string): Promise<unknown> {
    try {
      return await send("POST", url, body);
    } catch (error) {
      if (!(error instanceof VoiceProviderError) || !retryable(error)) throw error;
      await wait(retryWaitMs(error));
      return await send("POST", url, body);
    }
  }

  async function remove(name: string): Promise<void> {
    try {
      await send("DELETE", `${CACHE_ENDPOINT}${name}`);
      emit({ kind: "deleted", at: now() });
    } catch (error) {
      failed("delete", error);
    }
  }

  async function create(mine: CacheEntry): Promise<void> {
    let name: string, expireTime: string, tokens: number;
    try {
      const raw = obj(await send("POST", `${CACHE_ENDPOINT}cachedContents`, `{"model":${JSON.stringify(`models/${model}`)},${mine.stable},"ttl":"${CACHE_TTL_S}s"}`));
      name = typeof raw?.["name"] === "string" ? raw["name"] : "";
      expireTime = typeof raw?.["expireTime"] === "string" ? raw["expireTime"] : "";
      tokens = num(obj(raw?.["usageMetadata"])?.["totalTokenCount"]);
      if (!name || !Number.isFinite(Date.parse(expireTime))) throw new VoiceProviderError("service", "Gemini: the cache has no name or expiry");
    } catch (error) {
      if (entry === mine) entry = undefined;
      const e = error instanceof VoiceProviderError ? error : undefined;
      const never = e?.status === 400 || e?.status === 403 || (e?.kind === "rateLimit" && e.quota === "day");
      blocked.set(mine.stable, never ? "forever" : now() + CREATE_COOLDOWN_MS);
      failed("create", error);
      return;
    }
    // Replaced or disposed meanwhile: nobody will use it.
    if (entry !== mine) return remove(name);
    Object.assign(mine, { state: "ready", name, expiresAt: Date.parse(expireTime) - CACHE_EXPIRY_MARGIN_MS });
    emit({ kind: "created", tokens, expireTime, at: now() });
  }

  function startCreate(part: string): void {
    const until = blocked.get(part);
    if (entry?.stable === part || until === "forever" || (until !== undefined && now() < until)) return;
    const mine: CacheEntry = { stable: part, state: "creating" };
    entry = mine;
    mine.pending = create(mine);
  }

  async function extend(mine: CacheEntry): Promise<void> {
    if (mine.extending) return;
    mine.extending = true;
    try {
      const raw = obj(await send("PATCH", `${CACHE_ENDPOINT}${mine.name ?? ""}`, `{"ttl":"${CACHE_TTL_S}s"}`));
      const reported = typeof raw?.["expireTime"] === "string" ? Date.parse(raw["expireTime"]) : NaN;
      const expires = Number.isFinite(reported) ? reported : now() + CACHE_TTL_S * 1000;
      mine.expiresAt = expires - CACHE_EXPIRY_MARGIN_MS;
      emit({ kind: "extended", expireTime: new Date(expires).toISOString(), at: now() });
    } catch (error) {
      failed("extend", error);
    } finally {
      mine.extending = false;
    }
  }

  const interpret: Interpreter = async (session, userMessage) => {
    if (session !== lastSession || !stable) {
      lastSession = session;
      stable =
        `"systemInstruction":${JSON.stringify({ parts: [{ text: systemPromptEs(session) }] })}` +
        `,"tools":${JSON.stringify(toGeminiTools(buildToolSpecs(session)))}` +
        `,"toolConfig":${JSON.stringify({ functionCallingConfig: { mode: TOOL_MODE } })}`;
    }
    const part = stable;
    const turn = `"contents":${JSON.stringify([{ role: "user", parts: [{ text: userMessage }] }])},"generationConfig":${tail}}`;
    const body = `{${part},${turn}`;
    if (!caching) return geminiReply(await uncached(body), model);

    if (entry && entry.stable !== part) {
      if (entry.state === "ready" && entry.name) void remove(entry.name);
      entry = undefined;
    }
    const ready = entry?.state === "ready" && now() < (entry.expiresAt ?? 0) ? entry : undefined;
    if (!ready) {
      // Expired locally: Google lets it lapse on its own.
      if (entry?.state === "ready") entry = undefined;
      startCreate(part);
      return geminiReply(await uncached(body), model);
    }

    let raw: unknown;
    try {
      raw = await send("POST", url, `{"cachedContent":${JSON.stringify(ready.name)},${turn}`);
    } catch (error) {
      if (!(error instanceof VoiceProviderError)) throw error;
      const status = error.status ?? 0;
      if (status === 400 || status === 403 || status === 404) {
        // Expired, deleted or refused (a missing cache is a 403, R12). The uncached resend is the
        // command's one retry, so its own errors surface as today.
        if (entry === ready) entry = undefined;
        emit({ kind: "fallback", status, at: now() });
        try {
          return geminiReply(await send("POST", url, body), model);
        } finally {
          startCreate(part);
        }
      }
      if (!retryable(error)) throw error;
      await wait(retryWaitMs(error));
      return geminiReply(await send("POST", url, body), model);
    }
    if ((ready.expiresAt ?? 0) + CACHE_EXPIRY_MARGIN_MS - now() < (CACHE_TTL_S * 1000) / 2) void extend(ready);
    return geminiReply(raw, model);
  };

  disposers.set(interpret, async () => {
    const current = entry;
    entry = undefined;
    if (current?.state === "creating") await current.pending;
    else if (current?.name) await remove(current.name);
  });
  return interpret;
}
