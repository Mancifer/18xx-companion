# Implementation Plan: Railways of the Lost Atlas

**Branch**: `004-railways-lost-atlas` | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-railways-lost-atlas/spec.md`

## Summary

This feature adds Railways of the Lost Atlas (base game plus the small Landmarks effects) as a fourth built-in game. Most of RotLA fits the existing engine as data. The rest is new reusable mechanics and optional schema fields. No new primitive event type is added, and the existing games behave the same (SC-007).

What fits the existing engine as data:

- Incremental capitalization, with treasury shares paid to the company.
- Sell drops once per sale; sold-out +1 at the end of the SR (feature 003).
- Dynamic operating order by price, then top of stack.
- Phases that rust trains, a pool for discarded trains, a fixed round schedule, unlimited bank.
- The 7/∞ as one train type with two variants and a trade-in.

What is new:

1. **Stock track** ([research R1](research.md#r1-the-1-d-stock-track-is-a-one-column-grid)): a 27-row, 1-column grid, so every existing up/down move works unchanged. The Market screen draws it as a strip.
2. **"Bottom of the stack"** payout ([R2](research.md)): a `stackBottom` move rule emits `marketMove` with a new reason, `"restack"`.
3. **Minors and majors** ([R3](research.md)): `tier`, `start`, `altName` and money-relevant `traits` on `CompanyDef`. A major inherits the traits of its minors.
4. **Auction launch** ([R4](research.md)): a new `launchCompany` action (mechanic `auctionLaunch`). The whole bid goes to the treasury, 3 shares go to the treasury, and the starting price is half the bid, floored to the track and capped by the phase.
5. **Modes and variants** ([R5, R6](research.md)): option choices gain an RFC 7386 `patch`, `removeCompanies`/`addCompanies` and `recommendedPlayers`. A `companySubset` option kind selects the minors in play. `TrainDef.countByPlayers` gives the per-player-count train counts.
6. **Cycles** ([R7](research.md)): a fixed schedule `SRn, ORn.1, ORn.2, MRn`, with the Merger Round conditional on the phase. A new `"MR"` round value. `startSR` exports a train (data: `trainExport`), and the existing `phaseTrigger` already handles rust and phase changes on bank → removed. A `cyclesComplete` end trigger opens a new Score sheet.
7. **Mergers** ([R8](research.md)): a `mergeCompanies` action (mechanic `mergers`), built only from share, money, asset, market, status and counter primitives. One group; undo is exact.
8. **Issue and redeem** ([R9](research.md)): `issueShares` moves to the core, gated by data and with a configurable source. A new `redeemShare` action.
9. **Train limits** ([R10](research.md)): per-tier limits, Spacious +1, and Resourceful's "rusted, one last run" (a counter). An over-limit banner.
10. **Forced purchase, dissolution, bankruptcy** ([R15, R16](research.md)): an extended `corporateBankruptcy` config, plus a `forcedTrainPurchase` action that drops each sold company once.
11. **Landmarks** ([R13](research.md)): a `landmarks` mechanic with `rockFormation`, `cliffSale` and `canyonTrain`. Manufacturing is data (`launchFee`, `launchAssets`, a special `M2` train).
12. **Voice** ([R17](research.md)): tools are generated from the new schemas. Three new RotLA eval fixtures and cases are added, and all games are re-evaluated.

`docs/spec.md` §2.2 and §5.3 move mergers from "later" to "built", and §6 lists the new actions (constitution VII and the workflow rule).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), ES2022; Node.js 22 LTS for tooling

**Primary Dependencies**: react 19, react-dom 19, zod 4. No new runtime dependency: the RFC 7386 merge patch is about 20 lines in `games/index.ts`.

**Storage**: IndexedDB event log, unchanged.
- Sessions freeze the patched definition (`SessionMeta.game`), so mode and variants need no runtime lookups.
- New enum values (`Round: "MR"`; `MarketMoveReason: "restack" | "merge" | "bonus"`) are accepted by `events/schema.ts`. Old logs replay identically, and no migration is needed.

**Testing**: Vitest and @testing-library/react (domain and UI); Playwright (e2e); voice eval (`npm run eval:voice`)

**Target Platform**: Installable PWA. Chrome Android and Safari iOS 17+ are primary, plus desktop browsers.

**Project Type**: Single-project web app (PWA), no backend

**Performance Goals**: Transcript to confirmation card under 3 s, unchanged.
- The voice prompt's cached prefix grows by the RotLA definition and tools, and stays within the existing per-game prefix size.
- Reduce plus invariants stay under the existing perf test budget (`tests/domain/perf.test.ts`). A merger is about 40 primitives.

**Constraints**:
- Offline-capable.
- Money is conserved. With an unlimited bank the money-total check is skipped (as in 21Moon), and the share-unit invariant still covers mergers.
- One intent produces one group.
- Warnings never block.

**Scale/Scope**:
- 1 new game definition (`games/grotla.ts`): 22 companies with the expansion, 7 train types, 6 phases, 7 options.
- 4 new mechanics or extensions, 9 new actions, about 15 schema fields.
- UI: 2 new sheets (Launch, Merger) and the Score sheet; additions to Operate, NewSession, Market, Table, RoundIndicator and the Trains view.
- About 15 new test files and 3 eval fixtures.

No NEEDS CLARIFICATION remain. The data still owed by the user (only the majors' second names, which ship as placeholders by the user's decision) ships as unverified placeholders ([R14](research.md)), as the spec's Clarifications allow.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Event-Sourced Ledger | ✅ | No new primitive event type. Launch, merger, export, forced purchase and bankruptcy each expand into existing primitives, one group per intent. Three enum values are added to existing fields (`Round`, `MarketMoveReason`); see Complexity Tracking. Mergers compose from transfers, as the principle anticipates. |
| II. Money Is Conserved | ✅ | The bank is unlimited, so the total check is skipped, as in 21Moon. With Bank Break (8,000) the full total check applies. Share units are conserved through mergers: minor units go to `removed`, major units leave the IPO. Dividends use the definition's `floor` rounding. The random-walk invariant test is extended to RotLA (SC-005). |
| III. Rules as Data, the Table Wins | ✅ | Every RotLA value is in `grotla.ts`, with unverified fields marked ([contracts/game-definition.md](contracts/game-definition.md)). Per-game behavior lives only in named, reusable mechanics (`auctionLaunch`, `mergers`, `landmarks`, extended `corporateBankruptcy`) and data traits. No code branches on `"rotla"`. Every rule check is a warning. Prices, phases, turns and trains can still be overridden with `setMarket`, `setPhase`, `setTurn` and `discardTrain`. Map, routes and revenue stay out of scope. |
| IV. Propose, Confirm, Undo | ✅ | The new actions go through the same pipeline and confirmation card (with money flows and the chip breakdown for the launch). Each is undone in one tap. A merger undo is tested to restore the exact state. |
| V. Voice and Touch Parity | ✅ | Every new action has a touch control ([contracts/ui.md](contracts/ui.md)) and a generated voice tool ([contracts/actions.md](contracts/actions.md)). Launch, buy/sell, issue/redeem and payout take ≤ 2 taps. A merger takes ≤ 3 taps after choosing the minors (SC-003, SC-004). 48 px targets; colors are paired with short names. |
| VI. Test-First Domain Logic | ✅ | Each domain change has a failing test first ([quickstart.md](quickstart.md) lists them). Game-definition tests cover payout moves, treasury dividends, rounding, the stack-bottom rule and the rulebook diagrams (SC-002). New voice eval fixtures and cases come before any prompt or tool change is merged (FR-031). |
| VII. Local-First Simplicity | ✅ | Mergers were a "later iteration". They are now needed by a supported game, which the principle allows, and docs/spec.md is updated in the same change. Events, the Metropolitan and Direct-to-Major stay out (spec FR-033); only data shapes leave room for them. No backend, no new dependency. |
| Workflow: docs/spec.md | ✅ | §2.1 adds RotLA to the supported games; §2.2 removes mergers from the later iterations; §5.3 becomes "Mergers (built)"; §6 lists the new actions. |
| Workflow: voice eval | ✅ | The tool set and the prompt change, so the eval runs for all games and its accuracy is reported in the PR. RotLA cases must reach ≥ 90% (SC-006), and the other games must not drop (SC-007). |
| Platform: new dependencies | ✅ | None. |

**Result**: PASS. Re-checked after Phase 1 design: PASS. The only items recorded under Complexity Tracking are enum extensions and the move of one handler, not violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-railways-lost-atlas/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R17
├── data-model.md        # Phase 1: schema additions, counters, queries, transitions
├── quickstart.md        # Phase 1: validation scenarios
├── contracts/
│   ├── actions.md          # New and changed actions, triggers, voice tools
│   ├── game-definition.md  # The RotLA definition's values and options
│   └── ui.md               # New sheets and controls
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/domain/
├── games/
│   ├── schema.ts             # + tier, start, altName, traits, countByPlayers, special,
│   │                         #   trainLimitByTier, launchPriceRange, color, stackBottom, issue.from,
│   │                         #   redeem, auction, trainExport, conditional slots, option patch/kind
│   ├── grotla.ts             # NEW: the RotLA definition (contracts/game-definition.md)
│   ├── index.ts              # + register grotla; applyOptions: merge patch, add/remove companies, subsets
│   └── validateDefinition.ts # + rules 1–9 of data-model §6
├── events/
│   ├── types.ts, schema.ts   # + Round "MR"; reasons "restack", "merge", "bonus"
│   ├── reduce.ts             # + restack → bottom of stack
│   └── state.ts              # trainAssetIds by player count; special trains start in removed
├── mechanics/
│   ├── market.ts             # + stackBottom rule; floorToTrack; launchPrice
│   ├── phases.ts             # + per-tier limit and bonus; Resourceful rust; trainStack; overLimitCompanies
│   ├── schedule.ts           # + conditional slots; mergerRoundDue; exportEvents; cyclesComplete
│   ├── endTriggers.ts        # + cyclesComplete
│   ├── traits.ts             # NEW: effectiveTraits (own + mergedFrom)
│   ├── scores.ts             # NEW: finalScores with the tie rule
│   └── custom/
│       ├── auctionLaunch.ts       # NEW: launchCompany
│       ├── mergers.ts             # NEW: mergeCompanies, startMR, mergePreview
│       ├── landmarks.ts           # NEW: rockFormation, cliffSale, canyonTrain
│       ├── corporateBankruptcy.ts # + config fields; forcedTrainPurchase; liquidatePresided
│       ├── corporateRound.ts      # − issueShares (moved to core)
│       └── mechanic.ts, index.ts  # + register the new ids
├── actions/
│   ├── schemas.ts            # + the 9 new action schemas; ActionSchema union
│   ├── expand/operating.ts   # + issueShares (core), redeemShare, namedPayment; buyTrain trade-in variant
│   ├── expand/stock.ts       # + warnUnlessOperated, maxSharesPerBuy
│   ├── expand/flow.ts        # startSR + export
│   ├── expand/status.ts      # declareBankruptcy honors playerMode
│   └── limits.ts             # tier-aware train limit
├── i18n/es.ts                # summaries for the new actions and reasons, phase colors, round labels
└── queries.ts                # voice queries: the stack, limits, scores

src/voice/        tools.ts, prompt.ts, snapshot.ts   # new tools and descriptions; tier, cycle and minors in the snapshot
src/ui/
├── screens/NewSession.tsx, Market.tsx, Table.tsx    # option UI and warnings, 1-D strip, round controls, over-limit banner
├── sheets/LaunchSheet.tsx, MergerSheet.tsx, ScoreSheet.tsx   # NEW
├── sheets/OperateSheet.tsx, StockSheet.tsx          # issue/redeem, ability and landmark chips, 7/∞, forced purchase
└── components/RoundIndicator.tsx                    # "Ciclo n · …"

tests/games/rotla.test.ts, rotla.playthrough.test.ts, options.test.ts
tests/domain/launch, merger, export, cycles, issue, traits, forcedPurchase, dissolution, landmarks (.test.ts)
tests/ui/rotla.test.tsx
eval/voice/fixtureSpecs.ts (+ rotla-sr, rotla-or, rotla-mr), cases.jsonl
docs/spec.md
```

