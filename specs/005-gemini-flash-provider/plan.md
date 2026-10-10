# Implementation Plan: Gemini Flash as a Voice Provider

**Branch**: `005-gemini-flash-provider` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-gemini-flash-provider/spec.md`

## Summary

Users can pick Google Gemini (free tier) instead of Anthropic Claude to turn a Spanish transcript into an action. The eval can measure both providers on the same 78 cases, in one report format with cost per command.

The approach is to put a thin provider seam under the existing voice layer, without adding a second path to state:

1. **Neutral tools** ([R3](research.md#r3-sending-the-same-tools-to-gemini)): `buildToolSpecs(session)` keeps today's schema generation. `toAnthropicTools` is byte-identical to today's output, and `toGeminiTools` wraps the same specs as `functionDeclarations` with `parametersJsonSchema`.
2. **Neutral reply** ([R6](research.md#r6-one-response-format-for-both-providers)): adapters return a `ModelReply` (tool calls, stop reason, token usage). `resolveResponse` and the eval grader read only that, so validation, the pipeline and the confirmation card are shared (FR-007).
3. **Gemini adapter** ([R2](research.md#r2-plain-fetch-to-generatecontent-instead-of-a-google-sdk), [R4](research.md#r4-tool-choice-thinking-and-output-settings), [R5](research.md#r5-prompt-caching-on-gemini), [R7](research.md#r7-provider-errors)): plain `fetch` to `generateContent`. The key goes in a header. The adapter uses `ANY` tool mode, the lowest thinking level, an 8 s timeout and one retry, and orders the prefix for implicit caching. Errors map to a neutral kind and then to the shared Spanish messages.
4. **Settings** ([R8](research.md#r8-settings-storage-and-migration), [R11](research.md#r11-privacy-notice-and-key-guidance)): a provider choice, plus a key and a model per provider, with a read-time migration for existing users. The Gemini notes (key, privacy, limits) appear only when Gemini is selected.
5. **Eval** ([R9](research.md#r9-eval-provider-choice-pacing-retries-cost), [R10](research.md#r10-price-table)): `--provider`, `--rpm`, `--free`, 429 backoff, a dated per-model price table with cached-token prices, a neutral token format, and a `compare` script.

No new runtime dependency. No change to events, actions, game definitions or session files. Claude stays the default provider.

**Is Gemini Flash up for the task?** Probably, but it hasn't been proven. The main risk is the tool count (25–40, above Google's 10–20 guidance), then exact amounts and compound commands. The eval decides the default model among three stable candidates, and the 85% recommendation threshold (SC-002). See [research R12](research.md#r12-is-gemini-flash-up-for-the-task-expected-risks-to-be-confirmed-by-the-eval).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022; Node.js 22 for tooling and the eval

**Primary Dependencies**: react 19, zod 4, idb 8, @anthropic-ai/sdk (existing). Gemini is called with the platform `fetch`, so there is **no new dependency** ([R2](research.md#r2-plain-fetch-to-generatecontent-instead-of-a-google-sdk)).

**Storage**: The IndexedDB `settings` store, as key/value rows, with no DB version bump. New rows are `provider`, `apiKeys` and `models`. Legacy `apiKey`/`model` rows migrate on read ([data-model §1](data-model.md#1-settings-device-local)).

**Testing**: Vitest (unit, recorded responses, UI with Testing Library), Playwright e2e (unchanged), and the live voice eval `npm run eval:voice` (needs keys).

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus desktop browsers. The Gemini endpoint is called from the browser (CORS, with the user's own key).

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: Transcript to card under 3 s for 95% of commands (SC-003). The eval gate is a p95 API latency under 2.5 s, as today. Gemini uses the lowest thinking level its model allows.

**Constraints**:
- One provider request per command plus one retry (FR-010).
- An 8 s timeout.
- The stable prefix comes first for caching (FR-011).
- Keys stay on the device only, and are never in URLs, logs or exports (FR-002).
- Offline: voice is unavailable, and touch works.

**Scale/Scope**:
- 1 new adapter (about 150 lines), and a provider registry.
- Refactors of `tools.ts`, `interpreter.ts`, `resolve.ts`, `settingsRepo.ts`, `useVoice.ts` and `Settings.tsx`.
- Eval: `run.ts`, `grade.ts`, a new `prices.ts` and `compare.ts`.
- About 19 Gemini recorded fixtures, and about 6 new or extended test files.

**Unknowns resolved** (all in [research.md](research.md)):

| Unknown | Resolution |
|---|---|
| Which Gemini model and ID | R1: `gemini-3.6-flash`, chosen by the 2026-10-10 eval among 3.8 Flash / 3.6 Flash / 3.5 Flash-Lite (`gemini-3.8-flash` was the provisional pick) |
| SDK or REST | R2: REST via `fetch`, key in `x-goog-api-key` |
| Tool schema compatibility | R3: `parametersJsonSchema` (full JSON Schema) from the shared specs |
| Tool choice and thinking | R4: `ANY`, lowest thinking level per model, default temperature |
| Caching | R5: implicit caching, prefix order, minimum 4,096 tokens |
| Response and error mapping | R6, R7 |
| Settings migration | R8 |
| Free-tier pacing and cost | R9, R10 |

Values marked **(verify)** in research (model IDs, prices, rate limits, the schema keyword allowlist) are re-checked at implementation time. They are data, not design.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Constitution v1.1.0.

| Principle / Rule | Status | Notes |
|---|---|---|
| I. Event-Sourced Ledger | ✅ | No change to events or reduction. Voice still emits actions through `runPipeline` → one group. |
| II. Money Is Conserved | ✅ | Untouched. Gemini proposals are validated by the same pipeline and invariants. |
| III. Rules as Data | ✅ | No game logic. Provider differences live in the adapter and registry, not in domain code. |
| IV. Propose, Confirm, Undo | ✅ | `ModelReply` keeps only tool calls, so text can't reach state. Every Gemini failure (malformed, blocked, no call, errors) ends in "No entendí" with the touch fallback. Recorded tests prove zero state changes (SC-004). |
| V. Voice and Touch Parity | ✅ | Tools are still generated from the touch action schemas. The provider changes only the wire format. Settings controls are 48 px, and the provider is shown by name, not color. |
| VI. Test-First | ✅ | Adapter mapping, settings migration, price math and report shape are developed test-first from recorded JSON ([quickstart §1](quickstart.md#1-offline-checks-no-keys-run-in-ci)). Provider/model change → eval re-run for both providers before merge ([quickstart §2](quickstart.md#2-live-eval-needs-keys-spends-free-quota-or-money)). |
| VII. Local-First Simplicity | ✅ | No backend or proxy. One device-only key per provider, never exported or logged, never in a URL. Memory-only mode covers both keys. No speculative providers, only a registry shape that leaves room. |
| Platform: pluggable resolvers | ✅ | Same tools, instructions and snapshot ([contracts/voice-provider.md §1](contracts/voice-provider.md#1-inputs-identical-for-every-provider)). Same validation path (one `resolveResponse`). One call with the stable prefix first, plus implicit caching. Errors map to the shared messages. |
| Platform: eval gate before offering | ✅ | Gemini appears in Settings only after its eval run is recorded. The task order puts the eval before the Settings toggle ships ([quickstart §2](quickstart.md#2-live-eval-needs-keys-spends-free-quota-or-money)). |
| Platform: new dependencies | ✅ | None ([R2](research.md#r2-plain-fetch-to-generatecontent-instead-of-a-google-sdk)). |
| Platform: 3 s latency | ✅ (to measure) | The lowest thinking level, and the p95 gate in the eval. |
| Workflow: docs/spec.md | ✅ | §1 (voice resolved by "an AI provider: Claude or Gemini"), §3 (command resolution), §5 voice flow steps 3–4, §7 Settings and the privacy note, the security section (per-provider keys), and AI-1 extended for Gemini. |
| Workflow: eval reported | ✅ | The PR reports the Gemini candidates. Claude before and after (SC-006, ±2 points) is reported once an Anthropic key is available; until then, the offline byte-identity tests stand in. |

**Result**: PASS before Phase 0. Re-checked after Phase 1: PASS. One process note: there is no Claude eval baseline (`eval/voice/results/` is empty), and no Anthropic key is available for now, so the live Claude runs are **deferred**. Until a key exists, SC-006 is covered offline: Claude's prompt and tools must stay byte-identical (tested), and every recorded Claude response must resolve exactly as before. The Claude prompt and tools don't change, so the constitution's eval rule applies to the new Gemini provider, which can be measured with a free key. The live Claude comparison runs as soon as a key is available ([quickstart §2](quickstart.md#2-live-eval-needs-keys-spends-free-quota-or-money)).

## Project Structure

### Documentation (this feature)

```text
specs/005-gemini-flash-provider/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R12
├── data-model.md        # Phase 1: settings, ModelReply, registry, errors, prices, eval result
├── quickstart.md        # Phase 1: offline tests, live eval, manual check
├── contracts/
│   ├── voice-provider.md   # Adapter contract; Gemini wire format; recorded fixtures
│   ├── eval-report.md      # Eval CLI options and result file shape
│   └── settings-ui.md      # Settings Voz section, copy, availability messages
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/voice/
├── reply.ts              # NEW: ModelReply, ToolCall, TokenUsage, ReplyStop
├── errors.ts             # NEW: VoiceProviderError + kinds
├── tools.ts              # buildToolSpecs (neutral) + toAnthropicTools; buildTools kept as an alias
├── prompt.ts             # systemPromptEs unchanged; systemBlocks moves to the Anthropic adapter
├── interpreter.ts        # Interpreter type now returns ModelReply
├── providers/
│   ├── index.ts          # NEW: PROVIDERS registry, ProviderId, activeCredentials
│   ├── anthropic.ts      # NEW: today's createInterpreter + anthropicReply()
│   └── gemini.ts         # NEW: fetch adapter, toGeminiTools, geminiReply(), error mapping, thinking table
├── resolve.ts            # resolveResponse(ModelReply); "malformed" branch; resolveError + VoiceProviderError + NotFoundError
└── snapshot.ts, speech.ts  # unchanged

