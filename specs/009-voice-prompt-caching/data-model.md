# Data Model: Cheaper Voice Commands Through Reliable Prompt Caching

**Feature**: 009-voice-prompt-caching

This feature adds **no persisted data**. There are no new IndexedDB rows, no settings, no events and no export fields. Everything below lives in memory inside one Gemini interpreter, or in the eval.

## 1. Stable request part (derived, not stored)

| Field | Source | Notes |
|---|---|---|
| `systemInstruction` | `systemPromptEs(session)` | Unchanged |
| `tools` | `toGeminiTools(buildToolSpecs(session))` | Unchanged |
| `toolConfig` | `{functionCallingConfig:{mode:"ANY"}}` | Unchanged |
| `stable` | The three fragments above, serialized as today's prefix string | This string is the cache's identity (research R5) |

## 2. Cache entry (in memory, one per interpreter at a time)

| Field | Type | Meaning |
|---|---|---|
| `stable` | string | The stable part it was built from |
| `state` | `"creating" \| "ready"` | |
| `pending` | `Promise<void>` (while creating) | Shared, so a retry never creates a second cache |
| `name` | string (when ready) | `cachedContents/…`. It is not a secret, but it is never logged to the UI, put in events or exported (FR-007). |
| `tokens` | number | `usageMetadata.totalTokenCount` from the create |
| `expiresAt` | epoch ms | From `expireTime`; treated as expired 30 s early |

Plus a small map `blocked: Map<stable, until | "forever">` for create failures (research R6).

**Lifecycle**

```text
(none) ──first command──▶ creating ──201──▶ ready ──used, < TTL/2 left──▶ ready (PATCH, expiresAt moved)
   ▲                          │ fail                 │ expired locally / 4xx on use / stable changed
   └──────────────────────────┴──────────────────────┘  (DELETE best-effort when stable changed)
```

**Identity vs the spec's "belongs to one session"**: identity is the stable string, not a session id. Two sessions with identical setup, names and aliases would reuse one cache. That meets FR-004, because the cached content is exactly what either session would send. Any difference in content gives a different string and a new cache.

**Scope**: the interpreter closure, which already exists per (provider, key, model) in `useVoice.ts`. A key or model change creates a new interpreter, so its entries are never shared. A reload starts empty.

## 3. Token usage (`src/voice/reply.ts`, unchanged shape)

`TokenUsage.cacheRead` reports `usageMetadata.cachedContentTokenCount` for cached requests, as today. `cacheWrite` stays 0 on replies. Write tokens reach the eval through the `created` cache event, not through a command's reply, because creation is not part of any command.

## 4. Price period (`eval/voice/prices.ts`)

New field `cacheStorage: number | null`, in $ per 1M tokens per hour.

| Model | Through 2026-12-31 | From 2027-01-01 |
|---|---|---|
| gemini-3.6-flash, gemini-3.8-flash | input 0.75 · output 3.75 · cacheRead 0.075 · cacheStorage 0.50 | 1.50 · 7.50 · 0.15 · 1.00 |
| gemini-3.5-flash-lite | cacheStorage 1.00 | — |
| gemini-3-flash-preview | cacheStorage 1.00 | — |
| claude-* | `cacheStorage: null` | — |

`cacheWrite` stays `null` for Gemini, so writes are priced at the input rate (conservative).

## 5. Eval summary additions

See [contracts/eval-report.md](contracts/eval-report.md#summary-json-new-or-changed-fields): `cache`, `cacheEvents`, `storageUsd`, `totalUsd`, `totalPerCaseUsd`, `at2027`.
