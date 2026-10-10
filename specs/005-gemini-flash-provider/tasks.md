---

description: "Task list for 005-gemini-flash-provider"
---

# Tasks: Gemini Flash as a Voice Provider

**Input**: Design documents from `specs/005-gemini-flash-provider/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI (Test-First) applies, and the plan and quickstart §1 list the test files. Write each test task first and confirm it fails before the matching implementation task.

**Organization**: Tasks are grouped by user story. Phase 2 is the provider-neutral seam (Claude only, no behavior change) that every story depends on.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task belongs to (US1, US2, US3)
- Paths are relative to the repository root (single-project PWA: `src/`, `tests/`, `eval/`)

## Constitution gate (read first)

Gemini must not be **offered** in Settings before its eval run is recorded (constitution: eval gate before offering; plan step 5 before step 6). The code for US1 can be written and tested before the eval, but T029 (the provider control in Settings) must not be merged or shipped until T037 has recorded a Gemini result. See Dependencies.

---

## Phase 1: Setup (offline baseline)

**Purpose**: Freeze today's Claude behavior before any refactor, so later phases can prove byte-identity (SC-006). There is no Anthropic key, so the live baseline is deferred. These snapshots stand in for it.

- [X] T001 Add a snapshot test to tests/voice/tools.test.ts that, for every fixture session in eval/voice/fixtures/ (loaded the way tests/eval/voice.test.ts loads them), records `JSON.stringify(buildTools(session))` and `systemPromptEs(session)` with Vitest file snapshots under tests/voice/__snapshots__/. Run it on the current, unmodified code and commit the generated snapshots. They are the offline Claude baseline and must not be regenerated during this feature.
- [X] T002 Add a snapshot test to tests/voice/resolve.test.ts that runs `resolveResponse` on every recorded Claude response in tests/voice/recorded/*.json (amend, bad-input, buy-private, clarification, compound, confirm, max-tokens, next-company, no-tool, not-understood, payout, query, refusal, undo, unknown-entity) and snapshots the resulting `VoiceResult`. Run it on unmodified code and commit the snapshot.
- [ ] T003 *(Deferred: needs ANTHROPIC_API_KEY.)* When a key is available, check out the last pre-005 commit in a worktree and run `npm run eval:voice -- --model claude-sonnet-5`, then keep the result in eval/voice/results/ as the SC-006 baseline (quickstart §2 step 0). Leave this task unchecked until then.

---

## Phase 2: Foundational (neutral seam, Claude only)

**Purpose**: Put `ModelReply`, `VoiceProviderError`, neutral tool specs, the Anthropic adapter, the provider registry and per-provider settings under the existing voice layer. Claude behavior must not change: the T001/T002 snapshots must still pass unchanged.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Types

- [X] T004 [P] Create src/voice/reply.ts exporting `ToolCall { readonly name: string; readonly input: Readonly<Record<string, unknown>> }`, `ReplyStop = "done" | "truncated" | "refused" | "malformed" | "other"`, `TokenUsage { input; output; cacheRead; cacheWrite; thinking }` (all `number`; `output` includes thinking tokens, `thinking` is a subset of output, `cacheWrite` is 0 for Gemini) and `ModelReply { provider: ProviderId; model: string; calls: readonly ToolCall[]; stop: ReplyStop; rawStop: string; usage?: TokenUsage }`, exactly as in data-model.md §2. Import `ProviderId` as a type from src/voice/providers/index.ts (created in T013; a type-only import cycle is fine).
- [X] T005 [P] Create src/voice/errors.ts exporting `ProviderErrorKind = "auth" | "permission" | "model" | "rateLimit" | "timeout" | "connection" | "service"` and `class VoiceProviderError extends Error` with readonly `kind`, optional `status?: number`, `retryAfterMs?: number`, `quota?: "minute" | "day"` (data-model.md §4). The constructor takes a message that must never contain the key or the request body.

### Neutral tools

- [X] T006 Add a test to tests/voice/tools.test.ts: for every fixture session, `toAnthropicTools(buildToolSpecs(session))` serializes byte-identically to the T001 snapshot of `buildTools(session)`, and `buildToolSpecs` returns `{ name, description, schema }[]` in `ACTION_TOOLS` order (filtered by the game) followed by `META_TOOLS`. Confirm it fails (functions missing).
- [X] T007 Refactor src/voice/tools.ts: extract `interface ToolSpec { readonly name: string; readonly description: string; readonly schema: Readonly<Record<string, unknown>> }` and `buildToolSpecs(session): ToolSpec[]` holding today's schema generation (same Zod schemas, entity enums, descriptions, sorted keys, order); add `toAnthropicTools(specs): Anthropic.Tool[]` that adds `input_schema` and `strict: true`; keep `buildTools(session)` as `toAnthropicTools(buildToolSpecs(session))`. T001 and T006 pass.

### Anthropic adapter and resolution

- [X] T008 [P] Create tests/voice/anthropic.test.ts: `anthropicReply(message, requestedModel)` maps `tool_use` blocks to `calls` in order (text blocks dropped); `stop_reason` `refusal` → `"refused"`, `max_tokens` → `"truncated"`, `end_turn`/`tool_use`/`stop_sequence` → `"done"`, anything else → `"other"`; `rawStop` keeps the original; usage maps `input_tokens`/`output_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens` to `input`/`output`/`cacheRead`/`cacheWrite` with `thinking: 0`; `provider: "anthropic"`. Use the recorded JSON in tests/voice/recorded/.
- [X] T009 Create src/voice/providers/anthropic.ts: move `createInterpreter` and `supportsEffort` from src/voice/interpreter.ts and `systemBlocks` from src/voice/prompt.ts into it (request unchanged: `messages.create`, `tools: toAnthropicTools(specs)`, system with `cache_control`, `tool_choice: auto`, `max_tokens: 1024`, effort `low` where supported, `timeout: 8000`, `maxRetries: 1`, per-session memoization). Add `anthropicReply()` and make the interpreter resolve to `ModelReply`. SDK errors still pass through unchanged. Update tests/voice/prompt.test.ts imports if `systemBlocks` moved.
- [X] T010 Change src/voice/interpreter.ts so `type Interpreter = (session: VoiceSession, userMessage: string) => Promise<ModelReply>`, and re-export `createInterpreter`/`supportsEffort` from ./providers/anthropic so existing imports keep compiling.
- [X] T011 Extend tests/voice/resolve.test.ts: (a) every recorded Claude response passed through `anthropicReply` then `resolveResponse` equals the T002 snapshot; (b) a `ModelReply` with `stop: "malformed"` → notUnderstood "La orden llegó incompleta."; `stop: "other"` with no calls → "No reconocí ninguna orden."; (c) `resolveError` maps each `VoiceProviderError` kind to the R7 Spanish message ("La clave de la API no es válida.", "La clave no tiene permiso para este modelo.", "Este modelo no está disponible para esta clave.", "Se alcanzó el límite de uso; prueba en un momento.", "La respuesta tardó demasiado.", "Sin conexión con el servicio de voz.", "Error del servicio de voz."), and the Anthropic SDK `NotFoundError` maps to the new "Este modelo no está disponible para esta clave."; existing SDK mappings unchanged.
- [X] T012 Update src/voice/resolve.ts: `resolveResponse(reply: ModelReply, ctx, transcript)` reading only `reply.stop` and `reply.calls`, with the order in data-model.md §2 (refused → truncated → **new** malformed branch → no calls → meta tools → actions via `ActionSchema` and `runPipeline`); `resolveError` handles `VoiceProviderError` by `kind` plus the existing `instanceof` checks and `NotFoundError` → model message. T002 and T011 pass.

### Registry and settings

- [X] T013 Create src/voice/providers/index.ts exporting `ProviderId = "anthropic"` (widened to include `"gemini"` in T027), `interface VoiceProvider { id; label; defaultModel; keyPlaceholder; keyHelpEs; notesEs: readonly string[]; modelPrefix; createInterpreter(apiKey, model): Interpreter }` (data-model.md §3), `PROVIDERS: Readonly<Record<ProviderId, VoiceProvider>>` with the Anthropic entry (label "Anthropic Claude", defaultModel "claude-sonnet-5", keyPlaceholder "sk-ant-…", keyHelpEs "Créala en console.anthropic.com, en un espacio de trabajo con límite de gasto mensual.", notesEs `[]`, modelPrefix "claude-"), `isProviderId(value)`, and `activeCredentials(settings) → { provider, apiKey?, model }` that never falls back to another provider's key.
- [X] T014 [P] Create tests/persistence/settingsRepo.test.ts (fake-indexeddb, as other persistence tests do): legacy rows `apiKey: "sk-ant-x"`, `model: "claude-x"` with no new rows read as `provider: "anthropic"`, `apiKeys: { anthropic: "sk-ant-x" }`, `models.anthropic: "claude-x"` and every other provider at its registry default; an unknown stored `provider` reads as `"anthropic"`; `models` missing a provider reads that provider's default; the first `set()` after a migrated read writes `provider`/`apiKeys`/`models` and deletes the legacy `apiKey`/`model` rows in the same transaction; a blank key (after trimming) removes that provider's entry; a blank model resets to the registry default; `rememberKey: false` stores no `apiKeys` row, keeps keys in memory for the page load and deletes a previously stored `apiKeys` row; saving one provider's key never changes another's.
- [X] T015 Refactor src/persistence/settingsRepo.ts to `Settings { provider: ProviderId; apiKeys: Readonly<Partial<Record<ProviderId, string>>>; models: Readonly<Record<ProviderId, string>>; rememberKey; voiceLocale; lastSessionId? }` with defaults from `PROVIDERS` (`provider: "anthropic"`, `apiKeys: {}`), the read-time migration and validation rules from data-model.md §1, and memory-only mode covering every provider's key. Remove `DEFAULT_MODEL` or re-point it to `PROVIDERS.anthropic.defaultModel`. T014 passes.
- [X] T016 Update callers to the new types with no visible change for Claude users: src/app/useVoice.ts (interpreter from `PROVIDERS[provider].createInterpreter(apiKey, model)` via `activeCredentials`; unavailable message "Añade tu clave de <label corto> en Ajustes", i.e. "Añade tu clave de Anthropic en Ajustes" — keep the existing wording if it already matches), src/app/voiceController.ts (types follow `Interpreter`), src/ui/screens/Settings.tsx (read/write `apiKeys.anthropic` and `models.anthropic`; no provider control yet). Update test fakes and fixtures that build `Anthropic.Message` interpreters or legacy settings in tests/ui/voice.test.tsx, tests/ui/rotla.test.tsx, tests/ui/privates.test.tsx, tests/ui/settings.test.tsx and tests/persistence/sessionRepo.test.ts to return `ModelReply` / use the new settings shape.
- [X] T017 Make the eval compile on `ModelReply` with no report change yet: in eval/voice/grade.ts change `gradeResponse` and `describeCalls` to take `ModelReply`; in eval/voice/run.ts call the Anthropic adapter's interpreter (`PROVIDERS.anthropic.createInterpreter`), and adapt `costOf` to read `TokenUsage`. Update tests/eval/voice.test.ts accordingly.
- [X] T018 Run `npm run typecheck && npm run lint && npm test`. All green, and the T001/T002 snapshot files are unchanged (`git diff --stat tests/voice/__snapshots__` empty).

**Checkpoint**: The seam is in place and Claude behaves byte-for-byte as before. User stories can start.

---

## Phase 3: User Story 1 - Use voice with a free Gemini key (Priority: P1) 🎯 MVP

**Goal**: A user picks Google Gemini in Settings, pastes a free key, keeps the default Flash model, and gets the same confirmation cards as with Claude, with every failure ending in a Spanish message and the touch fallback.

**Independent Test**: With only a Gemini key configured, issue payout, buy train, buy share, next company and undo commands. Each one gives the correct card or the touch fallback, and nothing changes until Confirmar (quickstart §3 steps 2–6).

### Tests for User Story 1 ⚠️ (write first, confirm they fail)

- [X] T019 [P] [US1] Create raw `generateContent` response bodies in tests/voice/recorded/gemini/: one twin per Claude scenario with the same file name and the same intended calls (amend, bad-input, buy-private, clarification, compound, confirm, max-tokens with `finishReason: "MAX_TOKENS"`, next-company, no-tool with only a text part, not-understood, payout, query, refusal with `finishReason: "SAFETY"`, undo, unknown-entity), plus Gemini-only `blocked-prompt.json` (`promptFeedback.blockReason`, no candidates), `malformed-call.json` (`MALFORMED_FUNCTION_CALL`), `no-args.json` (a `functionCall` with no `args`) and `text-and-call.json` (a text part plus a call). Include realistic `usageMetadata` (`promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`) and `modelVersion`, following the example in contracts/voice-provider.md §4.
- [X] T020 [P] [US1] Extend tests/voice/tools.test.ts: for every fixture session, `toGeminiTools(buildToolSpecs(s))` returns exactly one `{ functionDeclarations }` entry whose names, order, descriptions and entity enums equal the Anthropic tools'; each declaration uses `parametersJsonSchema` (not `parameters`); and every schema node uses only keywords from an explicit allowlist (`type`, `properties`, `required`, `enum`, `anyOf`, `items`, `description`, `additionalProperties`, `minimum`, `maximum`, `const`, plus any others found necessary — mark the allowlist **(verify)** until T037's first live call succeeds).
- [X] T021 [P] [US1] Create tests/voice/gemini.test.ts with a stubbed `fetch`: **request** — POST to `https://generativelanguage.googleapis.com/v1beta/models/{encodeURIComponent(model)}:generateContent`, key only in the `x-goog-api-key` header and never in the URL, body key order `systemInstruction`, `tools`, `toolConfig`, `contents`, `generationConfig`, `systemInstruction` text equals `systemPromptEs(session)`, `toolConfig.functionCallingConfig.mode === "ANY"`, `maxOutputTokens: 1024`, `thinkingConfig.thinkingLevel` `"low"` for `gemini-3.8-flash`, `"minimal"` for `gemini-3.6-flash` and `gemini-3-flash-preview`, omitted for `gemini-3.5-flash-lite` and unknown models, no `safetySettings`, and the serialized `systemInstruction`+`tools` prefix byte-identical across two commands on the same session; **reply** — `geminiReply(raw, requestedModel)` for each T019 fixture per the mapping table in contracts/voice-provider.md §4 (calls in order, missing `args` → `{}`, text/thought parts dropped, finishReason → stop per research R6, no candidates or `blockReason` → `refused` with no calls, `modelVersion` fallback, token normalization `input = promptTokenCount − cachedContentTokenCount`, `output = candidatesTokenCount + thoughtsTokenCount`, `cacheWrite: 0`); **errors** — 400 `API_KEY_INVALID` and 401 → `auth`, 403 → `permission`, 404 or 400 naming an unknown model → `model`, 429 → `rateLimit` with `retryAfterMs` from `RetryInfo.retryDelay` and `quota: "day"` when the violated quota id contains `PerDay`, abort after 8 s (fake timers) and 504 → `timeout`, `fetch` `TypeError` → `connection`, other non-2xx or non-JSON body → `service`; **retry** — exactly one retry on `rateLimit`, `service` ≥ 500, 504 and `connection` (wait ≤ 1 s, or `retryAfterMs` when ≤ 1 s), never on `auth`/`permission`/`model`, so at most 2 fetch calls per command (FR-010); error messages never contain the key.
- [X] T022 [P] [US1] Extend tests/voice/resolve.test.ts: for every shared scenario, `resolveResponse(geminiReply(gemini/<s>))` deep-equals `resolveResponse(anthropicReply(<s>))` (parity, FR-007, FR-016); `blocked-prompt` and `refusal` → notUnderstood "La orden fue rechazada."; `malformed-call` → "La orden llegó incompleta."; `text-and-call` resolves only the call; `no-args` resolves like a call with `{}`; for every Gemini fixture, the session state is unchanged after resolution until a confirm is dispatched (SC-004).

