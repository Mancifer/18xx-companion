# Research: Gemini Flash as a Voice Provider

**Feature**: 005-gemini-flash-provider | **Date**: 2026-10-10

External facts were checked against Google's Gemini API docs on 2026-10-10 (models, pricing, caching, thinking, function calling, generateContent reference). Values marked **(verify)** must be re-checked during implementation, because Google changes model IDs and prices often.

---

## R1. Which Gemini model is the default

**Decision**: The default is **`gemini-3.6-flash`**, chosen from the eval runs of 2026-10-10 (see "Eval results" below). The plan started with `gemini-3.8-flash` (the newest stable Flash model) as a provisional default. Before the provider is offered (constitution: eval gate), the eval ran three candidates, and the default became the best one:

| Candidate | Status (2026-10-10) | Lowest thinking level | Why it is in the run |
|---|---|---|---|
| `gemini-3.8-flash` | Stable, newest | `low` | The most capable Flash model; Google recommends it for new projects |
| `gemini-3.6-flash` | Stable | `minimal` | Can think less, so it may be faster |
| `gemini-3.5-flash-lite` | Stable | `minimal` (its default) | The cheapest; tests whether "Lite" is enough |

**Rationale**: Preview models (`gemini-3-flash-preview`) can be shut down at short notice, as 2.0 Flash and 3.1 Flash-Lite Preview were. 2.5 Flash is limited to existing users, so a new user may not be able to call it. The model stays a free-text field, as with Claude, so a user can pick any of them.

**Alternatives considered**: `gemini-3-flash-preview`: a preview, so it may disappear. `gemini-2.5-flash`: new keys may not have access.

**Eval results (2026-10-10, T037)**: 78 cases × 1 run per model, paid tier (billing enabled, so not `--free`), files in `eval/voice/results/2026-10-10-gemini-*.json`. The 3.6 Flash column is the official run after the grader fixes below (`--rpm 60`). The 3.8 Flash and Flash-Lite columns are their saved answers re-graded offline with the same grader; their files on disk still hold the first grading.

| | `gemini-3.6-flash` | `gemini-3.8-flash` | `gemini-3.5-flash-lite` |
|---|---|---|---|
| Overall (SC-002: ≥ 85%) | **98.7%** ✓ | 91.0% ✓ | 88.5% ✓ |
| OR subset (gate ≥ 90%) | **97.9%** ✓ | 85.4% ✗ | 81.3% ✗ |
| Held-out | 100% | 88.2% | 94.1% |
| Categories below 80% (gate) | none ✓ (compound 80%, the rest 100%) | payout, compound, corrections ✗ | trains, compound, notUnderstood ✗ |
| Latency p50 / p95 (gate p95 < 2.5 s) | 1287 / **1492 ms** ✓ | 2016 / 6385 ms ✗ | 931 / 1760 ms ✓ |
| Malformed / refused stops | 0 / 0 | 0 / 0 | 0 / 0 |
| Errors | 0 | 5 timeouts (8 s) | 0 |
| Cache-read rate | 4% | 0% | 97% |
| Paid cost per command | $0.0043 | $0.0042 | $0.0012 |

- **3.6 Flash passes every gate and SC-002**, with one failure in 78: `cp-01` «compra un 3 y paga 290» reads "paga 290" as a cost (`payCost`) instead of the payout. It's the only candidate that passes the OR-subset and latency gates together.
- **3.8 Flash** is slower than 3.6 Flash even at its lowest thinking level (`low`; 3.6 accepts `minimal`). It used only 377 thinking tokens in the whole run, so the slowness is the model's serving time, not thinking. Five commands hit the app's own 8 s limit, which aborts the request (the model was still working), and they count as failures. On the 73 it answered it scores 97.3%, still below 3.6 Flash, and several of its answers took 5.6–7.7 s against the 3 s target. Its other misses are two compounds it put in game order (payout before the train purchase) instead of the order spoken.
- **3.5 Flash-Lite** is the cheapest and fastest, but it's the least accurate. It fills `seller` on bank train purchases, reads "paga" as withhold, and turns «la PRR pide un préstamo» in 1830 (no loans) into a bank payment. It's not suitable as the default.
- **Grader and case fixes made after the first grading** (shared by every provider, `eval/voice/grade.ts` and `cases.jsonl`). Three first-run failures were grading artifacts: the app's behavior was right.
  - `rl-or-forced-01`: a forced purchase with `variant` set to the type's default ("4") is now equal to `null`, as `buyTrain` already was.
  - `q-04`: asking for a company's `cash` now counts as its `treasury`, since the app answers both the same way.
  - `cl-02`: a clarification candidate now counts when it's a word of an option's value or label (`NYC:1`, "1 acción de NYC"). Tapping an option sends both back to the model, so either names the company.
  - `cl-03` «Ana bel compra una QR»: by the user's decision (2026-10-10), the recognizer's split "Ana bel" means Anabel. The case now expects Anabel buying one QR, and moved from clarification to stock, so clarification has 2 cases and stock 16. Every model read it that way.
