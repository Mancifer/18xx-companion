# Contract: Gemini Explicit Cache in the Voice Adapter

**Feature**: 009-voice-prompt-caching | Extends [005 contracts/voice-provider.md](../../005-gemini-flash-provider/contracts/voice-provider.md) §4

## 1. Factory

```ts
interface InterpreterOptions {
  /** Overrides EXPLICIT_CACHE_MODELS for this interpreter (eval: --cache on|off). */
  readonly cache?: boolean;
  /** Cache lifecycle events; never receives the key. */
  readonly onCacheEvent?: (event: CacheEvent) => void;
  /** Injectable clock for tests; defaults to Date.now. */
  readonly now?: () => number;
}

createGeminiInterpreter(apiKey: string, model: string, options?: InterpreterOptions): Interpreter
```

- `VoiceProvider.createInterpreter` and `useVoice`'s `deps.createInterpreter` gain the optional `options` argument. The Anthropic adapter accepts it and ignores it.
- Caching is on when `options.cache ?? EXPLICIT_CACHE_MODELS.has(model)`. `EXPLICIT_CACHE_MODELS` starts empty (FR-009).
- With caching off, the adapter's requests are byte-identical to today's (existing recorded tests stay green).

**Disposal (eval and housekeeping only)**:

```ts
/** Deletes the interpreter's cache, if any. It waits for an in-flight create first and never rejects. */
dispose(interpreter: Interpreter): Promise<void>   // exported from providers/gemini.ts
```

- The disposer is kept in a module-private `WeakMap<Interpreter, () => Promise<void>>`, so the `Interpreter` type does not change.
- For interpreters that are not Gemini (Anthropic, test stubs), it resolves at once.
- The eval calls it for every interpreter when a run ends ([eval-report.md](eval-report.md#cli)).
- The app does not call it. In the app, the TTL bounds the cost ([research R4](../research.md#r4-lifetime-ttl-and-extension-fr-005-edge-case-long-pauses)).
- After dispose, the next command goes uncached and starts a new create.

## 2. Provider calls (all `x-goog-api-key` header, never `?key=`)

| Call | Method + path | Body | Used result |
|---|---|---|---|
| Create | `POST v1beta/cachedContents` | `{"model":"models/<model>","systemInstruction":…,"tools":…,"toolConfig":…,"ttl":"900s"}` | `name`, `expireTime`, `usageMetadata.totalTokenCount` |
| Use | `POST v1beta/models/<model>:generateContent` | `{"cachedContent":"<name>","contents":[…],"generationConfig":…}` | as today (`geminiReply`) |
| Extend | `PATCH v1beta/<name>` | `{"ttl":"900s"}` | `expireTime` (optional) |
| Delete | `DELETE v1beta/<name>` | — | ignored |

`systemInstruction`, `tools` and `toolConfig` in the create body are the exact JSON fragments the uncached request would send. They come from the same strings.

## 3. Per-command algorithm

```text
stable := build stable JSON (same code as today's prefix)
if caching off                          → uncached request (today), done
entry := current entry
if entry and entry.stable ≠ stable      → background DELETE entry; entry := none
if entry ready and now < expiresAt − 30s:
    send cached request
      ok                                → if expiresAt − now < TTL/2: background PATCH; return reply
      400/403/404 (missing cache = 403) → drop entry, emit fallback; send uncached ONCE, no retry
                                          (the fallback is the command's one retry; its errors map as today);
                                          background create
      429/5xx/network/timeout           → today's single retry, sent uncached; entry kept
else:
    if no entry in flight and stable not blocked/cooling down → start background create
    send uncached request (today's path, unchanged)
```

- A command sends at most 2 `generateContent` requests: the first try plus one retry or fallback (plan Constraints).
- At most one create is in flight per stable part. A retry never starts another one.
- A create's failure handling is in [research R6](../research.md#r6-failure-handling-and-fallback-fr-003-sc-005).
- Nothing is persisted. A reload starts with no entry.
- Background calls (create, PATCH, DELETE) have the same 8 s timeout. They never reject into the command's promise and never surface to the UI.

## 4. Observer events

```ts
type CacheEvent =
  | { kind: "created"; tokens: number; expireTime: string; at: number }
  | { kind: "extended"; expireTime: string; at: number }
  | { kind: "deleted"; at: number }
  | { kind: "failed"; op: "create" | "extend" | "delete"; status?: number; reason: string; at: number }
  | { kind: "fallback"; status: number; at: number };
```

- Cache names are not in the events (FR-007: nothing to leak into eval output). Keys never are.
- `reason` follows `toVoiceProviderError`'s rule: status and Google codes only.

## 5. Equivalence guarantee (FR-002)

A unit test fixes the following for every fixture:

1. `JSON.parse(createBody)` minus `model`/`ttl` equals `JSON.parse(uncachedBody)` minus `contents`/`generationConfig`.
2. `contents` and `generationConfig` are equal between the cached and the uncached request for the same command.

The existing prompt and tool snapshots in `tests/voice/__snapshots__/` must not change.

## 6. Errors seen by the app

Unchanged. Only errors from the uncached path, or from the retry of a cached request, reach `VoiceProviderError` mapping and the Spanish messages. Cache-specific 4xx never surface.