**Structure Decision**: The existing single-project layout. Domain logic stays in `src/domain` as pure functions and handlers; UI sheets sit beside the existing ones; tests mirror the domain modules.

## Implementation order (for /speckit-tasks)

1. **Schema and definition**: the schema fields, the merge-patch options, `grotla.ts`, and the definition tests (US1).
2. **Market**: the 1-D grid, `restack`, `floorToTrack`, the payout and withhold rules (US5 payout part).
3. **Launch and stock round**: `launchCompany`, the stock warnings, the sold-out step (US2–US4).
4. **Operating round**: core `issueShares`, `redeemShare`, `namedPayment`, traits (US5).
5. **Trains and phases**: per-tier limits, Resourceful, 7/∞, the forced purchase (US6).
6. **Cycles**: conditional MR, `startMR`, export in `startSR`, `cyclesComplete`, scores (US8).
7. **Mergers** (US7).
8. **Dissolution and bankruptcy** (US9).
9. **UI**: New Session, Launch, Operate additions, Merger, Market strip, round controls, Score sheet.
10. **Voice**: snapshot, tools, prompt line, fixtures, cases, eval for all games (US10).
11. **Landmarks**: the mechanic, Manufacturing, the new companies (US11).
12. **Finishing**: docs/spec.md, the random-walk test, the full playthrough test, e2e smoke.

