<!--
Sync Impact Report
- Version change: 1.1.0 → 2.0.0 (MAJOR: principles I and IV redefined; amend and out-of-order
  undo retired)
- Modified principles:
  - I. Event-Sourced Ledger: undo is a ledger entry marking groups reverted, newest first; past
    entries are never edited in place (amend retired); legacy entries stay readable
  - IV. Propose, Confirm, Undo: one tap undoes only the latest action; older actions are reached
    by a confirmed "undo back to here"; undo only in order
- Added sections: none
- Removed sections: none
- Rationale: out-of-order undo and amend left later entries computed from a game that no longer
  existed (bug undo-stale-market-move); feature 010-reliable-play-history
- Templates: plan/spec/tasks templates read the constitution at runtime; no edits needed
- Follow-up TODOs: none (feature 010 plan should cite v2.0.0)
-->
# 18xx Companion Constitution

## Core Principles

### I. Event-Sourced Ledger

All session state MUST be derived by reducing an append-only log of events.

- UI components and the voice layer MUST NOT mutate state directly. They emit actions, which are
  validated and then appended as events.
- The primitive event vocabulary (money transfer, share transfer, market move, company status,
  train transfer, turn advance, note) MUST stay small. High-level actions expand into groups of
  primitive events; one user intent produces exactly one event group.
- Events are never deleted or rewritten. Undo is itself a ledger entry that marks groups as
  reverted, newest first. Past entries are never edited in place: the only way to change the
  past is to undo back to it and record the actions again. Entries written by older versions
  (including legacy amends) MUST stay readable and replay to the same state.
- Any transfer of money or shares between two holders MUST be expressible as a single primitive
  event, so future features (mergers, conversions, closures) compose from existing transfers.

Rationale: a replayable log gives free undo, history, export, and crash recovery over a 3–6 hour
session, and keeps later features possible without rewrites.

### II. Money Is Conserved (NON-NEGOTIABLE)

- After every reduce, the app MUST check its invariants: bank + players + companies equals the
  starting total (unless the bank is unlimited), and each company's held share units equal its
  total certificates.
- A broken invariant MUST be surfaced visibly to the user. It MUST NOT be silently corrected.
- Money amounts MUST be integers in game currency units. Rounding of per-share amounts and
  half-pays MUST follow the game definition's rounding rule, never ad hoc arithmetic.

Rationale: the app's core value is correct money. A silent drift ruins a game; a visible one
points to a bug or a misheard command.

### III. Rules as Data, the Table Wins

- Differences between games MUST live in game definitions (data). Per-game code paths are allowed
  only as named `customRules` hooks, each justified in the plan that introduces it.
- Game-definition values MUST be taken from the rulebook, not from memory. Unverified fields MUST
  be marked as such until checked.
- The app is not a rules engine. It MAY warn about likely illegal actions; it MUST NOT block
  them. Every value MUST be overridable through a recorded manual event.
- Map, tiles, routes, and revenue calculation are out of scope.

Rationale: physical play is the source of truth; the app supports it rather than policing it.

### IV. Propose, Confirm, Undo

- AI-resolved commands MUST be presented as proposed actions on a confirmation card (summary,
  money flows, chip breakdown) and applied only after explicit user confirmation.
- Model output MUST be structured tool calls validated against current state before display.
  Free model text MUST NOT change state, and queries MUST be answered from app state, never from
  model text.
- The latest applied action MUST be undoable in one tap, without confirmation.
- Any older action MUST be reachable by undoing back to it (that entry and every later one) in
  one step, after one confirmation that shows how many entries will be undone.
- Undo operates on whole event groups and only in order, newest first. No group may stay active
  after an undone one, so later entries are never left computed from a game that no longer
  exists.
- When the AI is unavailable (no network, no key, refusal, invalid output), the app MUST degrade
  to touch input with the transcript shown, never to an error dead end.

Rationale: voice at a noisy table is error-prone; confirmation plus cheap undo makes mistakes
harmless.

### V. Voice and Touch Parity, Minimal Screen Time

- Voice and touch MUST produce the same action types through the same validation path. Voice is
  a shortcut; every capability MUST be reachable by touch.
