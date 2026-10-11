import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../../eval/voice/load";
import { VoiceProviderError } from "../../src/voice/errors";
import type { CacheEvent, InterpreterOptions } from "../../src/voice/interpreter";
import { createGeminiInterpreter, dispose, EXPLICIT_CACHE_MODELS } from "../../src/voice/providers/gemini";
import { systemPromptEs } from "../../src/voice/prompt";
import type { ModelReply } from "../../src/voice/reply";
import { buildToolSpecs, toGeminiTools, type VoiceSession } from "../../src/voice/tools";

/**
 * Feature 009 T007–T016: explicit context caching in the Gemini adapter against a fake fetch that
 * routes by method + URL, with an injected clock (contracts/gemini-cache.md).
 */

const KEY = "AIzaTEST-cache-not-a-real-key";
const MODEL = "gemini-3.6-flash";
const NAME = "cachedContents/x";
const BASE = "https://generativelanguage.googleapis.com/v1beta/";
const T0 = Date.parse("2026-10-11T12:00:00Z");
const TTL_MS = 900_000;
const FIXTURES = "eval/voice/fixtures";
const payout = JSON.parse(readFileSync(new URL("./recorded/gemini/payout.json", import.meta.url), "utf8")) as Record<string, unknown>;
const { session } = loadFixture(FIXTURES, "1830-or");

type Json = Record<string, unknown>;
interface Call {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body?: string;
}
/** "hang" never settles; "timeout" rejects only when the request is aborted. */
type Reply = Response | Error | Promise<Response> | "hang" | "timeout";
type Handler = (call: Call) => Reply;
type Route = "create" | "generate" | "patch" | "delete";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const googleError = (code: number, status: string, message: string, details: unknown[] = []) => ({ error: { code, message, status, details } });
const quotaDetails = (quotaId: string) => [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_requests", quotaId }] },
];
const body = (call: Call) => JSON.parse(call.body!) as Json;
const expireAt = (ms: number) => new Date(ms).toISOString();

let clock: number;
let calls: Call[];
let events: CacheEvent[];
let routes: Record<Route, Handler>;

const created: Handler = () => json(200, { name: NAME, model: `models/${MODEL}`, expireTime: expireAt(clock + TTL_MS), usageMetadata: { totalTokenCount: 4909 } });
const generated: Handler = (call) => {
  const cached = body(call)["cachedContent"] !== undefined;
  const usageMetadata = { promptTokenCount: 5221, candidatesTokenCount: 35, totalTokenCount: 5256, ...(cached ? { cachedContentTokenCount: 4909 } : {}) };
  return json(200, { ...payout, usageMetadata });
};
const DEFAULT_ROUTES: Record<Route, Handler> = {
  create: created,
  generate: generated,
  patch: () => json(200, { name: NAME, expireTime: expireAt(clock + TTL_MS) }),
  delete: () => json(200, {}),
};

function routeOf({ method, url }: Call): Route | undefined {
  if (method === "POST" && url === `${BASE}cachedContents`) return "create";
  if (method === "POST" && url.endsWith(":generateContent")) return "generate";
  if (method === "PATCH" && url.startsWith(`${BASE}cachedContents/`)) return "patch";
  if (method === "DELETE" && url.startsWith(`${BASE}cachedContents/`)) return "delete";
  return undefined;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  clock = T0;
  calls = [];
  events = [];
  routes = { ...DEFAULT_ROUTES };
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    const call: Call = { method: init.method ?? "GET", url, headers: new Headers(init.headers), ...(typeof init.body === "string" ? { body: init.body } : {}) };
    calls.push(call);
    const route = routeOf(call);
    if (!route) return Promise.reject(new Error(`unexpected ${call.method} ${url}`));
    const reply = routes[route](call);
    if (reply === "hang") return new Promise<Response>(() => undefined);
    if (reply === "timeout") {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(reply);
  });
});