### Implementation for User Story 1

- [X] T023 [US1] Add `toGeminiTools(specs): [{ functionDeclarations: { name, description, parametersJsonSchema }[] }]` to src/voice/tools.ts, plus a small `geminiSchema()` pass that removes any keyword outside the T020 allowlist. T020 passes.
- [X] T024 [US1] Create src/voice/providers/gemini.ts with the pure `geminiReply(raw, requestedModel): ModelReply` mapper (finishReason table from research R6: `STOP` → done; `MAX_TOKENS` → truncated; `SAFETY`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `RECITATION`, `IMAGE_*`, any `blockReason`, no candidates → refused; `MALFORMED_FUNCTION_CALL`, `MALFORMED_RESPONSE`, `UNEXPECTED_TOOL_CALL`, `TOO_MANY_TOOL_CALLS` → malformed; anything else → other). T022 and the reply part of T021 pass.
- [X] T025 [US1] Add `toVoiceProviderError(response | error)` to src/voice/providers/gemini.ts implementing the error table in contracts/voice-provider.md §4, reading `error.status`, `details[].reason`, `RetryInfo.retryDelay` and the violated quota id, without putting the key, headers or full body in the message.
- [X] T026 [US1] Add `createGeminiInterpreter(apiKey, model): Interpreter` to src/voice/providers/gemini.ts: memoize the serialized `systemInstruction` and `tools` per `session` object; build the body in the contract key order with `THINKING_LEVEL` table and `TOOL_MODE = "ANY"` constants; `fetch` with an `AbortController` 8 s timeout per attempt; one retry per the T021 rules; no logging of key, headers or bodies. All of T021 passes.
- [X] T027 [US1] Register Gemini in src/voice/providers/index.ts: widen `ProviderId` to `"anthropic" | "gemini"` and add the entry (label "Google Gemini", defaultModel "gemini-3.8-flash", keyPlaceholder "AIza…", keyHelpEs "Consigue una clave gratis en Google AI Studio (aistudio.google.com) → «Get API key».", notesEs = the two notes verbatim from contracts/settings-ui.md, modelPrefix "gemini-", createInterpreter `createGeminiInterpreter`). Confirm T014 still passes with the second provider (defaults now include `models.gemini`).
- [X] T028 [P] [US1] Extend tests/ui/settings.test.tsx with contracts/settings-ui.md tests 2 and 4 (select Gemini, paste a key, keep the default model, Guardar → `provider: "gemini"`, `apiKeys.gemini` set, `apiKeys.anthropic` unchanged; Gemini notes visible only when Gemini is selected) plus: the key field label is "Clave de Gemini" with placeholder "AIza…", `type=password`, `autoComplete="off"`; the model placeholder is the provider default; the privacy text names the selected provider; provider options are ≥ 48 px and identified by name. Extend tests/ui/voice.test.tsx: Gemini selected with only a Claude key → mic unavailable with "Añade tu clave de Gemini en Ajustes" and no request to either provider; Gemini selected with a key and a stubbed interpreter → the same confirmation card as Claude for a payout; a `VoiceProviderError("model")` → "Este modelo no está disponible para esta clave." with the touch fallback.
- [X] T029 [US1] **(Ship gate: do not merge before T037 is recorded.)** Update src/ui/screens/Settings.tsx per contracts/settings-ui.md: a "Proveedor" segmented control (radio semantics, 48 px targets, labels from `PROVIDERS`), "Clave de <Proveedor>" field with the registry placeholder and key help line, "No recordar las claves en este dispositivo" checkbox, model field with the provider default as placeholder, the Gemini notes only when Gemini is selected, and the privacy text "La transcripción y el estado de la partida se envían a **<Proveedor seleccionado>** para interpretar la orden. Las claves solo se guardan en este dispositivo y nunca se incluyen al exportar una partida." Update src/app/useVoice.ts so the unavailable message uses the selected provider's short name. T028 passes.
- [X] T030 [P] [US1] Extend tests/security.test.ts: no `console.*`/log call in src/ touches `apiKeys` or `x-goog-api-key`, src/voice/providers/gemini.ts never builds a URL containing `key=`, and a session export (and bug report, if present) contains neither a stored Anthropic nor Gemini key (US1 scenario 4, FR-002).

