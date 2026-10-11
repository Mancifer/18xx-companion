# Quickstart: Validating Gemini Explicit Caching

**Feature**: 009-voice-prompt-caching

## 1. Offline checks (no key, no cost)

```sh
npm run typecheck && npm run lint && npm test
```

Expected:
- The existing Gemini recorded tests pass unchanged. With caching off, requests are byte-identical to today's.
- The prompt and tool snapshots in `tests/voice/__snapshots__/` are unchanged (FR-002).
- New adapter tests use a fake `fetch` and an injected clock. They cover:
  - The first command goes uncached and starts one create. The second command (after the create resolves) sends `cachedContent` and no `systemInstruction`/`tools`/`toolConfig`.
  - The equivalence of the create body and the uncached prefix, for all 10 fixtures ([contracts/gemini-cache.md §5](contracts/gemini-cache.md#5-equivalence-guarantee-fr-002)).
  - A changed alias leads to a new stable part, a DELETE of the old cache and an uncached request.
  - Expiry by clock leads to an uncached request and a re-create. Use within TTL/2 of expiry triggers a PATCH.
  - Fault matrix (SC-005): a create 400/403/429/500/network, and a cached-use 404/400/403/429/500/timeout. Every case returns the same `ModelReply` as the uncached path, with no extra error.
  - A retry never starts a second create. A command never makes more than 2 `generateContent` requests: a failed fallback is not retried. The key appears in no URL, event or error.
  - `dispose()` deletes a ready cache once and never rejects.

## 2. Probe the API (one-time, a few cents)

Run with a paid key (`GEMINI_API_KEY`):

```sh
npx tsx eval/voice/probeCache.ts [--model gemini-3.6-flash] [--fixture 1830-or]
```

Done on 2026-10-11 ([research R12](research.md#r12-live-probe-results-2026-10-11)). Re-run it when the default model changes. It confirms:
- create accepts `tools` + `toolConfig`;
- a cached request is rejected if it also sends them;
- PATCH works without `updateMask`;
- `cachedContentTokenCount` on later calls ≈ the create's `totalTokenCount`.

Then check a free-tier key with `--free --cache on`. Caching works, or every command falls back silently with the same results.

## 3. Full eval, on vs off (SC-001–SC-004)

```sh
npm run eval:voice -- --model gemini-3.6-flash --cache on
npm run eval:voice:compare -- eval/voice/results/baseline/2026-10-10-gemini-3.6-flash.json eval/voice/results/<date>-gemini-3.6-flash-cache.json
```

Optionally, add a same-day `--cache off` run to separate run-to-run variance from the cache.

Pass when:

| Criterion | Target |
|---|---|
| Cache reads (after each fixture's first call) | ≥ 90% (SC-001) |
| Total per command (tokens + writes + storage), today's prices | ≤ $0.00176, i.e. −60% vs $0.0044 (SC-002) |
| Overall accuracy | ≥ 81/83, and no category drops more than one case (SC-003) |
| p95 latency | < 3 s and ≤ 1.1 × baseline p95 (SC-004) |
| Fallbacks / create failures | 0 expected on a paid key |

If all pass, and the browser CORS pre-check also passes (tasks T042: a dev build with a temporary `cache: true`, where the `cachedContents` POST returns 200 with no CORS error), add `gemini-3.6-flash` to `EXPLICIT_CACHE_MODELS` (FR-009). Record the result file in the change.

## 4. Manual check in the app (after enabling)

1. Open a 1830 session with a paid Gemini key and DevTools → Network open.
2. First command: one `generateContent` with `systemInstruction`, plus one `cachedContents` POST in parallel. The card appears as fast as before.
3. Second command: `generateContent` with `cachedContent`. `usageMetadata.cachedContentTokenCount` is about 4.9k.
4. Edit a player alias, then give a command: an uncached request, a new `cachedContents` POST and a DELETE of the old one. The new alias is understood.
5. Block `cachedContents/*` in DevTools (request blocking), then give a command: the card still appears with no error toast.
6. Export the session: the JSON contains no `cachedContents/` string and no key.