// T015: in every test, the key only ever travels in its header, and events carry no key or name.
afterEach(() => {
  try {
    for (const call of calls) {
      expect(call.url).not.toContain(KEY);
      expect(call.url).not.toContain("key=");
      expect(call.headers.get("x-goog-api-key")).toBe(KEY);
      expect(call.body ?? "").not.toContain(KEY);
    }
    for (const event of events) {
      expect(JSON.stringify(event)).not.toContain(KEY);
      expect(JSON.stringify(event)).not.toContain("cachedContents/");
    }
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

const interpreter = (extra: InterpreterOptions = {}, model = MODEL) =>
  createGeminiInterpreter(KEY, model, { cache: true, now: () => clock, onCacheEvent: (e) => events.push(e), ...extra });

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function ticks(n = 20) {
  for (let i = 0; i < n; i++) await tick();
}

/** Settles a command while letting retry waits and timeouts elapse. */
async function run<T>(promise: Promise<T>): Promise<T> {
  const state = { done: false };
  const settled = promise.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  void settled.then(() => (state.done = true));
  for (let i = 0; i < 50 && !state.done; i++) {
    await vi.runAllTimersAsync();
    await tick();
  }
  const r = await settled;
  if (!r.ok) throw r.e;
  return r.v;
}

/** Lets background creates, PATCHes and DELETEs settle. */
async function flush() {
  await ticks(5);
  await vi.runAllTimersAsync();
  await ticks(5);
}

async function kindOf(promise: Promise<unknown>): Promise<VoiceProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(VoiceProviderError);
    return error as VoiceProviderError;
  }
  throw new Error("expected a rejection");
}

const byRoute = (route: Route) => () => calls.filter((c) => routeOf(c) === route);
const gens = byRoute("generate");
const creates = byRoute("create");
const patches = byRoute("patch");
const deletes = byRoute("delete");

/** What a caching-off interpreter sends and returns for this command; its calls are not kept. */
async function uncached(s: VoiceSession, message: string, model = MODEL): Promise<{ body: string; reply: ModelReply }> {
  const saved = calls.length;
  const reply = await run(createGeminiInterpreter(KEY, model, { cache: false })(s, message));
  const sent = calls[saved]!.body!;
  calls.splice(saved);
  return { body: sent, reply };
}

/** An interpreter whose cache is ready (one uncached command and one create done). */
async function ready(extra: InterpreterOptions = {}) {
  const interpret = interpreter(extra);
  await run(interpret(session, "primera"));
  await flush();
  expect(creates()).toHaveLength(1);
  return interpret;
}

const withAlias = (s: VoiceSession, alias: string): VoiceSession => ({
  ...s,
  players: s.players.map((p, i) => (i === 0 ? { ...p, aliases: [...p.aliases, alias] } : p)),
});

describe("009 T007 lifecycle", () => {
  it("first command uncached + one create; later commands send only cachedContent, contents and generationConfig", async () => {
    const first = await uncached(session, "primera");
    const second = await uncached(session, "segunda");
    const interpret = interpreter();

    await run(interpret(session, "primera"));
    await flush();
    expect(gens()).toHaveLength(1);
    expect(gens()[0]!.body).toBe(first.body);
    expect(creates()).toHaveLength(1);
    const create = body(creates()[0]!);
    expect(Object.keys(create)).toEqual(["model", "systemInstruction", "tools", "toolConfig", "ttl"]);
    expect(create["model"]).toBe(`models/${MODEL}`);
    expect(create["ttl"]).toBe("900s");
    expect(events).toEqual([{ kind: "created", tokens: 4909, expireTime: expireAt(T0 + TTL_MS), at: T0 }]);

    const reply = await run(interpret(session, "segunda"));
    expect(gens()).toHaveLength(2);
    const cached = body(gens()[1]!);
    expect(Object.keys(cached)).toEqual(["cachedContent", "contents", "generationConfig"]);
    expect(cached["cachedContent"]).toBe(NAME);
    const reference = JSON.parse(second.body) as Json;
    expect(cached["contents"]).toEqual(reference["contents"]);
    expect(cached["generationConfig"]).toEqual(reference["generationConfig"]);
    expect(reply.usage?.cacheRead).toBe(4909);
    expect(reply.calls).toEqual(second.reply.calls);
    await flush();
    expect(creates()).toHaveLength(1);
  });
});

describe("009 T008 in-flight create", () => {
  it("a command sent while the create is pending goes uncached and starts no second create", async () => {
    let release: () => void = () => undefined;
    routes.create = (call) => new Promise((resolve) => (release = () => resolve(created(call) as Response)));
    const interpret = interpreter();
    await run(interpret(session, "a"));
    await run(interpret(session, "b"));
    expect(gens().map((c) => body(c)["cachedContent"])).toEqual([undefined, undefined]);
    expect(creates()).toHaveLength(1);

    release();
    await flush();
    await run(interpret(session, "c"));
    expect(body(gens()[2]!)["cachedContent"]).toBe(NAME);
    expect(creates()).toHaveLength(1);
  });
});

describe("009 T009 equivalence (FR-002)", () => {
  const ids = readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));

  it("covers all 10 fixtures", () => expect(ids).toHaveLength(10));

  it.each(ids)("%s: the cache holds the uncached stable part; contents and generationConfig are unchanged", async (id) => {
    const { session: s } = loadFixture(FIXTURES, id);
    const reference = await uncached(s, "orden");
    const interpret = interpreter();
    await run(interpret(s, "orden"));
    await flush();
    await run(interpret(s, "orden"));

    const { model: _model, ttl: _ttl, ...cachedPart } = body(creates()[0]!);
    const { contents, generationConfig, ...stablePart } = JSON.parse(reference.body) as Json;
    expect(cachedPart).toEqual(stablePart);
    // Byte for byte, too: the create carries the very fragments of the uncached request.
    expect(creates()[0]!.body).toContain(reference.body.slice(1, reference.body.indexOf(',"contents":')));
    const cached = body(gens()[1]!);
    expect(cached["cachedContent"]).toBe(NAME);
    expect(cached["contents"]).toEqual(contents);
    expect(cached["generationConfig"]).toEqual(generationConfig);
  });
});

