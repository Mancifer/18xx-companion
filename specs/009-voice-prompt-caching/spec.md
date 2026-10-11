# Feature Specification: Cheaper Voice Commands Through Reliable Prompt Caching

**Feature Branch**: `009-voice-prompt-caching`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "I was wondering what could we do to reduce LLM spending even further. Right now it's pretty cheap, I ran multiple tests these days, like 240 commands and costed about 2 dollars, I think the test results are still there in the project, in eval/voice/results. However, I wouldn't want to introduce ambiguity to the prompt or risk increasing the failure rate due to the prompt not being clear enough. What do you think?, you see it possible to optimize further or it's not worth the effort? I'm open to give up on the matter, I'm ok with the current spending, but it doesn't hurt to make it a bit tighter"

## Background

**Where the money goes today** (from the 2026-10-10 eval runs in `eval/voice/results/`, default model Gemini 3.6 Flash):

| Measure | Value |
|---|---|
| Input sent per command | ~5,200 (1830) to ~8,700 (RotLA land-market) tokens |
| Output per command | ~35 tokens |
| Share of each request that is identical from command to command (instructions, game summary, names, tools) | ~95% |
| Share that changes each command (state snapshot + transcript) | ~200–300 tokens |
| Commands whose stable part was billed at the cached rate | **5%** (4 of 83) |
| Cost per command | ~$0.0044 |