**Checkpoint**: Gemini works end to end in tests. It can be offered to users once T037 has recorded the Gemini eval.

---

## Phase 4: User Story 2 - Compare providers on the eval set (Priority: P2)

**Goal**: The eval runs against either provider with the same cases and grading, paces free-tier requests, and writes reports with the same shape (accuracy, latency, neutral tokens, cost, paid equivalent), plus a side-by-side compare script.

**Independent Test**: Run the eval once per provider on the full case set. Both result files have identical keys, and `npm run eval:voice:compare` prints accuracy, latency, stops and paid cost per command side by side (SC-005).

### Tests for User Story 2 ⚠️ (write first, confirm they fail)

- [X] T031 [P] [US2] Extend tests/eval/voice.test.ts: `priceFor(model, date)` picks the latest period with `from <= date` (gemini-3.8-flash: 0.75/3.75/0.075 on 2026-12-31, 1.50/7.50/0.15 on 2027-01-01); unknown model → `undefined`; `costOf(usage, price)` charges `cacheRead` tokens at the input price when `cacheRead` price is null and the summary adds a `priceNotes` entry; Claude costs equal today's numbers for the same usage; Gemini token normalization from a T019 fixture; `summarize` with `freeTier: true` → `costUsd: 0`, `costPerCaseUsd: 0`, `paidEquivalentUsd` > 0; unknown price and not free → `costUsd: null` and `paidEquivalentUsd: null`; Anthropic → `paidEquivalentUsd === costUsd`; Anthropic and Gemini summaries have identical key sets (every field present, `0`/`null` when not applicable); `stops` counts per `ReplyStop`; `rateLimitRetries`; gate keys: Anthropic has the 4 existing gates, Gemini the first 3 with "cache reads > 0" reported as info only; records carry `stop`, `rawStop` and neutral `usage`.
- [X] T032 [P] [US2] Add tests for the eval's pure CLI helpers in tests/eval/voice.test.ts: `parseArgs` defaults and options from contracts/eval-report.md (`--model`, `--provider` inferred from `claude-`/`gemini-` prefix, anthropic when no model is given, `--runs`, `--only` → `-partial` file name, `--rpm` default none for anthropic and 8 for gemini, `--free`); a model whose prefix contradicts `--provider` and a missing `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` produce an error naming the problem; the backoff schedule (2 s, 4 s, 8 s, … capped at 60 s, or the server `retryDelay` if longer; at most 6 attempts; then `error: "rateLimited"`); a 429 with `quota: "day"` signals stop-and-write-partial; the pacer spaces requests at `60000 / rpm` ms (fake timers).
- [X] T033 [P] [US2] Add a test for `formatComparison(a, b)` (eval/voice/compare.ts) in tests/eval/voice.test.ts: given two summaries (one Claude, one Gemini free tier), the output lists overall and per-category accuracy, p50/p95, stop counts and paid cost per command for each, with the difference column; an older result file without the new fields still compares `overall`/`byCategory`.