- **Comparing with Claude later (SC-006)**: the T003 baseline runs on the pre-005 code and so uses the old grader and cases. Re-grade its saved answers with the current grader before comparing (the offline re-grade used here works for that).
- **Follow-up for the shared prompt, not done here**: make a bare «paga N» during an operating round mean the payout (`cp-01`), and remind the model to keep the spoken order in compounds. The prompt is shared with Claude, so it needs a Claude re-run, which waits for an Anthropic key.

## R2. Plain `fetch` to `generateContent` instead of a Google SDK

**Decision**: Call `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `fetch`. Send the key in the `x-goog-api-key` header, never as a `?key=` query parameter. Add **no new runtime dependency**.

**Rationale**:
- We need one endpoint, one request shape and one response shape: about 150 lines including error mapping. That is less code than wrapping an SDK's types.
- `@google/genai` would add a large dependency to the PWA bundle for features we don't use (streaming, files, live, chats).
- Recorded-response tests just feed JSON to a pure adapter function. No SDK mocking is needed.
- With the header, the key never appears in a URL. URLs can end up in browser history, proxies and error messages.
- The endpoint allows browser (CORS) calls with an API key, as Google's own browser SDK does. That matches the existing Claude setup (`dangerouslyAllowBrowser`): the user's own key, sent from their own device (constitution VII, spec assumption).

**Alternatives considered**:
- `@google/genai` (v2.28.0, the library in AI Studio's sample code): rejected. It is 11.9 MB unpacked and depends on `google-auth-library`, `protobufjs`, `ws` and `p-retry`, mostly for server auth, Live/WebSocket and files, none of which we use. What it would add for us: typed request/response objects, a `.functionCalls` helper, and an `ApiError` with the HTTP status. We would still write the same tool conversion, reply mapping and error-to-Spanish mapping, because those are app-specific. It gives no accuracy or latency gain: it calls the same endpoint. The constitution requires a justification for a new dependency, and there isn't one. Revisit if we need streaming, the Live API, or if Google moves voice-relevant features to the SDK only.
- The new Interactions API (`/v1beta/interactions`): Google's docs now lead with it. It is stateful by default (`store`), and we need nothing it adds for one call per command. `generateContent` is not deprecated (checked in the reference). Revisit if Google deprecates `generateContent`.

## R3. Sending the same tools to Gemini

**Decision**: Split tool generation into a neutral step and per-provider formatting:

1. `buildToolSpecs(session)` returns `{ name, description, schema }[]`. It holds today's logic in `tools.ts`: the same Zod schemas, the same entity enums, the same descriptions, the same order and sorted keys.
2. `toAnthropicTools(specs)` adds `input_schema` and `strict: true`. Its output must be byte-identical to today's `buildTools` (a regression test checks this, for SC-006).
3. `toGeminiTools(specs)` returns `[{ functionDeclarations: [{ name, description, parametersJsonSchema }] }]`.

`parametersJsonSchema` takes standard JSON Schema, including `anyOf`, `enum`, `type: "null"` and `additionalProperties: false`. The older `parameters` field accepts only an OpenAPI subset and rejects `additionalProperties`. If a keyword is still rejected, a small `geminiSchema()` pass removes it. A unit test checks that the declarations contain only an allowlist of keywords **(verify the allowlist against a real call; the first eval call per fixture surfaces any 400)**. Re-check 2026-10-10: Google's function-calling page now leads with the Interactions API and does not list the keywords. **Verified by the T037 eval runs (2026-10-10)**: every call on all three models was accepted, with no schema 400s, so the allowlist stands.

**Rationale**: FR-006 asks for the same vocabulary, descriptions and entity limits, with only the wire format differing. Generating both from one spec list makes drift impossible.

**Known risk**: Google recommends "10–20 tools maximum", and warns that `ANY` mode may reject very large schemas. A game here offers about 25–40 tools. This is the most likely cause of lower Gemini accuracy, and the eval will show it per category. We don't reduce the tool set ahead of the data: that would break FR-006 parity. If the eval shows it is needed, it becomes a follow-up (for example `allowed_tools` per round). **Eval (2026-10-10)**: `ANY` mode accepted the full tool set on every fixture, with 0 malformed calls on all three models, so the tool count did not show up as a problem.

## R4. Tool choice, thinking and output settings

**Decision**:
- `toolConfig.functionCallingConfig.mode = "ANY"`. The prompt already requires at least one tool call; `ANY` enforces it, and Gemini can still return several calls in parallel for compound commands. If the eval shows large-schema rejections or worse accuracy, the fallbacks are `VALIDATED` and then `AUTO`. The mode is one constant in the adapter.
- `generationConfig.maxOutputTokens = 1024` (same as Claude). Thinking tokens count against this limit, so it is checked in the eval (truncation shows up as `MAX_TOKENS`).
- `thinkingConfig.thinkingLevel` is set to the lowest level the model accepts, from a small table: `low` for 3.8 Flash, `minimal` for 3.6 Flash, 3.5 Flash-Lite and 3 Flash Preview, and omitted for unknown models. (Re-checked 2026-10-10: 3.5 Flash-Lite accepts `minimal`, which is also its default; none of these models can turn thinking off.) This mirrors `supportsEffort()` for Claude. Latency (SC-003) matters more than deep reasoning for single-call commands.
- `temperature` is left at the model default. Google's guidance for Gemini 3 is to keep the default.
- Timeout 8 s through `AbortController`, same as Claude. One retry on 429, 5xx or a network error, with a short backoff (≤ 1 s in the app), which matches the SDK's `maxRetries: 1` (FR-010).

**Rationale**: Each value is matched to Claude's settings so the comparison is fair, and each is a single constant that can be adjusted from eval data.

## R5. Prompt caching on Gemini

**Decision**: Use Gemini's **implicit caching**. It is on by default for 2.5 and newer models. The request order puts the stable prefix first: `systemInstruction` (the same text as Claude's system prompt), then `tools`, then the single user turn with the snapshot and transcript. The adapter memoizes the prefix per session, like today's interpreter, so the bytes are identical between commands. Cache hits are reported in `usageMetadata.cachedContentTokenCount`.

**Rationale**: Explicit caching (`cachedContents`) needs a create call, a TTL and an hourly storage fee. That breaks "one call per command" and costs money while idle. Implicit caching needs nothing, and Google applies the discount automatically (FR-011).

**Caveat**: The minimum prefix for implicit caching is 4,096 tokens on 3.8 and 3.6 Flash. Our prefix is about 6,000 tokens on Claude, so it should qualify, but smaller games may fall under it. The eval reports a cache-read rate per provider. For Gemini, "cache reads > 0" is reported but is not a gate, because Google does not guarantee implicit hits.

**Eval finding (2026-10-10)**: implicit caching barely hit on the Flash models: 4% of calls on 3.6 Flash and 0% on 3.8 Flash, against 97% on 3.5 Flash-Lite with the same adapter and prefix. The prefix is about 5,600 tokens per command, above the 4,096 minimum. Request spacing is not the cause: 3.6 Flash got 3% at 8 RPM (7.5 s apart) and 4% at 60 RPM (1 s apart). So a paid command costs about $0.0043 instead of the roughly $0.0012 that caching would give, and it doubles to about $0.009 at the 2027-01-01 prices. That's still well under a cent per command, so it's a follow-up, not a blocker: try explicit caching (`cachedContents`) for 3.6 Flash and weigh its hourly storage fee against the savings.

## R6. One response format for both providers

**Decision**: Add a neutral `ModelReply` (see [data-model.md §2](data-model.md#2-modelreply-neutral-model-response)). Each provider adapter turns its raw response into it. `resolveResponse` and the eval grader take `ModelReply`, not `Anthropic.Message`.

Mapping of the finish/stop reasons:

| Neutral `stop` | Claude `stop_reason` | Gemini (`finishReason` / `promptFeedback.blockReason`) |
|---|---|---|
| `"done"` | `end_turn`, `tool_use`, `stop_sequence` | `STOP` |
| `"truncated"` | `max_tokens` | `MAX_TOKENS` |
| `"refused"` | `refusal` | `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION`, `IMAGE_*`, any `blockReason`, no candidates |
| `"malformed"` | — | `MALFORMED_FUNCTION_CALL`, `MALFORMED_RESPONSE`, `UNEXPECTED_TOOL_CALL`, `TOO_MANY_TOOL_CALLS` |
| `"other"` | anything else | `OTHER`, `LANGUAGE`, `FINISH_REASON_UNSPECIFIED`, anything else |

`malformed` and `other` lead to "No entendí" with "La orden llegó incompleta." / "No reconocí ninguna orden." (existing Spanish strings). The spec's edge case "safety filter blocks a response" is `refused`, which is handled like Claude's refusal.

Gemini `functionCall.args` can be missing when a function has no arguments. The adapter turns it into `{}`. Text parts and `thoughtSignature`/thought parts are ignored. We never send a second turn, so signatures are not needed.

**Rationale**: FR-007 asks that both providers go through the same validation and resolution path. With one input type there is only one code path, and the existing Claude tests keep passing through `anthropicReply()`.

## R7. Provider errors

**Decision**: Each adapter throws a `VoiceProviderError` with a neutral `kind`. `resolveError` maps the kind to the Spanish message:

| `kind` | Claude source | Gemini source (HTTP status + `error.status` / `details.reason`) | Spanish message |
|---|---|---|---|
| `auth` | `AuthenticationError` | 400 `API_KEY_INVALID`; 401 | "La clave de la API no es válida." (existing) |
| `permission` | `PermissionDeniedError` | 403 `PERMISSION_DENIED` | "La clave no tiene permiso para este modelo." (existing) |
| `model` | `NotFoundError` | 404 `NOT_FOUND`; 400 naming an unknown model | "Este modelo no está disponible para esta clave." (**new**) |
| `rateLimit` | `RateLimitError` | 429 `RESOURCE_EXHAUSTED` | "Se alcanzó el límite de uso; prueba en un momento." (existing) |
| `timeout` | `APIConnectionTimeoutError` | `AbortError` after 8 s; 504 `DEADLINE_EXCEEDED` | "La respuesta tardó demasiado." (existing) |
| `connection` | `APIConnectionError` | `fetch` `TypeError` (network) | "Sin conexión con el servicio de voz." (existing) |
| `service` | other `APIError` | other 4xx/5xx | "Error del servicio de voz." (existing) |

The Anthropic adapter keeps passing SDK errors through, and `resolveError` keeps its `instanceof` checks, plus one new mapping (`NotFoundError` → `model`). That is the only visible Claude change: a clearer message for a mistyped model ID. Error messages and response bodies from Google are never logged in full, and never with the key (the security test is extended to `x-goog-api-key`).

## R8. Settings storage and migration

**Decision**: Settings gain `provider: "anthropic" | "gemini"`, `apiKeys: { anthropic?, gemini? }` and `models: { anthropic, gemini }`. Legacy rows `apiKey`/`model` are read as the Anthropic entries (read-time migration, FR-005), rewritten in the new shape on the next save, and then deleted. `rememberKey: false` keeps **both** keys in memory only. Details are in [data-model.md §1](data-model.md#1-settings-device-local).

**Rationale**: Per-provider maps mean adding a third provider is a registry entry, not a schema change (spec assumption: other providers must not get harder to add). A read-time migration needs no DB version bump, and a user who never opens Settings keeps working.

**Alternatives considered**: Flat `geminiApiKey`/`geminiModel` fields: simpler today, but every future provider would add fields and branches. An IndexedDB version bump with a migration: more code for no benefit.

## R9. Eval: provider choice, pacing, retries, cost

**Decision**:
- `--provider anthropic|gemini`, inferred from the model prefix (`claude-` / `gemini-`) when omitted. Keys come from `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`.
- `--rpm N` paces requests (default: none for Anthropic, 8 for Gemini). Google publishes free-tier limits per model only in AI Studio, so the default is conservative and configurable **(verify against the key's AI Studio rate-limit page)**.
- A 429 (or 503) during the eval is retried with exponential backoff, honoring `RetryInfo.retryDelay` when Google sends it, up to 6 attempts. It is not graded. Only exhausted retries are recorded as `error: "rateLimited"`. The app's own single retry stays inside the adapter; the eval's backoff wraps it.
- A daily cap (429 with a per-day quota id) stops the run cleanly and writes a `-partial` result, rather than recording dozens of failures.
- `--free` marks the run as free tier: `costUsd` is 0, and `paidEquivalentUsd` still shows what the run would cost at paid prices (US2-4).
- Latency is measured around the adapter call, including the in-adapter retry, the same way for both providers.

**Rationale**: FR-012–FR-015. With 78 cases at 8 RPM, a run takes about 10 minutes, within any plausible free daily cap.

## R10. Price table

**Decision**: `eval/voice/prices.ts` holds explicit per-model prices in $ per million tokens: `input`, `output`, `cacheRead`, and `cacheWrite` (null when not applicable). An entry can have dated periods (`from`), because Gemini 3.8/3.6 Flash prices double on 2027-01-01. The run date picks the period. Unknown model → cost `null`, shown as "—" (FR-014).

Initial values (re-checked against Google's pricing page on 2026-10-10 during implementation: all Gemini rows match, including the 2027-01-01 change for 3.8/3.6 Flash; 3.5 Flash-Lite has no context caching on the free tier):

| Model | Input | Output (incl. thinking) | Cache read | Cache write |
|---|---|---|---|---|
| claude-sonnet-5 | 2.00 | 10.00 | 0.20 | 2.50 |
| claude-haiku-4-5 | 1.00 | 5.00 | 0.10 | 1.25 |
| claude-opus-5 | 5.00 | 25.00 | 0.50 | 6.25 |
| gemini-3.8-flash (until 2026-12-31) | 0.75 | 3.75 | 0.075 | — |
| gemini-3.8-flash (from 2027-01-01) | 1.50 | 7.50 | 0.15 | — |
| gemini-3.6-flash | same as 3.8 Flash | | | |
| gemini-3.5-flash-lite | 0.30 | 2.50 | 0.03 | — |
| gemini-3-flash-preview | 0.50 | 3.00 | 0.05 | — |

The Claude values are today's `PRICES` with the ×1.25 and ×0.1 multipliers written out, so Claude costs don't change. Implicit caching has no write or storage charge.

**Token normalization**: For Gemini, `input = promptTokenCount − cachedContentTokenCount`, `cacheRead = cachedContentTokenCount`, `output = candidatesTokenCount + thoughtsTokenCount` (thinking is billed as output). Thinking is also reported separately, so its share of latency and cost is visible.

## R11. Privacy notice and key guidance

**Decision**: When Gemini is selected, Settings shows three short Spanish notes (exact copy in [contracts/settings-ui.md](contracts/settings-ui.md)):
1. Where to get a free key (Google AI Studio → "Get API key").
2. On the free tier, Google may use prompts and responses to improve its products. Prompts contain the game state and the transcript. Use the paid tier if this matters.
3. Free-tier limits apply (requests per minute and per day). If a limit is reached, voice pauses and touch keeps working.

The privacy section names the selected provider instead of always saying "Anthropic". `docs/spec.md` §1, §3, §8 and the security section are updated in the same change.

**Rationale**: FR-004, constitution VII, and the workflow rule that product behavior changes update `docs/spec.md`.

## R12. Is Gemini Flash up for the task? (expected risks, to be confirmed by the eval)

| Risk | Why it may happen | How it shows in the eval | Mitigation available without breaking parity |
|---|---|---|---|
| Many tools (25–40) | Above Google's 10–20 recommendation | Lower accuracy across categories, wrong tool picked | Better descriptions (shared); later, round-scoped tool sets as a follow-up |
| Exact amounts and compound commands | Smaller models slip here | `payout`, `costs`, `compound` categories | Shared prompt examples |
| Malformed calls | Best-effort schema adherence | `malformed` count, "La orden llegó incompleta" | `ANY` → `VALIDATED` mode |
| Thinking latency | Thinking is on by default for 3.x Flash | p95 > 2.5 s | Lowest thinking level; 3.6 Flash with `minimal` |
| Free-tier quota | Few requests per minute and per day | Rate-limit retries in the eval | Pacing; the app's "límite" message |

The feature ships the ability to use and measure Gemini. Whether Settings *recommends* it depends on SC-002 (≥ 85%), as the spec says. Claude stays the default provider.

**Outcome (eval of 2026-10-10, details under R1)**:

| Risk | What the eval showed |
|---|---|
| Many tools (25–40) | Not a problem: `ANY` accepted every tool set, and 3.6 Flash reached 98.7% overall |
| Exact amounts and compound commands | 3.6 Flash: payout and costs 100%, compound 80% (4 of 5: `cp-01` reads «paga 290» as a cost). 3.8 Flash and Flash-Lite: compound 60% |
| Malformed calls | None on any model |
| Thinking latency | Confirmed for 3.8 Flash (p95 6.4 s, 5 timeouts). 3.6 Flash with `minimal` stays at p95 1.5 s |
| Free-tier quota | Not measured: the runs used a paid key |

**SC-002 is met, and every gate passes**: `gemini-3.6-flash` scores 98.7% overall (77 of 78, ≥ 85%), 97.9% on the OR subset, no category below 80%, and p95 1.5 s. It's the default Gemini model. Its one miss (`cp-01`) is a shared-prompt follow-up. Claude stays the default *provider*. Whether Settings should *recommend* Gemini waits for Claude's numbers on the same cases (T003/T040).