describe("009 T010 caching off", () => {
  const OTHER = "gemini-test-model";
  const literal = (s: VoiceSession, message: string) =>
    `{"systemInstruction":${JSON.stringify({ parts: [{ text: systemPromptEs(s) }] })}` +
    `,"tools":${JSON.stringify(toGeminiTools(buildToolSpecs(s)))}` +
    `,"toolConfig":{"functionCallingConfig":{"mode":"ANY"}}` +
    `,"contents":${JSON.stringify([{ role: "user", parts: [{ text: message }] }])}` +
    `,"generationConfig":{"maxOutputTokens":1024}}`;

  it.each([
    ["cache: false", { cache: false }],
    ["no options, model not in EXPLICIT_CACHE_MODELS", undefined],
  ])("%s: nothing goes to cachedContents and the body is byte-identical to today's", async (_name, options) => {
    expect(EXPLICIT_CACHE_MODELS.has(OTHER)).toBe(false);
    const interpret = createGeminiInterpreter(KEY, OTHER, options);
    await run(interpret(session, "uno"));
    await flush();
    await run(interpret(session, "dos"));
    await flush();
    expect(calls.map(routeOf)).toEqual(["generate", "generate"]);
    expect(gens()[0]!.body).toBe(literal(session, "uno"));
    expect(gens()[1]!.body).toBe(literal(session, "dos"));
  });

  it("cache: true overrides the allowlist", async () => {
    const interpret = interpreter({}, OTHER);
    await run(interpret(session, "uno"));
    await flush();
    expect(gens()[0]!.body).toBe(literal(session, "uno"));
    expect(creates()).toHaveLength(1);
    expect(body(creates()[0]!)["model"]).toBe(`models/${OTHER}`);
  });
});

describe("009 T011 invalidation (FR-004)", () => {
  it("an identical stable string keeps the cache; a changed alias goes uncached, DELETEs and re-creates", async () => {
    const interpret = await ready();
    const same: VoiceSession = { game: session.game, players: [...session.players] };
    await run(interpret(same, "b"));
    await flush();
    expect(body(gens()[1]!)["cachedContent"]).toBe(NAME);
    expect(deletes()).toHaveLength(0);

    const renamed = withAlias(session, "Anitalias");
    await run(interpret(renamed, "c"));
    await flush();
    const third = body(gens()[2]!);
    expect(third["cachedContent"]).toBeUndefined();
    expect(JSON.stringify(third["systemInstruction"])).toContain("Anitalias");
    expect(gens()[2]!.body).toBe((await uncached(renamed, "c")).body);
    expect(deletes().map((c) => c.url)).toEqual([`${BASE}${NAME}`]);
    expect(creates()).toHaveLength(2);
    expect(JSON.stringify(body(creates()[1]!)["systemInstruction"])).toContain("Anitalias");
    expect(events.filter((e) => e.kind === "deleted")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "created")).toHaveLength(2);

    await run(interpret(renamed, "d"));
    expect(body(gens()[3]!)["cachedContent"]).toBe(NAME);
  });
});