src/persistence/settingsRepo.ts  # provider, apiKeys, models; read-time migration; memory-only for both keys
src/app/useVoice.ts               # interpreter from PROVIDERS[provider]; per-provider availability message
src/app/voiceController.ts        # unchanged logic (types follow Interpreter)
src/ui/screens/Settings.tsx       # provider control, per-provider drafts, Gemini notes, provider-named privacy text

eval/voice/
├── run.ts                # --provider, --rpm, --free; pacing + 429 backoff; daily-cap stop
├── grade.ts              # gradeResponse(ModelReply); summarize with neutral tokens, stops, paid equivalent
├── prices.ts             # NEW: dated per-model price table (Claude + Gemini), priceFor, costOf
└── compare.ts            # NEW: side-by-side report of two result files

tests/voice/
├── recorded/gemini/*.json  # NEW: raw generateContent twins + Gemini-only scenarios
├── gemini.test.ts          # NEW: request shape, reply mapping, errors, retry
├── tools.test.ts           # + Anthropic byte-identity, Gemini parity and keyword allowlist
└── resolve.test.ts         # + both providers per scenario, parity
tests/persistence/settingsRepo.test.ts  # NEW: migration, per-provider keys, memory-only
tests/ui/settings.test.tsx, tests/ui/voice.test.tsx  # + provider switching and availability
tests/eval/voice.test.ts    # + prices, free tier, report shape
tests/security.test.ts      # + x-goog-api-key / apiKeys never logged

docs/spec.md                # provider-neutral wording, Settings, privacy, security
package.json                # + "eval:voice:compare" script (no dependency change)
```

**Structure Decision**: The existing single-project layout. Provider code lives under `src/voice/providers/`, so the domain and app layers stay provider-agnostic. Only the registry knows the list of providers.

## Implementation Order (for /speckit-tasks)

1. **Baseline** (*deferred: no Anthropic key yet*): when a key is available, run the Claude eval on the pre-change commit and keep the result (SC-006). Before that, take a snapshot test of today's `buildTools` and system prompt output for every fixture, which stands in as the offline baseline.
2. **Neutral seam, Claude only** (no behavior change): `reply.ts`, `errors.ts`, `buildToolSpecs`/`toAnthropicTools`, the Anthropic adapter, and `resolveResponse(ModelReply)`. All existing tests pass, and the Anthropic tool output matches the step 1 snapshot byte for byte.
3. **Eval neutral**: prices table, neutral tokens, report shape, `--provider/--rpm/--free`, and `compare.ts`. The live Claude re-run (±2 points) is deferred with step 1.
4. **Gemini adapter**: recorded fixtures, then mapping tests, then the adapter. Error and retry tests.
5. **Gemini eval** on the three candidates; pick the default model; record the results (constitution gate).
6. **Settings and availability** (US1, US3): repo migration, UI, notes, `useVoice`.
7. **docs/spec.md** and security test updates. Manual check ([quickstart §3](quickstart.md#3-manual-check-in-the-app-sc-001-us1-us3)).

Steps 2 and 3 are the P2 groundwork, and they also unblock P1. Step 6 ships after step 5, so Gemini isn't offered before it is measured.

## Complexity Tracking

No constitution violations. Two design choices worth recording:

| Choice | Why needed | Simpler alternative rejected because |
|---|---|---|
| A neutral `ModelReply` type between the adapters and `resolveResponse` | FR-007 and the constitution require one validation path for every provider | Branching `resolveResponse` on provider type would create two paths to state and double the tests |
| Hand-written `fetch` adapter instead of `@google/genai` | No new runtime dependency (platform rule); recorded tests stay pure | The SDK adds bundle weight and types for one endpoint, with no accuracy or speed gain |
