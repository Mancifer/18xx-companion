---

description: "Task list for feature 004: Railways of the Lost Atlas"
---

# Tasks: Railways of the Lost Atlas

**Input**: Design documents from `specs/004-railways-lost-atlas/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/actions.md](contracts/actions.md), [contracts/game-definition.md](contracts/game-definition.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first domain logic, and [quickstart.md](quickstart.md) lists the planned test for each scenario. Every test task comes before the code it covers and MUST fail first. Domain tests use `TestSession` from `tests/helpers/dispatch.ts`: `.do()` throws on unavailable, `.tryDo()` returns the result kind, `.lastEvents` holds the last group's events, and `.apply()` reduces a raw primitive event.

**Organization**: Tasks are grouped by user story (US1–US11 in spec.md). US1–US8 are P1, US9 and US10 are P2, US11 is P3. Each story's UI tasks follow its domain tasks (plan step 9).

**Ground rules for every task**:

- No code branches on `"rotla"` or on a company id (constitution III). RotLA behavior comes from data and named mechanics.
- Every rule check is a warning, never a block.
- One intent produces one event group. No new primitive event type.
- 1830, 1848 and 21Moon must behave exactly as before (SC-007). Their existing tests must stay green after every task.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1–US11)

---

## Phase 1: Setup

**Purpose**: A green baseline before any change.

- [X] T001 Run `npm run typecheck && npm run lint && npm test` from the repo root and record the baseline (all green), so later failures can be traced to this feature. Also record the latest `eval/voice/results/` report per game as the SC-007 voice baseline.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema additions, the new enum values, merge-patch options, definition validation, the 1-D track helpers, per-player train counts, and the base (Long mode) RotLA definition. Every story depends on these (plan steps 1–2; data-model §1, §2, §6).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema

- [X] T002 [P] Write failing tests in `tests/games/schema.test.ts`. Each new field is optional, and each one parses:
  - `CompanyDef`: `tier: "minor" | "major"`, `start: "par" | "auction" | "merger"` (default `"par"`), `altName: string`, `altAliases: string[]`, and `traits` with `trainLimitBonus` (int ≥ 0), `keepsRustedTrains` (boolean), `launchFee` (int > 0), `launchAssets` (AssetId[]), `noLeadoffTrain` (boolean), and `payments: { id, labelEs, amount, direction: "bankPays" | "companyPays", cost?: int > 0 }[]`.
  - `TrainDef`: `countByPlayers: Record<string, posInt>`, `special: boolean`, `tradeIn.variant: string`, `tradeIn.to: "removed" | "discard"` (default `"discard"`), `displayName: string`, and `variants[].cost` relaxed to int ≥ 0 (a cost of 0 parses; −1 fails).
  - `PhaseDef`: `trainLimitByTier: { minor?: posInt; major?: posInt }`, `launchPriceRange: [posInt, posInt]`, `color: string`.
  - `MoveRule`: `effect: "move" | "stackBottom"` (default `"move"`). `market.moves.issue.from: "ipo" | "treasury"` (default `"ipo"`). `market.moves.redeem: { n: int ≥ 0 }`. `market.moves.sell.warnUnlessOperated: boolean`.
  - `GameDefinition`: `auction: { minBid: posInt; step: posInt }`, `trainExport: { allOfType: string[] } | null`, `roundSchedule.fixed.conditional: { slotPrefix: string; phaseReached: string }[]`, `limits.maxSharesPerBuy: posInt`, and `endTriggers[]` accepts `{ type: "cyclesComplete" }`.
  - `OptionDef`: `kind: "choice" | "companySubset"` (default `"choice"`), `from: string[]`, `size: Record<string, posInt>`, and on `choices[]`: `patch` (a JSON object), `removeCompanies: string[]`, `addCompanies: CompanyDef[]`, `recommendedPlayers: { min, max }`.
  - The 1830, 1848 and 21Moon definitions parse to the same output as before (deep equal to a snapshot taken before the change).
- [X] T003 Add the fields of T002 to `src/domain/games/schema.ts` (`CompanyDefSchema`, `TrainDefSchema`, `PhaseDefSchema`, `MoveRuleSchema`, `MarketSchema`, `RoundScheduleSchema`, `EndTriggerSchema`, `OptionDefSchema`, `GameDefinitionSchema`) and export a `CompanyTraits` type. Make T002 pass.

### Events: enum values and the `restack` reducer rule

- [X] T004 [P] Write failing tests in `tests/domain/events.test.ts`:
  - `src/domain/events/schema.ts` accepts `turnAdvance { round: "MR" }` and `marketMove` reasons `"restack"`, `"merge"` and `"bonus"`.
  - Reducer: `marketMove { reason: "restack" }` to the company's current cell sets `stackOrder = max(stackOrder of the other tokens in that cell) + 1`, so the company is now last in that cell. A same-cell move with any other reason keeps today's behavior.
  - Reducer: a `turnAdvance` that changes the round to `"MR"` clears `operatedThisOR`, `soldThisSR` and `roundEnded`, like any round change.
- [X] T005 Add `"MR"` to `Round` and `"restack" | "merge" | "bonus"` to `MarketMoveReason` in `src/domain/events/types.ts`, accept them in `src/domain/events/schema.ts`, and implement the `restack` rule in `src/domain/events/reduce.ts`. Make T004 pass. Existing replay tests stay green.

### Options: merge patch, company add/remove, subsets

- [X] T006 [P] Write failing tests in a new `tests/games/options.test.ts` for `applyOptions` / `resolveOptions` from `src/domain/games/index.ts`, with small inline fixture definitions:
  - RFC 7386 merge patch: objects merge, arrays and scalars replace, `null` deletes a key.
  - For each option, in definition order, the chosen value applies `removeCompanies`, then `addCompanies`, then `patch`, then `addCustomRules`.
  - A `companySubset` option whose value is a comma-separated id list removes the eligible (`from`) companies that are not listed. Its default value `"all"` removes nothing.
  - The result goes through `validateDefinition`. A patch that breaks the definition makes session creation fail with the errors listed.
  - 1830, 1848 and 21Moon (including the 21Moon `lateCompany` option) produce the same copies as before.
- [X] T007 Implement a `mergePatch(target, patch)` helper (about 20 lines, no dependency) and extend `applyOptions` and `resolveOptions` in `src/domain/games/index.ts` as in T006 and data-model §1 "Applying options". Make T006 pass.

### Definition validation

- [X] T008 [P] Write failing tests in `tests/games/schema.test.ts` (a `validateDefinition` block), one broken fixture per rule of data-model §6:
  1. `start: "auction"` without `game.auction`, or a phase without `launchPriceRange`.
  2. A `launchPriceRange` bound that is not a cell price.
  3. A `tier: "major"`, `start: "merger"` company whose `shareCount` ≠ min minor `shareCount` + max minor `shareCount`.
  4. `traits.launchAssets` naming a train whose type is not `special`.
  5. `trainExport.allOfType` naming an unknown train type.
  6. `roundSchedule.fixed.conditional[].phaseReached` naming an unknown phase.
  7. A `countByPlayers` key outside `playerCount`.
  8. `companySubset.from` naming an unknown company.
  9. After `applyOptions`, `startingCash` not covering every count in `playerCount` (the existing rule, run on the patched copy).
- [X] T009 Implement rules 1–8 in `src/domain/games/validateDefinition.ts`, and make sure rule 9 runs on the patched copy. Make T008 pass.

### 1-D track and train-stack state

- [X] T010 [P] Write failing tests in `tests/domain/market.test.ts` with a 27-row, 1-column fixture grid (`shape: "1d"`, rows 500 … 10, then 0 tagged `closed`):
  - `moveTarget(… "up", n)` and `"down"` move n rows. Up from 500 stays at 500. Down from 10 reaches the `closed` cell.
  - `floorToTrack(game, x)` returns the highest cell price ≤ x, never the `closed` cell: 82.5 → 80, 130 → 120, 127.5 → 120, 135 → 135, 600 → 500, 5 → 10.
- [X] T011 Implement and export `floorToTrack(game: GameDefinition, x: number): CellRef` in `src/domain/mechanics/market.ts`. Make T010 pass.
- [X] T012 [P] Write failing tests in `tests/domain/events.test.ts` (or a new `tests/domain/state.test.ts`) for `trainAssetIds` and `initialState` in `src/domain/events/state.ts`: `countByPlayers[String(players.length)]` overrides `count`; a `special` train type's assets start held by `removed`; unlimited types are unchanged.
- [X] T013 Implement T012 in `src/domain/events/state.ts`. Make T012 pass.

### The base RotLA definition (Long mode)

- [X] T014 Create `src/domain/games/grotla.ts` exporting the RotLA `GameDefinition` with every value of [contracts/game-definition.md](contracts/game-definition.md), except the options and the `auctionLaunch`, `mergers` and `landmarks` custom rules (added by their stories, so validation never sees an unregistered mechanic id):
  - Identity: `id: "rotla"`, name, `currency.symbol: "$"`, `playerCount { min: 2, max: 5 }`, `bank: "unlimited"`, `startingCash { "2": 450, "3": 300, "4": 275, "5": 220 }` (one table for Long and Short, so every count in `playerCount` has a value).
  - The 12 minors (`tier: "minor"`, `start: "auction"`, `shareCount: 5`, `presidencyUnits: 2`, `certificates: [2,1,1,1]`) with the contract's short names, colors, text colors and traits (Expansive and Tunneling `payments`, Resourceful `keepsRustedTrains`, Spacious `trainLimitBonus: 1`), plus Spanish voice aliases (TUN → "túnel", "tunneling"; EXP → "expreso", "express"; and so on).
  - The 6 majors (`tier: "major"`, `start: "merger"`, `shareCount: 10`, `presidencyUnits: 2`, `certificates: [2,1,1,1,1,1,1,1,1]`) with `altName` (Conglomerate, Unlimited, Syndicate, "International II", "Federation II", "Experiment II").
  - Shares and money: `capitalization { type: "incremental" }`, `ipoPrice: "market"`, `floatPercent: 20`, `unownedDividends { ipo: "none", pool: "none", treasury: "company" }`, `revenueParts`, `payoutModes ["full", "withhold"]`, `rounding { perShare: "floor", halfRetain: "floorToCompany", unit: 10 }`, `auction { minBid: 120, step: 5 }`, limits (`certificates: {}`, `perCompanyPercent: 60`, `pool.maxPercent: 50`, `maxSharesPerBuy: 1`), `privates: []`.
  - Market: `shape: "1d"`, the 27 cells, the moves (payout rules in the order ≥2× up 2, ≥1× up 1, =0 down 1, `effect: "stackBottom"`; withhold down 1; `sell { per: "sale", n: 1, onlyIfOperated: false, warnUnlessOperated: true }`; `soldOut { heldBy: "players", at: "endSR" }`; `issue { from: "treasury", onlyIfFloated: false, n: 1 }`; `redeem { n: 0 }`), `orOrder { by: "priceDesc", ties: ["stackTop"], dynamic: true }`.
  - Trains 2, 3, 4, 5, 6, 7 (7/∞) with the contract's variants, counts, `countByPlayers`, rust phases and trade-in; `discardedTrainsTo: "pool"`; `trainLimitScope: "company"`; `trainExport { allOfType: ["2"] }`.
  - Phases `yellow`, `green`, `green4`, `purple`, `purple6`, `grey` with `color`, triggering train, `trainLimitByTier`, `launchPriceRange`, `orsPerSet: 2`, and `trainLimit` = the major limit (2 in yellow).
  - The 6-cycle fixed schedule `SR1, OR1.1, OR1.2, MR1, … MR6` with `conditional: [{ slotPrefix: "MR", phaseReached: "green" }]`, and `endTriggers: [{ type: "cyclesComplete" }]`.
  - `customRules: [corporateBankruptcy { trigger: "closedCell" }]` for now (US6 and US9 add the new config fields).
  - `verification`: every field `verified` except `companies`, which is `unverified` (the majors' second identities).
- [X] T015 Register `grotla` in `src/domain/games/index.ts` so `getBuiltInGame("rotla")` returns it and New Session lists it.
- [X] T016 [P] Write tests in a new `tests/games/rotla.test.ts`: the definition parses and passes `validateDefinition`; `hasUnverified` is true; Long 3p gives trains 7/5/4/3/2 + 7/∞, Long 4p gives 7/6/4/3/3 + 7/∞; the market has 27 cells, 500 on top and 0 tagged `closed`; the phase table matches the contract. Add RotLA to the per-game loops in `tests/games/definitions.test.ts`.
- [X] T017 [P] Create `tests/helpers/rotla.ts` with:
  - `rotlaSession({ players, options })`, which returns a `TestSession` for RotLA.
  - `seedCompany(session, id, { price, holders, treasury, trains, operated })`, which places a minor or major in play with raw primitives through `.apply()` (`companyStatus floated`, `marketMove`, `shareTransfer`, `moneyTransfer`, `assetTransfer`, `counterChange runs`).

  Later stories use it to test without `launchCompany` or `mergeCompanies`.

**Checkpoint**: RotLA (Long) loads, validates and seeds. Existing games are unchanged, and the full suite is green.

---

## Phase 3: User Story 1 - Set up a RotLA session (Priority: P1) 🎯 MVP

**Goal**: Pick RotLA with a mode and variants, enter players, and start in cycle 1, Stock Round with the right cash, minors and train stack.

**Independent Test**: Create a 3-player Long game and a 2-player Short game. Each player has 300 and 450 respectively. Short lists 8 minors (no Adaptive, Bridging, Overnight or Spacious), and its stack has one fewer train of each type except 7/∞. The round indicator shows "Ciclo 1 · RA".

### Tests for User Story 1 ⚠️

- [X] T018 [P] [US1] Add failing tests to `tests/games/rotla.test.ts` for each `mode` × player count:
  - Train stacks: Long 3p 7/5/4/3/2/7∞; Long 4p 7/6/4/3/3/7∞; Short 2p 6/4/3/2/1/7∞; Short 4p 6/5/3/2/2/7∞; Micro 2p 3/3/3 of types 2/3/4 only; Micro 3p 5/4/4.
  - Starting cash: Long 3p 300, 4p 275, 5p 220; Short 2p 450; Micro 225. Off-mode counts use the same table: Long 2p 450, Short 5p 220.
  - Minors: Long has 12; Short has 8 without ADP, BRG, OVN, SPC.
  - Cycles: Long 6, the others 4. Micro has `trainExport: null`.
  - The initial turn is SR, `srNumber` 1.
  - Mode `long` with 2 players, and `short` with 5 players, produce an option warning (US1-2) and still create the session.
- [X] T019 [P] [US1] Add failing tests to `tests/games/options.test.ts` for the RotLA options other than `mode` and `expansion`:
  - `minorsInPlay` with 6 ids leaves only those minors (US1-4), and a count different from the mode's `size` gives a warning only.
  - `stockDrops: perShare` sets `market.moves.sell.per = "share"`.
  - `bankBreak: on` sets `bank { total: 8000 }`, certificate limits `{ "3": 16, "4": 12, "5": 10 }`, and adds the `bankBroken` and `bankruptcy` end triggers.
  - `hostileMergers: on` leaves the definition unchanged.
  - `headquarters: on` adds `payments: [{ id: "headquarters", labelEs: "Sede", amount: 0, direction: "bankPays" }]` to every major.
- [X] T020 [P] [US1] Write failing UI tests in a new `tests/ui/rotla.test.tsx` (helpers from `tests/ui/helpers.tsx`) for New Session:
  - Picking RotLA shows Modo, Expansión and Variantes selects.
  - Changing Modo updates the cash preview and the train preview (e.g. "2×7 · 3×5 · 4×4 · 5×3 · 6×2 · 7/∞").
  - The "Minors en juego" checklist shows "8 de 12" for Short and warns when the count differs from the mode's size.
  - 5 players with Short shows "El juego corto es para 2–4 jugadores", and "Empezar" stays enabled.

### Implementation for User Story 1

- [X] T021 [US1] Add the options to `src/domain/games/grotla.ts`: `mode` (`long` default with `recommendedPlayers` 3–5; `short`, `micro2`, `micro3` with the contract's `removeCompanies`, train count patches, 4-cycle schedule, `trainExport: null` and `startingCash` 225 for Micro (Short keeps the base cash table), `recommendedPlayers`), `stockDrops`, `bankBreak`, `hostileMergers`, `headquarters`, and `minorsInPlay` (`kind: "companySubset"`, `from` = every minor, `size` by mode: long 12, short 8, micro2 4, micro3 6). Make T018 and T019 pass.
- [X] T022 [US1] Add and export `optionWarnings(game, options, playerCount): Warning[]` in `src/domain/games/index.ts`. It returns the `recommendedPlayers` mismatch and the `companySubset` size mismatch.
- [X] T023 [P] [US1] Add Spanish labels to `src/domain/i18n/es.ts`: the option names and choices (Modo: Largo, Corto, Micro 2 jugadores, Micro 3 jugadores; Caída por acción; Quiebra de banca; Fusiones hostiles; Sedes), phase color names, and the round labels "RA", "RO", "RF".
- [X] T024 [US1] Update `src/ui/screens/NewSession.tsx` for T020:
  - Option selects.
  - Cash and train-stack previews computed from the patched copy (`applyOptions`; train display uses `displayName`).
  - The minors checklist with its counter.
  - The `optionWarnings` banner, which never disables "Empezar".

  Make T020 pass.
- [X] T025 [US1] Update `src/ui/components/RoundIndicator.tsx`. When the definition has a fixed schedule of cycles, show "Ciclo n · RA", "Ciclo n · RO i/2" and "Ciclo n · RF", where n = `srNumber`, plus "de N". Add the case to `tests/ui/rotla.test.tsx`.
- [X] T026 [US1] Let the custom-game editor in `src/ui/screens/CustomGame.tsx` (and `src/domain/games/customGame.ts` if it whitelists fields) edit `name` and `altName` of every `tier: "major"` company (FR-005a). Add a case to `tests/games/customGame.test.ts`.

**Checkpoint**: A RotLA session of any mode can be created and shows cycle 1, Stock Round.

---

## Phase 4: User Story 2 - Launch a minor from an auction (Priority: P1)

**Goal**: "Ana launches Tunneling for 140" is one action: the bid goes to the treasury, the player gets the president's certificate, 3 shares go to the treasury, and the price is set from half the bid, at the bottom of its stack.

**Independent Test**: In SR 1, launch at 165. The minor has 165 and 3 of its shares; the player has 2; the price is 80, below any minor already at 80.

### Tests for User Story 2 ⚠️

- [X] T027 [P] [US2] Add failing tests to `tests/domain/market.test.ts` for `launchPrice(game, state, bid, override?)`, which returns `{ price, cell, clamped }`. The price is `floorToTrack(clamp(⌊bid / 2⌋, phase.launchPriceRange))`.
  - Yellow: 140 → 70, 165 → 80, 200 → 90 (clamped), 210 → 90 (clamped).
  - Green: 260 → 110 (clamped).
  - Purple: 270 → 135, 260 → 120.
  - An override returns that price and `clamped: false`.
- [X] T028 [P] [US2] Write failing tests in a new `tests/domain/launch.test.ts` (use `rotlaSession`):
  - Launch at 140, 165, 200 and 210 in yellow. Check the price (70 / 80 / 90 / 90). The treasury equals the bid. 3 units are in `company:X` and 2 units with `presidency: true` are with the player. The status is `floated`, and `parPrice` equals the price.
  - The token is at the bottom of its cell's stack.
  - Warnings: `minBid` for bid 115, `bidStep` for 142, the range clamp with the price used in the message, `price` override not a track price, the player cannot pay. The group is still produced each time.
  - Unavailable for a `start: "merger"` company or a non-`unstarted` company. `parCompany` is unavailable for `start: "auction"` and `start: "merger"` companies.
  - `floatTrigger` emits nothing for a launched minor.
- [X] T029 [P] [US2] Add the SC-002 Diagram 3 case to `tests/games/rotla.test.ts`: three launches give 80, 80 (below the first) and 70, and the operating order of OR 1 lists them in that order.
- [X] T030 [P] [US2] Add failing UI tests to `tests/ui/rotla.test.tsx` for the Launch sheet:
  - Fields are player chips, minor (only those in play and unstarted), and the bid keypad prefilled with 120 in steps of 5.
  - The live preview reads "Precio $70 · Tesorería $140 · 3 acciones en tesorería".
  - A capped price shows a "Tope de fase $90" chip, and tapping the price allows an override.
  - The chip breakdown is shown.
  - Confirming takes one tap (SC-004).

### Implementation for User Story 2

- [X] T031 [US2] Implement and export `launchPrice` in `src/domain/mechanics/market.ts`. Make T027 pass.
- [X] T032 [US2] Add `launchCompany { type: "launchCompany", player: PlayerId, company: CompanyId, bid: int>0, price: int>0 | null }` to `src/domain/actions/schemas.ts` and the `ActionSchema` union.
- [X] T033 [US2] Create `src/domain/mechanics/custom/auctionLaunch.ts` (config `{}`), owning `launchCompany`. Follow the availability, warnings and expansion of contracts/actions.md and research R4 steps 1–5, in that order. Register it in `src/domain/mechanics/custom/index.ts` (and `mechanic.ts` / `config.ts` if ids are listed there). Add `auctionLaunch` to `customRules` in `src/domain/games/grotla.ts`.
- [X] T034 [US2] Make `floatTrigger` in `src/domain/actions/triggers.ts` skip companies with `start: "auction"` or `"merger"`. Make `parCompany` unavailable for them in `src/domain/actions/availability.ts`. Make T028 and T029 pass.
- [X] T035 [P] [US2] Add the `launchCompany` summary to `src/domain/i18n/es.ts`: "Ana abre Tunneling por $140 · precio $70 · tesorería $140 · 3 acciones en tesorería". Add a case to `tests/domain/summaries.test.ts`.
- [X] T036 [US2] Create `src/ui/sheets/LaunchSheet.tsx` as in contracts/ui.md "Launch sheet". Open it from an unstarted minor's card during an SR and from an "Abrir minor" button in `src/ui/screens/Table.tsx` (shown only when `launchCompany` is available). Make T030 pass.

**Checkpoint**: Minors can be launched by touch, with correct prices and stack order.

---

## Phase 5: User Story 3 - Buy and sell shares in the Stock Round (Priority: P1)

**Goal**: Buy one share from the treasury (money to the company) or the pool (money to the bank); sell with one drop per sale (or per share); presidency moves on ties clockwise; RotLA's limits warn.

**Independent Test**: Buying a minor share from the treasury at 80 adds 80 to the minor. Selling 2 shares of another company in one action drops it exactly one space.

### Tests for User Story 3 ⚠️

- [X] T037 [P] [US3] Add failing RotLA cases to `tests/domain/stock.test.ts` (seed with `seedCompany`):
  - Buy from the treasury at 80: 80 goes player → `company:X`.
  - Buy from the pool: the money goes to the bank.
  - Sell 2 major shares at 100: +200 from the bank, both shares to the pool, the price 90. With `stockDrops: perShare`, the price is 80.
  - The presidency moves when a non-president holds more. On a tie, it goes to the next tied player clockwise from the current president.
- [X] T038 [P] [US3] Write failing tests in a new `tests/domain/limits.test.ts`. Each case gives exactly one warning, and the result is never `unavailable`:
  - one purchase of 2 shares (`maxSharesPerBuy`);
  - a player above 60%;
  - the pool above 50%;
  - selling a minor whose `runs` counter is 0 (`warnUnlessOperated`);
  - buying a company the player sold this SR;
  - going over the certificate limit only with `bankBreak: on` (with it off there is no limit).

### Implementation for User Story 3

- [X] T039 [US3] Add the `maxSharesPerBuy` warning to `buyShare` and the `warnUnlessOperated` warning (based on the `runs` counter) to `sellShares` in `src/domain/actions/expand/stock.ts`, using helpers in `src/domain/actions/limits.ts`. Make T037 and T038 pass. If the clockwise tie rule or the treasury source fail, fix them in `src/domain/mechanics/presidency.ts` or `stock.ts` without changing 1830, 1848 or 21Moon results.
- [X] T040 [US3] In `src/ui/sheets/StockSheet.tsx`, make sure the buy source offers "Tesorería" and "Pool" when the company holds its own shares, and show the new warnings. Add a UI case to `tests/ui/rotla.test.tsx`: a treasury purchase takes ≤ 2 taps.

**Checkpoint**: The whole SR (launch, buy, sell) works for RotLA.

---

## Phase 6: User Story 4 - End of the Stock Round (Priority: P1)

**Goal**: Starting OR 1 first moves every company fully owned by players up one space.

**Independent Test**: A minor with all 5 shares held by players goes up one space at `startOR`. A minor with one share in its treasury does not move.

- [X] T041 [P] [US4] Add failing RotLA cases to `tests/domain/roundEnd.test.ts`:
  - At `startOR`, a minor held 100% by players moves up 1, once, inside the `startOR` group.
  - A minor with one share in `company:X` does not move, and neither does a minor with a share in the pool.
  - A second `startOR` does not move it again.
- [X] T042 [US4] Make `endOfRoundMoves` in `src/domain/mechanics/market.ts` (or `roundEnd.ts`) treat `heldBy: "players"` as "every unit held by players". Company treasury, pool and IPO units all disqualify. Make T041 pass and keep the 1830 and 1848 sold-out tests green.

**Checkpoint**: The cycle's first transition (SR → OR 1) is correct.

---

## Phase 7: User Story 5 - Operate a company: issue/redeem, costs, run and payout (Priority: P1)

**Goal**: Issue or redeem one share; pay ability costs; pay out per share with treasury shares paying the company; move by the RotLA table, including "bottom of the stack".

**Independent Test**: A minor at 70 with one treasury share pays out 310: each share gets 62, the minor gets 62, and the price rises to 90.

### Tests for User Story 5 ⚠️

- [X] T043 [P] [US5] Add failing tests to `tests/domain/market.test.ts`: in `applyMoveRules`, a rule with `effect: "stackBottom"` emits `marketMove { to: <same cell>, reason: "restack" }`. The rules are judged against the pre-move price, first match wins.
- [X] T044 [P] [US5] Add failing RotLA cases to `tests/domain/payout.test.ts`:
  - SC-002 Diagram 8: 310 at 70 gives 62 per share, the treasury share pays the minor, and the price goes up 2 to 90.
  - 60 at 100 for a major: 6 per share, a `restack` event, the price stays 100, and the company is now last among the 100s in the operating order.
  - Withhold 200 at 100: +200 to the company, down 1 to 90.
  - A zero run: down 1.
  - Pool shares pay no one.
  - An uneven total (e.g. 95 for a minor) pays ⌊95/5⌋ per share, and the remainder stays in the bank.
- [X] T045 [P] [US5] Add a failing case to `tests/domain/operatingOrder.test.ts`: with `ties: ["stackTop"]` and `dynamic: true`, a `restack` during the OR changes the remaining order, and companies that already operated are not offered again.
- [X] T046 [P] [US5] Write failing tests in a new `tests/domain/issue.test.ts`:
  - RotLA issue at 80: one share `company:X` → pool, +80 from the bank, down 1 to 70.
  - RotLA redeem at 80: one share pool → `company:X`, 80 to the bank, no market move.
  - A second issue or redeem by the same company in the same OR gives a warning only.
  - Redeem with no pool share is unavailable.
  - Both actions are unavailable in 1830 (no `issue` / `redeem` moves).
  - 21Moon `issueShares` (from the IPO, during the CR) gives the same events as before.
- [X] T047 [P] [US5] Write failing tests in a new `tests/domain/traits.test.ts`:
  - `effectiveTraits(game, state, company)` returns the company's traits merged with those of every `mergedFrom:<id>` counter: bonuses add up and booleans are OR-ed.
  - `namedPayment { payment: "tunneling" }` is one group: company → bank 40 (the trait's `cost`), then bank → company 60. One undo reverts both. `expansiveToken` is a company → bank transfer of 40.
  - A major seeded with `mergedFrom:TUN` can use `tunneling`.
  - A payment that is not in the effective traits is unavailable.

### Implementation for User Story 5

- [X] T048 [US5] Implement `effect: "stackBottom"` in `applyMoveRules` in `src/domain/mechanics/market.ts`. Make T043, T044 and T045 pass, and check the existing `orOrder` code handles the new stack order.
- [X] T049 [US5] Move `issueShares` out of `src/domain/mechanics/custom/corporateRound.ts` into the core handlers in `src/domain/actions/expand/operating.ts`:
  - Available when `market.moves.issue` is defined and the source given by `issue.from` (`ipo` by default, or `company:X` for `"treasury"`) holds the shares.
  - Expands to source → pool, bank → company at the price, and `marketMove down n` once per action.
  - Keep 21Moon's availability (its CR rule) through the existing `onlyIfFloated` and round data.
  - Update `ownerOf` / `src/domain/actions/availability.ts` accordingly.
- [X] T050 [US5] Add `redeemShare { type: "redeemShare", company: CompanyId | null, count: int>0 | null }` to `src/domain/actions/schemas.ts`, and its core handler to `src/domain/actions/expand/operating.ts`: available when `market.moves.redeem` is defined and the pool holds the shares; expands to pool → `company:X`, company → bank at count × price, and `marketMove up n` only when `n > 0`. Add the "more than one issue or redeem by this company in this OR" warning to both actions, read from this OR's groups as `operatedThisOR` is. Make T046 pass.
- [X] T051 [US5] Create `src/domain/mechanics/traits.ts` with `effectiveTraits`. Add `namedPayment { type: "namedPayment", company: CompanyId | null, payment: string }` to `src/domain/actions/schemas.ts` with a core handler in `src/domain/actions/expand/operating.ts`. Make T047 pass.
- [X] T052 [P] [US5] Add summaries to `src/domain/i18n/es.ts` for `redeemShare`, `namedPayment` ("Tunneling: montaña −$40 · bonificación +$60"), the RotLA `issueShares` wording, and the reasons `restack` ("pasa al fondo de la pila"), `merge` and `bonus`. Add cases to `tests/domain/summaries.test.ts`.
- [X] T053 [US5] Write failing UI tests in `tests/ui/rotla.test.tsx`, then update `src/ui/sheets/OperateSheet.tsx`:
  - "Emitir" and "Recomprar" chips, each one tap, shown only when the game defines the matching move rule.
  - Ability chips from `effectiveTraits`: "Montaña (−40 / +60)" records one `namedPayment` (one group, one History entry with both lines, one undo); "Ficha extra (−40)"; "Sede (+…)" opens the keypad (amount 0 in data means it is entered at use).
  - The payout still takes ≤ 2 taps.

**Checkpoint**: A full RotLA OR turn (except trains) works.

---

## Phase 8: User Story 6 - Trains, phases, rust and forced purchase (Priority: P1)

**Goal**: Phase changes, per-tier limits, rust (with Resourceful and Spacious), the 7/∞ card with its trade-in, and the forced purchase.

**Independent Test**: Buying the first 4-train removes all 2-trains, sets limits to minor 2 / major 3, and flags companies over the limit.

### Tests for User Story 6 ⚠️

- [X] T054 [P] [US6] Add failing RotLA cases to `tests/domain/trains.test.ts`:
  - The first 3, 4, 5, 6 and 7 bought give phases `green`, `green4`, `purple`, `purple6`, `grey` with the contract's limits. 2s rust at the first 4, 3s at the first 6, 4s at the first 7.
  - `trainLimitFor(game, state, company)` is tier-aware and adds `trainLimitBonus`.
  - `overLimitCompanies(game, state)` lists `{ company, count, limit }`.
  - Buying 7/∞ as "7" costs 750 and as "∞" costs 1000. "∞" with a non-rusted 5 traded in costs 800, and the 5 goes to `removed` (`tradeIn.to: "removed"`: it leaves the game). The trade-in price does not apply to the "7" variant.
  - Rust comes first: buying the first 7/∞ as "∞" while trading in a 4 rusts every 4 (that one included) to `removed` through the normal rust events. There is no trade-in transfer, a `tradeIn` warning ("El 4 se oxida con esta compra: no se puede entregar") is given, and the price is 1000. The same purchase trading in a 5 costs 800.
  - 1830 and 1848 trade-ins still send the train to `discardedTrainsTo`, as before.
  - Selling or trading in a `special` train, or one with a `permanent:` counter, warns.
  - `trainStack(game, state)` lists `{ type, displayName, left }` top first, with `left: "∞"` for 7/∞.
- [X] T055 [P] [US6] Add failing cases to `tests/domain/traits.test.ts`:
  - Resourceful at the first 4: its 2s stay with a `rusted:<asset>` counter, are not counted by `countedTrains`, and `discardTrain` sends them to `removed` and clears the counter.
  - A non-Resourceful `discardTrain` goes to the pool.
  - Spacious one train over the normal limit is not listed by `overLimitCompanies`.
- [X] T056 [P] [US6] Write failing tests in a new `tests/domain/forcedPurchase.test.ts`:
  - `buyTrain` with treasury 150, train 300, president 400 (`presidentPays: true`) gives one group: president → company 150, then the purchase.
  - `forcedTrainPurchase` with sales of two companies (one of them 2 shares) gives all the sales at pre-sale prices, then the shortfall transfer, then the purchase. Then each sold company moves down exactly once, even with `stockDrops: perShare`.
  - Warnings: a sale that changes the active company's presidency, a sale that puts the pool above 50%, the company still short after the sales (suggests `declareBankruptcy`), and the company already has a train.

### Implementation for User Story 6

- [X] T057 [US6] In `src/domain/mechanics/phases.ts`:
  - Make `trainLimit` tier-aware via `trainLimitByTier`, and add `trainLimitFor(game, state, company)` adding the effective `trainLimitBonus`.
  - Make `countedTrains` skip assets with a `rusted:` counter.
  - Make `phaseChangeEvents` emit `counterChange company:X "rusted:<asset>" +1` instead of moving the rusting trains of a company whose effective traits include `keepsRustedTrains`.
  - Add `overLimitCompanies` and `trainStack`.

  Update the callers in `src/domain/actions/limits.ts` and `expand/operating.ts`.
- [X] T058 [US6] In `src/domain/actions/expand/operating.ts`:
  - Apply `tradeIn.cost` only to `tradeIn.variant` when it is set (`trainPrice` and validation).
  - Rust first: judge the trade-in against the company's trains minus the types rusted by the phases this purchase triggers (`phasesTriggeredBy` and their `rust` effects). If the traded-in type rusts, warn, emit no trade-in transfer, and charge the variant's full price. `trainPrice` needs the state for this.
  - Send a valid traded-in train to `removed` when `tradeIn.to` is `"removed"`, otherwise to `discardDestination(game)` as today.
  - Add the `special` and `permanent:` sale and trade-in warnings.
  - Make `discardTrain` send a `rusted:` train to `removed` with a `counterChange −1`, and any other train to `discardedTrainsTo`.

  Make T054 and T055 pass.
- [X] T059 [US6] Extend `CorporateBankruptcyConfig` in `src/domain/mechanics/custom/corporateBankruptcy.ts` with `presidentPays?: boolean` (the `trainShortfall` hook runs with `trigger: "closedCell"` when it is true). Add the `forcedTrainPurchase` action, owned by `corporateBankruptcy`: its schema in `src/domain/actions/schemas.ts`, and the expansion and warnings of research R16. Set `presidentPays: true` in `src/domain/games/grotla.ts`. Make T056 pass. The 21Moon config and tests are unchanged.
- [X] T060 [P] [US6] Add summaries to `src/domain/i18n/es.ts` for `forcedTrainPurchase`, the 7/∞ variants and the trade-in, and the Resourceful "oxidado, última carrera" label.
- [X] T061 [US6] Write failing UI tests in `tests/ui/rotla.test.tsx`, then implement:
  - In `src/ui/sheets/OperateSheet.tsx`:
    - 7/∞ shows "7: $750", "∞: $1.000" and "∞ entregando…", which lists the non-rusted trains (on the first 7/∞ it leaves out the 4s, which rust with that purchase).
    - The "Compra forzada" card appears when the company has no train and its treasury is below the cheapest train. It shows the president's contribution and has share-sale rows.
    - Resourceful rusted trains show "Oxidado · última carrera" and "Retirar".
  - An over-limit banner in `src/ui/screens/Table.tsx` and the Operate sheet ("<name>: 3 trenes, límite 2. Elegir cuál va al pool"). Tapping it opens the existing `discardTrain` picker.
  - A "Trenes" section in `src/ui/screens/Market.tsx` with `trainStack` and "Límite: minor 2 · major 3".

**Checkpoint**: Trains, phases and limits are correct for every phase.

---

## Phase 9: User Story 7 - Merger Round: two minors become a major (Priority: P1)

**Goal**: After OR 2 from green on, the Merger Round lets the table merge two minors into a major in one undoable action.

**Independent Test**: Minors at 80 and 70 merge. Ana held 3 + 0 and Bruno 2 + 3, so Bruno is president and Ana holds 3 units. The price is 70, at the bottom of the stack, and the treasuries are summed.

### Tests for User Story 7 ⚠️

- [X] T062 [P] [US7] Write failing tests in a new `tests/domain/merger.test.ts` (seed with `seedCompany`):
  - The independent test above, in full: every holder's minor units go to `removed`, and the same number of major units go from `ipo:M`. A minor's own treasury units become `company:M` units, and pool units become pool units. Treasuries and trains move to `company:M`. The price is `floorToTrack(⌊(80+70)/2⌋)` = 70 with reason `"merge"`, at the bottom of the stack. M is `floated` and the minors are `closed`. The counters `mergedFrom:A` and `mergedFrom:B` are set. The share-unit invariant holds.
  - Same president for both minors: that player gets 2 + 8 units.
  - A 5–5 tie: the president of the minor that comes first in the operating order wins, with an info warning naming them.
  - `identity: "alt"` sets the `identity` counter to 1, and the display name is `altName`.
  - `rusted:` and `permanent:` counters move from the minor to the major.
  - Undo gives a reduced state deep-equal to the state before the merger.
  - 5 trains in `green4`: a `trainLimit` warning, and the major appears in `overLimitCompanies`.
  - Warnings for "not a Merger Round" and an unknown identity. Unavailable when a or b is not a floated minor, or `into` is not an unstarted major.
  - `mergePreview(game, players, state, a, b)` returns the president, tie, holdings, price, treasury, trains and overLimit matching the expansion.
- [X] T063 [P] [US7] Write failing tests in a new `tests/domain/cycles.test.ts`:
  - `mergerRoundDue(game, state)` is false after OR 2 in yellow, and true after OR 2 when the phase is `green` or later (first 3 bought, or exported at an earlier cycle's end).
  - US7-6: yellow at the end of OR 2 gives no Merger Round; `startSR` then exports the first 3 and the phase becomes green, and the next cycle's OR 2 makes the Merger Round due.
  - `startMR` is unavailable when not due. When due, it emits the OR end step (empty) and then `turnAdvance { round: "MR", company: null, operatingOrder }`, listing only minors, in operating order.
- [X] T064 [P] [US7] Write failing UI tests in `tests/ui/rotla.test.tsx` for the Merger sheet:
  - Minors are listed in operating order; majors are unstarted only, each with an identity toggle.
  - The preview shows the president with a "desempate por orden" tag on a tie, per-player shares, price, treasury, trains, and an over-limit flag.
  - Confirming takes ≤ 3 taps after the minors are chosen (SC-003).
  - History shows one entry listing every transfer (US7-7).

### Implementation for User Story 7

- [X] T065 [US7] Add `mergeCompanies { type: "mergeCompanies", a: CompanyId, b: CompanyId, into: CompanyId, identity: "primary" | "alt" | null }` and `startMR { type: "startMR" }` to `src/domain/actions/schemas.ts`.
- [X] T066 [US7] Add `mergerRoundDue` to `src/domain/mechanics/schedule.ts`, reading `roundSchedule.fixed.conditional` and `phaseReached`. The round is OR, `orIndex = orsInSet`, and `phaseReached` has been reached (B p.18). No export-timing tracking: the export comes after this check.
- [X] T067 [US7] Create `src/domain/mechanics/custom/mergers.ts` (config `{ round: "MR" }`). It owns `mergeCompanies` and `startMR`, and exports `mergePreview`. Follow research R8 steps 1–6, using only `shareTransfer`, `moneyTransfer`, `assetTransfer`, `marketMove`, `companyStatus` and `counterChange`. Register it in `src/domain/mechanics/custom/index.ts`, and add `mergers` to `customRules` in `src/domain/games/grotla.ts`. Make T062 and T063 pass. Confirm that `presidencyTrigger` finds nothing to change after a merger.
- [X] T068 [P] [US7] Add summaries to `src/domain/i18n/es.ts` for `mergeCompanies` ("Express + Tunneling → Union · presidente Bruno · precio $70 · tesorería $310 · 3 trenes") and `startMR`. Make the display name use `altName` when the `identity` counter is 1, wherever company names are resolved (`src/domain/i18n/es.ts` `companyName` and the UI's `CompanyBadge`).
- [X] T069 [US7] Create `src/ui/sheets/MergerSheet.tsx` per contracts/ui.md. Add the round controls to `src/ui/screens/Table.tsx`: "Ronda de fusiones" (`startMR`) after OR 2 when due, and "Fusionar…" during the MR. Make T064 pass.

**Checkpoint**: Majors can be formed, previewed and undone exactly.

---

## Phase 10: User Story 8 - Export, cycles and end of game (Priority: P1)

**Goal**: Starting the next SR exports a train (with its rust and phase effects). After the last cycle, show the final scores.

**Independent Test**: At the end of cycle 1 in yellow, the export removes all remaining 2-trains, so the next train is a 3. After cycle 4 of a Short game, "Ver puntuación" shows scores instead of a new SR.

### Tests for User Story 8 ⚠️

- [X] T070 [P] [US8] Write failing tests in a new `tests/domain/export.test.ts` for `exportEvents(game, state)` and `startSR`:
  - A 2 on top: every bank-held 2 goes bank → `removed`.
  - The first 3 exported: the phase becomes `green`.
  - The first 4 exported: every 2 rusts as if bought, and Resourceful keeps its 2s with `rusted:` counters.
  - Only 7/∞ left: one new 7 asset goes to `removed`, and the supply stays unlimited.
  - Micro (`trainExport: null`): no export.
  - SR 1 start (`srNumber` 0) exports nothing.
  - The order inside `startSR` is the round end step, then the export, then `turnAdvance SR`.
  - Undo restores the stack, the phase and the rusted trains.
  - The validation info names the export: "Se exporta un tren 3: empieza la fase verde".
  - `startSR` after `cyclesComplete` warns "La partida terminó".
- [X] T071 [P] [US8] Add failing cases to `tests/domain/cycles.test.ts` and `tests/domain/endTriggers.test.ts`: `cyclesComplete` fires after OR 4.2 of a Short game in yellow (no MR due), and after MR 4 when one is due, but not before.
- [X] T072 [P] [US8] Write failing tests in a new `tests/domain/scores.test.ts` for `finalScores(game, players, state)`. It returns `{ player, cash, sharesValue, total, rank, eliminated }`, with shares at the current price and company treasuries excluded. On a tie, the player who presides over the company highest in the operating order ranks first, then the next company, and so on. A player with the `bankrupt` counter is `eliminated: true`, listed last, with no total or rank (US9-4).
- [X] T073 [P] [US8] Write failing UI tests in `tests/ui/rotla.test.tsx`:
  - The round controls follow the contracts/ui.md table: "Empezar RO 1", "Empezar RO 2", "Ronda de fusiones", "Exportar y nueva RA" with the export subtitle ("Sale un 2 · quedan 3×3"), and "Ver puntuación".
  - The Score sheet lists cash, shares, total and rank, with "desempate: presidente de X" on a tie.
  - The Score sheet opens automatically on `cyclesComplete` and from the menu ("Puntuación").

### Implementation for User Story 8

- [X] T074 [US8] Add `exportEvents` to `src/domain/mechanics/schedule.ts`. It takes the first bank-held train in `game.trains` order, or every bank-held train of that type when it is in `allOfType`; it never takes a `special` type; and for an unlimited type it creates the next numbered asset. Add the export (when `trainExport` is set and `srNumber ≥ 1`) and the validation info to `startSR` in `src/domain/actions/expand/flow.ts`. Check that `phaseTrigger` already applies phase changes and rust for bank → `removed`. Make T070 pass.
- [X] T075 [US8] Add the `cyclesComplete` trigger to `src/domain/mechanics/endTriggers.ts` (data-model §4 "The game is over"), and the "La partida terminó" warning to `startSR`. Make T071 pass.
- [X] T076 [US8] Create `src/domain/mechanics/scores.ts` with `finalScores`. Make T072 pass.
- [X] T077 [P] [US8] Add the export summary to `src/domain/i18n/es.ts`: "Exportado: 3 → fase verde; se oxidan …", shown inside the `startSR` entry in History.
- [X] T078 [US8] Create `src/ui/sheets/ScoreSheet.tsx`. Finish the cycle round controls in `src/ui/screens/Table.tsx` (the export subtitle uses `exportEvents` and `trainStack`). Add "Puntuación" to the menu, and open the sheet automatically on `cyclesComplete`. Make T073 pass.
- [X] T079 [US8] Add the Bank Break case to `tests/domain/endTriggers.test.ts`: with `bankBreak: on`, the bank reaching 0 during an OR announces the end trigger, and the game ends after the current set of ORs. Fix `src/domain/mechanics/endTriggers.ts` if needed, and open the Score sheet then too.

**Checkpoint**: A Short game can run from cycle 1 to the final scores.

---

## Phase 11: User Story 9 - Dissolution and bankruptcy (Priority: P2)

**Goal**: A price of 0 dissolves the company in the same step. A player's bankruptcy liquidates the companies they preside over, paying the other holders.

**Independent Test**: A company at 10 withholds and drops to 0. Its shares disappear from every holder, its money is back in the bank, and its trains are in the pool.

- [X] T080 [P] [US9] Write failing tests in a new `tests/domain/dissolution.test.ts`:
  - Withhold at 10 dissolves the company in the same group: all its units go to `removed`, the treasury goes to the bank, the trains go to the pool, the status is `closed`, and it leaves the operating order. The `bankruptcy` end trigger does not fire without Bank Break.
  - The same happens when the price reaches 0 during a `forcedTrainPurchase` sale.
  - `declareBankruptcy` with `playerMode: "liquidatePresided"`, for a player presiding over two companies who also holds a share of a third company (presided by another player) and some cash: one group in which, for **both** presided companies, every other holder is paid units × current price by the bank, then all units go to `removed`, trains to the pool, the treasury to the bank, and the company is `closed`. Then the third company's share goes to the pool (no payment, no market move), the cash goes to the bank, and the player gets `bankrupt +1` (eliminated). The share-unit invariant holds, and one undo restores everything.
  - Naming an eliminated player in `launchCompany` or `buyShare` gives an "eliminated player" warning, never a block (the UI hides them; see T083).
  - With `bankBreak: on`, the bankruptcy fires the end triggers.
  - 21Moon bankruptcy is unchanged.
- [X] T081 [US9] Extend `CorporateBankruptcyConfig` in `src/domain/mechanics/custom/corporateBankruptcy.ts` with:
  - `companyTrainsTo?: "removed" | "pool"`, default `"removed"`;
  - `companyStatus?: "bankrupt" | "closed"`, default `"bankrupt"`;
  - `playerMode?: "toPool" | "liquidatePresided"`, default `"toPool"`.

  Make the `closedCell` trigger honor them, and make `declareBankruptcy` in `src/domain/actions/expand/status.ts` honor `playerMode`. `liquidatePresided` liquidates every presided company first and then reuses the existing `playerBankruptcyEvents` (cash to the bank, shares to the pool, `bankrupt +1`). Add an "eliminated player" warning to `launchCompany` and `buyShare` using `isPlayerBankrupt`. Set the RotLA values in `src/domain/games/grotla.ts`. Make T080 pass.
- [X] T082 [P] [US9] Add the summary to `src/domain/i18n/es.ts`: "Quiebra de Carla: queda eliminada; se cierran Union y Express; se pagan $720 a otros accionistas", plus a dissolution line for the `closedCell` case.
- [X] T083 [US9] After a recorded bankruptcy in `src/ui/sheets/StatusSheets.tsx`, offer "Terminar partida", which opens the Score sheet. With Bank Break, open it directly. Hide eliminated players from the player chips in `LaunchSheet.tsx` and `StockSheet.tsx`, mark them "Eliminado" on the Table, and show them last as "Eliminado" in `ScoreSheet.tsx`. Mark eliminated players in `src/voice/snapshot.ts` so voice does not propose them. Add cases to `tests/ui/rotla.test.tsx` (US9-4).

**Checkpoint**: Rare money paths are correct and conserved.

---

## Phase 12: User Story 10 - Voice commands for RotLA (Priority: P2)

**Goal**: Spanish voice covers launch, issue, redeem, merge, Merger Round, forced purchase, named payments, the ∞ trade-in, and RotLA names. The eval reaches ≥ 90% on RotLA cases, and the other games do not drop.

**Independent Test**: The eval set has RotLA fixtures and cases for every new action, and `npm run eval:voice` meets the target.

**Depends on**: US2–US9 (the actions must exist). FR-031: fixtures and cases come before any prompt or tool change.

- [X] T084 [P] [US10] Add the fixtures `rotla-sr` (an SR with launched and unlaunched minors), `rotla-or` (an OR with a Tunneling minor, a pool share, and 7/∞ available), and `rotla-mr` (a Merger Round in green) to `eval/voice/fixtureSpecs.ts`. Regenerate them with `eval/voice/buildFixtures.ts`.
- [X] T085 [P] [US10] Add cases to `eval/voice/cases.jsonl`, with expected actions, for:
  - "Ana abre Tunneling por 140" and "Bruno lanza Express en 165";
  - "emite una acción" and "recompra una acción";
  - "Express y Tunneling se fusionan en Union" and "… en Conglomerate" (alt identity);
  - "ronda de fusiones";
  - "compra forzada de un 4, Ana vende dos de Express";
  - "bonificación de túnel" and "ficha extra de Expansive";
  - "compra un infinito entregando el 5";
  - common OR commands (payout, withhold, buy a train) with RotLA names.

  Update `tests/eval/voice.test.ts` so the new fixtures build and every case parses.
- [X] T086 [US10] Add Spanish tool descriptions with examples to `src/voice/tools.ts` for `launchCompany`, `mergeCompanies`, `startMR`, `redeemShare`, `forcedTrainPurchase` and `namedPayment`, and update `issueShares` so it no longer says "ronda corporativa" only. Tools of mechanics a session does not enable are not sent. Add cases to `tests/voice/` that check the RotLA tool list and that the 1830, 1848 and 21Moon tool lists are unchanged.
- [X] T087 [US10] Extend `src/voice/snapshot.ts` with each company's tier and launch state, the minors in play, and the turn's cycle and round (MR included). Add the game-agnostic line "«abre X por N» = launchCompany en juegos con lanzamiento por subasta" to `src/voice/prompt.ts`, included only when `launchCompany` is available. Keep the cached per-game prefix stable.
- [X] T088 [US10] Make sure the confirmation card (`src/ui/components/ConfirmationCard.tsx`) shows, for `launchCompany`, the bid, treasury, starting price and chip breakdown (US2-5), and for `mergeCompanies` the merger preview, including the alt identity (US10-3).
- [ ] T089 [US10] Run `npm run eval:voice` for every game. Record the accuracy per game in `eval/voice/results/`. RotLA common OR commands must reach ≥ 90% (SC-006), and 1830, 1848 and 21Moon must not drop below the T001 baseline (SC-007). Iterate on the tool descriptions and aliases only.

**Checkpoint**: Voice parity for RotLA.

---

## Phase 13: User Story 11 - Landmarks expansion effects (Priority: P3)

**Goal**: With `expansion: landmarks`, record Rock Formation, Cliff and Canyon; launch Manufacturing with its fee and special train; and offer the new minors and majors.

**Independent Test**: A company runs to the Rock Formation. Its price rises two spaces before the payout, and the bonus is marked as used.

**Depends on**: US2 (launch), US5 (payout), US6 (trains), US7 (mergers).

- [X] T090 [P] [US11] Add failing cases to `tests/games/options.test.ts` and `tests/games/rotla.test.ts`. `expansion: landmarks`:
  - adds CIR, CPL, MFG, TWC (minors) and AUT, LGE (majors, `altName` "Authority II" and "League II") with the contract's colors and traits;
  - adds the `M2` train (count 1, `special`, variant cost 0), held by `removed` at start;
  - adds the `landmarks` custom rule.

  With `expansion: off`, none of these are present.
- [X] T091 [P] [US11] Write failing tests in a new `tests/domain/landmarks.test.ts`:
  - Rock Formation at 80, then payout 160: 80 → 100 (reason `"bonus"`) → 110. The `landmark:rockFormation` counter is set, and a second use warns.
  - Cliff with a 5: +225 from the bank, the 5 to the pool. A second Cliff in the same OR, or a train the company does not own, warns.
  - Canyon after the first 4: a rusted 2 goes `removed` → `company:X` with `permanent:<asset>` and `landmark:canyon`, counts for the limit, and warns if sold. Canyon before the first 4 warns.
  - Manufacturing launched for 140: treasury 90 (140 − 50 to the bank), holds `train:M2:1`. A leadoff purchase warns (`noLeadoffTrain`).
  - With the expansion, `mergeCompanies` accepts AUT and LGE.

### Implementation for User Story 11

- [X] T092 [US11] Add the `expansion` option to `src/domain/games/grotla.ts` (`addCompanies`, a patch adding the `M2` train, `addCustomRules: [landmarks]`). Make T090 pass.
- [X] T093 [US11] Add research R4 step 6 to `src/domain/mechanics/custom/auctionLaunch.ts`: with `launchFee`, a `moneyTransfer company:X → bank`; with `launchAssets`, an `assetTransfer removed → company:X` for each asset. Add the `noLeadoffTrain` info. Add a `buyTrain` warning in `src/domain/actions/expand/operating.ts` for a leadoff purchase by a company with `noLeadoffTrain`.
- [X] T094 [US11] Create `src/domain/mechanics/custom/landmarks.ts` (config `{}`), owning `rockFormation { company }`, `cliffSale { company, train }` (a type or asset id) and `canyonTrain { company }`, as in research R13. Add their schemas to `src/domain/actions/schemas.ts` and register the mechanic in `src/domain/mechanics/custom/index.ts`. Make T091 pass.
- [ ] T095 [P] [US11] Add summaries to `src/domain/i18n/es.ts` for the three actions and the Manufacturing launch fee line. Add voice tool descriptions to `src/voice/tools.ts` ("formación rocosa", "vende el 5 en el acantilado", "tren del cañón"), and add eval cases to `eval/voice/cases.jsonl`. These tools change the tool set after T089, so re-run `npm run eval:voice` for every game (constitution VI) and record the results in `eval/voice/results/`: RotLA ≥ 90%, and 1830, 1848 and 21Moon not below the T001 baseline.
- [X] T096 [US11] Add the Landmarks chips to `src/ui/sheets/OperateSheet.tsx`: "Formación rocosa (+2)", "Acantilado" (pick a train) and "Cañón". Show them only when the mechanic is enabled. A chip is disabled with "Ya usada" once its counter is set, and a long press still allows a repeat with a warning. Add cases to `tests/ui/rotla.test.tsx`.

**Checkpoint**: All user stories are functional.

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, whole-game checks, and the SC-005, SC-001 and SC-007 gates.

- [X] T097 [P] Update `docs/spec.md` in the same change (constitution VII; plan "Workflow"): §2.1 adds RotLA to the supported games, §2.2 removes mergers from the later iterations, §5.3 becomes "Mergers (built)", and §6 lists `launchCompany`, `mergeCompanies`, `startMR`, `redeemShare`, `forcedTrainPurchase`, `namedPayment`, `rockFormation`, `cliffSale`, `canyonTrain`, and the core `issueShares`.
- [X] T098 [P] Extend `tests/helpers/randomWalk.ts` candidates with the RotLA actions (launch, buy, sell, issue, redeem, payout, buyTrain with variants, namedPayment, startOR/startMR/startSR, mergeCompanies). Add RotLA to `tests/domain/randomGames.test.ts`: no invariant violation over 1,000 seeded games (SC-005).
- [X] T099 Write `tests/games/rotla.playthrough.test.ts`: a scripted 3-player Short game over 4 cycles, with launches, purchases, sales, issues, payouts, trains through the grey phase, at least one merger, exports, and the final scores. It ends with `cyclesComplete`, every group's money flows trace to one History entry, and no manual correction is used (SC-001, SC-005).
- [X] T100 [P] Confirm `tests/domain/perf.test.ts` stays within budget with a RotLA game that includes mergers. If the budget is exceeded, optimize only the RotLA additions.
- [X] T101 [P] Add a Playwright smoke test `e2e/rotla.spec.ts`: create a RotLA Short game, launch two minors, start OR 1, pay out, and open the Market strip. Extend `e2e/a11y.spec.ts` to cover the Launch, Merger and Score sheets (48 px targets).
- [X] T102 [P] Render `shape: "1d"` in `src/ui/screens/Market.tsx` as a horizontal strip of 27 cells that wraps on phones. Label the 0 cell "Cerrada", list stacked tokens top to bottom, and highlight the current phase's launch range. Add a case to `tests/ui/market.test.tsx`. (This is presentation only; earlier stories work with the existing renderer.)
- [X] T103 Verify SC-007: the full existing suite passes unchanged, and the 1830, 1848 and 21Moon replay logs reduce to byte-identical states (`tests/domain/snapshots.test.ts`).
- [ ] T104 Run `npm run typecheck && npm run lint && npm test`. If anything touching voice (tools, prompt, snapshot, aliases) changed since the last eval run, run `npm run eval:voice` again and report the per-game accuracy for the PR (constitution workflow). Then do the manual check in [quickstart.md](quickstart.md) (10 minutes, `npm run dev`), and record the results.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: depends on Setup. It BLOCKS every user story (plan steps 1–2).
- **US1 (Phase 3)**: depends on Foundational.
- **US2–US6 (Phases 4–8)**: depend on Foundational only. They seed state with `seedCompany`, so they do not need each other. The plan's domain steps 3–5 can run in parallel.
- **US7 (Phase 9)**: depends on Foundational. It uses `trainLimitFor` / `overLimitCompanies` from US6 (T057) for the over-limit warning.
- **US8 (Phase 10)**: depends on Foundational, plus `mergerRoundDue` and `startMR` from US7 (T066–T067) for the cycle controls and `cyclesComplete`.
- **US9 (Phase 11)**: depends on US6 (T059 `forcedTrainPurchase`) for the "dissolved during a forced sale" case. T083 also needs the Score sheet from US8 (T078) and the Launch sheet from US2 (T036).
- **US10 (Phase 12)**: depends on US2–US9 (every action must exist).
- **US11 (Phase 13)**: depends on US2, US5, US6 and US7.
- **Polish (Phase 14)**: depends on every story included in the release.

### User Story Dependency Graph

```text
Foundational ─┬─ US1
              ├─ US2 ──────────────────────────────┐
              ├─ US3                               │
              ├─ US4                               │
              ├─ US5 ──────────────────────────────┤
              ├─ US6 ─┬─ US7 ─┬─ US8               ├─ US11
              │       │       └────────────────────┤
              │       └─ US9                       │
              └─ (US2–US9) ─────────── US10        │
