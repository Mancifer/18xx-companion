# Research: Cheaper Voice Commands Through Reliable Prompt Caching

**Feature**: 009-voice-prompt-caching | **Date**: 2026-10-11

Sources: Google's Gemini API docs, checked 2026-10-11: [pricing](https://ai.google.dev/gemini-api/docs/pricing), [explicit caching](https://ai.google.dev/gemini-api/docs/generate-content/caching), [implicit caching](https://ai.google.dev/gemini-api/docs/caching). We also used the baseline runs in `eval/voice/results/baseline/`. Points the docs don't state were confirmed by a live probe on 2026-10-11 (`eval/voice/probeCache.ts`, gemini-3.6-flash, 1830-or; see [R12](#r12-live-probe-results-2026-10-11)). Points still marked **(verify)** need the full eval or the app.

## R1. Explicit caching instead of implicit caching

**Decision**: For Gemini, store the stable part ahead of time with the explicit Context Caching API (`POST v1beta/cachedContents`). Later commands refer to it by name (`"cachedContent": "cachedContents/…"` in the `generateContent` body).

**Rationale**: Implicit caching comes with "no cost saving guarantee". On `gemini-3.6-flash` it hit on 4 of 83 commands, even though our prefix is byte-identical and above the 4,096-token minimum. Explicit caching is deterministic: when a valid cache name is sent, the cached tokens are billed at the cached rate. It is the only provider-side way to get SC-001 (≥ 90%).

**Alternatives considered**:
- *Keep implicit caching and tune timing or prefix length.* Google doesn't say what makes a hit. 21 identical requests 2 s apart all missed, so tuning has nothing to work on.
- *Interactions API with `previous_interaction_id`.* It doesn't support explicit caching, and it would change the request shape for every command. That is more risk for no gain.
- *Shorten the prompt.* Out of scope (spec). It also saves less: at the cached rate, every stable token costs a tenth.

## R2. What goes into the cache, and request equivalence (FR-002)

**Decision**: The cache holds exactly the three fields that today make up the byte-identical prefix: `systemInstruction`, `tools` and `toolConfig`, built by the same code (`systemPromptEs`, `toGeminiTools(buildToolSpecs(…))`, `{functionCallingConfig:{mode:"ANY"}}`). A cached `generateContent` request sends only `cachedContent`, `contents` (snapshot + transcript, unchanged) and `generationConfig` (unchanged). It omits the three cached fields.

**Rationale**: The `CachedContent` resource takes `systemInstruction`, `tools` and `toolConfig`. Requests that use a cache must not set them again: the API rejects `system_instruction`, `tools` or `tool_config` alongside `cached_content` (confirmed by the probe: HTTP 400 `INVALID_ARGUMENT`). `generationConfig` (thinking level, max output) is not cacheable and stays per request. The model therefore receives the same instructions, tools and per-command content. A unit test pins this: the cache-create body's three fields are byte-equal to the uncached prefix ([contracts/gemini-cache.md §5](contracts/gemini-cache.md#5-equivalence-guarantee-fr-002)).

**Alternatives considered**: Caching the system prompt only and sending tools every time. Tools are about half the stable part, and the API doesn't allow splitting them anyway.

## R3. When the cache is created (FR-006)

**Decision**: The cache is created lazily, in the background, when the first command of a stable part is sent. That first command (and any command sent while creation is still in flight) goes uncached, exactly as today. Commands after the create succeeds use the cache.

**Rationale**:
- The first command gets no extra wait. Creation runs in parallel and its failure is invisible.
- No cache is made for sessions where voice is never used. Opening a session would otherwise pay a cache write of up to 9k tokens for nothing.
- Cost: the first command pays the full stable part twice (the uncached command, plus the write). That is about $0.004–0.007 once per cache lifetime, and the saving pays it back by the second or third command.
- **Short sessions (spec edge case "many short sessions")**: we accept the one-command loss. A session or cache lifetime with only one command costs about twice today's ($0.008 instead of $0.004 on 1830). From the second command it is cheaper than today, so the most extra spend per cache lifetime is one write. We add no guard, such as "create only on the second command": it would make every session lose its second command's saving to protect a case that is rare at the table. If the eval or real use shows many one-command lifetimes, the fix is to start the create on the second command instead of the first. That is a one-line change in `startCreate`'s trigger.

**Alternatives considered**:
- *Create when the session opens.* This pays for sessions that never use voice, and it competes with session load on slow networks.
- *Create when push-to-talk starts.* That is earlier, but it ties the voice adapter to the recognizer lifecycle, for a gain of at most one cached command per game. Revisit only if the eval shows the first-command cost matters.
- *Block the first command on creation.* It adds a round trip to the first card (FR-006).

## R4. Lifetime: TTL and extension (FR-005, edge case "long pauses")

**Decision**: Create with `ttl: "900s"` (15 min). After each command that used the cache, if less than half the TTL is left, send a background `PATCH v1beta/{name}` with `{"ttl":"900s"}` (no `updateMask`; confirmed by the probe). The adapter tracks expiry locally (`expireTime` from the response, minus a 30 s safety margin). A command after local expiry goes uncached and starts a new cache.

**Rationale**:
- **Storage cost.** $0.50 per 1M tokens per hour today, $1.00 from 2027-01-01. For 5–9k tokens that is $0.0025–0.0045 per hour (doubled in 2027). Saving per cached command: 5–9k × ($0.75 − $0.075)/M ≈ $0.0034–0.006. Caching pays for itself if there is about one command per hour. At the table there are dozens.
- **Lapsing.** The cache lapses at most 15 min after the last command, with no cleanup needed. That holds even if the app closes or the tab is killed (FR-005, reload edge case).
- **Extension cost.** It is one cheap request at most every ~7.5 min of active play, so free-tier request quotas are barely touched.
- A long stock-round pause over 15 min costs one re-creation, not a failed command.

**Alternatives considered**:
- *1 h default TTL.* That stores up to an hour after the game ends, for cents. 15 min is enough for normal gaps.
- *PATCH on every command.* That doubles request count with no benefit.
- *DELETE on page unload.* It is unreliable from a closing tab, and the TTL already bounds the cost.

## R5. Invalidation and identity (FR-004)

**Decision**: The cache is identified by the exact stable-part string (system + tools + toolConfig JSON) inside one interpreter instance. That instance is already per (provider, key, model), from `useMemo` in `useVoice.ts`. Before each command the adapter builds the stable part as it does today and compares it with the cached entry's string. If they differ (alias edit, other session, different game), the old handle is dropped (best-effort background `DELETE`) and the uncached path plus a new background create apply. A key or model change creates a new interpreter, so its caches never cross over. The old interpreter's cache lapses by TTL.

**Rationale**: Comparing the full string costs microseconds for 30–40 KB and cannot give false matches. A hash would only add an async step (`crypto.subtle`) for nothing. Caches are never shared across keys, because each key's interpreter holds its own handle.

## R6. Failure handling and fallback (FR-003, SC-005)

**Decision**:

| Where | Failure | Behavior |
|---|---|---|
| Create | 400 (e.g. below the minimum size, unsupported model), 403, daily-quota 429 | That stable part is marked uncacheable for this interpreter's life. No more create attempts for it. |
| Create | Other 429, 5xx, network, timeout | Cooldown of 5 min, then a later command may try again. |
| Cached `generateContent` | 400 / 403 / 404 (cache expired, deleted, not found, not permitted; the probe shows a deleted cache returns **403** `PERMISSION_DENIED` "CachedContent not found (or permission denied)") | Drop the handle and resend at once **uncached**, the request of today. That resend is the "one retry" of User Story 1 scenario 3, so it is **not** retried again: its own errors map as today and are shown. A command never makes more than 2 `generateContent` requests. A background re-create follows (subject to the rules above). |
| Cached `generateContent` | 429 / 5xx / network / timeout | The existing single retry, sent **uncached** (the cache is kept). No second cache is created by a retry. |
| PATCH / DELETE | Anything | Ignored. Local expiry still governs. |

Creates for the same stable part are de-duplicated: one in-flight promise.

**Rationale**: Any cache trouble ends up as today's request, so the result is the same (SC-005). The worst extra latency is one fast 4xx round trip (~100–300 ms) before the uncached request. A missing cache from another tab or device is just a 404 → fallback.

## R7. Free tier (FR-010)

**Decision**: There is no tier detection and no setting. The adapter behaves the same on every key: R6 makes it fall back silently if the free tier refuses caching. The pricing page lists context caching on 3.6/3.8 Flash as "free of charge" on the free tier, while the caching guide calls it "a paid feature" **(verify which holds; either outcome is handled)**. Each cache adds one create, plus about one PATCH every 7.5 min. These count against the free-tier request quota **(verify)**. That is under 10% extra requests at normal play.

**Status (2026-10-11)**: the free-tier check (T041) was skipped by the user. The two **(verify)** points stay open; the silent fallback handles either outcome.

**Alternatives considered**: A "paid key" toggle. Rejected: FR-011 forbids new settings, and fallback covers it.

## R8. Rollout gate (FR-009)

**Decision**: A per-model allowlist `EXPLICIT_CACHE_MODELS` in `gemini.ts`, next to `THINKING_LEVEL`, starts **empty**. The adapter takes an option `cache?: boolean` that overrides the allowlist; the eval uses it. When an eval with caching on meets SC-001–SC-004, `gemini-3.6-flash` is added to the allowlist in the same change that records the result.

**Rationale**: The eval can measure caching before it ships, with one constant to flip. Same pattern as `THINKING_LEVEL`.

**Outcome (2026-10-11)**: `eval/voice/results/2026-10-11-gemini-3.6-flash-cache.json` against the 2026-10-10 baseline: cache reads 100% (SC-001 ✓), 82/83 with no per-case change (SC-003 ✓), p95 2155 ms vs 2140 ms, +0.7% (SC-004 ✓), 10 caches created and deleted, 0 fallbacks, 0 create failures. SC-002 missed on the eval: $0.00192 per command vs ≤ $0.00176 (−56%). The cause is the eval's shape: 10 caches for 83 commands (3–22 per fixture), each create costing ~$0.0045 at the input price. A cached command costs $0.00079 (−82%), 1830-or (22 commands) came out at $0.00109 per command, and a real game has far more commands per cache. The user accepted SC-002 on that basis, to be revisited with usage data. A game with only 1–2 voice commands costs more than uncached. No PATCH happened in the run (too short), so extension is covered by unit tests only. The browser check (quickstart §4, T042) passed on Chrome Android via remote DevTools. `gemini-3.6-flash` was added to `EXPLICIT_CACHE_MODELS`.

## R9. Eval support (FR-008, US2)

**Decision**:
- `--cache on|off` CLI option. The default follows the allowlist, so it is `off` today.
- The result file name gets `-cache` when on.
- The adapter takes an optional observer `onCacheEvent` ([contracts/gemini-cache.md §4](contracts/gemini-cache.md#4-observer-events)), which reports `created` (tokens, expireTime), `extended`, `deleted`, `failed` and `fallback`. The eval logs these. The app passes nothing (or a DEV log).
- `prices.ts` periods gain `cacheStorage` ($ per 1M tokens per hour). Gemini 3.6/3.8 Flash: 0.50, then 1.00 from 2027-01-01. The `cacheWrite` price stays `null`, meaning the write is charged at the input price. This is conservative: Google doesn't publish a separate write price.
- The summary gains:
  - `cacheWrites` (tokens written by creates, priced as above);
  - `storageUsd`: each cache's tokens × (time from create to its last use + the remaining TTL) × storage price. This is the real total if the eval stops reusing it. The eval deletes its caches at the end, so the stored amount is bounded by the formula.
  - `totalPerCaseUsd` (tokens + writes + storage);
  - the same figures at the 2027-01-01 prices.
- The cache-read rate keeps excluding each fixture's first call.
- `compare.ts` lines up an on run against an off run (or the baseline file): accuracy per category, p95, cache-read rate, total per command.
- The eval keeps one interpreter per fixture, with cases grouped by fixture. That is how a session's commands share a cache (US2 scenario 3).
- `--free` still zeroes `costUsd`.

**Rationale**: Every cost component is visible, and run-to-run comparison uses the existing tooling.

## R10. Expected numbers (sanity check, to be replaced by the eval)

At today's prices, `gemini-3.6-flash`, with a stable part of S tokens, ~250 volatile input tokens and ~35 output tokens:

| Game | S | Uncached / cmd | Cached / cmd | Storage / h |
|---|---|---|---|---|
| 1830 | 4,909 (probe) | $0.0040 | $0.0007 | $0.0025 |
| RotLA land market | ~8,450 | $0.0066 | $0.0009 | $0.0042 |

Over a 4-hour game with ~80 commands, storage adds about $0.0001–0.0002 per command, and the creates add less than that. The expected total is ~$0.0008–0.0011 per command, which meets SC-002 (−60%) with margin. In 2027 everything doubles, so the ratio holds.

**1830 is close to the minimum**: S = 4,909 against a 4,096 minimum. If a smaller setup ever falls under it, the create returns 400 and that stable part stays uncached (R6), as the spec's edge case allows.

## R11. Claude provider

**Decision**: No change. It already uses `cache_control` (out of scope per spec). The `createInterpreter(apiKey, model, options?)` signature gains an optional third argument for every provider. The Anthropic adapter ignores it.

## R12. Live probe results (2026-10-11)

`npx tsx eval/voice/probeCache.ts` (gemini-3.6-flash, fixture 1830-or, «240, paga»), paid key:

| Step | Result |
|---|---|
| Uncached request (today) | 200, 1,399 ms. prompt 5,221, cached 0, `runAndPayout(240, full)` |
| Create with system + tools + toolConfig, ttl 300s | 200, 554 ms. `totalTokenCount` 4,909 |
| Cached request ×2 | 200, 1,247 / 1,144 ms. prompt 5,221, **cached 4,909**, same tool call and args |
| Cached request that also resends system/tools | **400** `INVALID_ARGUMENT`: "CachedContent can not be used with GenerateContent request setting system_instruction, tools or tool_config." |
| PATCH `{"ttl":"600s"}`, no `updateMask` | 200. `expireTime` moved |
| DELETE | 200 |
| Cached request after delete | **403** `PERMISSION_DENIED`: "CachedContent not found (or permission denied)" |

What it settles:
- **Tools can be cached.** The whole stable part (4,909 of 5,221 prompt tokens, 94%) goes into the cache. `promptTokenCount` includes the cached tokens, which matches how `geminiReply` already splits them.
- **The request split in R2 is required**, not optional.
- **The fallback must treat 403 as a cache miss.** A missing cache is reported as 403, not 404. A 403 from a bad key is also caught by this rule, but the uncached fallback then returns the same 403, which maps to today's "permission" message, so the user sees the same error as today.
- **Cost per cached 1830 command** at today's prices: 312 × $0.75 + 4,909 × $0.075 + 35 × $3.75 = **$0.00073**, versus $0.0040 uncached (−82%) before storage and writes.
- **Latency** is the same or slightly better: one sample each, so the eval decides SC-004.

**Browser calls and key exposure**: Google allows browser calls but advises against them, because a key shipped in client code can leak. That warning is about a developer embedding *their* key in an app served to others. Here, since feature 005, each user's own key is stored on their device and sent from the browser to `generateContent`. `cachedContents` uses the same key, the same `x-goog-api-key` header and the same Google origin, so it adds no new place for the key to leak. A cache name alone is useless without the key: the probe shows a request with a name that doesn't resolve for the caller gets a 403. No plan change.

Browser CORS for `cachedContents` passed on 2026-10-11 (Chrome Android, T042). Still open: free-tier behavior and quota (R7), and how create and storage show up on the billing report.
