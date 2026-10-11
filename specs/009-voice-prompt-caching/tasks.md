---

description: "Task list for feature 009: cheaper voice commands through reliable prompt caching"
---

# Tasks: Cheaper Voice Commands Through Reliable Prompt Caching

**Input**: Design documents from `specs/009-voice-prompt-caching/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/gemini-cache.md](contracts/gemini-cache.md), [contracts/eval-report.md](contracts/eval-report.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first for the adapter, and [quickstart §1](quickstart.md#1-offline-checks-no-key-no-cost) lists the required adapter tests. Write each test task first and watch it fail before its implementation task.

**Organization**: Tasks are grouped by user story so each story can be built and tested on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: The user story the task belongs to (US1, US2)
- Paths are relative to the repo root

## Ground rules for every task

- No change to `systemPromptEs`, `buildToolSpecs`, `toGeminiTools`, the snapshot, or anything under `tests/voice/__snapshots__/` (FR-002).
- With caching off, the adapter must send requests byte-identical to today's. `tests/voice/gemini.test.ts` keeps its current expectations unchanged.
- The API key goes only in the `x-goog-api-key` header. It never goes in a URL, an event, a log or an error. Cache names (`cachedContents/…`) never go in events, exports or UI (FR-007).
- Nothing is persisted. No settings, events, actions, IndexedDB rows or export fields are added (data-model.md).
- The Anthropic adapter's behavior does not change (R11).
- Leave changes uncommitted for review.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the starting point before any code changes

- [X] T001 Run `npm run typecheck && npm run lint && npm test` and record that everything is green before the change (baseline for "unchanged" claims). Confirm the baseline result file `eval/voice/results/baseline/2026-10-10-gemini-3.6-flash.json` exists, because the US2 compare and SC-002/SC-003 use it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The optional `options` argument and the event type. Both US1 (the adapter) and US2 (the eval) depend on them.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Add the shared types to `src/voice/interpreter.ts`, exported as in [contracts/gemini-cache.md §1/§4](contracts/gemini-cache.md#1-factory): `InterpreterOptions { readonly cache?: boolean; readonly onCacheEvent?: (event: CacheEvent) => void; readonly now?: () => number }` and the `CacheEvent` union `created {tokens, expireTime, at} | extended {expireTime, at} | deleted {at} | failed {op: "create"|"extend"|"delete", status?, reason, at} | fallback {status, at}`. Each member also has `kind`. Add doc comments: `cache` overrides `EXPLICIT_CACHE_MODELS`; events never carry the key or the cache name.
- [X] T003 Change `VoiceProvider.createInterpreter` in `src/voice/providers/index.ts` to `(apiKey: string, model: string, options?: InterpreterOptions) => Interpreter`. Give `createInterpreter` in `src/voice/providers/anthropic.ts` an unused optional third parameter `_options?: InterpreterOptions` so the signature matches. Its behavior stays unchanged (R11).
- [X] T004 Give `createGeminiInterpreter` in `src/voice/providers/gemini.ts` the signature `(apiKey: string, model: string, options: InterpreterOptions = {})`. Ignore `options` for now. Add the constants next to `THINKING_LEVEL`:
  - `export const EXPLICIT_CACHE_MODELS: ReadonlySet<string> = new Set()`. It must start **empty** (FR-009, R8). Add a comment saying a model is added only after an eval with `--cache on` passes SC-001–SC-004.
  - `export const CACHE_TTL_S = 900`
  - `CACHE_EXPIRY_MARGIN_MS = 30_000`
  - `CREATE_COOLDOWN_MS = 5 * 60_000`
  - `CACHE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/"`
- [X] T005 In `src/app/useVoice.ts`, change `deps.createInterpreter` to `(provider, apiKey, model, options?: InterpreterOptions) => Interpreter`. The default dep passes `options` through to `PROVIDERS[provider].createInterpreter`. In the `useMemo`, pass `import.meta.env.DEV ? { onCacheEvent: (e) => console.debug("[voice cache]", e.kind, e) } : undefined`. The events contain no name or key, and nothing else is logged. Confirm the existing `createInterpreter` stubs in `tests/ui/voice.test.tsx`, `tests/ui/privates.test.tsx`, `tests/ui/results.test.tsx` and `tests/ui/rotla.test.tsx` still typecheck. The extra parameter is optional, so they should need no edits. Add one test to `tests/ui/voice.test.tsx`, next to the "Gemini selected with a key" test (~line 229), for US1 scenario 4 / FR-004: changing the Gemini key, and separately the Gemini model, makes `createInterpreter` get called again with the new value. A new interpreter means the cache is never shared. If that test already fails on the `useMemo` deps, fix the deps.
- [X] T006 Run `npm run typecheck && npm test`. Everything must stay green, with `tests/voice/gemini.test.ts` and the snapshots untouched.