### Implementation for User Story 2

- [X] T034 [P] [US2] Create eval/voice/prices.ts with `PricePeriod { from?: string; input: number; output: number; cacheRead: number | null; cacheWrite: number | null }`, `PRICES` with the research R10 table (claude-sonnet-5 2.00/10.00/0.20/2.50, claude-haiku-4-5 1.00/5.00/0.10/1.25, claude-opus-5 5.00/25.00/0.50/6.25, gemini-3.8-flash 0.75/3.75/0.075/null until 2026-12-31 then 1.50/7.50/0.15/null from 2027-01-01, gemini-3.6-flash same as 3.8 Flash, gemini-3.5-flash-lite 0.30/2.50/0.03/null, gemini-3-flash-preview 0.50/3.00/0.05/null; mark the table **(verify)** with the check date), `priceFor(model, date)` and `costOf(usage, price)`. Remove `PRICES`/`costOf` from eval/voice/grade.ts.
- [X] T035 [US2] Update eval/voice/grade.ts: `RunRecord` gains `stop`, `rawStop`, neutral `usage: TokenUsage`, and `error` may be `"rateLimited"`; `summarize(records, { provider, model, freeTier, rateLimitRetries, date })` produces the summary in contracts/eval-report.md (`provider`, `freeTier`, neutral `tokens`, `costUsd`, `costPerCaseUsd`, `paidEquivalentUsd`, `paidPerCaseUsd`, `priceNotes`, `stops`, `rateLimitRetries`, `cacheReadRate`, provider-specific `gates`), honoring the invariants listed there. T031 passes.
- [X] T036 [US2] Update eval/voice/run.ts: extract pure `parseArgs`, `backoffDelay` and a pacer; select the adapter from `PROVIDERS[provider]` with the key from `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` (exit 1 naming the variable if missing; exit 1 on prefix/provider mismatch); pace to `--rpm`; wrap each interpreter call in the 429/503 backoff (not graded), count `rateLimitRetries`, record `error: "rateLimited"` after 6 attempts, stop on a daily-quota 429 and write `<date>-<model>-partial.json`; measure latency around the adapter call; print the console output from contracts/eval-report.md (header with provider and "(free tier)", `wait` retry lines, stops, tokens with thinking, cost and paid equivalent, rate-limit retries, gates). T032 passes.
- [X] T037 [US2] *(Live: needs GEMINI_API_KEY; spends free quota.)* Run `npm run eval:voice -- --model gemini-3.8-flash --free`, then `gemini-3.6-flash` and `gemini-3.5-flash-lite`, with `--rpm` below the key's AI Studio limits. Fix any 400 caused by a schema keyword (adjust the T020 allowlist and `geminiSchema()`), then confirm the T020 allowlist and the thinking-level table as verified. Commit the three result files in eval/voice/results/. Record per candidate: overall vs 85% (SC-002) or the per-category gap, p95 vs 2.5 s, malformed/refused counts, cache-read rate. **This is the constitution gate for T029.**
- [X] T038 [US2] Pick the default Gemini model from T037 (the best candidate that passes the gates); if it is not `gemini-3.8-flash`, update `defaultModel` in src/voice/providers/index.ts, the T021 expectations and specs/005-gemini-flash-provider/data-model.md §1/§3. Add a short "Eval results" note to specs/005-gemini-flash-provider/research.md R1/R12 with the numbers and whether Gemini meets SC-002.
- [X] T039 [P] [US2] Create eval/voice/compare.ts (read-only: loads two result files, prints `formatComparison`) and add `"eval:voice:compare": "tsx eval/voice/compare.ts"` to package.json scripts (no dependency change). T033 passes.
- [ ] T040 [US2] *(Deferred: needs ANTHROPIC_API_KEY.)* Re-run `npm run eval:voice -- --model claude-sonnet-5` on this branch, compare with the T003 baseline via `npm run eval:voice:compare`, and confirm overall within ±2 points (SC-006). Until then, T001/T002/T018 stand in.