describe("009 T012 expiry and extension (R4, FR-005)", () => {
  it("more than half the TTL left: cached, no PATCH", async () => {
    const interpret = await ready();
    clock = T0 + 400_000;
    await run(interpret(session, "b"));
    await flush();
    expect(body(gens()[1]!)["cachedContent"]).toBe(NAME);
    expect(patches()).toHaveLength(0);
  });

  it("less than half left: cached, plus one background PATCH {ttl} that moves the expiry", async () => {
    const interpret = await ready();
    clock = T0 + 500_000;
    await run(interpret(session, "b"));
    await flush();
    expect(body(gens()[1]!)["cachedContent"]).toBe(NAME);
    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.url).toBe(`${BASE}${NAME}`);
    expect(patches()[0]!.body).toBe('{"ttl":"900s"}');
    expect(events.at(-1)).toEqual({ kind: "extended", expireTime: expireAt(T0 + 500_000 + TTL_MS), at: T0 + 500_000 });

    // Past the original expiry, still inside the extended one.
    clock = T0 + 1_300_000;
    await run(interpret(session, "c"));
    expect(body(gens()[2]!)["cachedContent"]).toBe(NAME);
    expect(creates()).toHaveLength(1);
  });

  it("inside the 30 s margin: uncached, and a re-create starts", async () => {
    const interpret = await ready();
    clock = T0 + TTL_MS - 29_000;
    await run(interpret(session, "b"));
    await flush();
    expect(body(gens()[1]!)["cachedContent"]).toBeUndefined();
    expect(creates()).toHaveLength(2);
  });

  it("a failed PATCH emits failed extend and changes nothing else", async () => {
    routes.patch = () => json(500, googleError(500, "INTERNAL", "x"));
    const interpret = await ready();
    clock = T0 + 500_000;
    await run(interpret(session, "b"));
    await flush();
    expect(events.at(-1)).toMatchObject({ kind: "failed", op: "extend", status: 500, at: T0 + 500_000 });
    clock = T0 + 600_000;
    await run(interpret(session, "c"));
    expect(body(gens()[2]!)["cachedContent"]).toBe(NAME);
    expect(creates()).toHaveLength(1);
  });
});

describe("009 T013 create failures (R6, SC-005)", () => {
  it.each([
    ["400 (below the minimum size)", () => json(400, googleError(400, "INVALID_ARGUMENT", "Cached content is too small")), 400],
    ["403", () => json(403, googleError(403, "PERMISSION_DENIED", "x")), 403],
    ["daily-quota 429", () => json(429, googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("GenerateRequestsPerDayPerProjectPerModel"))), 429],
  ])("create %s blocks that stable part for the interpreter's life", async (_name, reply, status) => {
    routes.create = reply;
    const expected = await uncached(session, "a");
    const interpret = interpreter();
    for (const t of [0, 60_000, 6 * 60_000, 60 * 60_000]) {
      clock = T0 + t;
      expect(await run(interpret(session, "a"))).toEqual(expected.reply);
      await flush();
    }
    expect(creates()).toHaveLength(1);
    expect(gens().every((c) => c.body === expected.body)).toBe(true);
    expect(events).toEqual([{ kind: "failed", op: "create", status, reason: expect.any(String) as string, at: T0 }]);
  });

  it.each([
    ["per-minute 429", () => json(429, googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("GenerateRequestsPerMinutePerProjectPerModel"))), 429],
    ["500", () => json(500, googleError(500, "INTERNAL", "x")), 500],
    ["network error", () => new TypeError("Failed to fetch"), undefined],
    ["8 s timeout", () => "timeout" as const, undefined],
  ])("create %s: a 5-minute cooldown, then one more try", async (_name, reply, status) => {
    routes.create = reply;
    const expected = await uncached(session, "a");
    const interpret = interpreter();
    expect(await run(interpret(session, "a"))).toEqual(expected.reply);
    await flush();
    expect(creates()).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "failed", op: "create", at: T0 });
    expect((events[0] as { status?: number }).status).toBe(status);

    clock = T0 + 5 * 60_000 - 1;
    expect(await run(interpret(session, "a"))).toEqual(expected.reply);
    await flush();
    expect(creates()).toHaveLength(1);

    routes.create = created;
    clock = T0 + 5 * 60_000;
    await run(interpret(session, "a"));
    await flush();
    expect(creates()).toHaveLength(2);
    await run(interpret(session, "a"));
    expect(body(gens().at(-1)!)["cachedContent"]).toBe(NAME);
  });
});