**Checkpoint**: The options plumbing is in place, caching is not active anywhere, and behavior is identical to today

---

## Phase 3: User Story 1 - Pay less per voice command without changing what the model sees (Priority: P1) 🎯 MVP

**Goal**: When caching is on for the interpreter, the Gemini adapter stores the stable part (`systemInstruction` + `tools` + `toolConfig`) with `cachedContents` in the background on the first command. Later commands send `cachedContent` + the same `contents` + `generationConfig`. Every cache problem falls back silently to today's request.

**Independent Test**: Run `npx vitest run tests/voice/gemini-cache.test.ts` with a fake `fetch` and an injected clock. The second command sends `cachedContent` and none of the three cached fields. The equivalence test passes for all 10 fixtures. Every fault case returns the same `ModelReply` as the uncached path. Live (optional, paid key): `npm run eval:voice -- --only or-pay-01,or-pay-02,or-pay-03 --cache on` shows cache reads > 0 (all three are `1830-or` cases, so they share one cache). That run needs T029 + T032 from US2. Without it, use `probeCache.ts`.

### Tests for User Story 1 ⚠️

> Write these tests FIRST in the new file `tests/voice/gemini-cache.test.ts` and make sure they FAIL before T018. Use a fake `fetch` (`vi.stubGlobal("fetch", …)`) that routes by method + URL: `POST …/cachedContents`, `POST …:generateContent`, `PATCH …/cachedContents/x`, `DELETE …/cachedContents/x`. Every interpreter in this file is created with `{ cache: true, now: () => clock, onCacheEvent: events.push }`. Reuse the fixture/session loading that `tests/voice/gemini.test.ts` already uses. Add a helper `flush()` that awaits pending microtasks/promises, so background creates can settle between commands.

- [X] T007 [US1] Lifecycle test in `tests/voice/gemini-cache.test.ts`:
  - The first command sends one uncached `generateContent`, whose body is identical to the caching-off body, plus exactly one `POST v1beta/cachedContents`. The create body has `model: "models/<model>"`, `ttl: "900s"` and the three stable fields.
  - After `flush()`, the second command's `generateContent` body has `cachedContent: "cachedContents/x"`, the same `contents` and `generationConfig`, and **no** `systemInstruction`, `tools` or `toolConfig` keys.
  - A `created` event is emitted with `tokens` from `usageMetadata.totalTokenCount` and with `expireTime`.
  - The returned `ModelReply` reports `usage.cacheRead` from `cachedContentTokenCount`.