**Checkpoint**: Both providers produce comparable reports; Gemini has a recorded eval, so T029 may ship.

---

## Phase 5: User Story 3 - Switch providers without losing setup (Priority: P3)

**Goal**: Each provider keeps its own key and model; switching is one choice in Settings, existing users stay on Claude, and a command in flight finishes on the provider it started with.

**Independent Test**: Save keys for both providers, switch back and forth in Settings, issue a command after each switch: the selected provider answers and neither key is lost (quickstart §3 step 7).

### Tests for User Story 3 ⚠️ (write first, confirm they fail)

- [X] T041 [P] [US3] Extend tests/ui/settings.test.tsx with contracts/settings-ui.md tests 1, 3 and 5: (1) legacy `apiKey`/`model` rows → Claude selected, key and model shown, voice available; (3) with both drafts edited, switching the control back and forth before Guardar keeps both drafts, and after saving and switching back to Claude the Claude key is still there without retyping; Guardar saves `provider`, both keys and both models in one `set()` and fires `SETTINGS_CHANGED`; (5) "No recordar las claves en este dispositivo" → neither key is in IndexedDB after save.
- [X] T042 [P] [US3] Extend tests/ui/voice.test.tsx: with keys for both providers, switching the provider makes the next command call the new provider's interpreter with its own model (US3-1); a command started before the switch resolves with the interpreter it captured (spec edge case); an upgraded user with only legacy Claude rows gets Claude answers unchanged (US3-2).

