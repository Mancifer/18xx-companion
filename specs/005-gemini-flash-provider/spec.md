# Feature Specification: Gemini Flash as a Voice Provider

**Feature Branch**: `005-gemini-flash-provider`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "I was thinking about adding support for gemini flash, since it's a free model and it's fairly easy to setup an API key, at least to test out the voice commands. Maybe we should modify the prompt to have it return a structured response, like in json format so we can have a deterministic response that we can measure, making it easier to calculate costs in other models. Or maybe even explore the posibility of using JEV or other Typesafe AI for faster results?, Although for now I would focus on gemini flash. Let me know if this model is not up for the task"

## Background

Today, voice commands are resolved by one AI provider (Anthropic Claude). The user brings their own paid key. That cost is a barrier to trying voice at all. Google's Gemini Flash models have a free tier, and getting a key takes a couple of minutes. That makes them a good way to try voice before paying for anything.

**What already exists, and what this means for the request**

| Request | Current state | What this feature does |
|---|---|---|
| "Return a structured response (JSON) so it is deterministic and measurable" | Already in place. The model can only answer with **structured tool calls** generated from the same action schemas touch uses. Entity fields are limited to this session's companies and players. Every call is validated against game state before the confirmation card appears. Free text never changes state (Constitution IV). | Keeps this contract. Gemini must answer through the **same** action vocabulary and the same validation, not a separate JSON format. |
| "Easier to calculate costs in other models" | The voice eval already records accuracy, latency (p50/p95), tokens, and cost per case, but only for Claude models and Claude's token accounting. | Makes the eval provider-neutral, so Claude and Gemini results can be compared on the same 78 cases, side by side. |
| "JEV or other type-safe AI for faster results" | The term is not recognized. The closest ideas are type-safe structured-output libraries. The app already gets type safety from its schemas and validation, so a library would not add accuracy and would not obviously add speed. | **Out of scope.** Latency is measured per provider here; if it turns out to be the bottleneck, that can be a later feature. |

**Is Gemini Flash up for the task?** Probably yes, with caveats this spec must handle:

- **Capable enough**: Flash models support function calling with enumerated values, handle Spanish well, and are fast. That should fit the 3-second transcript-to-card target. Whether accuracy is good enough has to be **measured on the eval set**, not assumed. Precise money amounts and multi-action ("compound") commands are where smaller models usually slip.
- **Weaker output guarantees**: Claude's tools are enforced strictly against the schema. Gemini's are best-effort, so malformed or partial calls will happen more often. The app's existing validation and "not understood → touch fallback" path covers this, but the rate has to be measured.
- **Privacy on the free tier**: Google may use free-tier prompts and responses to improve its products. Prompts contain the game state and the spoken transcript, not personal data, but users must be told this.
- **Free-tier rate limits**: These are a few requests per minute and a daily cap. That is plenty for one table (a command every minute or so), but a full eval run must pace itself.
- **Constitution**: v1.1.0 (amended 2026-10-10) allows pluggable AI resolvers. Each must use the shared action tools and validation path, and must pass the eval set before it is offered.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use voice with a free Gemini key (Priority: P1)

A player who doesn't want to pay for an AI key opens Settings, chooses Google Gemini as the voice provider, pastes a free Gemini key, and keeps the suggested Flash model. At the table, they hold push-to-talk and say "la PRR paga 240". The same confirmation card appears as with Claude, and they confirm it.

**Why this priority**: This is the whole point of the feature. It removes the cost barrier to trying voice.

**Independent Test**: With only a Gemini key configured, run a session and issue common voice commands (payout, buy train, buy share, next company, undo). Each one produces the correct confirmation card or falls back to touch input.

**Acceptance Scenarios**:

1. **Given** Gemini is the selected provider with a valid key, **When** the user says a supported command, **Then** a confirmation card shows the same proposed action that touch input would create, and nothing changes until the user confirms.
2. **Given** Gemini is selected, **When** the model returns a call that is malformed, names something that doesn't exist, or returns free text only, **Then** the app shows the transcript with the touch fallback, as it does today for Claude, and state is unchanged.
3. **Given** Gemini is selected and the key is invalid, quota is exhausted, or the request times out, **When** the user issues a command, **Then** a clear Spanish message says what happened (invalid key / limit reached, try again shortly / too slow / no connection), and the touch fallback is offered.
4. **Given** a Gemini key is saved, **When** the user exports a session or a bug report, **Then** the key is not included.

