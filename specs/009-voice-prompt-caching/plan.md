# Implementation Plan: Cheaper Voice Commands Through Reliable Prompt Caching

**Branch**: `009-voice-prompt-caching` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-voice-prompt-caching/spec.md`

## Summary

About 95% of each Gemini voice request (instructions, game summary, names, tools) is the same from command to command. On the default model, implicit caching billed it at the cached rate only 5% of the time. This feature switches the Gemini adapter to **explicit context caching**: it stores the stable part once with `cachedContents` and points later commands at it. The model receives exactly the same content. Expected cost goes from ~$0.0044 to ~$0.001 per command.

1. **Same content, different billing** ([R1](research.md#r1-explicit-caching-instead-of-implicit-caching), [R2](research.md#r2-what-goes-into-the-cache-and-request-equivalence-fr-002)): the cache holds today's `systemInstruction` + `tools` + `toolConfig`, built by the same code. Cached requests send `cachedContent` + the unchanged `contents` and `generationConfig`. A test pins byte-equivalence.
2. **No wait on the first command** ([R3](research.md#r3-when-the-cache-is-created-fr-006)): the cache is created in the background on the first command, which goes uncached as today.
3. **Short, self-extending lifetime** ([R4](research.md#r4-lifetime-ttl-and-extension-fr-005-edge-case-long-pauses)): the TTL is 15 min. Active play extends it with a PATCH when less than half is left. Idle time lets it lapse with no cleanup.
4. **Identity = the stable string** ([R5](research.md#r5-invalidation-and-identity-fr-004)): any change (alias, session, game) gets a new cache. A key or model change gets a new interpreter, so caches are never shared.
5. **Every cache problem falls back to today's request** ([R6](research.md#r6-failure-handling-and-fallback-fr-003-sc-005), [R7](research.md#r7-free-tier-fr-010)): this covers refused, expired, deleted, below the minimum size, and the free tier. There is no tier detection and no setting.
6. **Eval-gated rollout** ([R8](research.md#r8-rollout-gate-fr-009), [R9](research.md#r9-eval-support-fr-008-us2)): `EXPLICIT_CACHE_MODELS` starts empty. The eval gets `--cache on|off`, cache write and storage costs, totals at both dated prices, and compare rows. The model is added to the allowlist only after the eval passes SC-001–SC-004.

No new dependency. No change to events, actions, settings, storage, exports, the prompt or the tools. Claude is untouched.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022; Node.js 22 for tooling and the eval

**Primary Dependencies**: Existing only: react 19, zod 4, idb 8, @anthropic-ai/sdk. Gemini is still called with the platform `fetch`.

**Storage**: N/A. Cache handles live in memory in the interpreter closure and are never persisted ([data-model](data-model.md)).

**Testing**: Vitest with fake `fetch` and an injected clock for the adapter, plus the existing recorded and snapshot tests. Live: `npm run eval:voice -- --cache on` (paid key).

**Target Platform**: Installable PWA (Chrome Android, Safari iOS 17+, desktop). `cachedContents` is on the same Google origin as `generateContent`, so CORS should behave the same **(verify in the app, quickstart §4; the probe ran in Node)**.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: Transcript to card under 3 s at p95, and no worse than the uncached baseline by more than 10% (SC-004). The first command gets no extra wait (FR-006).

**Constraints**:
- One command request plus at most one retry or fallback.
- Background cache calls never block or fail a command.
- The key goes only in the `x-goog-api-key` header.
- Cache names are never exported.
- The stable part must be at least 4,096 tokens on 3.6/3.8 Flash. 1830 is ~4,950.

**Scale/Scope**:
- `src/voice/providers/gemini.ts`: a cache manager of about 120–150 lines, plus the request split.
- `providers/index.ts` and `useVoice.ts`: the optional `options` argument.
- `eval/voice/{cli,run,grade,prices,compare}.ts`.
- One new adapter test file, and extended eval-helper tests.

**Unknowns resolved** (all in [research.md](research.md)):

| Unknown | Resolution |
|---|---|
| Why implicit caching misses, and what hits reliably | R1: explicit `cachedContents` |
| Can tools be cached, and what must the cached request omit | R2/R12: system + tools + toolConfig in the cache, omitted from the request (probe: resending them is a 400) |
| When to create without delaying the first command | R3: background create on the first command |
| TTL vs storage cost | R4: 900 s plus a PATCH when under half, storage $0.50/M·h (→ $1.00 in 2027) |
| Invalidation | R5: compare the full stable string, per-interpreter scope |
| Failure handling | R6/R12: an uncached fallback for every cache failure (a missing cache is a 403), plus create cooldowns |
| Free tier | R7: no detection, silent fallback |
| Minimum cacheable size | R10: 4,096 tokens (3.6/3.8 Flash). Below it, the create returns 400 and the part stays uncached. |
| Prices | R9/R10: from Google's pricing page, 2026-10-11 |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Status | How |
|---|---|---|
| I. Event-sourced ledger | ✅ N/A | No state, events or actions change |
| II. Money conserved | ✅ N/A | No domain change |
| III. Rules as data | ✅ N/A | No game definitions touched |
| IV. Propose, confirm, undo | ✅ | The same tool calls go through the same `ModelReply` → validation → card. Every cache failure degrades to today's request, then to today's errors and touch fallback. |
| V. Voice/touch parity | ✅ N/A | No new capability |
| VI. Test-first; eval on provider changes | ✅ | Adapter cache logic is built test-first with fake fetch. This is a provider-side change, so it is re-evaluated (`--cache on` vs baseline) before it is enabled (FR-009). |
| VII. Local-first, keys on device | ✅ | No backend. Nothing persisted. The key goes only in the header, never in URLs, events or exports. Cache names are not exported. |
| Resolver: same tools, instructions and snapshot | ✅ | Byte-equivalence test ([contracts §5](contracts/gemini-cache.md#5-equivalence-guarantee-fr-002)). The prompt and tool snapshots are unchanged. |
| Resolver: one call per command, stable first, use provider caching | ✅ | One command request (+1 retry or fallback). Cache create, PATCH and DELETE are background housekeeping, not command calls. This applies "using provider-side prompt caching where the provider offers it" more fully. |
| Resolver: errors map to shared messages | ✅ | Cache 4xx never surface. Other errors map as today. |
| Provider/model measured on eval before offered | ✅ | The model allowlist flips only after the eval. The report adds storage and write cost per command. |
| 3 s latency target | ✅ | The first command is unchanged. Later commands are expected to be the same or faster (SC-004 checks it). |
| New runtime dependencies justified | ✅ | None |
| `docs/spec.md` updated with behavior change | ✅ planned | §8 "Prompt caching" and the Gemini note at lines ~321/333: explicit cache, background create, 15 min TTL, fallback |

**Post-design re-check**: the design artifacts add no violations. The background cache calls are the only debatable point. They are housekeeping that never carries a command and never changes its result, so the "one call per command" rule holds.

## Project Structure

### Documentation (this feature)

```text
specs/009-voice-prompt-caching/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── gemini-cache.md  # Adapter cache behavior + equivalence guarantee
│   └── eval-report.md   # --cache flag, storage/total cost, compare rows
├── checklists/
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/voice/
├── providers/
│   ├── gemini.ts        # + EXPLICIT_CACHE_MODELS, cache manager, cached/uncached request split
│   └── index.ts         # createInterpreter(apiKey, model, options?)
└── interpreter.ts       # InterpreterOptions type (shared)
src/app/useVoice.ts      # deps.createInterpreter passes options (DEV log of cache events only)