- [X] T008 [US1] In-flight test in `tests/voice/gemini-cache.test.ts`: a command sent while the create is still pending (unresolved fake promise) goes uncached and does **not** start a second create. Exactly one `POST cachedContents` in total.
- [X] T009 [US1] Equivalence test in `tests/voice/gemini-cache.test.ts` ([contracts §5](contracts/gemini-cache.md#5-equivalence-guarantee-fr-002)). For every fixture under `eval/voice/fixtures/` (all 10):
  1. `JSON.parse(createBody)` minus `model`/`ttl` deep-equals `JSON.parse(uncachedBody)` minus `contents`/`generationConfig`.
  2. `contents` and `generationConfig` deep-equal between the cached and the uncached request for the same command.
- [X] T010 [US1] Caching-off test in `tests/voice/gemini-cache.test.ts`. With `{ cache: false }`, and with no options on a model not in `EXPLICIT_CACHE_MODELS`, nothing is sent to `cachedContents` and the `generateContent` body is byte-identical to today's (compare with the body built the way `tests/voice/gemini.test.ts` expects). With `{ cache: true }` the allowlist is overridden.
- [X] T011 [US1] Invalidation test in `tests/voice/gemini-cache.test.ts` (FR-004, US1 scenario 4). With a ready cache, a command with a session whose player alias changed (a new `VoiceSession` object with a different stable string) goes uncached, carries the **new** alias in `systemInstruction`/tools, sends a best-effort `DELETE v1beta/cachedContents/x`, and starts a new create. A `deleted` event is emitted. A new session object with an **identical** stable string keeps using the existing cache with no DELETE (identity is the string, R5).
- [X] T012 [US1] Expiry and extension test in `tests/voice/gemini-cache.test.ts` (R4, FR-005), using the injected clock and `expireTime = created + 900 s`:
  - At created + 400 s (more than half the TTL left) the command is cached and sends no PATCH.
  - At created + 500 s (less than half left) it is cached and one background `PATCH v1beta/cachedContents/x` is sent with body exactly `{"ttl":"900s"}` and no `updateMask`. `expiresAt` moves to the response's `expireTime` and an `extended` event is emitted.
  - At `expireTime − 29 s` (inside the 30 s margin) the command goes uncached and a re-create starts.
  - A failed PATCH emits `failed {op:"extend"}` and changes nothing else.
- [X] T013 [US1] Create-failure matrix in `tests/voice/gemini-cache.test.ts` (R6, SC-005):
  - Create 400, 403 and daily-quota 429 (`quotaId` containing `PerDay`) block that stable part for the interpreter's life. Later commands go uncached with no further create attempts.
  - Create 429 (per-minute), 500, network error and 8 s timeout start a 5-minute cooldown. No create before cooldown end; one create allowed after, by clock.
  - Each case emits `failed {op:"create", status?}` and every command returns the same `ModelReply` as the uncached path, with no thrown error.
- [X] T014 [US1] Cached-use failure matrix in `tests/voice/gemini-cache.test.ts` (R6, R12, SC-005):
  - Cached `generateContent` returns 400, 403 (`PERMISSION_DENIED` "CachedContent not found") or 404. The adapter drops the entry, emits `fallback {status}`, resends at once **uncached** (body equal to the caching-off body) and returns that reply. A background re-create follows.
  - Cached `generateContent` returns 429, 500, network error or timeout. The single existing retry is sent **uncached**, the entry is kept, and no second create starts. The next command uses the cache again.
  - **The fallback is the command's one retry** (plan Constraints, US1 scenario 3). If the uncached fallback itself fails, it is not retried, and its error maps exactly as today. Cases: cached 403 then fallback 403 (bad key) gives `VoiceProviderError` kind `permission`. Cached 403 then fallback 500 gives kind `service` with **exactly 2** `generateContent` requests and no wait. Cached 404 then fallback per-minute 429 gives kind `rateLimit` with exactly 2 requests.
  - In every case of this matrix, a command makes at most 2 `generateContent` requests.
- [X] T015 [US1] Key and name hygiene test in `tests/voice/gemini-cache.test.ts` (FR-007). Across all requests in the lifecycle, fault and expiry tests, the key appears only in the `x-goog-api-key` header and never in any URL. No emitted event, serialized with `JSON.stringify`, contains the key or the substring `cachedContents/`. No thrown error message contains the key.
- [X] T016 [US1] Background-isolation test in `tests/voice/gemini-cache.test.ts`. A create, PATCH or DELETE that rejects or hangs never rejects or delays the command's promise. The command resolves as soon as its own `generateContent` resolves, and no unhandled rejection occurs (fail the test on `unhandledrejection`).
- [X] T017 [US1] Run `npx vitest run tests/voice/gemini-cache.test.ts` and confirm T007–T016 fail for the right reason (no caching yet), not because of setup errors.

### Implementation for User Story 1

- [X] T018 [US1] In `src/voice/providers/gemini.ts`, split today's `prefix` string into the three fragments `system`, `tools`, `toolConfig`, built by the same `JSON.stringify` calls as today. The uncached body is still assembled as the exact same string (`{"systemInstruction":…,"tools":…,"toolConfig":…,"contents":…,"generationConfig":…}`). `stable` is the joined fragment string, and it is the cache identity (data-model §1). Run `tests/voice/gemini.test.ts` to prove the bodies are unchanged.
- [X] T019 [US1] In `src/voice/providers/gemini.ts`, generalize `attempt(body)` into a private `send(method, url, body?, timeoutMs = TIMEOUT_MS)`. It keeps the same `x-goog-api-key` header, the 8 s abort, the error mapping via `toVoiceProviderError` and the JSON parsing. `generateContent` keeps using it unchanged. Background calls use it too, for `POST ${CACHE_ENDPOINT}cachedContents`, `PATCH ${CACHE_ENDPOINT}${name}` and `DELETE ${CACHE_ENDPOINT}${name}`.
- [X] T020 [US1] In `src/voice/providers/gemini.ts`, implement the in-memory cache entry inside the interpreter closure (data-model §2):
  - `entry?: { stable: string; state: "creating" | "ready"; pending?: Promise<void>; name?: string; tokens?: number; expiresAt?: number }`
  - `blocked: Map<string, number | "forever">`
  - `caching = options.cache ?? EXPLICIT_CACHE_MODELS.has(model)`
  - `now = options.now ?? Date.now`
  - `emit = (e) => { try { options.onCacheEvent?.(e) } catch {} }`
- [X] T021 [US1] In `src/voice/providers/gemini.ts`, implement `startCreate(stable, fragments)`:
  - It is a no-op if an entry for `stable` is in flight or ready, or if `blocked` says `forever` or a future time.
  - Otherwise it sends the create body `{"model":"models/<model>","systemInstruction":…,"tools":…,"toolConfig":…,"ttl":"900s"}`, assembled from the **same** fragment strings.
  - On 200 it stores `name`, `tokens` = `usageMetadata.totalTokenCount` and `expiresAt` = `Date.parse(expireTime) − CACHE_EXPIRY_MARGIN_MS`, then emits `created`. It drops the result if the entry has been replaced meanwhile, and DELETEs the orphan.
  - On a 400 or 403, or a 429 with `quota === "day"`, it sets `blocked = "forever"`.
  - On any other 429, a 5xx, a connection error or a timeout, it sets `blocked = now() + CREATE_COOLDOWN_MS`.
  - Failures emit `failed {op:"create", status, reason}`, with `reason` = the `VoiceProviderError` message (status and Google codes only).
  - The promise is stored in `entry.pending` and never rejects.
- [X] T022 [US1] In `src/voice/providers/gemini.ts`, implement the per-command algorithm from [contracts §3](contracts/gemini-cache.md#3-per-command-algorithm) in the returned interpreter:
  - If caching is off, use today's path unchanged.
  - If `entry.stable !== stable`, start a background DELETE of a ready entry (emit `deleted` on success or `failed {op:"delete"}`) and clear the entry.
  - If the entry is ready and `now() < expiresAt`, send the cached body `{"cachedContent":"<name>","contents":…,"generationConfig":…}`:
    - On success, if `expiresAt + margin − now() < CACHE_TTL_S*1000/2`, send a background PATCH `{"ttl":"900s"}`. On 200 update `expiresAt` from `expireTime` and emit `extended`. On failure emit `failed {op:"extend"}` and ignore it.
    - On a 400, 403 or 404, clear the entry, emit `fallback {status}`, and send today's uncached body exactly once, with **no retry**: the fallback is the command's one retry. Its errors map through `toVoiceProviderError` as today and are thrown. Start `startCreate` in the background whether the fallback succeeds or not.
    - On a retryable error (per the existing `retryable()`), wait as today, retry once with the **uncached** body and keep the entry.
    - No path sends more than 2 `generateContent` requests for one command.
  - Otherwise call `startCreate(stable, …)` without awaiting it and send today's uncached path (with its existing retry).
  - Return `geminiReply(raw, model)` in all cases.
- [X] T023 [US1] Update the doc comment above `createGeminiInterpreter` in `src/voice/providers/gemini.ts`. It now says the adapter uses explicit caching when enabled: background create on first use, 15-minute TTL extended past half, and fallback to the uncached request on any cache error. Link feature 009 contracts/gemini-cache.md. Keep the module within the plan's ~120–150 added lines.
- [X] T024 [US1] Run `npx vitest run tests/voice/gemini-cache.test.ts tests/voice/gemini.test.ts tests/voice/prompt.test.ts tests/voice/tools.test.ts` until all pass, with `tests/voice/__snapshots__/` unchanged (`git status tests/voice/__snapshots__` clean). Then run `npm run typecheck && npm run lint && npm test`.

**Checkpoint**: The adapter caches when told to, is byte-identical when not, and every fault ends in today's request. The allowlist is still empty, so the app still behaves exactly as today.

---

## Phase 4: User Story 2 - Measure the real saving and the accuracy on the eval set (Priority: P2)

**Goal**: `npm run eval:voice -- --cache on|off` runs the eval with or without explicit caching. The report shows cache events, cache-read rate, write and storage cost, totals at both dated prices and the SC-001 gate. `eval:voice:compare` lines up an on run against the baseline.

**Independent Test**: `npx vitest run tests/eval/voice.test.ts` passes the new CLI, prices, summary and compare tests. A live `npm run eval:voice -- --cache on` writes `eval/voice/results/<date>-gemini-3.6-flash-cache.json` with the new fields. That needs a paid key and the US1 adapter for real cache reads.

### Tests for User Story 2 ⚠️

> Add these to the existing `tests/eval/voice.test.ts`, in new `describe` blocks labelled `(009 Txxx)`. Write them first and see them fail.

- [X] T025 [US2] CLI tests in `tests/eval/voice.test.ts` for `parseEvalArgs`:
  - `--cache on` → `cache: true`; `--cache off` → `cache: false`; omitted → `cache: undefined`, meaning it follows `EXPLICIT_CACHE_MODELS`.
  - `--cache maybe` throws.
  - `--cache on --provider anthropic` throws with a message naming both flags (exit 1 per [eval-report contract](contracts/eval-report.md#cli)).
- [X] T026 [US2] Price tests in `tests/eval/voice.test.ts`:
  - `priceFor("gemini-3.6-flash", "2026-10-11").cacheStorage === 0.5`, and the same call with `"2027-01-01"` returns `1.0`. The same holds for `gemini-3.8-flash`.
  - `gemini-3.5-flash-lite` and `gemini-3-flash-preview` have `cacheStorage: 1.0`.
  - Every `claude-*` row has `cacheStorage: null`.
  - Gemini `cacheWrite` stays `null` (data-model §4).
  - A new pure `storageCostUsd(tokens, hours, price)` returns `tokens × hours × cacheStorage / 1e6`. It returns `0` when `cacheStorage` is null.
- [X] T027 [US2] Summary tests in `tests/eval/voice.test.ts` for `summarize` with a new `SummaryOptions.cache?: { on: boolean; caches: readonly CacheLifetime[]; events: readonly CacheEvent[] }`, where `CacheLifetime = { tokens: number; createdAt: number; lastUseAt: number }`:
  - `cache` is `"on"` or `"off"`.
  - `cacheEvents` counts `{ created, extended, deleted, fallbacks, failures }`.
  - `tokens.cacheWrite` = Σ `created.tokens`.
  - `storageUsd` = Σ tokens × ((lastUseAt − createdAt)/3.6e6 + 900/3600) × `cacheStorage`/1e6.
  - `totalUsd` = token cost (writes at the input price) + storage, and `totalPerCaseUsd` = `totalUsd / calls`.
  - `at2027` = the same totals priced at the `2027-01-01` period, or `null` when the model has no such period.
  - `--free` still makes `costUsd` 0 and leaves the paid-equivalent figures.
  - For Gemini with cache on, the gate `"cache reads ≥ 90%"` is present and `true` only when `cacheReadRate ≥ 0.9` (SC-001). The gate is absent with cache off.
  - `latencyMs.firstP95` = p95 over the records with `prefixFirst: true` (each fixture's first call, FR-006). It is `null` when there are none.
  - Summaries without the `cache` option keep today's shape for the existing fields.
- [X] T028 [US2] Compare tests in `tests/eval/voice.test.ts` for `formatComparison`:
  - It prints new rows `cache reads` (percent), `total $ / command` and `total $ 2027`, which fall back to `paidPerCaseUsd` when `totalPerCaseUsd` is absent (old files) and show `—` when both are missing.
  - It prints a flag line `SC-003 ✗: <category> dropped by N cases` for any category whose passing-case count drops by more than one. Counts come from records when available, otherwise rate × cases.
  - It prints `SC-004 ✗: p95 +X%` when B's p95 > 1.1 × A's p95, and `✓` lines otherwise.
  - It prints a `first-call p95 ms` row from `latencyMs.firstP95`. For older files without that field, the row is computed from `records` with `prefixFirst`, and shows `—` when neither is present.
  - Per-case pass/fail deltas are listed when both inputs include `records`.

### Implementation for User Story 2

- [X] T029 [US2] In `eval/voice/cli.ts`, add `readonly cache?: boolean` to `EvalOptions` and parse `--cache on|off` in `parseEvalArgs` per T025. Update the usage text and the header comment of `eval/voice/run.ts`.
- [X] T030 [P] [US2] In `eval/voice/prices.ts`, add `readonly cacheStorage: number | null` ($ per 1M tokens per hour) to `PricePeriod` and fill it in per data-model §4. `GEMINI_FLASH`: 0.50, then 1.00 from `2027-01-01`. `gemini-3.5-flash-lite`: 1.00. `gemini-3-flash-preview`: 1.00. Claude rows: `null`. Add an exported `storageCostUsd(tokens, hours, price)`. Update the header comment: Gemini rows re-checked 2026-10-11; explicit-cache writes are priced at the input rate (conservative, `cacheWrite: null`); storage is per hour.
- [X] T031 [US2] In `eval/voice/grade.ts`, extend `SummaryOptions` and `Summary` with `cache`, `cacheEvents`, `storageUsd`, `totalUsd`, `totalPerCaseUsd`, `at2027` and `latencyMs.firstP95`, per [contracts/eval-report.md](contracts/eval-report.md#summary-json-new-or-changed-fields) and T027. Use `priceFor(model, "2027-01-01")` for `at2027`. Add the `"cache reads ≥ 90%"` gate for Gemini with cache on. Keep the existing informational `cache reads > 0` handling for cache off. Import `CACHE_TTL_S` from `src/voice/providers/gemini.ts` for the remaining-TTL term. Export `CacheLifetime`.
- [X] T032 [US2] In `eval/voice/run.ts`:
  - Pass `{ ...(options.cache !== undefined ? { cache: options.cache } : {}), onCacheEvent }` to `PROVIDERS[provider].createInterpreter(apiKey, model, …)`, one interpreter per fixture as today. That is how a session's cases share one cache (US2 scenario 3).
  - Wrap `onCacheEvent` per fixture so events are stored with their fixture id. Log one console line per event, e.g. `cache 1830-or created 4909 tokens`, with no name or key.
  - Track per fixture the cache lifetimes: `createdAt` from `created.at`, and `lastUseAt` = the end time of the last call on that fixture after it. A `created` after a fallback or expiry starts a new lifetime.
  - Pass `cache: { on, caches, events }` to `summarize`.
  - Name the result file `<date>-<model>[-cache][-partial].json`, with `-cache` only when caching was on.
- [X] T033 [US2] Cache cleanup, per [contracts/gemini-cache.md §1 "Disposal"](contracts/gemini-cache.md#1-factory). Do it in this order:
  1. **Test first**, in `tests/voice/gemini-cache.test.ts`. `dispose(interpreter)` sends exactly one `DELETE v1beta/cachedContents/x` for a ready entry. It sends nothing when there is no entry or the entry is still creating, and in that case it waits for the pending create and then DELETEs it if it succeeded. It never rejects, even when the DELETE fails. After dispose, the next command goes uncached and starts a new create.
  2. In `src/voice/providers/gemini.ts`, export `dispose(interpreter: Interpreter): Promise<void>`. The interpreter function returned by `createGeminiInterpreter` carries its disposer in a module-private `WeakMap<Interpreter, () => Promise<void>>`, which keeps the `Interpreter` type unchanged. `dispose` on an interpreter with no disposer (Anthropic, stubs) resolves at once. Document it as eval/housekeeping only. The app does not call it, and TTL bounds the app's cost (R4).
  3. In `eval/voice/run.ts`, wrap the case loop in `try/finally` and `await Promise.all([...interpreters.values()].map(dispose))`. That deletes every cache the run created, including on a daily-quota stop and on an uncaught error.
- [X] T034 [US2] In `printSummary` in `eval/voice/run.ts`, add the console lines from [contracts/eval-report.md "Console summary"](contracts/eval-report.md#console-summary-new-lines):
  - `cache: N created (T tokens written), F fallbacks, X create failures`
  - the existing tokens line, now with the real cache write
  - `cost $… · storage $… · total $… ($… per command)`
  - `  at 2027-01-01 prices: total $… ($… per command)`
  
  Print the new lines only when `s.cache === "on"`. The gates line shows the new `cache reads ≥ 90%` gate.
- [X] T035 [US2] In `eval/voice/compare.ts`, implement the rows and flags from T028: cache reads, total per command at both prices, first-call p95, the SC-003 per-category drop flag, the SC-004 p95 flag and per-case deltas. Change `load()` to also return `records` when present. Update the header comment (feature 009).
- [X] T036 [US2] Run `npx vitest run tests/eval/voice.test.ts tests/voice/gemini-cache.test.ts`, then `npm run typecheck && npm run lint && npm test`. All must be green.

**Checkpoint**: The eval can measure caching on vs off offline-tested end to end. Live runs are next.

---

## Phase 5: Polish, Rollout Gate & Cross-Cutting Concerns

**Purpose**: Documentation, live validation against the success criteria, and the gated enable (FR-009)

- [X] T037 [P] Update `docs/spec.md` §8. In the "Prompt caching" bullet (~line 321) and the Gemini note (~line 333), explain the change: Gemini uses explicit context caching (`cachedContents`) for `systemInstruction` + `tools` + `toolConfig`. Creation runs in the background on the first command, which goes uncached. The TTL is 15 min and is extended with a PATCH when under half remains. Any cache error falls back to the uncached request. Caching is enabled per model through `EXPLICIT_CACHE_MODELS` only after the eval passes. Implicit caching stays as the uncached path's behavior.
- [X] T038 [P] Update the header comment of `eval/voice/probeCache.ts` to point to research R12 and quickstart §2. Keep the script, because it is the re-check tool when the default model changes. Confirm it sends the key only in the header.
- [X] T039 Live eval, caching on (needs the user's paid `GEMINI_API_KEY`, costs a few cents): `npm run eval:voice -- --model gemini-3.6-flash --cache on`. Expect `eval/voice/results/<date>-gemini-3.6-flash-cache.json`, `0` fallbacks and `0` create failures. **Needs user.**
- [X] T040 Compare against the baseline: `npm run eval:voice:compare -- eval/voice/results/baseline/2026-10-10-gemini-3.6-flash.json eval/voice/results/<date>-gemini-3.6-flash-cache.json`. Check the [quickstart §3](quickstart.md#3-full-eval-on-vs-off-sc-001sc-004) pass table:
  - cache reads ≥ 90% (SC-001)
  - total per command ≤ $0.00176 at today's prices (SC-002)
  - ≥ 81/83 overall, no category down more than one case (SC-003)
  - p95 < 3 s and ≤ 1.1 × baseline (SC-004)
  
  If p95 or accuracy is borderline, run a same-day `--cache off` and compare it too, to separate run-to-run variance from the cache. **Needs user (depends on T039).**
- [X] T041 **Skipped by the user (2026-10-11): not needed; the fallback covers the free tier either way.** Free-tier check (quickstart §2, R7): run `npm run eval:voice -- --free --cache on --only or-pay-01,or-pay-02,or-pay-03,or-pay-04` with a free key. These are 4 `1830-or` cases, so 3 of them can read the cache. Either caching works, or every command falls back silently with the same grades and `failures`/`fallbacks` are reported. Record the outcome in research.md R7 (resolve the two **(verify)** notes). **Needs user.**
- [X] T042 Browser CORS pre-check, before any enable (research R12 "Still open"; quickstart §4). The eval runs in Node, so it cannot see CORS.
  1. Make a temporary, local-only edit to `src/app/useVoice.ts` so the `useMemo` passes `cache: true` along with the DEV `onCacheEvent`.
  2. Run `npm run dev`, open a 1830 session with a paid Gemini key, open DevTools → Network, and give two commands.
  3. Pass when the `cachedContents` POST returns 200 with no CORS error in the console, a `[voice cache] created` debug line appears, and the second `generateContent` sends `cachedContent`.
  4. **Revert the temporary edit** (`git diff src/app/useVoice.ts` shows only the T005 change).
  
  If CORS fails, do not run T043. Record the result in research.md R12. **Needs user.**
- [X] T043 Rollout gate (FR-009, R8). **Only if T040 passes every criterion and T042 passes**:
  - Add `"gemini-3.6-flash"` to `EXPLICIT_CACHE_MODELS` in `src/voice/providers/gemini.ts`, with a comment citing the result file name and date. Keep the result file in `eval/voice/results/`.
  - In `tests/voice/gemini.test.ts`, the thinking-level table test (~lines 105–106, which includes `gemini-3.6-flash`) and any other test that builds an interpreter for an allowlisted model will now start background creates. Pass `{ cache: false }` to `createGeminiInterpreter` in those tests. Change only how the tests are built, never their expected bodies.
  - Run `npm test`.
  
  If T040 or T042 fails, leave the allowlist empty and record why in research.md R8.
- [X] T044 Manual check in the app (quickstart §4, after T043). On a phone or desktop with a paid key, check all of these:
  - The first command sends `generateContent` + a parallel `cachedContents` POST, and its card appears as fast as before.
  - The second command sends `cachedContent`, with `cachedContentTokenCount` ≈ 4.9k on 1830.
  - An alias edit causes an uncached request, a new create and a DELETE, and the new alias is understood.
  - With `cachedContents/*` blocked in DevTools, the card still appears with no toast.
  - The session export contains no `cachedContents/` string and no key.
  
  **Needs user.**
- [X] T045 Final run of `npm run typecheck && npm run lint && npm test && npm run build`. Confirm `git status tests/voice/__snapshots__` is clean (FR-002) and `grep -rn "cachedContents/" src --include=*.ts` matches only the adapter.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup and BLOCKS both stories. T002 → T003, T004, T005 → T006
- **US1 (Phase 3)**: Depends on Phase 2
- **US2 (Phase 4)**: Depends on Phase 2. Offline (T025–T032, T034–T036), it does not need US1: with the allowlist empty and no adapter caching, `--cache on` just produces zero cache events. T033 (`dispose`) touches `gemini.ts` and should follow T022. Live measurement (T039–T040) needs both stories.
- **Polish (Phase 5)**: T037/T038 can run any time after US1. T039 → T040, and T042 (which needs US1 + T005), both come before T043 → T044, in strict order. T043 is gated on T040 **and** T042 passing. T041 is informational and blocks nothing.

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2. It is the MVP of the code, but it stays dormant (allowlist empty) until US2's eval approves it.
- **US2 (P2)**: Independent offline. Live results need US1.

### Within Each User Story

- Tests are written first and fail (T017 confirms for US1).
- US1: T018 (fragment split) → T019 (`send`) → T020 (state) → T021 (create) → T022 (per-command algorithm) → T023 → T024
- US2: T029 → T031 → T032 → T033 → T034. T030 and T035 are independent of those.

### Parallel Opportunities

- US1 test tasks T007–T016 all edit the same file (`tests/voice/gemini-cache.test.ts`), so they are sequential. They can be split across files only if the shared fake-fetch helper is extracted first.
- US2: T025–T028 all edit `tests/eval/voice.test.ts`, so they are sequential. T030 (`prices.ts`) and T035 (`compare.ts`) are separate files from T029/T031/T032 and can run in parallel.
- After Phase 2, US1 (the `src/voice/providers/gemini.ts` and `tests/voice/gemini-cache.test.ts` track) and US2 (the `eval/voice/*` and `tests/eval/voice.test.ts` track) can proceed in parallel. The exception is T033, which waits for T022.
- T037 and T038 are documentation and can run in parallel with anything after US1.

---

## Parallel Example: after Phase 2

```text
# Track A (US1 adapter):
Task: "T007–T016 cache tests in tests/voice/gemini-cache.test.ts"
Task: "T018–T022 cache manager in src/voice/providers/gemini.ts"

# Track B (US2 eval), at the same time:
Task: "T030 cacheStorage + storageCostUsd in eval/voice/prices.ts"
Task: "T035 compare rows and SC-003/SC-004 flags in eval/voice/compare.ts"
Task: "T029 --cache on|off in eval/voice/cli.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2: the options plumbing, with no behavior change.
2. Phase 3: the adapter cache manager, test-first. **Stop and validate**: `tests/voice/gemini-cache.test.ts` is green, existing Gemini tests and snapshots are untouched, and the allowlist is empty. The app is unchanged in production.
3. Optionally probe live with `npx tsx eval/voice/probeCache.ts`.

### Incremental Delivery

1. Setup + Foundational → no visible change.
2. US1 → caching exists but is dormant.
3. US2 → the eval can measure it.
4. T039–T040 live eval and the T042 browser check → if both pass, T043 flips the allowlist. That is the only step that changes what users get.
5. T044 manual check in the app.

**Merge gate (constitution: "Changes touching voice resolution MUST also report eval-set accuracy")**: US1 changes the voice adapter, so no merge happens without an eval report. The default plan is one merge after T040, citing the `--cache on` result and the compare output. If US1/US2 must merge before that, run `npm run eval:voice -- --model gemini-3.6-flash --cache off` first and cite its accuracy against the baseline. With caching off, requests are byte-identical (T010, unchanged `tests/voice/gemini.test.ts`), so the result is expected to match within run-to-run variance.

### Rollback

Remove the model from `EXPLICIT_CACHE_MODELS`. Requests return to byte-identical uncached bodies.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps each task to its user story for traceability
- Tasks marked **Needs user** need the user's paid or free Gemini key, or a device. Do not mark them done without the user's result.
- Do not commit after each task. Leave changes uncommitted for review.