```

### Within Each User Story

- Tests are written first and MUST fail before the implementation.
- Schema → mechanic or handler → i18n summary → UI.
- Each story ends at its checkpoint with the full suite green.

### Shared files (no [P] between tasks that touch them)

`src/domain/games/grotla.ts`, `src/domain/actions/schemas.ts`, `src/domain/actions/expand/operating.ts`, `src/domain/mechanics/phases.ts`, `src/domain/mechanics/market.ts`, `src/domain/i18n/es.ts`, `src/ui/sheets/OperateSheet.tsx`, `src/ui/screens/Table.tsx`, `tests/ui/rotla.test.tsx`. Different stories that edit these must merge sequentially.

---

## Parallel Examples

### Foundational

```text
T002 schema tests  |  T004 event tests  |  T006 options tests  |  T008 validation tests  |  T010 market tests  |  T012 state tests
then T003, T005, T007, T009, T011, T013 (different files, each after its test)
then T014 → T015 → T016 | T017
```

### User Story 2

```text
T027 launchPrice tests  |  T028 launch tests  |  T029 Diagram 3  |  T030 Launch sheet UI tests
then T031 → T032 → T033 → T034, with T035 in parallel, then T036
```

### User Story 5

```text
T043 stackBottom  |  T044 payout  |  T045 operating order  |  T046 issue/redeem  |  T047 traits
then T048 (market.ts) and T051 (traits.ts) in parallel; T049 → T050 (operating.ts) in sequence; T052 in parallel; then T053
```

### Across stories (after Foundational)

```text
Developer A: US2 → US3 → US4
Developer B: US5 → US6 → US9
Developer C: US1 → US7 → US8
Then: US10 and US11, then Polish
```

---

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2 (Foundational).
2. US1: sessions can be created.
3. US2 to US5: a full SR and OR without trains past yellow.
4. **Stop and validate**: launch, trade and operate a first cycle.

### Incremental delivery

1. Add US6 (trains and phases), then US7 (mergers), then US8 (cycles and end). At this point a whole game can be played (SC-001).
2. Add US9 (dissolution and bankruptcy).
3. Add US10 (voice), which needs the eval run (SC-006, SC-007).
4. Add US11 (Landmarks).
5. Polish: docs, random walk, playthrough, e2e, the Market strip.

---

## Notes

- `[P]` tasks touch different files and depend on no unfinished task.
- Trade-in (resolved by the user, 2026-10-09): rust is checked first, and a traded-in train leaves the game (`tradeIn.to: "removed"`). See spec FR-018 and research R11.
- Commit after each task or logical group, and stop at any checkpoint to validate the story on its own.