- Common actions MUST take at most 2 taps or one short voice command.
- Touch targets MUST be at least 48 px; color MUST never be the only cue (company colors are
  always paired with short names). Layouts MUST work on phone portrait and tablet landscape.

Rationale: players' attention belongs on the board, not the device.

### VI. Test-First Domain Logic

- Domain logic (reducers, action expansion, payouts and dividend routing, capitalization, market
  movement, chip change-making, invariant checks) MUST be developed test-first: write a failing
  test, make it pass, then refactor.
- Game definitions MUST have tests covering their rule-dependent calculations (payout modes,
  unowned-share dividends, rounding, market moves).
- Voice resolution accuracy MUST be measured against a maintained eval set of real Spanish
  transcripts with expected actions; prompt, tool-schema, provider, or model changes MUST be
  re-evaluated against it before merging.

Rationale: money correctness can only be trusted if it is proven by tests, and AI behavior can
only be trusted if it is measured.

### VII. Local-First Simplicity

- v1 MUST run with no backend: a single-device PWA, offline-capable except for the AI call.
- State MUST survive reloads, sleep, and app restarts (persist on every event).
- The user's API keys (one per AI provider) MUST be stored only on the device and MUST NOT be
  included in exports, logs, or bug reports.
- Features listed as "later iterations" (mergers, multi-device rooms, loans beyond what v1 games
  need, backend proxy, native wrapper) MUST NOT be built ahead of need. Designing data shapes so
  they remain possible is allowed; implementing them is not. Prefer the simplest solution (YAGNI).

Rationale: fewer moving parts means fewer failure points mid-game.

## Platform & Technology Constraints

- Stack: React + TypeScript (strict mode) + Vite, delivered as an installable PWA.
- Storage: IndexedDB holding the event log plus periodic snapshots; session export/import as JSON.
- Speech-to-text: Web Speech API, push-to-talk only, Spanish (`es-*`) locale in v1.
- Command resolution: pluggable AI resolvers behind one interface (Anthropic Claude today; other
  providers such as Google Gemini may be added). Every resolver MUST:
  - receive the same tools/functions, generated from the same action schemas touch uses, the same
    instructions, and the same context snapshot; only the wire format may differ per provider;
  - return structured tool/function calls that go through the same validation and resolution
    path, so no provider gets its own route to state;
  - make one call per command, with the stable prefix (system prompt, game definition, tools)
    first and the volatile context snapshot last, using provider-side prompt caching where the
    provider offers it;
  - map its errors to the shared user messages and the touch fallback (Principle IV).
- Provider and model are user-configurable. Each provider keeps its own API key, stored only on
  the device (Principle VII).
- A provider/model pair MUST be measured on the shared voice eval set (same cases, grading, and
  report format, including cost per command) before it is offered in the app.
- Performance target: transcript-to-confirmation-card latency under 3 s on a typical connection.
- New runtime dependencies MUST be justified in the plan that introduces them.

## Development Workflow & Quality Gates

- Work follows the Spec Kit flow: specify → (clarify) → plan → tasks → implement. Each plan MUST
  include a Constitution Check against these principles, and any violation MUST be recorded with
  its justification in the plan's complexity tracking.
- Before merging, all of the following MUST pass: type check, lint, and the full test suite.
  Changes touching voice resolution MUST also report eval-set accuracy.
- Reviews MUST verify that no code path changes state outside the event pipeline, that money
  invariants hold, and that new game-specific behavior is data-driven or a justified hook.
- `docs/spec.md` is the product reference; when a feature changes product behavior, the spec MUST
  be updated in the same change.

## Governance

- This constitution supersedes other project practices. Where guidance conflicts, it wins.
- Amendments are made through `/speckit-constitution`, with a Sync Impact Report, and MUST state
  the version bump and its rationale.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR for
  adding a principle or section or materially expanding guidance, PATCH for clarifications and
  wording.
- Compliance is reviewed at plan time (Constitution Check) and at review time. Unjustified
  complexity or principle violations block merging.

**Version**: 2.0.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-12