---

### User Story 2 - Compare providers on the eval set (Priority: P2)

The developer runs the voice eval against a Gemini Flash model and against a Claude model. Both runs use the same cases, the same session snapshots, and the same grading. Each produces a report with accuracy per category, latency, token use, and cost, so the developer can see whether Gemini is good enough and how much each provider costs per command.

**Why this priority**: The constitution requires every model change to be measured on the eval set before it ships. It is also how we answer "is Gemini up for the task" with numbers.

**Independent Test**: Run the eval once per provider on the full case set. Both result files exist, have the same structure, and can be read side by side.

**Acceptance Scenarios**:

1. **Given** a Gemini key is available to the eval, **When** the developer runs it for a Gemini model, **Then** every case is graded with the same rules used for Claude, and the report includes accuracy, latency p50/p95, input/output/cached tokens, and estimated cost.
2. **Given** a free-tier key with per-minute limits, **When** the eval runs, **Then** it paces requests and retries rate-limited calls instead of recording them as failures.
3. **Given** a model with no known price (e.g. a free-tier-only or new model), **When** the eval runs, **Then** cost shows as unknown (or zero when the user says the run is free) instead of a wrong figure.
4. **Given** results from two providers, **When** the developer compares them, **Then** a per-command cost estimate (paid pricing) is shown for each, so free and paid options can be compared fairly.

---

### User Story 3 - Switch providers without losing setup (Priority: P3)

A user tries Gemini for free, then later switches to Claude (or back). Each provider keeps its own key and model choice, so switching is a single choice in Settings.

**Why this priority**: This makes it easy to try and compare. It is useful, but not needed for the first use.

**Independent Test**: Save keys for both providers, switch back and forth, and issue a command after each switch. The right provider answers, and neither key is lost.

**Acceptance Scenarios**:

1. **Given** keys for both providers are saved, **When** the user switches the provider, **Then** the next command goes to the newly selected provider with its own model, and the other key is kept.
2. **Given** an existing user upgrading with only a Claude key, **When** they open the app, **Then** Claude stays selected and works exactly as before.

---

### Edge Cases

- The provider is switched while a command is in flight: that command finishes with the provider it started on, and the next command uses the new one.
- Gemini returns several calls for a compound command ("compra un tres y paga 240"): these are handled like Claude's multi-call answers today (shown as one proposal, or "not understood" if invalid).
- Gemini returns a function call plus free text: the text is ignored for state changes, as it is today.
- The model ID the user types doesn't exist for that provider: a clear "model not available for this key" message, plus the touch fallback.
- The user selects Gemini but has no Gemini key (only a Claude key): voice is unavailable and the app asks for a key. It does not silently use the other provider.
- Gemini's safety filter blocks a response: this is treated like a refusal, so "not understood" plus the touch fallback.
- The free-tier daily cap is reached mid-game: the "limit reached" message appears and the touch flow continues normally.

## Requirements *(mandatory)*

### Functional Requirements

**Provider choice and settings**

- **FR-001**: Users MUST be able to choose the voice provider in Settings: Anthropic Claude (default) or Google Gemini.
- **FR-002**: The app MUST keep a separate API key and model ID for each provider. Both follow the existing rules: stored on the device only, the optional "don't remember" (memory-only) mode, and never included in exports, logs, or bug reports.
- **FR-003**: When Gemini is selected, the model field MUST suggest a current Gemini Flash model as the default.
- **FR-004**: Settings MUST show short Spanish notes for Gemini: where to get a free key, that free-tier usage may be used by Google to improve its products, and that free-tier limits apply.
- **FR-005**: Existing users' settings MUST migrate with no action: Claude selected, with their current key and model kept.

**Command resolution parity**

