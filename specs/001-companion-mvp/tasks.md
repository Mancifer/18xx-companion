---

description: "Task list for the 18xx Companion MVP"
---

# Tasks: 18xx Companion MVP

**Input**: Design documents from `specs/001-companion-mvp/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. Constitution VI makes domain logic test-first (reducers, expansion, payouts
and routing, capitalization, market, chips, invariants), requires per-game rule tests, and
requires a voice eval. Test tasks come before the implementation they cover and MUST fail first.
UI tests cover the 2-tap rule (FR-100) and the key flows.

**Organization**: Tasks are grouped by user story so each story is a testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story the task belongs to (US1–US8)
- Paths are relative to the repository root (single project: `src/`, `tests/`, `e2e/`, `eval/`)

## Conventions used by every task

- `src/domain/**` is pure TypeScript: no React, no I/O, no imports from `ui`, `voice`,
  `persistence` or `app` (ESLint enforces this).
- All money is an integer in game currency units. Rounding comes only from `game.rounding`.
- Every state change goes through `SessionStore.dispatch` → parse (Zod) → availability →
  validate (warnings only, never block) → expand → triggers → persist → reduce.
- Rule values come from research.md R13 (1848), R14 (1830) and R15 (21Moon). Cite the rule §
  in test names (e.g. `"1848 §5.6: second loan in the same OR moves left 3"`).
- UI text is Spanish. Summaries for cards, toasts and History come from `src/domain/i18n/es.ts`.
- When a story changes product behavior described in `docs/spec.md`, update `docs/spec.md` in
  the same change, before that story's checkpoint (constitution, Development Workflow).
- Round labels follow the spec: "SR n", "CR n", "OR n.m".

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [X] T001 Initialize the npm project at the repo root in `package.json`: runtime deps `react@19`, `react-dom@19`, `zod@4`, `idb@8`, `@anthropic-ai/sdk`; dev deps `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `typescript@5`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `fake-indexeddb`, `@playwright/test`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react`, `tsx`; scripts `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `test:e2e` (`playwright test`), `eval:voice` (`tsx eval/voice/run.ts`); commit `package-lock.json`. No other runtime dependencies (constitution: new deps must be justified in the plan)
- [X] T002 Create `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, target/lib ES2022, `jsx: react-jsx`, includes `src`, `tests`, `e2e`) and `tsconfig.node.json` (Node 22 types for `vite.config.ts`, `playwright.config.ts`, `eval/**`)
- [X] T003 [P] Create `vite.config.ts`: `@vitejs/plugin-react`; `vite-plugin-pwa` with `registerType: "autoUpdate"`, Workbox precache of the app shell, manifest (name "18xx Companion", `display: standalone`, icons from `public/`); a small `transformIndexHtml` plugin that injects the CSP meta **only in build** (`default-src 'self'; connect-src 'self' https://api.anthropic.com; script-src 'self'; object-src 'none'; base-uri 'none'`, research R17); Vitest config with `environmentMatchGlobs` (`tests/ui/**` → jsdom, everything else → node) and `setupFiles: ["tests/setup.ts"]`
- [X] T004 [P] Create `eslint.config.js`: typescript-eslint strict-type-checked, react-hooks, `react/no-danger` as error; `no-restricted-imports` so files under `src/domain/**` cannot import `react`, `src/ui/**`, `src/voice/**`, `src/persistence/**` or `src/app/**`; and so nothing outside `src/app/**` imports `src/app/SessionStore` internals (only `src/app/useSession.ts` and the store's public API)
- [X] T005 [P] Create `playwright.config.ts` with two projects, `phone` (Pixel 7, portrait) and `tablet` (iPad Pro 11 landscape), and `webServer: { command: "npm run build && npm run preview", port: 4173 }`
- [X] T006 Create the directory skeleton from plan.md (`src/domain/{events,ledger,actions/expand,mechanics/custom,games,i18n}`, `src/persistence`, `src/voice`, `src/app`, `src/ui/{screens,sheets,components,styles}`, `tests/{domain,games,persistence,voice,ui,app}`, `e2e`, `eval/voice/{fixtures,results}`, `public`), plus `index.html` (lang `es`, viewport meta, root div), `src/main.tsx` (mounts `<App/>`, imports styles), and `tests/setup.ts` (imports `fake-indexeddb/auto` and calls React Testing Library's `cleanup` after each test; no jest-dom)
- [X] T007 [P] Create `src/ui/styles/tokens.css` (`--tap: 48px`, spacing, type scale, neutral palette, warning/danger colors, light and dark) and `src/ui/styles/layout.css` (CSS grid; phone portrait: 2-column player grid, companies in a tab; tablet landscape: players and companies side by side; research R12)
- [X] T008 [P] Create `.github/workflows/ci.yml` running `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm audit --audit-level=high` on push and pull request (research R17)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Primitive events, reducer, invariants, ledger basics, definition schema, action
pipeline, persistence and the store. Every user story depends on this phase.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational (write first, must fail)

- [X] T009 [P] Write `tests/domain/events.test.ts`: one positive case per primitive in contracts/events.md (`moneyTransfer`, `shareTransfer` incl. `presidency: true` moving the presidency marker with its units, `marketMove` incl. "entering an occupied cell gives `stackOrder = max + 1`" (1848 §11.3), `companyStatus` setting `parPrice`/`floatConfirmed`/`capitalPending`, `assetTransfer`, `turnAdvance` with partial fields, `counterChange`, `note`); the reducer **never rejects** (moving shares a holder does not have still applies arithmetically); reduce is pure (same input → deep-equal output, input not mutated); derived fields per data-model §5: a `runs` counterChange sets `hasOperated` and adds the company to `turn.operatedThisOR`, a `loan:*` assetTransfer to a company increments `turn.loansThisOR`, a player→pool shareTransfer during an SR adds to `soldThisSR`, a `bankrupt` counter marks a player bankrupt, and a `turnAdvance` changing round / OR set / OR index / SR number clears the per-round sets
- [X] T010 [P] Write `tests/domain/invariants.test.ts` for data-model §11: money total = `bank.total` + Σ `initialTreasuries.money` (1848: 10,000 + 2,000); money check skipped when `bank: "unlimited"`; Σ share units per company (including `removed`) = `shareCount`; each asset has exactly one holder; loan supply + outstanding + removed = `loans.supply`; negative `ipo:*`/`pool` units are flagged; negative holder **money** is NOT flagged; a violation returns `InvariantWarning {kind, detail, firstBadGroupId}`
- [X] T011 [P] Write `tests/domain/ledger.test.ts`: appending `group` entries; a `revert { groupId }` entry removes that group from the effective log while the group stays in the log; replay determinism (`replay(log)` twice → deep-equal state); invariants are checked after every group and the first failing group id is reported
- [X] T012 [P] Write `tests/domain/conservation.test.ts`: a seeded-PRNG property test (hand-written mulberry32, no new dependency) of 1,000 random `moneyTransfer`/`shareTransfer`/`assetTransfer` sequences between valid holders, asserting money, share and asset totals are unchanged
- [X] T013 [P] Write `tests/games/schema.test.ts` for definition validation (data-model §4): Zod rejects `playerCount.max > 7` ("`max ≤ 7` (validated)"); semantic errors for missing `startingCash` for a player count in range, `startingCash × max players > bank.total` (unless `"unlimited"`), a `parOptions` price with no `par`-tagged cell, a train `rustsOnPhase` naming an undefined phase, certificate units not summing to `shareCount`, a market row with no cells, an unknown `customRules` id, and a `loans` block with `interestPerOR ≠ 0` or `repayable: true` (data only in v1, constitution VII)
- [X] T014 [P] Write `tests/persistence/sessionRepo.test.ts` (fake-indexeddb): `appendEntry` resolves only after the transaction commits; entries load in `seq` order; two sessions do not mix entries; `settings` live in their own store and are not returned by session reads
- [X] T015 [P] Write `tests/app/sessionStore.test.ts`: `dispatch` persists the entry **before** subscribers see the new state (FR-090); a failed persist leaves state unchanged and returns an error; `revert(groupId)` appends a `revert` entry and the state matches the log without that group; warnings from `validate` are returned but never block

### Implementation for Foundational

- [X] T016 Create `src/domain/types.ts`: `PlayerId` ("p1".."p7"), `CompanyId`, `PrivateId`, `AssetId` (formats `"train:<type>:<n>"`, `"private:<id>"`, `"loan:<n>"`), `HolderRef` union exactly as data-model §1 (`"bank" | player:* | company:* | ipo:* | "pool" | "removed"`), `CellRef` (`{row, col}` or `{index}`), `parseHolder`, and capability predicates: money only in `bank`, `player:*`, `company:*` ("`ipo:*`, `pool` and `removed` hold **no money**"); shares in `player:*`, `company:*`, `ipo:*`, `pool`, `removed`; assets in any holder except `ipo:*`, and "Only trains may be held by `pool`"
- [X] T017 Create `src/domain/events/types.ts` with the closed `PrimitiveEvent` union verbatim from contracts/events.md (`moneyTransfer` "amount > 0, integer"; `shareTransfer` "units > 0"; `marketMove` reasons; `companyStatus` statuses `unstarted | parred | floated | receivership | bankrupt | closed`; `assetTransfer`; `turnAdvance`; `counterChange`; `note`)
- [X] T018 Create `src/domain/events/state.ts`: readonly `SessionState` (bank cash; `PlayerState` per data-model §3 with `cash`, `holdings`, `certificates`, `counters.debt`, `soldThisSR`, `bankrupt`; `CompanyState` per §5 with `status`, `parPrice?`, `position?`, `stackOrder`, `cash`, `shareCount`, `president?`, `trains`, `loans`, `hasOperated`, `operatedThisOR`, `floatConfirmed`, `capitalPending`, `counters`; `holdings: Record<HolderRef, Record<CompanyId, number>>` and `presidencyHolder`; asset owner map; `TurnState` per §9 with `round` `"PRIVATES" | "SR" | "CR" | "OR"`, `srNumber`, `orSet`, `orIndex`, `orsInSet`, `scheduleIndex?`, `operatingOrder`, `currentCompany?`, `phase`, `loansThisOR`, `operatedThisOR`; end triggers are **not** stored, see T152) and `emptyState(game, players)`; derived getters (`president`, `trains`, `loans`, certificate count where a presidency counts once). Freeze states in dev
- [X] T019 Implement `src/domain/events/reduce.ts`: pure `reduce(state, event)` and `reduceAll(state, events)` making T009 pass; `marketMove` into an occupied cell sets `stackOrder = max + 1`; derive `hasOperated`, `operatedThisOR`, `loansThisOR`, `soldThisSR` and player `bankrupt` exactly by the derivation table in data-model §5 (no new primitives)
- [X] T020 Implement `src/domain/mechanics/invariants.ts`: `checkInvariants(game, state) → InvariantWarning[]` making T010 pass
- [X] T021 Implement the ledger core making T011 pass: `src/domain/ledger/entries.ts` (`LogEntry` union from data-model §10 with `group`, `revert`, `amend`; `source: "touch" | "voice" | "system"`; `touches` keys `money:<holder>`, `shares:<company>`, `market:<company>`, `asset:<assetId>`, `turn`, `status:<company>`; `touchesOf(events)`), `src/domain/ledger/effectiveLog.ts` (groups in order, skipping reverted), and `src/domain/ledger/replay.ts` (`replay(game, players, log) → {state, warnings}` running invariants after each group)
- [X] T022 Create `src/domain/games/schema.ts`: the Zod `GameDefinition` with every field in data-model §4 (`id`, `name`, `version`, `basedOn?`, `currency`, `playerCount {min, max}` with `max ≤ 7`, `options: OptionDef[]`, `bank: {total} | "unlimited"`, `initialTreasuries`, `startingCash`, `companies: CompanyDef[]`, `privates: PrivateDef[]`, `capitalization`, `ipoPrice`, `floatPercent`, `floatCounts`, `unownedDividends {ipo, pool, treasury}` each `"company" | "none"` (`"none"` = money stays in the Bank), `revenueParts {id, label, to: "choice" | "treasury" | "dividend"}[]`, `payoutModes`, `rounding`, `market: MarketDef` (shape, cells with `tags`/`zone`/`leftEdge`/`rightEdge`, `edges`, `moves`, `tracks`), `trains: TrainDef[]`, `trainLimitScope`, `phases: PhaseDef[]`, `roundSchedule`, `srOrder`, `orOrder`, `limits`, `loans?: LoanDef` (`interestPerOR` literal `0`, `repayable` literal `false` in v1), `endTriggers`, `customRules: {id, config}[]`, `chipPreset`, `verification`), plus `CompanyDef`, `PrivateDef`, `TrainDef`, `PhaseDef`, `LoanDef` exactly as listed there; export the inferred TS types
- [X] T023 Create `src/domain/mechanics/custom/index.ts`: the `Mechanic` interface (id, `configSchema` (Zod), optional `actions`, `availability`, `expand`, `triggers`, `roundTypes` extension points, research R16) and a registry containing the nine ids `loans`, `nationalBank`, `nationalTakeover`, `bankDebt`, `forcedWithhold`, `corporateBankruptcy`, `manualFloatCondition`, `privateGrants`, `corporateRound` as stubs with their config schemas (shapes from contracts/game-definition.md examples). `getMechanic(id)` throws on unknown ids. No mechanic may branch on a game id
- [X] T024 Implement `src/domain/games/validateDefinition.ts`: Zod parse + the semantic checks of T013 + config validation of each `customRules` entry through the registry; returns `{ok, errors[]}`. Makes T013 pass
- [X] T025 Create `src/domain/actions/schemas.ts` base: shared Zod field schemas (`holderRef`, nullable `companyId` meaning "current company", positive integer money), `Warning {code, messageEs, severity}`, and an `Action` discriminated union on `type` that later stories extend. Include the ledger actions `undo {groupId: string | null}` and `note {text}`
- [X] T026 Implement the action pipeline: `src/domain/actions/availability.ts` (per-action `isAvailable(game, state)` registry plus mechanic hooks), `src/domain/actions/validate.ts` (per-action warning rules registry; returns `Warning[]`, never throws), `src/domain/actions/expand/index.ts` (per-action expander registry; pure and deterministic given `(game, state, action)`), `src/domain/actions/triggers.ts` (post-expansion trigger runner that applies registered triggers to the interim state inside the same group), and `src/domain/actions/pipeline.ts` (`runPipeline(game, state, action) → {events, warnings, touches} | {unavailable}`)
- [X] T027 [P] Create `src/domain/i18n/es.ts` scaffolding: `formatMoney(amount, currency)` (thousands with "." and the game symbol), holder display names, a per-action `summaryEs(action, game, stateBefore)` registry with a fallback, and status labels (`receivership` → "administrada", `bankrupt` → "en quiebra", …)
- [X] T028 Create `src/persistence/db.ts`: `idb` `openDB("companion", 1)` with stores `sessions` (key `id`), `entries` (key `[sessionId, seq]`), `snapshots` (key `[sessionId, seq]`), `settings` (key `key`), `games` (key `id`) (research R6)
- [X] T029 Implement `src/persistence/sessionRepo.ts`: `createSession(meta)`, `appendEntry(sessionId, entry)` in one `readwrite` transaction with `{durability: "strict"}` that also updates `sessions.updatedAt`/`entryCount`, `loadSession(id) → {meta, entries}`, `listSessions()`, `updateMeta(id, patch)`. Makes T014 pass
- [X] T030 [P] Implement `src/persistence/settingsRepo.ts` for data-model §13: `apiKey?`, `rememberKey` (false → key kept in memory only, never written), `voiceLocale` (default `"es-ES"`), `model` (default `"claude-sonnet-5"`), `lastSessionId?`
- [X] T031 Implement `src/app/SessionStore.ts`: owns `game`, `players`, `log` and derived `state`/`invariantWarnings`; `subscribe`/`getSnapshot`; `dispatch(action, {source, transcript?}) → {group, warnings} | {error}` running `runPipeline`, building the `group` entry (`seq`, `id`, ISO `at`, `touches`, `warnings`), persisting via `sessionRepo.appendEntry`, then reducing and notifying; `revert(groupId?)` (default last active group) appending a `revert` entry; `load(sessionId)` replaying the stored log. Makes T015 pass
- [X] T032 Create `src/app/useSession.ts`: `useSession()` via `useSyncExternalStore`, plus `useDispatch()`; the only React entry point to the store
- [X] T033 Create `src/ui/App.tsx`: screen switching by app state (no router; screens Home, NewSession, Table, History, Market, Settings, CustomGame), a top-level error boundary that shows the error and a "Volver al inicio" button

**Checkpoint**: Foundation ready. `npm run typecheck`, `npm run lint` and `npm test` pass.

---

## Phase 3: User Story 1 - Set up a game and track money by touch (Priority: P1) 🎯 MVP

**Goal**: Create a session for 1830, 1848, 21Moon or a custom copy, deal starting cash, show the
Table, and record manual transfers by touch with an Undo toast. State survives reloads.

**Independent Test**: Start a 4-player 1830 session (expect $600 each, bank $9,600), transfer
100 from Ana to the bank (Ana $500, bank $9,700), reload, and see the identical state with no
invariant badge (quickstart scenarios 1–2).

### Tests for User Story 1 (write first, must fail)

- [X] T034 [P] [US1] Write `tests/games/definitions.test.ts`: each built-in passes `validateDefinition`; 1830 bank $12,000 and starting cash 2p 1200 · 3p 800 · 4p 600 · 5p 480 · 6p 400 · 7p 350; 1848 bank £10,000, 3p 840 · 4p 630 · 5p 510 · 6p 430, `initialTreasuries` BOE £2,000 + `loan:1`..`loan:20`; 21Moon `bank: "unlimited"`, 2p 600 · 3p 540 · 4p 410 · 5p 340; player ranges 1830 2–7, 1848 3–6, 21Moon 2–5; every `verification` value is `"verified"`; 1830 `ruleset` option patches (`base` → `bankDebt` + `forcedWithhold`; `classic` → `corporateBankruptcy`)
- [X] T035 [P] [US1] Write `tests/domain/actions/setup.test.ts`: `createSession` expansion — 1830 4p: bank→each player 600, bank shows 9,600, each `ipo:<company>` holds `shareCount` units, privates and trains held by `bank`; 1848: BOE treasury £2,000 and 20 loan markers set up outside the bank total, money invariant total £12,000; 21Moon: no money invariant, reserve trains (`reserve`) held by `removed`; initial `turnAdvance` sets the first round (`PRIVATES`); player count outside the game range → warning; 8 players → schema error
- [X] T036 [P] [US1] Write `tests/domain/actions/manual.test.ts`: `transferMoney` emits exactly one `moneyTransfer`; `adjustMoney` with `delta` and with `setTo` emits one bank↔holder transfer for the difference (none when 0); `transferShares` emits one `shareTransfer`; a money transfer from/to `ipo:*`, `pool` or `removed` fails schema validation; transferring more than a holder has is allowed with an "insufficient cash" warning
- [X] T037 [P] [US1] Write `tests/games/customGame.test.ts`: copying 1830 gives a new uuid `id`, `basedOn: "1830"`; editing `bank.total` and a company `name` changes the copy and leaves the built-in deep-equal to before (US1-5); editing a non-editable field (`market`, `phases`, `payoutModes`, `revenueParts`, `rounding`, `capitalization`, `roundSchedule`, `customRules`) is rejected; an invalid edit (starting cash × max players > bank) fails `validateDefinition`
- [X] T038 [P] [US1] Write `tests/persistence/resume.test.ts`: create an 1830 session through `SessionStore`, dispatch a transfer, construct a fresh store, `load` the same id → deep-equal state and log (FR-090, SC-007); `lastSessionId` points at it

### Implementation for User Story 1

- [X] T039 [P] [US1] Write `src/domain/games/g1830.ts` from research R14: bank 12,000; starting cash; PRR, NYC, CPR, B&O, C&O, Erie, NNH, B&M (one 20% president's certificate + eight 10%, aliases incl. "la Pennsy", "be y o", "la iri"); par 67/71/76/82/90/100; `ipoPrice: "par"`; `floatPercent: 60`; `capitalization {type: "full", timing: "endOfSR"}`; `unownedDividends {ipo: "none", pool: "company", treasury: "none"}`; `payoutModes: ["full", "withhold"]`; rounding floor; the 11-row market grid from R14 with zones `y`/`o`/`b`, par tags, `noUp` at 350, `edges {right: "up", left: "down"}`; moves payout right 1, withhold left 1, sell `{per: "share", n: 1, onlyIfOperated: false}`, sold-out `{heldBy: "players", at: "endSR"}`; trains 2×6 $80 · 3×5 $180 · 4×4 $300 · 5×3 $450 · 6×2 $630 · D×6 $1100 (trade-in $800 for 4/5/6 → pool); phases with limits and rusting per R14; privates SV/CS/DH/MH/CA/BO with costs, income, company price range ½×–2×, grants/exchange, closings; limits (certificates 2p 28 · 3p 20 · 4p 16 · 5p 13 · 6–7p 11, 60%, pool 5 certs, zone relaxations); `orOrder {by: "priceDesc", ties: ["stackTop", "columnRight", "rowTop"], dynamic: true}`; option `ruleset` (`base` default, `classic`); end triggers; `chipPreset` 500/100/50/20/10/5/1; `verification` all `"verified"`
- [X] T040 [P] [US1] Write `src/domain/games/g1848.ts` from research R13 and the contracts/game-definition.md example: companies QR, COM, FED, VR, SAR, WA, NSW, CAR (+ BOE `kind: "national"`), par 70/80/90/100 (CAR fixed 100), float 60, capitalization `onFloat`, `unownedDividends` all `"none"`, pay/withhold only, rounding floor; the 6-row market grid from R13 with `receivership`-tagged column 0, start cells, `top` at 450; sell `{per: "sale"}`; sold-out up 1 at endSR; `tracks.BOE` (start 70, `byLoansIssued` 80…340, `endGameAtIndex: 15`); trains incl. 2E (from phase 5, not counted for the limit) and D trade-in; phases with train limit 4 → 3 (phase 4) → 2 (phase 5 on), ORs per set 1/2/3; privates P1–P6 with income, company price caps, P5 grants 10% QR, P6 grants CAR director's share at par 100 and closes when CAR buys a train; `loans` and the five `customRules` from the contract example; end triggers (bank broken, top cell, ≥16 loans, ≥5 receiverships); chip preset; `verification` all `"verified"`
- [X] T041 [P] [US1] Write `src/domain/games/g21moon.ts` from research R15 and the contract example: `bank: "unlimited"`; companies SWP, HMQ, VH, ITC, SSF, LG, KR; start prices 60/70/80/90; `capitalization {type: "incremental"}`; `ipoPrice: "market"`; float 50; `revenueParts` local → treasury, spacePort → dividend; `payoutModes: []`; `unownedDividends {ipo: "none", pool: "none", treasury: "company"}`; the staggered 7-row market grid from R15 with per-cell `leftEdge`/`rightEdge` arrows, start cells and a `closed` cell; payout move rules (E = 0 left 1; E ≥ 2P right 2; E ≥ P/2 right 1; otherwise none); sell `{per: "sale", onlyIfOperated: true}`; `soldOut {heldBy: "playersAndCompanies", at: "endCR"}`; `poolPenalty`; `issue`; trains with `reserve` UN cards; `trainLimitScope {perBase: 2, bases: ["local", "spacePort"]}`; phases 2/3/4/5/6/10 with removals; fixed `roundSchedule` with events (SR3 late company available, OR3.1 and OR5.1 Space Port values, OR4.1 `closePrivates`); privates P1–P6; option `lateCompany`; limits (certificates 2p 15 · 3p 15 · 4p 12 · 5p 10; 50% (60% with 2 players); pool ≤ 50%); `customRules` `corporateRound`, `forcedWithhold`, `corporateBankruptcy {trigger: "closedCell"}`, `privateGrants`; `verification` all `"verified"`
- [X] T042 [US1] Create `src/domain/games/index.ts`: `builtInGames` (deep-frozen), `applyOptions(def, options)` that applies each `OptionDef` patch and returns the frozen session copy (FR-005), and `hasUnverified(def)`
- [X] T043 [US1] Implement `src/domain/games/customGame.ts` per contracts/game-definition.md rule 4: `createCustomGame(builtIn, name)` = `{...structuredClone(builtIn), id: uuid, basedOn: builtIn.id, name}`, and `editCustomGame(def, patch)` allowing only `name`, `bank.total`, `startingCash`, company `name/shortName/aliases/color`, private `name/cost/income`, train `cost/count`, `chipPreset`; validates with `validateDefinition`. Makes T037 pass
- [X] T044 [US1] Add Zod schemas to `src/domain/actions/schemas.ts` for `createSession {game, options, players: {id, name, color, aliases, seat}[], walletMode: "appTruth" | "bankOnly", chipSet}`, `transferMoney {from, to, amount}`, `adjustMoney {holder, delta | setTo}`, `transferShares {company, from, to, units}`; player names unique and non-empty, seat order a permutation of 1..n, at most 7 players; duplicate aliases (case- and accent-insensitive) produce a warning, not an error (data-model §2)
- [X] T045 [US1] Implement `src/domain/actions/expand/setup.ts` (`createSession`: starting cash bank→players, IPO shares, `initialTreasuries` money and assets, privates/trains to `bank`, reserve trains to `removed`, initial `turnAdvance`) and register the player-count range warning. Makes T035 pass
- [X] T046 [US1] Implement `src/domain/actions/expand/manual.ts` (`transferMoney`, `adjustMoney`, `transferShares`, `note`) and the insufficient-cash warning in `src/domain/actions/validate.ts`. Makes T036 pass
- [X] T047 [US1] Add Spanish summaries for `createSession`, `transferMoney`, `adjustMoney`, `transferShares`, `note`, `undo` to `src/domain/i18n/es.ts` (e.g. "Ana paga $100 al banco")
- [X] T048 [P] [US1] Implement `src/persistence/gamesRepo.ts`: save/list/load/delete custom games in the `games` store; built-ins are never written
- [X] T049 [P] [US1] Create `src/ui/components/PlayerTile.tsx`: large tile with color swatch **and** name, cash (hidden when `walletMode === "bankOnly"`, US1-4), certificate count, debt badge when `counters.debt > 0`; whole tile is a ≥ 48 px target that opens PlayerSheet
- [X] T050 [P] [US1] Create `src/ui/components/CompanyCard.tsx`: short name rendered over the company color (never color alone), treasury, share price, president name, status label from `es.ts`, train list, loan count when > 0; tap opens CompanySheet
- [X] T051 [P] [US1] Create `src/ui/components/TopBar.tsx`: bank remaining ("ilimitado" for unlimited banks), "banca quebrada" at ≤ 0 (FR-082), an invariant badge when `invariantWarnings` is non-empty (FR-015), and slots for round indicator and mic used later
- [X] T052 [P] [US1] Create `src/ui/components/Keypad.tsx`: integer-only numeric keypad with 48 px keys, backspace, quick multiples (×10, +10/+50/+100), `onSubmit(amount)`
- [X] T053 [P] [US1] Create `src/ui/components/UndoToast.tsx`: after every applied group, whatever its source (a touch dispatch or a confirmed voice proposal, constitution IV), show the group's Spanish summary for ~5 s with a "Deshacer" button that calls `store.revert(group.id)` (US1-6, FR-061); a slot for the chip breakdown filled in US6
- [X] T054 [US1] Create `src/ui/screens/Home.tsx`: "Continuar" for `lastSessionId` (FR-006), list of sessions (name, game, updatedAt), "Nueva partida", "Juego personalizado"
- [X] T055 [US1] Create `src/ui/screens/NewSession.tsx`: game picker (built-ins + custom games, "reglas sin verificar" badge when `hasUnverified`), session options, player rows limited to the game's range and never more than 7 (name, color, aliases, seat order with up/down), wallet mode choice, then dispatch `createSession`, set `lastSessionId`, and open Table. Default session name "1830 · 07/10 20:15"
- [X] T056 [US1] Create `src/ui/screens/CustomGame.tsx`: pick a built-in, edit only the fields allowed by T043, show validation errors, save via `gamesRepo`
- [X] T057 [US1] Create `src/ui/screens/Table.tsx`: TopBar, PlayerTile grid and CompanyCard grid per layout.css breakpoints, UndoToast host, menu to History/Market/Settings/Home
- [X] T058 [US1] Create `src/ui/sheets/PlayerSheet.tsx` and `src/ui/sheets/CompanySheet.tsx`: "Pagar" (from this holder to bank/player/company, keypad amount), "Fijar valor" (`adjustMoney setTo`), "Mover acciones" (`transferShares`); each dispatches one action (FR-024)
- [X] T059 [US1] Implement `src/app/wakeLock.ts` (Screen Wake Lock, re-acquire on `visibilitychange`, silent no-op when unsupported) and acquire/release it from `Table.tsx` (FR-102)
- [X] T060 [US1] Write `e2e/setup.spec.ts` (quickstart 1: create 1830 with Ana, Bruno, Carla, Dani → $600 each, bank $9,600; pay 100 Ana→bank → Ana $500, bank $9,700, toast with Deshacer; bank-only mode hides player cash) and `e2e/reload.spec.ts` (quickstart 2: reload → Continuar → identical state)

**Checkpoint**: US1 is a usable money counter for all three games.

---

## Phase 4: User Story 2 - Undo, amend, and review history (Priority: P1)

**Goal**: Amend any past entry, undo from History with a dependency warning, and see reverted
and amended entries in History. Snapshots keep replay fast.

**Independent Test**: Perform several actions, undo the last, amend an earlier one, and confirm
balances equal entering the corrected actions directly (quickstart scenario 4).

### Tests for User Story 2 (write first, must fail)

- [X] T061 [P] [US2] Write `tests/domain/amend.test.ts` (research R3): an `amend` entry's events are expanded against the state **at the original group's position**; the effective log swaps in the latest amendment; later groups keep their stored events (not re-expanded); an amend that later breaks an invariant surfaces a warning (nothing corrected); undoing an amend re-activates the previous version; amending a reverted group is refused; group status derives as `active | reverted | amended`
- [X] T062 [P] [US2] Write `tests/domain/dependencies.test.ts`: `dependentsOf(g)` returns later active groups whose `touches` intersect the keys `g` changes (money, shares, market, asset, turn, status); independent groups are not listed
- [X] T063 [P] [US2] Write `tests/domain/snapshots.test.ts`: a snapshot every 50 groups; snapshot + tail replay deep-equals full replay; a `revert`/`amend` aimed before a snapshot invalidates later snapshots and rebuild starts from the nearest earlier one

### Implementation for User Story 2

- [X] T064 [US2] Implement `src/domain/ledger/amend.ts` (`buildAmend(game, log, groupId, action)` expanding at the original position) and extend `src/domain/ledger/effectiveLog.ts` with amendment swapping and `groupStatus`. Makes T061 pass
- [X] T065 [US2] Implement `src/domain/ledger/dependencies.ts` (`dependentsOf(log, groupId)`). Makes T062 pass
- [X] T066 [US2] Implement `src/domain/ledger/snapshots.ts` (every 50 groups, invalidation) and add `putSnapshot`/`latestSnapshotBefore`/`deleteSnapshotsFrom` to `src/persistence/sessionRepo.ts`. Makes T063 pass
- [X] T067 [US2] Extend `src/app/SessionStore.ts`: `previewRevert(groupId)`/`previewAmend(groupId, action)` return dependents; `revert(groupId, {confirmed})` and `amend(groupId, action, {confirmed})` append the entry only after confirmation when dependents exist (FR-014); load and rebuild use snapshots
- [X] T068 [P] [US2] Create `src/ui/components/DependentsDialog.tsx`: "Hay N entradas posteriores que dependen de esta" with their summaries and Cancelar / Aplicar igualmente
- [X] T069 [US2] Create `src/ui/screens/History.tsx`: newest-first list of groups with Spanish summary, time, source icon (touch/voice/system), transcript for voice, status (reverted struck through; amended showing original and correction, US2-2), the first invariant-breaking group highlighted (FR-015), and per-entry Deshacer / Corregir (FR-013)
- [X] T070 [US2] Create `src/ui/sheets/AmendSheet.tsx`: opens the original action's fields prefilled (amounts via Keypad, pickers for enums), dispatches `amend` through the store, routes through DependentsDialog
- [X] T071 [US2] Write `tests/ui/history.test.tsx`: undo from History marks the entry reverted and balances revert; amend 240 → 260 shows both entries; a dependent-entries warning appears when later entries touch the same company

**Checkpoint**: US1 + US2 give a safe, correctable money counter.

---

## Phase 5: User Story 3 - Run an operating round with automated dividends (Priority: P1)

**Goal**: Revenue entry with Pay/Withhold/Half (or per-part revenue), dividend routing, price
moves, train purchases with phase changes, costs, private income, and full 1848 OR mechanics
(loans, BoE, receivership), plus 1830 Base receivership and 21Moon forced withhold and bankruptcy.

**Independent Test**: In 1830 with Ana 60%, Bruno 20%, pool 20% of PRR, pay out 240 → Ana +144,
Bruno +48, PRR treasury +48, price right 1 (quickstart 3); 1848 loan and receivership
(quickstart 5); 21Moon two-part revenue (quickstart 12).

### Tests for User Story 3 (write first, must fail)

- [X] T072 [P] [US3] Write `tests/domain/payout.test.ts` (contracts/actions.md "Payout"): `perShare = round(amount / shareCount)` for `floor`/`ceil`/`round`; routing player → player, `company:X` holding X → `unownedDividends.treasury`, `ipo:X` → `.ipo`, `pool` → `.pool`, `company:Y` holding X → company Y; destination `"none"` emits **no transfer** (the money stays in the Bank); half: `paid = roundHalf(amount)`, company keeps `amount − paid`; withhold → all to treasury; revenue parts `treasury` / `dividend` / `choice`
- [X] T073 [P] [US3] Write `tests/domain/market.test.ts`: payout/withhold/half `MoveRule`s evaluated in order, first match wins; 21Moon thresholds against the **pre-move** price (E = 0 left 1; 0 < E < P/2 none; E ≥ P/2 right 1; E ≥ 2P right 2); default edges (right end → up "if possible", left end → down "if possible"); per-cell `leftEdge`/`rightEdge` overrides; up/down at column top/bottom don't move; `noUp` blocks upward moves (1830 at 350); new arrivals stack underneath; unfloated companies do not move in ORs; entering `receivership`/`closed`/`top` cells emits the matching trigger
- [X] T074 [P] [US3] Write `tests/domain/trains.test.ts`: `buyTrain` from bank at list cost, from pool at face value to the bank, from another company at an agreed price ≥ 1; trade-in (1830 D for $800, traded train → pool); phase change only on the first train of a type (idempotent), with effects rust → `removed`, close privates → `removed`, train-limit change; 1848 §5.4.4 a removed train counts as sold; train-limit warnings (1848 4 → 3 → 2 with 2E excluded; 21Moon 2 per base); `discardTrain` → `pool` (1830) or `removed` (1848); `changeTrainSupply` moves a reserve card between `removed` and `bank`
- [X] T075 [P] [US3] Write OR cases in `tests/games/1830.test.ts`: US3-1 (Ana 60%, Bruno 20%, pool 20%, 240 full → 144 / 48 / pool 48 to PRR treasury, right 1); rulebook §7.5 example (50% player / 30% IPO / 20% pool on $50 → $25 player, $10 treasury, $15 stays in the Bank); withhold 180 → treasury +180, left 1 (US3-2); Half not available (US3-3); no loan actions available (US3-7); Base ruleset forced train purchase: president pays what they can, the Bank lends the rest (`bankDebt`), company status `receivership`, next runs forced withhold with revenue repaying the debt, back to `floated` at 0; Classic ruleset: shortfall → `corporateBankruptcy` with end-game flag
- [X] T076 [P] [US3] Write OR cases in `tests/games/1848.test.ts` citing §: loans only from phase 3 (§5.6), £100 from BOE treasury + one loan marker in ascending order, company left 2 for the first loan and left 3 for each later loan in the same OR, and left 2 again for the first loan after `startOR` begins a new OR, BOE price = `byLoansIssued[n − 1]`, no interest and no repay action exists (US3-6); BoE `nationalPayout` = phase minimum (0/100/200/300) + user extra, 10% per share, paid by the normal Bank; per-share dividends floored with the remainder in the Bank; withhold into the `receivership` column triggers `nationalTakeover`: compensation par × each non-director player share, director shortfall lent via `bankDebt` and repaid from their next income, remaining treasury → Bank, trains → `removed`, status `receivership`; 2nd and 5th takeovers remove the cheapest permanent train in the Bank; 5th sets the end trigger; P6 closes when CAR buys a train; all privates close on the first 5/5+
- [X] T077 [P] [US3] Write OR cases in `tests/games/21moon.test.ts`: quickstart 12 (VH local 60 / Space Port 40 → treasury +60, 4 per share to holders, none for IPO and pool, right 1; amend Space Port to 30 → no move; to 0 → left 1); own treasury shares paid to the company; SSF holding 10% of VH receives 35 into its treasury (§11.5 example); `bankPays` P3 ₡60 once; a company in `receivership` withholds everything and moves left 1 each run (`forcedWithhold`); entering the `closed` cell → `corporateBankruptcy` (its shares → `removed`, treasury → Bank, shares it holds → pool, assets → `removed`)

### Implementation for User Story 3

- [X] T078 [US3] Implement `src/domain/mechanics/payout.ts` (`computePayout(game, state, company, parts, mode) → {transfers, dividendForMoves}`). Makes T072 pass
- [X] T079 [US3] Implement `src/domain/mechanics/market.ts` (`cellAt`, `neighbor(dir)` with edges and arrows, `applyMoveRules(game, state, company, kind, context) → CellRef`, `moveSteps`, cell-trigger detection, `stackOrder` handling). Makes T073 pass
- [X] T080 [US3] Implement `src/domain/mechanics/phases.ts` (`phaseTriggeredBy(game, state, trainType)`, phase effects `rust`, `closePrivates`, `enableActions`, `setNationalMinDividend`, `dropFloatCondition` as events, current train limit, train-limit warnings incl. `trainLimitScope`)
- [X] T081 [US3] Add Zod schemas to `src/domain/actions/schemas.ts` for `runAndPayout {company: CompanyId | null, parts: {part, amount}[], mode: "full" | "withhold" | "half" | null}`, `buyTrain {company | null, trainType, variant | null, from: "bank" | "pool" | "company", seller | null, price | null, tradeIn | null}`, `payCost {company | null, amount, reason | null}`, `bankPays {company | null, amount, reason}`, `privateIncome {}`, `buyPrivateByCompany {company | null, private, price}`, `discardTrain {company, train}`, `changeTrainSupply {trainType, op: "add" | "remove"}`, and a minimal `startOR {}`; `null` resolves to the current company / current price
- [X] T082 [US3] Implement `src/domain/actions/expand/operating.ts` for the actions in T081 (payout transfers then `marketMove` per move rules, plus `counterChange {key: "runs", delta: 1}` for the company so `hasOperated`/`operatedThisOR` derive per data-model §5; minimal `startOR` = one `turnAdvance` to round `OR`: coming from an SR it starts set `orSet + 1` at `orIndex: 1`, otherwise it increments `orIndex`, which clears the per-OR sets (US7 T150 adds ordering, schedule and events); `buyTrain` money + `assetTransfer` + phase change and effects; `privateIncome` bank→owner for each open private, company-owned income to the treasury), and register the phase trigger in `src/domain/actions/triggers.ts`. Makes T074 and the non-mechanic parts of T075–T077 pass
- [X] T083 [US3] Register availability and warnings for operating actions in `src/domain/actions/availability.ts` and `src/domain/actions/validate.ts`: `mode` must be one of `game.payoutModes` (Half hidden when absent, US3-3); per-part entry when `revenueParts` has no `"choice"` part (FR-030); warnings for insufficient company cash, train limit, train not yet available, company private price outside `companyPriceRange`
- [X] T084 [P] [US3] Implement `src/domain/mechanics/custom/loans.ts`: `takeLoan {company | null, count}` (lender→company `amount × n`, next loan markers in ascending order, company `marketMove reason "loan"` left `first` then `subsequentInOR` using `turn.loansThisOR`, national track step); availability from `availableFromPhase`; warning beyond `voluntaryLimit`; loan actions unavailable when `game.loans` is absent (FR-112, US3-7). Build **no** repay action or interest charging: `interestPerOR` and `repayable` are data only, and `validateDefinition` accepts only `0` / `false` (constitution VII)
- [X] T085 [P] [US3] Implement `src/domain/mechanics/custom/nationalBank.ts`: director-less national company priced from `market.tracks[company]` by loans issued; `nationalPayout {extra}` = phase minimum (`setNationalMinDividend`) + extra, bank→shareholders 10% per share (no pay to IPO/pool); operates first via `orOrder.before`
- [X] T086 [P] [US3] Implement `src/domain/mechanics/custom/bankDebt.ts`: lending = bank→debtor `moneyTransfer` + `counterChange debt +x`; a trigger that adds debtor→bank `moneyTransfer` + `counterChange debt −y` (y = min(income, debt)) to any later group paying the debtor; company debtor → status `receivership` with presidency frozen, back to `floated` at 0 debt and any pending presidency change applied; shortfall handling for `buyTrain` (president pays, Bank lends the rest)
- [X] T087 [P] [US3] Implement `src/domain/mechanics/custom/forcedWithhold.ts`: for a company in `receivership`, `runAndPayout` is expanded as withhold (and repay with `bankDebt`) with a left-1 move each run; Pay/Half shown disabled with the reason
- [X] T088 [US3] Implement `src/domain/mechanics/custom/nationalTakeover.ts` (depends on T086): triggered by entering a `receivership` cell or by `enterReceivership`; compensation par × non-director player share from the company, director shortfall lent via `bankDebt`, treasury → Bank, trains → `removed`, status `receivership`, `counterChange {subject: "bank", key: "nationalTakeovers", delta: 1}`, cheapest permanent bank train removed at configured counts `[2, 5]` (read from that counter), end-game threshold 5; one group with the triggering action
- [X] T089 [US3] Implement `src/domain/mechanics/custom/corporateBankruptcy.ts`: triggered by a `closed` cell or `declareBankruptcy {company}`; company shares → `removed`, treasury → Bank, shares it holds → pool, assets → `removed`, status `bankrupt`, optional end-game flag; player bankruptcy (`declareBankruptcy {player}`): money → Bank, shares → pool, privates → `removed`, `counterChange {subject: player:P, key: "bankrupt", delta: 1}`
- [X] T090 [US3] Add schemas and `src/domain/actions/expand/status.ts` for `enterReceivership {company}`, `declareBankruptcy {player | company}`, `closeCompany {company}` (`companyStatus closed`, assets stay), `adjustCounter {subject, key, delta}`
- [X] T091 [US3] Add Spanish summaries for every US3 action and mechanic event to `src/domain/i18n/es.ts` (e.g. "PRR paga 240 (24/acción) → derecha 1", "QR pide 1 préstamo: +£100, izquierda 2", "VR pasa a administración del BoE")
- [X] T092 [US3] Create `src/ui/sheets/OperateSheet.tsx`: Keypad revenue then one tap on Pagar / Retener / Mitad (only allowed modes; payout ≤ 2 taps after entering revenue, SC-006), or one Keypad field per revenue part (21Moon) with Confirmar; tabs/buttons for Comprar tren (bank/pool list with costs, or another company with price), Pagar costo (amount + reason), Cobro del banco, Comprar privada, Préstamo (only when available), Descartar tren (`discardTrain`), Cambiar oferta de trenes (`changeTrainSupply`, only when the game has reserve trains), BoE extra entry for `nationalPayout`; disabled options show the reason
- [X] T093 [US3] Wire operating UI in `src/ui/screens/Table.tsx` and `src/ui/components/CompanyCard.tsx`: CompanyCard → OperateSheet; a "Cobrar privadas" action and an "Empezar OR" button (minimal `startOR`); status actions in `src/ui/sheets/CompanySheet.tsx` (Entrar en administración → `enterReceivership`, Declarar quiebra, Cerrar compañía, Ajustar contador → `adjustCounter`) and in `src/ui/sheets/PlayerSheet.tsx` (Declarar quiebra, Ajustar deuda), so every capability is reachable by touch (constitution V); a summary toast for multi-step groups (takeover, bankruptcy) listing every flow; receivership/bankrupt status styling
- [X] T094 [US3] Write `tests/ui/operate.test.tsx`: 1830 shows Pagar/Retener and no Mitad and no Préstamo; 1848 phase 3 shows Préstamo and no "Devolver"; 21Moon shows two part inputs and no mode buttons; payout from revenue entry takes ≤ 2 taps
- [X] T095 [US3] Write `e2e/operating.spec.ts`: quickstart 3 (PRR payout 240 with manual share setup) and quickstart 5 (1848 loan, then Market-free receivership via `enterReceivership` from CompanySheet)

**Checkpoint**: US1–US3 cover the money of an operating round for all three games.

---

## Phase 6: User Story 4 - Run a stock round (Priority: P2)

**Goal**: Par, buy, sell, swap, private purchases and exchanges, float and capitalization,
presidency changes, sold-out moves, batch entry, and the 21Moon corporate round.

**Independent Test**: Run an 1830 SR with par, buys and sells, then check ownership,
presidents, float status, treasuries (capital paid at `endSR`) and prices (quickstart 6, 12, 13).

### Tests for User Story 4 (write first, must fail)

- [X] T096 [P] [US4] Write `tests/domain/capitalization.test.ts`: full `onFloat` (1848) pays bank→company `par × shareCount` the moment shares that left the IPO reach `floatPercent`; full `endOfSR` (1830) sets `capitalPending` and pays at `endSR` (quickstart 13 label "flotada (capital al final de la ronda)"); incremental (21Moon) pays each IPO buy and each issue to the company at the market price; `floatCounts: "soldFromIpo"` counts shares that left the IPO by any route (incl. private grants, later pool sales); `manualFloatCondition` requires `confirmFloatCondition` and is dropped at its phase
- [X] T097 [P] [US4] Write `tests/domain/presidency.test.ts` (data-model §5): presidency moves only when another **player** holds strictly more units; ties keep the president; a tie for most excluding the president goes to the next player in seat order after the old president; a company never becomes president; frozen during `bankDebt` receivership; the swap is `shareTransfer {presidency: true}` plus compensating standard-unit transfers in the same group (US4-4)
- [X] T098 [P] [US4] Write `tests/domain/stock.test.ts`: `parCompany` (status `parred` with `parPrice`, presidency 2 units to the player, `2 × par` to the bank or to the company when incremental, `marketMove reason "par"`, US4-1); `buyShare` from ipo/pool/treasury at `ipoPrice` or market price; `sellShares` at the pre-sale price, `per: "share"` moving n × units after all are sold (1830) vs `per: "sale"` once per action (1848, 21Moon, skipped when `onlyIfOperated` and not operated) (US4-3); sold-out moves at `endSR` in descending price order (`heldBy` players vs players and companies); `swapCertificates` with no money; `stockBatch` as one group applied in order at the stated `assumedPrices` (US4-5); warnings for certificate limit (with 1830 zone relaxations), per-company percent, pool limit, buying a company sold this SR — all warnings, none blocking
- [X] T099 [P] [US4] Write `tests/domain/privateGrants.test.ts`: 1830 CA grants 10% PRR; BO grants the B&O president's certificate with the owner choosing par, and closes when B&O buys its first train; MH `exchangePrivate` takes a NYC share from IPO or pool and closes MH; 1848 P5 grants 10% QR and P6 the CAR director's share at par 100; 21Moon P6 takes one pool share for free and closes
- [X] T100 [P] [US4] Write `tests/domain/corporateRound.test.ts` (21Moon §10): `issueShares` ipo→pool and bank→company at market, one `marketMove reason "issue"` down 1 when floated regardless of count; a company buys another company's IPO share (paid to that company) or a pool share (paid to the Bank, own shares allowed); treasury sales to the pool paid by the Bank; `endCR`: up 1 when 100% held by players or companies, down 1 when any share is in the pool unless the company has not operated, applied in descending price order (quickstart 12 tail)
- [X] T101 [P] [US4] Write SR cases in `tests/games/1830.test.ts`, `tests/games/1848.test.ts` and `tests/games/21moon.test.ts`: 1830 float at 60% bought from IPO with capital at `endSR`, pool buy at market price, sell 2 → down 2; 1848 COM floats only after confirmation until phase 6, BoE shares bought and sold at the track price with no price change, sale money to the normal Bank; 21Moon quickstart 12 opening (Ana starts VH at 70 → ₡140 to VH; three IPO buys at 70 → VH floats at 50% with ₡350 in treasury)

### Implementation for User Story 4

- [X] T102 [US4] Implement `src/domain/mechanics/capitalization.ts` and register the float trigger in `src/domain/actions/triggers.ts`. Makes T096 pass (except the manual condition, T108)
- [X] T103 [US4] Implement `src/domain/mechanics/presidency.ts` and register it as a trigger after every share transfer. Makes T097 pass
- [X] T104 [US4] Add Zod schemas to `src/domain/actions/schemas.ts` for `parCompany {player, company, price}`, `buyShare {buyer, company, source: "ipo" | "pool" | "treasury", count | null}`, `sellShares {seller, company, count}`, `swapCertificates {player, company, give, take}`, `buyPrivate {buyer, private, price}`, `exchangePrivate {private, source: "ipo" | "pool"}`, `stockBatch {items: (buyShare | sellShares | parCompany)[], assumedPrices}`, `startSR`, `endSR`, `confirmFloatCondition {company}`, `issueShares {company, count}`, `startCR`, `endCR`; `buyer`/`seller` may be a company only when `corporateRound` is enabled
- [X] T105 [US4] Implement `src/domain/actions/expand/stock.ts` (`parCompany`, `buyShare`, `sellShares`, `swapCertificates`, `buyPrivate`, `stockBatch` applying items in order against the interim state with assumed prices) and track `soldThisSR`. Makes T098 pass
- [X] T106 [US4] Implement `src/domain/actions/expand/flow.ts` for `startSR` (turnAdvance round `SR`, `srNumber + 1`, reset `soldThisSR`) and `endSR` (pay `capitalPending` companies, sold-out moves in descending price order)
- [X] T107 [P] [US4] Implement `src/domain/mechanics/custom/privateGrants.ts` (grants on `buyPrivate`, `exchangePrivate`, closing triggers `companyBuysTrain`/`exchanged`). Makes T099 pass
- [X] T108 [P] [US4] Implement `src/domain/mechanics/custom/manualFloatCondition.ts` (float requires percentage **and** `confirmFloatCondition`; dropped at `droppedAtPhase`; CompanyCard shows the configured question, e.g. "¿Hay enlace Sídney–Adelaida?")
- [X] T109 [P] [US4] Implement `src/domain/mechanics/custom/corporateRound.ts`: CR round type, company buyers/sellers, `issueShares`, `startCR`/`endCR` with sold-out and `poolPenalty` moves. Makes T100 pass
- [X] T110 [US4] Extend `src/domain/mechanics/custom/nationalBank.ts` for stock actions: buying and selling national shares at the track price, no sell or sold-out moves, sale money paid by the normal Bank, no presidency
- [X] T111 [US4] Register stock warnings in `src/domain/actions/validate.ts` (certificate limit by player count with zone relaxations, per-company percent incl. 21Moon 60% with 2 players, pool limit in certs or percent, buy after sell in the same SR, a company holding a president's certificate)
- [X] T112 [US4] Add Spanish summaries for every US4 action to `src/domain/i18n/es.ts` (e.g. "Ana abre la NYC a 82", "Carla vende 2 Erie a 90 → abajo 2", "Presidencia de la Erie: Carla → Bruno")
- [X] T113 [US4] Create `src/ui/sheets/StockSheet.tsx`: from CompanyCard, one tap on "Comprar IPO" / "Comprar banco" / "Vender" then one tap on the player (≤ 2 taps, FR-100); par with price picker; count stepper for sells; swap; private purchase (also for the `PRIVATES` round) at a given price; exchange private
- [X] T114 [US4] Create `src/ui/sheets/BatchSheet.tsx`: add buy/sell/par rows in the stated order, show the assumed price per row (editable), one summary card, then dispatch one `stockBatch` (FR-042, US4-5)
- [X] T115 [US4] Add SR/CR controls to `src/ui/screens/Table.tsx`: "Fin de ronda de acciones" (`endSR`), CR company actions (issue, company buys/sells) when `corporateRound` is enabled, and the float-condition confirmation prompt on CompanyCard
- [X] T116 [US4] Write `tests/ui/stock.test.tsx`: buy and sell take ≤ 2 taps from Table; batch card shows rows in order with editable prices; the presidency change appears in the toast

**Checkpoint**: US1–US4 cover a full game by touch.

---

## Phase 7: User Story 5 - Use voice commands in Spanish (Priority: P2)

**Goal**: Push-to-talk Spanish voice → strict tool calls → validated proposal on a confirmation
card; clarification, state queries, voice undo/amend/confirm, and graceful degradation.

**Independent Test**: Speak the v1 example set and check each card; "¿cuánto tiene Ana?" is
answered from state; offline or keyless → mic unavailable, touch works (quickstart 7).

### Tests for User Story 5 (write first, must fail)

- [X] T117 [P] [US5] Write `tests/voice/tools.test.ts` (contracts/voice-tools.md): `buildTools(session)` produces one tool per voice-reachable action with `strict: true` and `additionalProperties: false`; optional fields are `nullable` **and** listed in `required`; entity fields are enums of the session's player ids, company ids, train types and private ids; tools for actions the game does not offer are omitted (no loan tools in 1830, no CR tools outside 21Moon); `runAndPayout` takes the two parts in 21Moon; meta tools `askClarification` (2–6 options), `query` (kinds `cash | shares | price | treasury | trains | bank | president | turn`), `notUnderstood`; serialization is byte-identical across different states of the same session (sorted keys)
- [X] T118 [P] [US5] Write `tests/voice/prompt.test.ts`: `systemPromptEs(session)` depends only on the session definition (game summary, players, companies, aliases, enabled mechanics) and carries `cache_control: {type: "ephemeral"}`; `snapshotAndTranscript(state, transcript, clarification?)` contains round, operating company, cash, holdings, trains on sale and the last 5 groups
- [X] T119 [P] [US5] Write `tests/voice/resolve.test.ts` using recorded API responses in `tests/voice/recorded/*.json` (no network): one action → proposal; "compra un 4 y paga 290" (two `tool_use` blocks) → one proposal with two actions in order (US5-2); `askClarification` → clarification with options (US5-3); `query` → answer computed from state, model text ignored (US5-4); `undo`/`amendLast`/`confirmProposal` → ledger operations; `notUnderstood`, no tool call, Zod failure, `stop_reason` `refusal` or `max_tokens`, auth error, rate limit, timeout → `notUnderstood` with the transcript (US5-6)
- [X] T120 [P] [US5] Write `tests/domain/queries.test.ts`: `answerQuery(state, {kind, player, company})` for every query kind, with Spanish answer text (e.g. "Ana tiene $520")
- [X] T121 [P] [US5] Write `tests/ui/voice.test.tsx` with a fake SpeechRecognition and a stub interpreter: mic disabled with a reason when there is no key, `navigator.onLine` is false, or SpeechRecognition is missing (US5-5); live transcript while held; nothing changes until Confirmar (US5-1); editing a field on the card; Cancelar; "sí"/"confirmar" confirms a pending card (FR-062); "No entendí" shows the transcript and "Hacerlo a mano" opens the matching sheet

### Implementation for User Story 5

- [X] T122 [US5] Add a `compound {actions: Action[]}` action to `src/domain/actions/schemas.ts` and `src/domain/actions/expand/index.ts` that expands each action in order against the interim state into **one** group (FR-071), and its summary in `src/domain/i18n/es.ts`
- [X] T123 [US5] Implement `src/domain/queries.ts` (`answerQuery`). Makes T120 pass
- [X] T124 [US5] Implement `src/voice/tools.ts`: generate tool `input_schema`s from the Zod action schemas via `z.toJSONSchema()` with session enums injected, Spanish descriptions with 2–3 example phrases each, meta tools, sorted-key deterministic output. Makes T117 pass
- [X] T125 [US5] Implement `src/voice/prompt.ts` (`systemPromptEs(session)`: Spanish instructions requiring at least one tool call, number-word handling, alias table, game summary) and `src/voice/snapshot.ts` (`snapshotAndTranscript`). Makes T118 pass
- [X] T126 [US5] Implement `src/voice/interpreter.ts`: `new Anthropic({apiKey, dangerouslyAllowBrowser: true})`, `messages.create` with `model: settings.model`, `max_tokens: 1024`, `tools`, `tool_choice: {type: "auto"}`, cached `system`, user snapshot message, options `{timeout: 8000, maxRetries: 1}`; never logs the key
- [X] T127 [US5] Implement `src/voice/resolve.ts`: response → `Proposal` (data-model §14) with Zod parsing, `runPipeline` validation of each action, `summaryEs`, money flows; clarification re-run appends the chosen option to the user message. Makes T119 pass
- [X] T128 [US5] Implement `src/voice/speech.ts`: Web Speech wrapper (`SpeechRecognition`/`webkitSpeechRecognition`, `interimResults: true`, `continuous: true`, `lang` from settings), `start()`/`stop()` returning the final transcript, availability check
- [X] T129 [US5] Implement `src/app/voiceController.ts`: state machine idle → listening → interpreting → proposal | clarification | query | notUnderstood; confirm dispatches the proposal with `source: "voice"` and the transcript; "deshacer" and "no, eran 260" act on the latest entry (FR-074, needs US2 amend); unconfirmed proposals live only in memory and are dropped on reload; in dev, log the time from mic release to card render (SC-004, end-to-end budget 3 s)
- [X] T130 [P] [US5] Create `src/ui/components/MicButton.tsx`: large hold-to-talk button (pointer down/up, ≥ 48 px, sized larger), live transcript, disabled state with its reason
- [X] T131 [P] [US5] Create `src/ui/components/ConfirmationCard.tsx` (Spanish summary, money flows, warnings, editable fields, Confirmar / Editar / Cancelar, chip slot filled in US6) and `src/ui/components/ClarifyButtons.tsx` (one button per option)
- [X] T132 [US5] Wire voice into `src/ui/screens/Table.tsx` and `src/ui/components/TopBar.tsx`: MicButton, ConfirmationCard/ClarifyButtons/query answer/"No entendí" overlays, "Hacerlo a mano" routing to the matching sheet. Makes T121 pass
- [ ] T133 [US5] Create `src/ui/screens/Settings.tsx`: masked API key with show/hide, "no recordar la clave en este dispositivo" (`rememberKey`), voice locale (es-ES, es-MX, es-AR, es-US, …), model id (default `claude-sonnet-5`), a privacy note (audio to the browser's speech service, transcripts and state to Anthropic) and advice to use a dedicated Console workspace with a monthly spend limit (research R17, FR-076)
- [ ] T134 [US5] Implement the eval harness in `eval/voice/run.ts` and `eval/voice/grade.ts`: load `cases.jsonl` and fixtures, call the interpreter from Node with `ANTHROPIC_API_KEY`, grade deterministically with the same Zod schemas (normalize `null` defaults, compound passes only if every action matches in order, clarification passes if options include every expected candidate, query passes on kind + entity), report overall, OR-subset, per-category and held-out accuracy, p50/p95 latency, cache-read rate after the first call, tokens and cost, `--model` and `--runs` flags, writing `eval/voice/results/<date>-<model>.json` (research R18)
- [ ] T135 [US5] Create `eval/voice/buildFixtures.ts` and generate the six fixtures in `eval/voice/fixtures/` (`1830-or`, `1830-sr`, `1848-or`, `1848-sr`, `21moon-or`, `21moon-cr`) by dispatching actions through the domain and serializing in the session export format (depends on T158, US8); at least two fixtures include confusable players (Ana and Anabel) and `1830-or` has a player alias shared with a company nickname
- [ ] T136 [US5] Draft the ~60 seed cases in `eval/voice/cases.jsonl` with the R18 composition (OR payout 14, trains 8, costs/bonuses/income 4, stock 10, 1848 loans/BoE 3, flow 3, compound 5, corrections 4, queries 4, clarification 3, notUnderstood 2), noise tags, and ~20% marked `"heldout": true`; then ask the user to rephrase the transcripts in their regional Spanish (open item AI-2) before the first scored run
- [X] T137 [US5] Add a dev-only (`import.meta.env.DEV`) "Guardar para eval" button to ConfirmationCard and the "No entendí" view that saves the raw transcript, a fixture export and the confirmed or manually entered action as a candidate case in `eval/voice/candidates/` via download
- [ ] T138 [US5] Run `npm run eval:voice -- --model claude-sonnet-5 --runs 3` and `-- --model claude-haiku-4-5 --runs 3`; record results; confirm or replace the default model in `src/persistence/settingsRepo.ts` against the gates (OR subset ≥ 90%, no category < 80%, p95 API latency < 2.5 s, cache reads > 0) and note the outcome in `specs/001-companion-mvp/research.md` R18

**Checkpoint**: Voice is a working shortcut over US1–US4.

---

## Phase 8: User Story 6 - Make change with poker chips (Priority: P3)

**Goal**: Fewest-chip breakdowns for every bank transaction, change for larger chips, limited
counts, configurable chip set from a per-game preset.

**Independent Test**: Chip set 1/5/10/50/100/500 — a bank payout of 287 shows 2×100, 1×50,
3×10, 1×5, 2×1; 30 paid with a 50 shows 2×10 change (quickstart 8).

### Tests for User Story 6 (write first, must fail)

- [X] T139 [P] [US6] Write `tests/domain/chips.test.ts`: 287 → 2×100, 1×50, 3×10, 1×5, 2×1 (US6-1); 30 paid with a 50 → change 20 as 2×10 (US6-2); limited `countAvailable` → fewest-chip valid breakdown or `null` ("no hay cambio exacto", US6-3); a non-canonical set (1, 3, 4: 6 → 2×3) is solved by DP not greedy; `ChipSet` validation: "sorted by value descending; values unique and > 0"
- [X] T140 [P] [US6] Write `tests/domain/flows.test.ts`: `bankFlows(events)` nets each group's money into and out of the bank per counterparty (a payout is one outflow per recipient; internal player↔company transfers are excluded)

### Implementation for User Story 6

- [X] T141 [US6] Implement `src/domain/mechanics/chips.ts`: bounded change-making DP minimizing chip count with `countAvailable`, the Kozen–Zaks canonical check per chip set with a greedy fast path when canonical and unlimited, `change(chipValue, amount)` (research R11). Makes T139 pass
- [X] T142 [US6] Implement `src/domain/ledger/flows.ts` (`bankFlows`, `MoneyFlow`). Makes T140 pass
- [X] T143 [US6] Create `src/ui/components/ChipStrip.tsx`: colored discs with count and value label (never color alone), "no hay cambio exacto", and a "pagó con…" chip picker that shows the change breakdown
- [X] T144 [US6] Create `src/ui/components/ChipSetEditor.tsx` (value, color, optional label, optional count; starts from `game.chipPreset`) used in `src/ui/screens/NewSession.tsx` and from the Table menu; save session changes via `sessionRepo.updateMeta` (FR-080). The chip set is table configuration, not game state (data-model §2), so it is not logged
- [X] T145 [US6] Show ChipStrip per bank flow in `src/ui/components/UndoToast.tsx` (FR-061) and `src/ui/components/ConfirmationCard.tsx` (FR-060)

**Checkpoint**: Chip help is available on every bank transaction.

---

## Phase 9: User Story 7 - Track turns and the stock market (Priority: P3)

**Goal**: Round indicator, operating order, next company, fixed and phase-driven schedules,
end triggers, and a Market view with manual token moves.

**Independent Test**: Advance through an SR and two ORs; check the indicator, order and current
company at each step; drag a token and see a manual override in History (quickstart 9).

### Tests for User Story 7 (write first, must fail)

- [X] T146 [P] [US7] Write `tests/domain/operatingOrder.test.ts`: only `floated` and `receivership` companies; price descending; ties by `orOrder.ties` (1830 stackTop → columnRight → rowTop; 1848 stackTop → columnRight; 21Moon columnRight → stackTop); `before` companies first (BOE); with `dynamic: true`, the next company is recomputed from current prices after each turn
- [X] T147 [P] [US7] Write `tests/domain/turns.test.ts`: `startOR` shows "OR n.1" and the operating order (US7-1) and offers private income; `nextCompany` steps through the order, then to the next OR in the set, then prompts for an SR (US7-2); ORs per set from the phase (1830: fixed at the SR before the set); 21Moon fixed schedule (PRIVATES, SR n, CR n, OR n.1, OR n.2, OR 5.3) with events SR3 late company available and OR4.1 privates closed **before** income; `setMarket` records `marketMove reason "manual"` (US7-3); `setPhase`/`setTurn` record `turnAdvance`; `nextCompany` past a company with no recorded run marks it operated (`hasOperated` true, so a later 21Moon sale moves its price), but does not add a second run for a company that already paid out
- [X] T148 [P] [US7] Write `tests/domain/endTriggers.test.ts`: bank broken, price reaching a `top` cell, ≥ 16 loans issued, ≥ 5 receiverships (the bank's `nationalTakeovers` counter), last scheduled round, bankruptcy → `endTriggers(game, state)` returns warnings only, nothing blocked, and the result is recomputed from state (never stored)

### Implementation for User Story 7

- [X] T149 [US7] Implement `src/domain/mechanics/operatingOrder.ts`. Makes T146 pass
- [X] T150 [US7] Extend the minimal `startOR` from T081/T082 and add schemas for `nextCompany`, `setPhase`, `setTurn` to `src/domain/actions/schemas.ts`, with their expansion in `src/domain/actions/expand/flow.ts` (operating order, byPhase and fixed `roundSchedule`, scheduled events as a system group before income; the per-OR sets are already cleared by the `turnAdvance` derivation; `nextCompany` emits `counterChange {subject: company:X, key: "runs", delta: 1}` for the company it moves past when X is not yet in `turn.operatedThisOR`). Makes T147 pass
- [X] T151 [US7] Add `setMarket {company, cell}` to `src/domain/actions/schemas.ts` and `src/domain/actions/expand/manual.ts` (`marketMove reason "manual"`, plus cell triggers)
- [X] T152 [US7] Implement `src/domain/mechanics/endTriggers.ts`: a pure `endTriggers(game, state) → EndTrigger[]`, computed from state and never stored (data-model §9), reading bank cash, `top` cells, loans issued, the bank's `nationalTakeovers` counter, the schedule position and bankrupt flags. Makes T148 pass
- [X] T153 [US7] Extend `src/ui/components/TopBar.tsx` and `src/ui/screens/Table.tsx`: round indicator ("SR 3", "CR 1", "OR 2.1"), current company highlighted, phase, end-trigger banner, a one-tap "Siguiente" button (`nextCompany`), extend T093's "Empezar OR" button with the private-income offer (FR-037), a "Turno / Fase" manual control (`setTurn`, `setPhase`) so every turn value can be overridden by touch, OperateSheet defaulting to the current company
- [X] T154 [US7] Create `src/ui/screens/Market.tsx`: render 2-D grids with null padding and zone/tag styling, 1-D tracks (BOE), stacked tokens with short names over color; pointer drag to a cell (with a tap-to-select, tap-to-place fallback) dispatches `setMarket` (FR-052)
- [X] T155 [US7] Write `tests/ui/market.test.tsx`: dragging or tap-placing a token dispatches `setMarket` and History shows a manual override entry

**Checkpoint**: Turn tracking drives current-company defaults for touch and voice.

---

## Phase 10: User Story 8 - Back up, restore, and move a session (Priority: P3)

**Goal**: Export a session to JSON and import it with identical state and history, never
including the AI key.

**Independent Test**: Export mid-game, import in a fresh profile; state and history match and
the file contains no `sk-ant` (quickstart 10).

### Tests for User Story 8 (write first, must fail)

- [X] T156 [P] [US8] Write `tests/persistence/export.test.ts` (contracts/export-format.md): a session exported while an API key is set does not contain the key string or any field named like `apiKey` (FR-092, US8-2); export → import round-trips state, log (incl. reverts and amends) and turn state deep-equal (US8-1); a tampered `stateHash` imports with the warning "el estado reproducido no coincide"; an existing `id` offers replace or import-as-copy; `version > 1` is refused; file name `18xx-<game>-<yyyyMMdd-HHmm>.json`

### Implementation for User Story 8

- [X] T157 [US8] Implement `src/persistence/canonical.ts`: canonical JSON (sorted keys, no undefined) and `stateHash(state)` = SHA-256 hex via `crypto.subtle`
- [X] T158 [US8] Implement `src/persistence/exportImport.ts`: `buildExport(sessionId) → SessionExport` (`format: "18xx-companion/session"`, `version: 1`, `exportedAt`, `appVersion`, session with frozen `game`, `players`, `walletMode`, `chipSet`, all `entries`, `stateHash`; never reads `settings`), `parseImport(json)` (Zod validation, `migrations[version]`, replay, hash compare), and `importSession(parsed, {mode: "replace" | "copy"})`. Makes T156 pass
- [X] T159 [US8] Add export (Table menu and History, download via Blob) and import (Home, file input, replace/copy dialog, hash-mismatch warning) UI in `src/ui/screens/Home.tsx` and `src/ui/screens/History.tsx`
- [X] T160 [US8] Write `e2e/export.spec.ts`: export mid-game, import in a new browser context, compare visible balances and History, and assert the downloaded file has no `sk-ant`

**Checkpoint**: All user stories are independently functional.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story guarantees, performance, offline, security and validation

- [ ] T161 [P] Write `tests/ui/taps.test.tsx`: count taps from Table to applied state for payout (after revenue entry), buy share, sell, next company and undo; each ≤ 2 (FR-100, SC-006)
- [ ] T162 [P] Write `tests/domain/randomGames.test.ts`: per built-in game, seeded random sequences of valid high-level actions produce zero invariant warnings (SC-002)
- [ ] T163 [P] Write `tests/domain/perf.test.ts`: replay of a generated 1,500-group log completes in < 50 ms and snapshot load + tail in well under that; `SessionStore.dispatch` of a payout (pipeline + fake-indexeddb write) completes in < 100 ms (plan performance goals)
- [ ] T164 [P] Write `e2e/offline.spec.ts`: after first load, go offline, reload; the app loads, the mic shows unavailable, and touch payout still works (FR-093, quickstart 11); also assert cold start to a rendered Table from IndexedDB < 1 s and tap-to-updated-tile < 100 ms in the phone project
- [ ] T165 [P] Add PWA icons (192, 512, maskable) and `apple-touch-icon` to `public/`, and verify install on Android Chrome and iOS Safari
- [ ] T166 Write `e2e/security.spec.ts` (quickstart 14): the built app's CSP blocks an injected `<script src="https://example.com">`; with "no recordar la clave" on, reload clears the key and the mic is unavailable; and grep `src/` in CI for `dangerouslySetInnerHTML` and for logging of `apiKey`
- [ ] T167 [P] Accessibility pass over `src/ui/**`: every interactive element ≥ `var(--tap)`, every company color paired with its short name, phone portrait and tablet landscape screenshots in Playwright for Table, OperateSheet, StockSheet, History, Market
- [ ] T168 Final consistency pass on `docs/spec.md`: each story already updated it in its own change (see Conventions); confirm nothing was missed (e.g. receivership/bankrupt statuses, assetTransfer, counters, 21Moon CR)
- [ ] T169 Run all gates (`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`) and walk through quickstart.md manual scenarios 1–14 on a phone, checking the dev release-to-card timing from T129 stays under 3 s; record any failures as new tasks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: depends on Setup; blocks all user stories
- **US1 (Phase 3)**: depends on Foundational. It delivers the built-in game definitions,
  `createSession` and the Table, so **every later story depends on US1**
- **US2 (Phase 4)**: depends on US1
- **US3 (Phase 5)**: depends on US1. Independent of US2 (undo already exists from Phase 2)
- **US4 (Phase 6)**: depends on US1. Independent of US3 except that phase-dependent checks
  (float-condition drop at phase 6, BO closing on B&O's first train) need `phases.ts` (T080)
- **US5 (Phase 7)**: depends on US1; tools cover whatever action schemas exist, so it is most
  useful after US3 and US4. `amendLast` / "no, eran 260" needs US2 (T067). The eval fixtures
  (T135) need the export serializer from US8 (T158)
- **US6 (Phase 8)**: depends on US1; T145 also touches ConfirmationCard from US5 (skip that half
  if US5 is not done)
- **US7 (Phase 9)**: depends on US1 and uses `market.ts` (T079) and the minimal `startOR`
  (T081–T082) from US3
- **US8 (Phase 10)**: depends on US1
- **Polish (Phase 11)**: depends on all stories

### Story completion order

```
Setup → Foundational → US1 ─┬─► US2 ──────────────┐
                            ├─► US3 ─┬─► US7      │
                            │        └─► US4 ─────┼─► US5 (eval needs US8 T158) ─► Polish
                            ├─► US6               │
                            └─► US8 ──────────────┘
```

### Within each story

- Tests first; they MUST fail before implementation (constitution VI)
- Domain mechanics → schemas → expanders → availability/validate → i18n → UI → UI/e2e tests
- `src/domain/actions/schemas.ts`, `src/domain/i18n/es.ts`, `src/domain/actions/validate.ts` and
  `src/domain/actions/expand/flow.ts` are shared files: tasks touching them are never [P] with
  each other

### Parallel Opportunities

- Phase 1: T003, T004, T005, T007, T008 together after T001–T002
- Phase 2: all tests T009–T015 together; T027 and T030 alongside the main chain
- US1: tests T034–T038 together; definitions T039–T041 together; components T049–T053 together
- US3: tests T072–T077 together; mechanics T084–T087 together
- US4: tests T096–T101 together; mechanics T107–T109 together
- US5: tests T117–T121 together; T130 and T131 together
- After US1, US2 / US3 / US6 / US8 can proceed in parallel

---

## Parallel Example: User Story 3

```bash
# Tests first, all in different files:
Task: "Write tests/domain/payout.test.ts"
Task: "Write tests/domain/market.test.ts"
Task: "Write tests/domain/trains.test.ts"
Task: "Write OR cases in tests/games/1830.test.ts"
Task: "Write OR cases in tests/games/1848.test.ts"
Task: "Write OR cases in tests/games/21moon.test.ts"

# Then independent mechanics:
Task: "Implement src/domain/mechanics/custom/loans.ts"
Task: "Implement src/domain/mechanics/custom/nationalBank.ts"
Task: "Implement src/domain/mechanics/custom/bankDebt.ts"
Task: "Implement src/domain/mechanics/custom/forcedWithhold.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Write src/domain/games/g1830.ts"
Task: "Write src/domain/games/g1848.ts"
Task: "Write src/domain/games/g21moon.ts"

Task: "Create src/ui/components/PlayerTile.tsx"
Task: "Create src/ui/components/CompanyCard.tsx"
Task: "Create src/ui/components/TopBar.tsx"
Task: "Create src/ui/components/Keypad.tsx"
Task: "Create src/ui/components/UndoToast.tsx"
```

---

## Implementation Strategy

### MVP first (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1 → **stop and validate** with quickstart 1–2: a reliable shared money counter for
   all three games, with one-tap undo and resume

### Incremental delivery

1. US1 → usable at the table as a counter
2. US2 + US3 (the remaining P1 stories) → automated operating rounds with safe correction: the
   core value (SC-001, SC-006)
3. US4 → full games by touch
4. US5 → voice shortcut, then the eval (AI-2) to confirm the default model
5. US6, US7, US8 → chips, turn tracking and market view, backup
6. Polish → performance, offline, security and the full quickstart

---

## Notes

- [P] = different files and no dependency on an incomplete task
- Commit after each task or logical group; all four gates pass before merging
- Rule values: if a test needs a value not in research.md R13–R15, stop and check the rulebook
  in `docs/rules/` rather than guessing (constitution III)
- Warnings never block; every value stays overridable by a recorded manual action
