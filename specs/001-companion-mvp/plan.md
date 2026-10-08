# Implementation Plan: 18xx Companion MVP

**Branch**: `001-companion-mvp` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-companion-mvp/spec.md`

## Summary

A single-device, offline-first PWA that does the money bookkeeping for 1830, 1848 and 21Moon
(and copy-and-edit custom games), driven by touch and by Spanish voice commands. All state is
reduced from an append-only, IndexedDB-persisted log of grouped primitive events. Undo and
amend append revert and amend entries, and invariants are checked after every reduce. One set
of Zod action schemas feeds both the touch flows and the strict tool schemas sent to Claude
(called from the browser with the user's key, hardened per research R17). Game differences live
in game-definition data verified against the three rulebooks in `docs/rules/`, plus nine named,
reusable mechanics (`loans`, `nationalBank`, `nationalTakeover`, `bankDebt`, `forcedWithhold`,
`corporateBankruptcy`, `manualFloatCondition`, `privateGrants`, `corporateRound`). Together they
give full 1848 support, both 1830 rulesets, and 21Moon's two-base revenue and corporate rounds.
See [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), ES2022 target; Node.js 22 LTS for tooling and
the eval

**Primary Dependencies**: react 19, react-dom 19, zod 4 (action, definition and import schemas
→ JSON Schema for tools), idb 8 (IndexedDB wrapper), @anthropic-ai/sdk (browser,
`dangerouslyAllowBrowser`); build: vite, vite-plugin-pwa. The justification for each is in
[research.md](./research.md) R1–R8.

**Storage**: IndexedDB (`sessions`, `entries`, `snapshots`, `settings`, `games`). JSON
export/import.

**Testing**: Vitest + @testing-library/react + fake-indexeddb (unit and integration),
Playwright (E2E: phone and tablet projects, offline), voice eval harness (`eval/voice`, Node +
SDK)

**Target Platform**: Mobile and tablet browsers. Chrome Android and Safari iOS 17+ are primary.
Desktop Chrome for development. Installable PWA.

**Project Type**: Single-project client-only web app (PWA), with no backend

**Performance Goals**: Transcript-to-confirmation-card latency < 3 s p95 (SC-004). Touch action
to persisted state < 100 ms. Full replay of a 6-hour log (~1,500 groups) < 50 ms. Cold start
from IndexedDB < 1 s.

**Constraints**: Offline for everything except voice (FR-093). Persist before showing success
(FR-090). Touch targets ≥ 48 px. Portrait phone and landscape tablet. The API key never leaves
the device except to the Anthropic API. Integer money only.

**Scale/Scope**: 1 device, 2–7 players (per game, capped at 7), 7–9 companies, 3 built-in games, ~8 screens,
~40 action types, ~30 voice tools, a ~50-case Spanish voice eval set

All technical unknowns are resolved in research.md. All three rulebooks are in the repo and
were read, all three stock markets and the 1848 BoE track are transcribed, and the rules the
rulebooks leave unstated were confirmed by the user. No rule values remain unverified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Pre-research | Post-design |
|---|---|---|---|
| I. Event-sourced ledger | All state from the log. One intent = one group. Undo and amend never delete. Transfers are single primitives | ✅ | ✅ The store is the only writer (R2). Revert and amend are appended entries (R3). Primitives in [events.md](./contracts/events.md). `trainTransfer` generalized to `assetTransfer` (see Complexity Tracking) |
| II. Money conserved | Invariant check after every reduce, surfaced and never corrected. Integer money. Data-driven rounding | ✅ | ✅ data-model §11. `rounding` is a definition field. Negative balances are allowed and flagged. BoE £2,000 counted through `initialTreasuries`. Bank debt is a counter, not money. The 21Moon unlimited bank skips only the money check |
| III. Rules as data, the table wins | Per-game code only as justified named hooks. Rulebook values. Warn, never block. Everything overridable | ✅ | ✅ Nine mechanics, each justified below and none keyed on a game id (R16). The `verification` map marks ⚠ fields. `validate` returns warnings only. Manual actions cover every value |
| IV. Propose, confirm, undo | AI → strict tool calls → validated → card. Queries from state. Graceful degradation | ✅ | ✅ [voice-tools.md](./contracts/voice-tools.md): `strict: true`, Zod re-validation, `query` answered from state, every failure ends in "No entendí" with touch entry |
| V. Voice/touch parity, minimal screen time | Same actions and validation path. ≤ 2 taps. 48 px. Color + name | ✅ | ✅ One schema source (R5). Tap-count tests. A `--tap` token |
| VI. Test-first domain logic | TDD for reducers, expansion, payouts, market, chips, invariants. Per-game tests. Voice eval | ✅ | ✅ R10. Tests listed in quickstart. Eval contract defined |
| VII. Local-first simplicity | No backend. Persist each event. Key on device only. No later-iteration features | ✅ | ✅ IndexedDB `durability: strict`. Export excludes settings (tested). 21Moon-driven fields are needed for a v1 game, not speculative. Mergers and multi-device are not built |
| Platform constraints | React+TS strict+Vite PWA, IndexedDB, Web Speech push-to-talk, Claude with strict tools and caching, new deps justified | ✅ | ✅ Every dependency is justified in R1–R10. Caching layout in R9 |

**Result**: PASS. No unjustified violations. The deviations below are deliberate and
justified.

## Project Structure

### Documentation (this feature)

```text
specs/001-companion-mvp/
├── plan.md              # This file
├── research.md          # Phase 0: decisions + verified/unverified rule tables
├── data-model.md        # Phase 1: entities, state, ledger, invariants
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── events.md            # primitive events + reducer guarantees
│   ├── actions.md           # high-level actions, pipeline, expansion rules
│   ├── voice-tools.md       # Claude request/tool/response contract + eval format
│   ├── export-format.md     # session file format
│   └── game-definition.md   # definition rules, custom games, 1848 example
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
src/
├── domain/                     # pure TS — no React, no I/O (100% unit-tested)
│   ├── types.ts                # ids, HolderRef, CellRef
│   ├── queries.ts              # state queries answered for voice (FR-073)
│   ├── events/                 # primitive event types, state.ts, reduce.ts
│   ├── ledger/                 # log entries, effective log, revert/amend, dependencies, snapshots,
│   │                           # flows.ts (bank money flows for chips)
│   ├── actions/                # schemas.ts (Zod), availability.ts, validate.ts, expand/*.ts
│   ├── mechanics/              # payout, capitalization, market, presidency, operatingOrder,
│   │   │                       # phases, chips, invariants
│   │   └── custom/             # loans, nationalBank, nationalTakeover, bankDebt, forcedWithhold,
│   │                           # corporateBankruptcy, manualFloatCondition, privateGrants,
│   │                           # corporateRound, index.ts (registry)
│   ├── games/                  # schema.ts, validateDefinition.ts, g1830.ts, g1848.ts, g21moon.ts, customGame.ts
│   └── i18n/es.ts              # summaries for cards, toasts and History (shared by touch and voice)
├── persistence/                # db.ts (idb), sessionRepo.ts, settingsRepo.ts, gamesRepo.ts,
│                               # exportImport.ts, canonical.ts (state hash)
├── voice/                      # speech.ts (Web Speech), interpreter.ts (SDK), tools.ts,
│                               # prompt.ts, snapshot.ts, resolve.ts (tool_use → Proposal)
├── app/                        # SessionStore (useSyncExternalStore), useSession.ts, dispatch pipeline,
│                               # voiceController.ts, wakeLock.ts
└── ui/
    ├── screens/                # Home, NewSession, Table, History, Market, Settings, CustomGame
    ├── sheets/                 # OperateSheet, StockSheet, PlayerSheet, CompanySheet, BatchSheet
    ├── components/             # PlayerTile, CompanyCard, TopBar, MicButton, UndoToast,
    │                           # ConfirmationCard, ChipStrip, Keypad, ClarifyButtons
    └── styles/                 # tokens.css (incl. --tap: 48px), layout.css

