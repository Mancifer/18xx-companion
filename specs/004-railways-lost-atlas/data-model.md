# Data Model: Railways of the Lost Atlas

**Feature**: 004-railways-lost-atlas | **Date**: 2026-10-09

This feature adds **no new primitive event type** (constitution I). It extends:

- **Game-definition data**: the schema in `src/domain/games/schema.ts`.
- **Enums on existing event fields**: `Round`, `MarketMoveReason`.
- **Derived state**: from counters that already exist.

Section numbers refer to `specs/001-companion-mvp/data-model.md` where they extend it.

---

## 1. Game definition: schema additions (§4)

All new fields are optional. Existing definitions (1830, 1848, 21Moon) and saved custom games parse unchanged.

### CompanyDef

| Field | Type | Meaning |
|---|---|---|
| `tier` | `"minor" \| "major"` | Selects the per-tier train limit and the role in a merger. Absent means neither (today's games). |
| `start` | `"par" \| "auction" \| "merger"` | How the company enters play. Default `"par"`. With `"merger"`, `parCompany` and `launchCompany` are unavailable. |
| `altName`, `altAliases` | `string`, `string[]` | The major's second identity (FR-005a). |
| `traits` | `CompanyTraits` | Money- and train-relevant abilities (below). |

`CompanyTraits` (all optional):

| Trait | Type | RotLA use |
|---|---|---|
| `trainLimitBonus` | int ≥ 0 | Spacious: 1 |
| `keepsRustedTrains` | boolean | Resourceful |
| `launchFee` | int > 0 | Manufacturing: 50 (L p.10) |
| `launchAssets` | AssetId[] | Manufacturing: `["train:M2:1"]` |
| `noLeadoffTrain` | boolean | Manufacturing (warning only) |
| `payments` | `{ id, labelEs, amount, direction: "bankPays" \| "companyPays", cost?: int > 0 }[]` | Tunneling `{ id: "tunneling", amount: 60, direction: "bankPays", cost: 40 }` (the company pays the cost to the bank in the same group); Expansive `{ id: "expansiveToken", amount: 40, direction: "companyPays" }` |

**Effective traits** of a company are its own traits plus those of every company named by its `mergedFrom:<id>` counters (§4 below). Bonuses add up, and booleans are OR-ed.

### TrainDef

| Field | Type | Meaning |
|---|---|---|
| `countByPlayers` | `Record<string, posInt>` | Overrides `count` for the session's player count (FR-005). |
| `special` | boolean | Starts in `removed`. Never in the stack, never exported. The Manufacturing 2-train. |
| `tradeIn.variant` | string | The variant the trade-in price applies to (`"∞"`). |
| `tradeIn.to` | `"removed" \| "discard"` | Where the traded-in train goes. Default `"discard"` (`discardedTrainsTo`, today's behavior for 1830 and 1848). RotLA uses `"removed"`: it leaves the game. |
| `variants[].cost` | relaxed to int ≥ 0 | So the special train can cost 0. |
| `displayName` | string | Shown instead of `type` (`"7/∞"`). |

### PhaseDef

| Field | Type | Meaning |
|---|---|---|
| `trainLimitByTier` | `{ minor?: posInt; major?: posInt }` | Overrides `trainLimit` per tier. |
| `launchPriceRange` | `[posInt, posInt]` | Starting-price bounds for `launchCompany` (B p.10, 16). |
| `color` | `string` | Display name of the phase color (`"Verde"`). Several phase ids can share a color (research R10). |

### MarketDef

| Field | Change |
|---|---|
| `shape` | `"1d"` is now used: a one-column grid, row 0 = highest price (research R1). |
| `moves.payout[]` / `moves.withhold[]` | A rule may have `effect: "stackBottom"` (research R2). |
| `moves.issue.from` | `"ipo"` (default) \| `"treasury"`. |
| `moves.redeem` | `{ n: int ≥ 0 }`, optional. Present means `redeemShare` is available. |
| `moves.sell.warnUnlessOperated` | boolean. Warns (never blocks) on selling a company that has not operated (B p.10). |

### GameDefinition (top level)

| Field | Type | Meaning |
|---|---|---|
| `auction` | `{ minBid: posInt; step: posInt }` | Launch warnings (120, 5). Required when any company has `start: "auction"`. |
| `trainExport` | `{ allOfType: string[] } \| null` | The export at each new SR (research R7). Absent or `null` means no export. |
| `roundSchedule.fixed.conditional` | `{ slotPrefix: string; phaseReached: string }[]` | Slots skipped unless the phase was reached (`MR*` → `green`). |
| `limits.maxSharesPerBuy` | posInt | Warns when one purchase takes more (1). |
| `endTriggers[]` | adds `{ type: "cyclesComplete" }` | Fires after the last slot of a fixed schedule has been completed. |

### OptionDef (§4, contracts/game-definition.md rule 2)

| Field | Type | Meaning |
|---|---|---|
| `kind` | `"choice"` (default) \| `"companySubset"` | |
| `from` | `string[]` | `companySubset` only: the eligible company ids. |
| `size` | `Record<string, posInt>` | `companySubset` only: the expected count, by mode value (a warning only). |
| `choices[].patch` | JSON object | An RFC 7386 merge patch on the definition. |
| `choices[].removeCompanies` | `string[]` | Company ids dropped from the session copy. |
| `choices[].addCompanies` | `CompanyDef[]` | Companies appended to the session copy. |
| `choices[].recommendedPlayers` | `{ min, max }` | Shows a New Session warning when the player count is outside it (US1-2). |

**Applying options**: `applyOptions` applies each option in definition order. For the chosen value it applies `removeCompanies`, then `addCompanies`, then `patch`, then `addCustomRules`. For a `companySubset` option, it removes the eligible companies that are not in the list. The result must pass `validateDefinition`, otherwise session creation fails with the errors listed.

### Mechanics (customRules)

| Id | New or changed | Config |
|---|---|---|
| `auctionLaunch` | new | `{}`. Owns `launchCompany`. |
| `mergers` | new | `{ round: "MR" }`. Owns `mergeCompanies` and `startMR`. |
| `landmarks` | new | `{}`. Owns `rockFormation`, `cliffSale` and `canyonTrain`. |
| `corporateBankruptcy` | changed config | Adds `companyTrainsTo`, `companyStatus`, `playerMode`, `presidentPays` (research R15, R16). Owns `forcedTrainPurchase`. |
| `corporateRound` | changed | `issueShares` moves out to the core handlers (research R9). The 21Moon definition is unchanged. |

---

## 2. Events: extended enums only (contracts/events.md)

| Type | Added values | Reducer behavior |
|---|---|---|
| `Round` | `"MR"` | Like any round: changing to it clears `operatedThisOR`, `soldThisSR` and `roundEnded`. |
| `MarketMoveReason` | `"restack"` | Re-enters the same cell: `stackOrder = max(others in cell) + 1`. |
| `MarketMoveReason` | `"merge"`, `"bonus"` | Ordinary moves. Used for summaries and History. |
| `CompanyStatus` | (none) | Minors that merge or dissolve use the existing `"closed"`. |

`events/schema.ts` (the import/export validator) accepts the new enum values. Old logs contain none of them, so they replay identically (SC-007).

---

## 3. Counters (existing `counterChange`)

| Subject | Key | Value | Set by |
|---|---|---|---|
| `company:M` | `mergedFrom:<minorId>` | 1 | `mergeCompanies` |
| `company:M` | `identity` | 1 = alt identity, absent = primary | `mergeCompanies` |
| `company:X` | `rusted:<assetId>` | 1 while held rusted (Resourceful) | the phase change; cleared by `discardTrain` |
| `company:X` | `permanent:<assetId>` | 1 (Canyon train) | `canyonTrain` |
| `company:X` | `landmark:rockFormation` | 1 | `rockFormation` |
| `company:X` | `landmark:canyon` | 1 | `canyonTrain` |
| `company:X` | `runs` | existing | the run. Also drives "has operated" for the sale warning. |
| `player:P` | `bankrupt` | existing. In RotLA it means eliminated: hidden from player pickers, ranked last by `finalScores` | `declareBankruptcy` |

When a merger moves a train, `rusted:` and `permanent:` counters on the minor are moved to the major in the same group (−1 on the minor, +1 on the major).

---

## 4. Entities (the spec's Key Entities mapped to state)

### Minor company

- **Definition**: `tier: "minor"`, `start: "auction"`, `shareCount: 5`, `presidencyUnits: 2`, `certificates: [2,1,1,1]`.
- **State**: a `CompanyRecord`, with status `unstarted`, then `floated` at launch, then `closed` when it merges or dissolves.
  - Treasury: `money["company:X"]`.
  - Own shares: `holdings["company:X"][X]`.
  - Trains: `assets → "company:X"`.
  - Price and stack: `position`, `stackOrder`.
- **Has operated**: `runs > 0`.

### Major corporation

- **Definition**: `tier: "major"`, `start: "merger"`, `shareCount: 10`, `presidencyUnits: 2`, `certificates: [2,1×8]`.
- **State**: `unstarted` until a merger, then `floated`.
- **Origins and identity**: `mergedFrom:*` and `identity` counters. The display name is `altName` when `identity = 1`.

### Stock track

The one-column grid of research R1. Each cell's stack is ordered by `stackOrder` ascending (top first).

**Operating order** (unchanged code: `orOrder: { by: "priceDesc", ties: ["stackTop"], dynamic: true }`): companies with status `floated`, by price descending, then top of stack first.

**`floorToTrack(x)`**: the highest cell price ≤ x, excluding the `closed` cell.

### Cycle

Not stored. It is derived from the turn as cycle = `srNumber` (one SR per cycle). The round indicator shows "Ciclo n · RA", "Ciclo n · RO 1/2" or "Ciclo n · RF".

**The Merger Round is offered** when the round is `OR`, `orIndex = orsInSet` (OR 2 done), and `phaseReached(conditional.phaseReached)` (the first green train has been bought or exported, B p.18). No export-timing check is needed: the export that might start green comes after this point (B p.19).

**The game is over** (`cyclesComplete`) when `srNumber` = the number of cycles, OR 2 of that cycle is complete, and either no Merger Round is due or the round is `MR`.

### Train card

`train:<type>:<n>` assets.

- **Stack**: the bank-held trains in `game.trains` order.
- **Rusted**: held by `removed`, or held by a Resourceful company with a `rusted:` counter.
- **7/∞**: one type, `"7"`, with two variants. The variant chosen at purchase sets the price only.

### Game mode

The `mode` option value, stored in `SessionMeta.options`. Its patch is already folded into the frozen `SessionMeta.game` (FR-005 of feature 001), so nothing reads the mode at runtime except the New Session screen and the summary.

### Landmarks marker

The `landmark:*` counters.

---

## 5. Derived queries (new, pure)

| Function | Returns | Used by |
|---|---|---|
| `launchPrice(game, state, bid, override?)` | `{ price, cell, clamped: boolean }` | `launchCompany`, the Launch sheet preview, voice card |
| `floorToTrack(game, x)` | `CellRef` | launch, merger |
| `mergePreview(game, players, state, a, b)` | `{ president, tie: boolean, holdings: [holder, units][], price, treasury, trains, overLimit }` | `mergeCompanies` expansion and the Merger sheet |
| `effectiveTraits(game, state, company)` | `CompanyTraits` | train limit, payments, rust |
| `trainLimitFor(game, state, company)` | number | `buyTrain` warning, `overLimitCompanies` |
| `overLimitCompanies(game, state)` | `{ company, count, limit }[]` | Table banner |
| `trainStack(game, state)` | `{ type, displayName, left: number \| "∞" }[]`, top first | Trains view, export preview |
| `exportEvents(game, state)` | `PrimitiveEvent[]` | `startSR` |
| `mergerRoundDue(game, state)` | boolean | round controls, `startMR` availability |
| `finalScores(game, players, state)` | `{ player, cash, sharesValue, total, rank, eliminated }[]`; eliminated players last, with no total or rank | Score sheet |

---

## 6. Validation rules (definition, `validateDefinition`)

1. A company with `start: "auction"` requires `game.auction`, and every phase must define `launchPriceRange`.
2. Every phase's `launchPriceRange` bounds must be cell prices of the track.
3. A `tier: "major"` company with `start: "merger"` must have `shareCount` equal to the sum of two minors' `shareCount` (5 + 5 = 10). This check is generic: the minimum and maximum minor share counts must add up to the major's count.
4. `traits.launchAssets` must name trains of `special` types.
5. `trainExport.allOfType` must name existing train types.
6. `roundSchedule.fixed.conditional[].phaseReached` must be a defined phase.
7. `countByPlayers` keys must lie within `playerCount`.
8. Option `companySubset.from` must name existing companies.
9. After `applyOptions`, `startingCash` must cover every count in `playerCount` (an existing rule). This runs on the patched copy. RotLA keeps `playerCount` 2–5 and one cash table for every mode, so an off-mode player count passes validation and gets only the `recommendedPlayers` warning.

---

## 7. State transitions

### Minor

```text
unstarted ──launchCompany──▶ floated ──mergeCompanies──▶ closed (shares → removed)
                               │
                               ├──price enters 0 (closedCell trigger)──▶ closed (dissolved)
                               └──declareBankruptcy(president, liquidatePresided)──▶ closed
```

### Major

```text
unstarted ──mergeCompanies──▶ floated ──price 0 / president bankrupt──▶ closed
```

### Round (per cycle n)

```text
SR n ──startOR (end step: sold-out +1)──▶ OR n.1 ──startOR──▶ OR n.2
   ──[phase ≥ green] startMR──▶ MR n ──startSR (export)──▶ SR n+1
   ──[phase < green] startSR (export)──────────────────▶ SR n+1
   (n = last cycle: show the Score sheet instead of startSR, with no export)
```