### Implementation for User Story 3

- [X] T043 [US3] Update src/ui/screens/Settings.tsx to keep per-provider drafts (key and model for every `ProviderId`) in component state, swap the visible fields when the control changes, and save everything in one `settingsRepo.set()` followed by `SETTINGS_CHANGED`. T041 passes.
- [X] T044 [US3] Make sure src/app/useVoice.ts rebuilds the interpreter memo on `SETTINGS_CHANGED` keyed by `(provider, apiKey, model)`, and that src/app/voiceController.ts captures the interpreter at command start rather than reading it at resolve time. Change only what T042 shows is needed. T042 passes.

**Checkpoint**: All three stories work independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T045 [P] Update docs/spec.md: §1 (voice resolved by "an AI provider: Claude or Gemini"), §3 (command resolution is provider-neutral), §5 voice flow steps 3–4, §7 Settings (provider control, per-provider key and model, Gemini notes) and the privacy note naming the selected provider, the security section (per-provider keys, `x-goog-api-key` header, memory-only covers both), and AI-1 extended for Gemini.
- [X] T046 [P] Re-check every value marked **(verify)** in specs/005-gemini-flash-provider/research.md against Google's docs (model IDs, thinking levels, prices and their 2027-01-01 change, free-tier limits, schema keyword allowlist) and update eval/voice/prices.ts, the thinking table in src/voice/providers/gemini.ts and the research file with the check date.
- [X] T047 Confirm no new runtime dependency (`git diff main -- package.json` shows only the `eval:voice:compare` script) and that eval/voice/prices.ts is not imported from src/.
- [X] T048 Run quickstart §1: `npm run typecheck && npm run lint && npm test`, all green, T001/T002 snapshots unchanged.
- [ ] T049 *(Manual: needs the user, a phone or mic, and a Gemini key.)* Run quickstart §3 steps 1–8 (fresh profile under 5 minutes, SC-001; payout card; compound and undo; wrong key; `gemini-nope` model; switch to Claude and back; export has no key) and note the results in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: none. T001 and T002 must run on unmodified code, before any Phase 2 change. T003 is deferred and blocks only T040.
- **Phase 2 (Foundational)**: after T001–T002. Blocks every story.
- **Phase 3 (US1)**: after Phase 2. Code and tests can be completed before US2, but **T029 must not ship before T037** (constitution eval gate).
- **Phase 4 (US2)**: after Phase 2. T037 also needs T026–T027 (the Gemini adapter and registry entry from US1), since it runs Gemini.
- **Phase 5 (US3)**: after Phase 2 and T029 (the Settings provider control it extends).
- **Phase 6 (Polish)**: after the stories you intend to ship. T049 after T029 and T037.