describe("009 T014 cached-request failures (R6, R12, SC-005)", () => {
  it.each([
    [400, googleError(400, "INVALID_ARGUMENT", "x")],
    [403, googleError(403, "PERMISSION_DENIED", "CachedContent not found (or permission denied)")],
    [404, googleError(404, "NOT_FOUND", "x")],
  ])("cached %s: drop the entry, resend uncached at once, re-create in the background", async (status, error) => {
    const interpret = await ready();
    const expected = await uncached(session, "b");
    routes.generate = (call) => (body(call)["cachedContent"] ? json(status, error) : generated(call));

    // No timers advance: the fallback goes out without a wait.
    const reply = await (async () => {
      const pending = interpret(session, "b");
      await ticks();
      expect(gens()).toHaveLength(3);
      return pending;
    })();
    expect(reply).toEqual(expected.reply);
    const [cached, fallback] = gens().slice(1);
    expect(body(cached!)["cachedContent"]).toBe(NAME);
    expect(fallback!.body).toBe(expected.body);
    expect(events).toContainEqual({ kind: "fallback", status, at: T0 });
    await flush();
    expect(creates()).toHaveLength(2);
  });

  it.each([
    ["per-minute 429", () => json(429, googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("GenerateRequestsPerMinutePerProjectPerModel")))],
    ["500", () => json(500, googleError(500, "INTERNAL", "x"))],
    ["504", () => json(504, googleError(504, "DEADLINE_EXCEEDED", "x"))],
    ["network error", () => new TypeError("Failed to fetch")],
  ])("cached %s: the one retry goes uncached and the entry is kept", async (_name, fail) => {
    const interpret = await ready();
    const expected = await uncached(session, "b");
    let failed = false;
    routes.generate = (call) => {
      if (body(call)["cachedContent"] && !failed) {
        failed = true;
        return fail();
      }
      return generated(call);
    };
    expect(await run(interpret(session, "b"))).toEqual(expected.reply);
    const sent = gens().slice(1);
    expect(sent).toHaveLength(2);
    expect(body(sent[0]!)["cachedContent"]).toBe(NAME);
    expect(sent[1]!.body).toBe(expected.body);
    await flush();
    expect(creates()).toHaveLength(1);
    expect(events.some((e) => e.kind === "fallback")).toBe(false);

    await run(interpret(session, "c"));
    expect(body(gens().at(-1)!)["cachedContent"]).toBe(NAME);
  });

  it("cached request with no response in 8 s: a timeout as today (no retry), and the entry is kept", async () => {
    const interpret = await ready();
    let failed = false;
    routes.generate = (call) => {
      if (body(call)["cachedContent"] && !failed) {
        failed = true;
        return "timeout";
      }
      return generated(call);
    };
    expect((await kindOf(run(interpret(session, "b")))).kind).toBe("timeout");
    expect(gens()).toHaveLength(2);
    await run(interpret(session, "c"));
    expect(body(gens().at(-1)!)["cachedContent"]).toBe(NAME);
  });

  it.each([
    ["cached 403, fallback 403 (bad key)", 403, () => json(403, googleError(403, "PERMISSION_DENIED", "x")), "permission"],
    ["cached 403, fallback 500", 403, () => json(500, googleError(500, "INTERNAL", "x")), "service"],
    ["cached 404, fallback per-minute 429", 404, () => json(429, googleError(429, "RESOURCE_EXHAUSTED", "q", quotaDetails("PerMinute"))), "rateLimit"],
  ])("%s: the fallback is the one retry; its error maps as today", async (_name, cachedStatus, fallback, kind) => {
    const interpret = await ready();
    routes.generate = (call) => (body(call)["cachedContent"] ? json(cachedStatus, googleError(cachedStatus, "X", `bad ${KEY}`)) : fallback());
    const pending = interpret(session, "b").catch((e: unknown) => e);
    await ticks();
    expect(gens()).toHaveLength(3);
    const error = await pending;
    expect(error).toBeInstanceOf(VoiceProviderError);
    expect((error as VoiceProviderError).kind).toBe(kind);
    expect((error as VoiceProviderError).message).not.toContain(KEY);
    await flush();
    expect(gens()).toHaveLength(3);
  });
});