Steps 1–2 block everything else. Steps 3–8 are domain work that can proceed in parallel after step 2. Step 9 follows its domain step. Step 10 needs 3–8. Step 11 needs 3–7.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| `Round` gains `"MR"` (an existing `turnAdvance` field) | The Merger Round is a distinct round with its own order and controls (FR-024, FR-027) | Treating it as an OR or SR would trigger OR or SR semantics: runs, sold-out moves, `soldThisSR` |
| `MarketMoveReason` gains `"restack"`, `"merge"`, `"bonus"` | `restack` is the only way to express "same price, bottom of stack" (FR-013); the other two label History correctly | A new primitive (forbidden without need), or a `stackOrder` field on the event (it leaks internal ordering numbers into the log) |
| `issueShares` moves from the `corporateRound` mechanic to the core | Two games need it, and only one mechanic can own an action type | A duplicate RotLA-only action (two near-identical voice tools) |
| Option choices carry a JSON merge patch | Modes change starting cash, trains, companies, schedule and export together (FR-002) | Separate definitions per mode (≈90% duplication, multiplied by the variants); per-field option kinds (an open-ended list) |
| Phase ids finer than the rulebook colors (`green4`, `purple6`) | Train limits and rusting change at trains that do not change color (B p.16) | Per-train-type limit and rust tables (a second mechanism beside phases) |