eval/voice/
├── cli.ts               # --cache on|off
├── run.ts               # options per fixture interpreter, collect events, delete caches at end, -cache filename
├── grade.ts             # summary: cache, cacheEvents, storageUsd, totals, at2027, gate
├── prices.ts            # cacheStorage per period; dated lookup reused for 2027 totals
└── compare.ts           # rows for cache-read rate, totals, SC-003/SC-004 flags

tests/voice/
├── gemini-cache.test.ts # new: lifecycle, invalidation, expiry, fault matrix, equivalence
└── gemini.test.ts       # unchanged expectations (caching off ⇒ identical bodies)
tests/eval/              # cli/grade/prices helper tests extended

docs/spec.md             # §8 caching paragraph
```

**Structure Decision**: Single project, same layout as feature 005. The caching code lives in the Gemini adapter, because it is provider wire format. The interpreter interface only gains an optional options bag.

## Complexity Tracking

No violations. One point is recorded here so reviewers don't have to work it out again:

| Item | Why it is acceptable | Simpler alternative rejected because |
|---|---|---|
| Background `cachedContents` create, PATCH and DELETE calls, besides the one `generateContent` per command ("make one call per command") | They carry no command. They never change a command's result, never block it and never surface errors ([contracts §3](contracts/gemini-cache.md#3-per-command-algorithm)). The rule's own clause, "using provider-side prompt caching where the provider offers it", needs them on Gemini, where implicit caching hits 5% of the time. There is at most one create per cache lifetime and one PATCH per ~7.5 min. | Implicit caching only: it fails SC-001 (5% vs ≥ 90%), and nothing can be tuned (R1). |