- **FR-006**: Gemini MUST be given the same action vocabulary, descriptions, session entity restrictions (companies, players), system instructions, and context snapshot as Claude. Only the format sent to each provider may differ.
- **FR-007**: Gemini's answers MUST go through the same validation and resolution path as Claude's, and produce the same proposals, clarifications, queries, undo/amend, and "not understood" results.
- **FR-008**: No Gemini output MUST change state without user confirmation. Free text MUST NOT change state, and queries MUST be answered from app state (Constitution IV).
- **FR-009**: Provider errors (invalid key, no permission or unknown model, rate or quota limit, timeout, no connection, blocked by safety filter, other service error) MUST map to the existing Spanish user messages and the touch fallback.
- **FR-010**: One spoken command MUST result in at most one provider request plus the existing single retry, as today.
- **FR-011**: The request MUST be arranged so the parts that stay the same during a session (instructions, game definition, actions) can benefit from provider-side caching where the provider offers it, with the changing snapshot last.

**Evaluation and cost measurement**

- **FR-012**: The voice eval MUST be able to target either provider by model ID or an explicit provider option, using the same cases, fixtures, and grading.
- **FR-013**: Eval results MUST record, for every provider and in the same structure: accuracy overall and per category, latency p50/p95, input tokens, output tokens, cached input tokens, estimated total cost, and cost per case.
- **FR-014**: Cost MUST be calculated from a per-model price table that covers both providers, including cached-token pricing where the provider has it. When a model's price is unknown, cost MUST be reported as unknown, never guessed.
- **FR-015**: The eval MUST stay within a configurable request rate, and MUST retry rate-limited requests with backoff instead of grading them as failures.
- **FR-016**: Recorded-response tests (the offline test fixtures) MUST cover Gemini answers for the same scenarios already covered for Claude (proposal, compound, clarification, query, undo, amend, not understood, refusal/blocked, bad input, unknown entity, no tool call, truncated output).

### Key Entities

- **Voice provider**: Which AI service resolves commands (Claude or Gemini). It has a display name, a default model, and a key-setup note.
- **Provider credentials**: The API key and chosen model for each provider, stored only on the device.
- **Price entry**: A model's price per million input, output, and cached tokens. It is used only for eval cost estimates.
- **Eval run result**: One provider and model run over the case set, with accuracy, latency, token, and cost summaries in a shared format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user with no paid AI account can go from a fresh install to a working voice command in under 5 minutes, using only a free Gemini key.
- **SC-002**: With Gemini Flash, at least 85% of eval cases resolve correctly. If not, the eval report states the gap per category, so the decision to recommend it is based on data.
- **SC-003**: With Gemini Flash, 95% of commands reach a confirmation card (or the fallback) within 3 seconds of the transcript being ready, matching the existing latency target.
- **SC-004**: 0 state changes happen from unconfirmed or invalid Gemini output across the eval set and recorded tests.
- **SC-005**: A developer can compare Claude and Gemini on accuracy, latency, and cost per command from two eval reports with the same format, with no manual calculation.
- **SC-006**: Existing Claude users see no change in behavior or accuracy after upgrading (Claude eval results within ±2 points of the last baseline).

## Assumptions

- "Gemini Flash" means the current generally available Gemini Flash model on Google's developer API (free tier). The exact model ID is a default the user can change, as with Claude.
- Calls go directly from the browser with the user's own key, as Claude calls do today. No backend or proxy is added (Constitution VII).
- Speech-to-text is unchanged (browser speech recognition). Gemini only replaces the step that turns the transcript into an action.
- Gemini's accuracy is unknown until measured. This feature delivers the ability to use and measure it. It does not promise that Gemini matches Claude, and the default provider stays Claude.
- "Structured JSON response" is satisfied by the existing structured action calls plus validation. No separate JSON output mode is added.
- Type-safe AI libraries ("JEV" or similar) are out of scope. Latency per provider is measured here and can justify a later feature.
- Constitution v1.1.0 already allows additional resolvers, so no further amendment is needed for this feature.
- Other providers (OpenAI, local models) are out of scope, but the provider choice should not make them harder to add later.