tests/
├── domain/                     # events, ledger, payout, market, chips, invariants (property tests)
├── games/                      # 1830.test.ts, 1848.test.ts, 21moon.test.ts, definitions.test.ts
├── persistence/
├── app/                        # SessionStore pipeline and persistence ordering
├── voice/                      # recorded responses → Proposal
└── ui/                         # tap-count and flow tests
e2e/                            # Playwright specs
eval/voice/                     # cases.jsonl, fixtures/, run.ts, results/
public/                         # icons, manifest assets
docs/rules/                     # rulebook PDFs: 1830 (Mayfair 2011), 1848, 21Moon
```

**Structure Decision**: A single client-only project. `src/domain` is a framework-free core
with no imports from `ui`, `voice`, `persistence` or `app` (enforced by an ESLint
`no-restricted-imports` rule), so money logic is fully unit-testable and is the only place
rules live. `app/` is the only writer of state.

## Open Items Carried Into Tasks

| Id | Item | Blocks |
|---|---|---|
| AI-2 | Write the seed eval set (~60 cases, design in research R18), with the user phrasing the transcripts in their regional Spanish; add real cases after the first games | Confirming the default. **Default: `claude-sonnet-5`** (user decision), effort low |

**Resolved 2026-10-07**: SPEC-1 (US3-6 reworded: 1848 loans have no interest and are never repaid), G-2a (1848 BoE track and £70 start price, research R13), G-3 (1848
train limit 4 → 3 → 2, and rounding down), G-2b (1830 market from the user's image, research R14), G-2c (21Moon:
CR between SR and OR, own treasury shares are paid, research R15), and SPEC-2 (player count per
game with a hard cap of 7; revenue parts with fixed destinations; applied to `spec.md` FR-002,
FR-030, FR-031 and `docs/spec.md`).

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `trainTransfer` generalized to `assetTransfer` (trains, privates, loan markers) | Privates and 1848 loan markers change owner exactly like trains, and the loan supply must be conserved | Three separate primitives would triple the reducer and test code. A loan counter can't be checked against the BoE's 20-marker supply |
| New primitive `counterChange` | Bank debt (1848 director liability, 1830 Base receivership loan) is an IOU, not money: the Bank really pays out, and the debt is tracked separately. 21Moon East-West tokens are also a per-company tally. The same event records company runs (`runs`, from which `hasOperated` and `operatedThisOR` derive), player bankruptcy (`bankrupt`) and the 1848 takeover count (`nationalTakeovers`), so the vocabulary stays closed (data-model §5) | Storing debt as money would make the Bank's cash wrong. One dedicated event per counter type would grow the vocabulary faster |
| `companyStatus` gains `receivership`, `bankrupt`, and optional `parPrice` / `floatConfirmed` / `capitalPending` | All three games have a receivership-like state, 21Moon has corporate bankruptcy, and 1830 pays capital at the end of the SR | Reusing `closed` would lose the fact that shares still count and the company still operates |
| Mechanic `loans` | FR-112. Loans are data-configured (amount, lender, interest, repayable, market effect) | Pure data can't express "move left 3 for the 2nd loan in the same OR" without an expansion hook |
| Mechanic `nationalBank` | FR-111. The BoE is a director-less company with a loan-driven price track and a phase minimum dividend | Treating it as a normal company would apply sell and sold-out moves and require a president |
| Mechanic `nationalTakeover` | FR-111. A multi-step expansion (compensation, director liability, treasury sweep, train removal, threshold effects) triggered by a market cell | Leaving it to manual transfers would make the most error-prone 1848 event the least supported |
| Mechanic `bankDebt` | 1848 §5.5.3 and 1830 §7.7: interest-free Bank debt with automatic repayment from the next income. Used by two games | Manual tracking would be forgotten and break the repayment rule |
| Mechanic `forcedWithhold` | 1830 Base §7.7 and 21Moon §11.8.2: a company in receivership cannot pay dividends | A per-game check in the payout code |
| Mechanic `corporateBankruptcy` | 21Moon §12 (and the 1830 Classic game end): shares are removed, the treasury goes to the Bank, held shares go to the pool | Manual cleanup of ~10 transfers in one emergency |
| Mechanic `manualFloatCondition` | COM launch needs a map condition the app can't see (Sydney–Adelaide link) | Hard-coding COM is per-game logic. Ignoring the condition would float COM early |
| Mechanic `privateGrants` | 1830 CA/BO/MH, 1848 P5/P6, and 21Moon P6 grant or exchange shares | Manual share transfers after every such purchase break the "one intent = one group" rule |
| Mechanic `corporateRound` | 21Moon §10: a whole round type in which companies trade shares, issue shares, and get end-of-CR moves | Expressing a round type purely as data would need a rules engine |
| `dangerouslyAllowBrowser` client-side API key | Constitution VII: no backend in v1, user-supplied key. Threats and mitigations in research R17 | A proxy backend is a listed later iteration, and is only worth it if the app is distributed with a key the user doesn't own |