### Within phases

- T004, T005 → T006/T007 → T008 → T009 → T010 → T011 → T012; T013 → T014/T015 → T016 → T017 → T018.
- US1: T019–T022 (tests, parallel) → T023 → T024 → T025 → T026 → T027 → T028 → T029; T030 any time after T026.
- US2: T031–T033 (tests, parallel) → T034 → T035 → T036 → T037 → T038; T039 after T033 and T035; T040 after T003, T036 and T039.
- US3: T041, T042 → T043, T044.

### Story dependencies

- **US1 (P1)**: independent after Phase 2; offered to users only after US2's T037.
- **US2 (P2)**: the offline parts (T031–T036, T039) are independent after Phase 2; the live run T037 needs US1's adapter.
- **US3 (P3)**: builds on US1's Settings control (T029).

## Parallel Opportunities

- Phase 2: T004 ∥ T005; T008 ∥ T006; T014 ∥ T007–T012.
- US1 tests: T019 ∥ T020 ∥ T021 ∥ T022 (different files; T021/T022 read T019's fixtures, so write the fixtures first or together). T030 ∥ T028.
- US2: T031 ∥ T032 ∥ T033 (same test file, different `describe` blocks — split across people only if merging is easy), T034 ∥ T039 after their tests.
- US2's offline work (T031–T036) can run in parallel with US1 (T019–T028) once Phase 2 is done.
- Polish: T045 ∥ T046.

### Parallel example: User Story 1

```text
Task: "T019 Create Gemini recorded fixtures in tests/voice/recorded/gemini/"
Task: "T020 Gemini tool parity and keyword allowlist test in tests/voice/tools.test.ts"
Task: "T021 Gemini adapter request/reply/error/retry tests in tests/voice/gemini.test.ts"
Task: "T030 Security test for apiKeys and x-goog-api-key in tests/security.test.ts"
```

### Parallel example: User Story 2

```text
Task: "T034 Price table in eval/voice/prices.ts"
Task: "T039 Compare script in eval/voice/compare.ts + package.json script"
```

---

## Implementation Strategy

### MVP first (User Story 1, gated by the Gemini eval)

1. Phase 1: freeze the offline Claude baseline (T001–T002).
2. Phase 2: the neutral seam, with Claude unchanged (T004–T018).
3. Phase 3: the Gemini adapter and Settings (T019–T030), tested offline.
4. US2's T034–T037 far enough to record the Gemini eval (the constitution gate), then T038.
5. **Stop and validate**: quickstart §3 (T049). Ship US1.

### Incremental delivery

1. Setup + Foundational → no visible change, Claude byte-identical.
2. US1 + Gemini eval → Gemini offered in Settings (MVP).
3. Rest of US2 (compare script) → side-by-side reports.
4. US3 → painless switching between providers.
5. Deferred Claude runs (T003, T040) once an Anthropic key exists.

## Notes

- Tasks marked *Deferred*, *Live* or *Manual* need a key or the user; leave them unchecked rather than faking results.
- Never regenerate the T001/T002 snapshots during this feature: they are the Claude regression baseline.
- Keys must never appear in URLs, logs, error messages, exports or test snapshots.
- Commit after each task or logical group.