describe("009 T015 key and name hygiene (FR-007)", () => {
  it("failures that echo the key or the cache name never reach an event or an error", async () => {
    const echo = (status: number) => json(status, googleError(status, "X", `${KEY} ${NAME}`));
    routes.create = () => echo(500);
    const interpret = interpreter();
    await run(interpret(session, "a"));
    await flush();
    clock = T0 + 5 * 60_000;
    routes.create = created;
    await run(interpret(session, "a"));
    await flush();
    routes.patch = () => echo(500);
    routes.delete = () => echo(500);
    clock = T0 + 5 * 60_000 + 500_000;
    await run(interpret(session, "a"));
    await run(interpret(withAlias(session, "otro"), "a"));
    await flush();
    expect(events.map((e) => (e.kind === "failed" ? `${e.kind}:${e.op}` : e.kind))).toEqual(
      expect.arrayContaining(["failed:create", "created", "failed:extend", "failed:delete"]),
    );
    routes.generate = (call) => (body(call)["cachedContent"] ? echo(404) : echo(400));
    await flush();
    const error = await kindOf(run(interpret(withAlias(session, "otro"), "a")));
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain(NAME);
    expect(JSON.stringify(error)).not.toContain(KEY);
    // The afterEach checks every URL, header, body and event.
  });
});

describe("009 T016 background isolation", () => {
  it.each([
    ["rejects", () => new TypeError("Failed to fetch")],
    ["hangs", () => "hang" as const],
  ])("a create that %s never rejects or delays the command", async (_name, reply) => {
    routes.create = reply;
    const interpret = interpreter();
    let done = false;
    const pending = interpret(session, "a").then((r) => ((done = true), r));
    await ticks();
    expect(done).toBe(true);
    expect((await pending).calls[0]?.name).toBe("runAndPayout");
  });

  it("PATCH and DELETE that reject or hang never surface, and nothing goes unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      routes.patch = () => new TypeError("Failed to fetch");
      routes.delete = () => "hang";
      const interpret = await ready();
      clock = T0 + 500_000;
      let done = false;
      const first = interpret(session, "b").then((r) => ((done = true), r));
      await ticks();
      expect(done).toBe(true);
      await first;
      done = false;
      const second = interpret(withAlias(session, "otro"), "c").then((r) => ((done = true), r));
      await ticks();
      expect(done).toBe(true);
      await second;
      routes.delete = () => new TypeError("Failed to fetch");
      await run(interpret(session, "d"));
      await flush();
      expect(patches()).toHaveLength(1);
      expect(deletes().length).toBeGreaterThanOrEqual(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("009 T033 dispose", () => {
  it("a ready entry: exactly one DELETE; the next command goes uncached and re-creates", async () => {
    const interpret = await ready();
    await dispose(interpret);
    expect(deletes().map((c) => c.url)).toEqual([`${BASE}${NAME}`]);
    await run(interpret(session, "b"));
    await flush();
    expect(body(gens()[1]!)["cachedContent"]).toBeUndefined();
    expect(creates()).toHaveLength(2);
  });

  it("no entry: nothing is sent", async () => {
    await dispose(interpreter());
    await dispose(createGeminiInterpreter(KEY, MODEL, { cache: false }));
    await dispose(() => Promise.reject(new Error("not Gemini")));
    expect(calls).toEqual([]);
  });

  it("a create in flight: waits for it, then DELETEs it if it succeeded", async () => {
    let release: () => void = () => undefined;
    routes.create = (call) => new Promise((resolve) => (release = () => resolve(created(call) as Response)));
    const interpret = interpreter();
    await run(interpret(session, "a"));
    let disposed = false;
    const pending = dispose(interpret).then(() => (disposed = true));
    await ticks();
    expect(disposed).toBe(false);
    expect(deletes()).toHaveLength(0);
    release();
    await pending;
    expect(deletes()).toHaveLength(1);
  });

  it("a create in flight that fails: nothing to delete", async () => {
    let fail: () => void = () => undefined;
    routes.create = () => new Promise((resolve) => (fail = () => resolve(json(500, googleError(500, "INTERNAL", "x")))));
    const interpret = interpreter();
    await run(interpret(session, "a"));
    const pending = dispose(interpret);
    await ticks();
    fail();
    await pending;
    expect(deletes()).toHaveLength(0);
  });

  it("never rejects, even when the DELETE fails", async () => {
    routes.delete = () => new TypeError("Failed to fetch");
    const interpret = await ready();
    await expect(dispose(interpret)).resolves.toBeUndefined();
    expect(events.at(-1)).toMatchObject({ kind: "failed", op: "delete" });
  });
});