Input is about 99% of the bill. Most of it is the same text every time. The provider bills repeated, cached text at **one tenth** of the normal input price. The app already sends the stable part first and byte-identical (the setup the provider's automatic caching needs). Even so, on the default model the cache almost never hits: in the eval, 21 identical 1830 requests in a row, a couple of seconds apart, were all billed at full price. A cheaper model in the same runs hit the cache on 97% of commands, so the request layout is fine. The automatic caching on the default model is the part that doesn't work.

Also, the provider's listed Flash price **doubles on 2027-01-01**, which doubles today's cost per command.

**Answer to "is it worth it?"**: Yes, if the change is limited to how the stable part is billed. Rewording or shortening the prompt is **not** part of this feature. The stable part would cost about a tenth of what it does now, so trimming it would save little money and would bring exactly the ambiguity risk the user wants to avoid. Expected effect: cost per command drops by roughly 75–85% (from ~$0.0044 to under ~$0.001 at today's prices). The model sees exactly the same instructions, tools and snapshot, so accuracy should not change, and the eval must show it doesn't.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay less per voice command without changing what the model sees (Priority: P1)

A player using voice with a paid Gemini key plays a normal game. During the game, the stable part of the request (instructions, game summary, names, tools) is billed at the cached rate on almost every command, not at full price. The model gets exactly the same content as before, so commands are understood the same way. The player notices no difference except a smaller bill.

**Why this priority**: This is the whole saving. Everything else supports it.

**Independent Test**: Run a sequence of commands for one game session against the real provider and compare the billed token breakdown with today's behavior: most input tokens show as cached, and the confirmation cards are the same.

**Acceptance Scenarios**:

1. **Given** a session with voice enabled and a paid Gemini key, **When** the player issues a second and later commands in the same session, **Then** the stable part of each request is billed at the cached rate, and the proposed action is the same as it would be without caching.
2. **Given** the first voice command of a session, **When** it is sent, **Then** it still produces its confirmation card within the existing 3-second target, even if setting up the cache costs extra.
3. **Given** caching can't be set up or used (the provider refuses it, the key's tier doesn't support it, the cached content expired or was removed, or the request is too small to qualify), **When** the player issues a command, **Then** it is sent uncached exactly as today and succeeds. The player sees no error and no extra wait beyond one retry.
4. **Given** something that the stable part depends on changes mid-session (a player alias is edited, a different session is opened, the provider key or model is changed), **When** the next command is sent, **Then** it uses content that matches the new state, never stale names or tools.

---

### User Story 2 - Measure the real saving and the accuracy on the eval set (Priority: P2)

The developer runs the voice eval with caching enabled. The report shows accuracy (overall and per category), latency, the cached share of input, and cost per command. Cost includes any charge for keeping cached content stored, so it is the real total. The developer compares it with the 2026-10-10 baseline and decides whether to keep caching.

**Why this priority**: The constitution requires every provider-side change to voice resolution to be re-evaluated before it ships. The user's main condition is "don't raise the failure rate", and this is how we prove it.

**Independent Test**: Run the full eval with caching on and with caching off, using the same model and cases, and compare the two reports.

**Acceptance Scenarios**:

1. **Given** the eval runs with caching on, **When** it finishes, **Then** the report shows the cached share of input tokens, the storage cost (if any) and the total cost per command, next to accuracy and latency.
2. **Given** both runs are complete, **When** the developer compares them, **Then** the instructions, tools and snapshots the model received are identical in both, and only billing and latency differ.
3. **Given** the eval runs cases from several games, **When** caching is on, **Then** cases from the same game reuse the same cached content, the way commands within one real session would.

---

### Edge Cases

- **Long pauses between commands** (a long stock round, a break): the cached content may expire. The next command must still work (uncached or with a fresh cache), and the app must not keep paying to store content that has stopped being used.
- **Many short sessions or frequent session switches**: setting up and storing caches that are barely used must not cost more than it saves. When a session is very short or caching would not pay for itself, sending uncached is acceptable.
- **Free-tier keys**: the free tier may not offer this kind of caching, or may bill nothing anyway. Voice on a free key must behave exactly as today.
- **App closed or reloaded mid-game**: on return, the next command works whether or not the earlier cached content still exists. Nothing about the cache needs to survive a reload.
- **Two devices or tabs with the same key and session**: each one works on its own. A missing or duplicate cache must never make a command fail.
- **Retry after a provider error**: the existing single retry still applies, and a retry must not create a second cache.
- **Stable part below the provider's minimum cacheable size** (if a small game ever falls under it): send uncached with no error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For Gemini, the system MUST arrange for the stable part of each voice request (instructions, game summary, names and aliases, tool definitions) to be billed at the provider's cached rate on later commands within the same session, using a caching method that hits reliably (target in SC-001), not one that hits only some of the time.
- **FR-002**: The instructions, tool definitions and per-command snapshot the model receives MUST be exactly the same as they are today. This feature MUST NOT reword, shorten, reorder or remove any of the content sent to the model.
- **FR-003**: Any failure to set up, find or use cached content MUST fall back to today's uncached request, without showing an error and without changing the proposed action. Failures in the command itself keep the existing error messages and touch fallback.
- **FR-004**: Cached content MUST always match the session it serves. When anything it was built from changes (players, aliases, game, model, key), the next command MUST NOT use the old content.
- **FR-005**: Cached content MUST NOT be kept stored (and billed) long after voice commands stop. Its lifetime MUST cover normal gaps between commands at the table, and it MUST lapse on its own after a period of inactivity, even if the app is closed without cleaning up.
- **FR-006**: The first voice command of a session MUST still meet the 3-second transcript-to-card target. Setting up the cache MUST NOT add a noticeable wait to that command; doing it in advance or in the background is acceptable.
- **FR-007**: The user's API key MUST stay as protected as today: only sent to the provider, never in URLs, logs, exports or error messages. Identifiers of cached content are not secrets, but they MUST NOT be included in exports either.
- **FR-008**: The voice eval MUST be able to run with caching on and off. Its report MUST include the cached share of input tokens, any cache storage charge, and total cost per command at the dated prices (including the 2027-01-01 price change).
- **FR-009**: Caching MUST NOT be enabled by default until an eval run with caching on reaches the accuracy and cost targets in the Success Criteria.
- **FR-010**: Behavior on free-tier keys MUST be unchanged. If caching is unavailable there, it is skipped silently.
- **FR-011**: No setting or prompt is added for the player; caching is invisible to them.

### Key Entities

- **Stable request part**: what is the same for every command in a session: instructions, game summary, player and company names with aliases, and tool definitions. Its identity is derived from the session, model and content.
- **Cached content**: the provider's stored copy of the stable part, with a limited lifetime. It belongs to one session/model/key combination and is replaced when any of those change.
- **Per-command part**: the state snapshot and transcript. It is never cached and is unchanged by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a session-like sequence of commands with a paid key, at least 90% of commands after the first are billed at the cached rate for their stable part (baseline: 5%).
- **SC-002**: Total cost per command, including any storage charge, drops by at least 60% against the 2026-10-10 baseline of ~$0.0044 for the same model at the same prices. Expected: about $0.001 or less.
- **SC-003**: Eval accuracy with caching on is not lower than the baseline (98.8% overall, 82 of 83 cases), allowing at most one case of run-to-run variation, and no category drops more than one case.
- **SC-004**: p95 transcript-to-card latency with caching on stays within the 3-second target, and it is no worse than the uncached baseline by more than 10%.
- **SC-005**: In fault tests (caching refused, expired, deleted, unsupported tier), 100% of commands still produce the same result they would produce without caching.

## Assumptions

- Gemini (default Gemini 3.6 Flash) is the only provider in use. **The Claude provider is out of scope.** It already marks its stable part for caching and is not used today.
- The provider offers a way to store the stable part ahead of time and refer to it from later requests, at the cached input rate plus a small per-hour storage charge. At ~5–9k tokens, storage for a multi-hour game is expected to cost cents or less, far below the saving. Exact prices and the minimum cacheable size get checked in planning.
- The stable part already contains only game setup, player names and aliases. Storing it on the provider's side for a limited time exposes nothing new: the same content goes with every request today.
- Typical use is one table, one device, with commands spread over a multi-hour game, sometimes minutes apart.
- **Out of scope**: rewording or shortening the prompt or tool descriptions, trimming the per-command snapshot, changing the default model, and adding a backend. The first three risk accuracy for a small gain once caching works. The last one breaks the local-first principle.
- The eval set (83 cases) and the 2026-10-10 Gemini 3.6 Flash run are the baseline for accuracy, latency and cost.
