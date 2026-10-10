# Contract: the RotLA game definition (`src/domain/games/grotla.ts`)

This contract extends `specs/001-companion-mvp/contracts/game-definition.md`. The schema additions are in [data-model.md](../data-model.md) §1. Below are the values the built-in definition carries, with their sources.

Fields marked ⚠ ship as `unverified` in `verification`: research R14 gives the reason for each, and the user will confirm them from the physical copy.

## Identity

| Field | Value | Source |
|---|---|---|
| `id` | `"rotla"` | |
| `name` | `"Railways of the Lost Atlas"` | |
| `currency.symbol` | `"$"`. The game has no money symbol; `$` is a display choice (user, 2026-10-09) | B p.2 |
| `playerCount` | `{ min: 2, max: 5 }`. The 6–7 player mode (L p.12) is out of scope | B p.6–7 |
| `bank` | `"unlimited"` (Bank Break patch: `{ total: 8000 }`) | B p.2, 21 |
| `startingCash` | `{ "2": 450, "3": 300, "4": 275, "5": 220 }` for Long and Short (one table, so an off-mode count still has a value); the Micro patches replace it with 225 for every count | B p.7, 22–23; user, 2026-10-09 |

## Companies

**Minors** (12, B p.3, 24): `tier: "minor"`, `start: "auction"`, `shareCount: 5`, `presidencyUnits: 2`, `certificates: [2,1,1,1]`.

| Short | Name | Color (user, from B p.24) | `color` / `textColor` | Traits |
|---|---|---|---|---|
| ADP | Adaptive | light purple | `#b39ddb` / `#1b1b1b` | none |
| AGR | Agricultural | green | `#2e7d32` / `#ffffff` | none |
| BRG | Bridging | aqua / light blue | `#4fc3f7` / `#1b1b1b` | none |
| EMN | Eastern Mining | brown | `#6d4c41` / `#ffffff` | none |
| EXV | Expansive | pink | `#ec407a` / `#ffffff` | `payments: [{ id: "expansiveToken", amount: 40, direction: "companyPays" }]` |
| EXP | Express | red | `#c62828` / `#ffffff` | none |
| NPT | Northern Port | blue | `#1565c0` / `#ffffff` | none |
| OVN | Overnight | black | `#212121` / `#ffffff` | none |
| RES | Resourceful | light brown | `#c19a6b` / `#1b1b1b` | `keepsRustedTrains: true` |
| SPC | Spacious | light green | `#9ccc65` / `#1b1b1b` | `trainLimitBonus: 1` |
| SUB | Suburban | light pink | `#f8bbd0` / `#1b1b1b` | none |
| TUN | Tunneling | gray | `#757575` / `#ffffff` | `payments: [{ id: "tunneling", amount: 60, direction: "bankPays", cost: 40 }]` (the mountain tile: pays 40, receives 60, one action) |

The color names are confirmed by the user (2026-10-09). The hex values are chosen to match those names. The light colors use dark text for contrast. The UI pairs every color with the short name (constitution V): green vs light green and pink vs light pink are close.

**Expansion minors** (added by `expansion: landmarks`, L p.10; colors from the user, 2026-10-09):

| Short | Name | Color | `color` / `textColor` | Traits |
|---|---|---|---|---|
| CIR | Circus | purple | `#9c27b0` / `#ffffff` | none |
| CPL | Coupling | cyan | `#26c6da` / `#1b1b1b` | none |
| MFG | Manufacturing | mustard | `#c9a227` / `#1b1b1b` | `launchFee: 50`, `launchAssets: ["train:M2:1"]`, `noLeadoffTrain: true` |
| TWC | Twin Cities | light blue | `#81d4fa` / `#1b1b1b` | none |

**Majors** (6, B p.18): `tier: "major"`, `start: "merger"`, `shareCount: 10`, `presidencyUnits: 2`, `certificates: [2,1,1,1,1,1,1,1,1]`.

| Short | Name | Color (user) | `color` / `textColor` | `altName` |
|---|---|---|---|---|
| CON | Consortium | red | `#e53935` / `#ffffff` | ⚠ Conglomerate |
| UNI | Union | orange | `#ef6c00` / `#ffffff` | ⚠ Unlimited |
| SYS | System | yellow | `#fdd835` / `#1b1b1b` | ⚠ Syndicate |
| INT | International | light blue / cyan | `#00bcd4` / `#1b1b1b` | ⚠ placeholder "International II" |
| FED | Federation | green | `#43a047` / `#ffffff` | ⚠ placeholder "Federation II" |
| EXM | Experiment | purple | `#7b1fa2` / `#ffffff` | ⚠ placeholder "Experiment II" |

**Expansion majors** (names and colors from the user, 2026-10-09; L p.3: "2 Major Corporations, each with 2 identity options"):

| Short | Name | Color | `color` / `textColor` | `altName` |
|---|---|---|---|---|
| AUT | Authority | light gray / white | `#e0e0e0` / `#1b1b1b` | ⚠ placeholder "Authority II" |
| LGE | League | dark gray / gray | `#424242` / `#ffffff` | ⚠ placeholder "League II" |

League is darker than Tunneling (`#757575`) so the two grays stay apart; the short name is always shown too.

All company colors are confirmed by the user (2026-10-09). Several minors and majors share a hue: Express and Consortium (red), Agricultural and Federation (green), Circus and Experiment (purple), Coupling and International (cyan), Bridging and Twin Cities (light blue). Their shades differ slightly, and the short name is always shown (constitution V). Second identities without a known name ship as placeholders `"<name> II"`; the user may correct them in a future spec or through a custom game. The Spanish voice aliases include the short form and a spoken form, for example TUN → "túnel", "tunneling"; EXP → "expreso", "express".

## Shares and money

| Field | Value | Source |
|---|---|---|
| `capitalization` | `{ type: "incremental" }` | B p.4, 11 |
| `ipoPrice` | `"market"` | B p.11 |
| `floatPercent` | 20. Unused: auction companies float at launch | |
| `unownedDividends` | `{ ipo: "none", pool: "none", treasury: "company" }` | B p.15 |
| `revenueParts` | `[{ id: "revenue", label: "Ingresos", to: "choice" }]` | |
| `payoutModes` | `["full", "withhold"]` | B p.15 |
| `rounding` | `{ perShare: "floor", halfRetain: "floorToCompany", unit: 10 }`. Always round down | user, 2026-10-09 (the rulebook is silent) |
| `auction` | `{ minBid: 120, step: 5 }` | B p.10 |
| `limits.certificates` | `{}` (Bank Break patch: `{ "3": 16, "4": 12, "5": 10 }`) | B p.10, 21 |
| `limits.perCompanyPercent` | 60 | B p.10 |
| `limits.pool.maxPercent` | 50 | B p.11 |
| `limits.maxSharesPerBuy` | 1 | B p.11 |
| `privates` | `[]` | |

## Market

- **Shape**: `shape: "1d"`. One column, top to bottom: 500, 450, 400, 360, 330, 300, 270, 245, 220, 200, 180, 165, 150, 135, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0 (`closed`). Source: B p.2, 11.
- **Moves**:
  - `payout`: `[{ ≥2× : up 2 }, { ≥1× : up 1 }, { =0 : down 1 }, { effect: "stackBottom" }]` (B p.14–15)
  - `withhold`: `[{ down 1 }]`
  - `sell`: `{ per: "sale", n: 1, onlyIfOperated: false, warnUnlessOperated: true }`. The `stockDrops: perShare` patch sets `per: "share"`.
  - `soldOut`: `{ heldBy: "players", at: "endSR" }`
  - `issue`: `{ from: "treasury", onlyIfFloated: false, n: 1 }`
  - `redeem`: `{ n: 0 }`
- `orOrder`: `{ by: "priceDesc", ties: ["stackTop"], dynamic: true }` (B p.12).

## Trains (Long mode, the base data; B p.16–17, user's copy)

| Type | Display | Variants | Count | `countByPlayers` | Rusts on | Notes |
|---|---|---|---|---|---|---|
| 2 | 2 | 2 @100 | 7 | none | `green4` | |
| 3 | 3 | 3 @200 | 6 | `{ "2": 5, "3": 5 }` | `purple6` | |
| 4 | 4 | 4 @300 | 4 | none | `grey` | |
| 5 | 5 | 5 @450 | 3 | none | never | permanent |
| 6 | 6 | 6 @550 | 3 | `{ "2": 2, "3": 2 }` | never | permanent |
| 7 | 7/∞ | 7 @750, ∞ @1000 | unlimited | none | never | `tradeIn: { fromTypes: ["2","3","4","5","6","7"], cost: 800, variant: "∞", to: "removed" }`. Rust is checked first, so a train rusted by this purchase cannot be traded in |
| M2 | Manufacturing 2 | 2 @0 | 1, `special` | none | never | expansion only |

Other train data:

- `discardedTrainsTo`: `"pool"` (B p.16).
- `trainLimitScope`: `"company"`.
- `trainExport`: `{ allOfType: ["2"] }` (B p.19).

## Phases (research R10)

| id | Color | Triggered by | Minor/major limit | `launchPriceRange` | Effects |
|---|---|---|---|---|---|
| yellow | Amarilla | none | 2 / none | 60–90 | |
| green | Verde | 3 | 2 / 4 | 60–110 | Merger Rounds begin |
| green4 | Verde | 4 | 2 / 3 | 60–110 | 2s rust |
| purple | Morada | 5 | 1 / 2 | 60–135 | |
| purple6 | Morada | 6 | 1 / 2 | 60–135 | 3s rust |
| grey | Gris | 7 | 1 / 2 | 60–135 | 4s rust |

Every phase has `orsPerSet: 2`. `trainLimit` (the fallback) equals the major limit, or 2 in yellow.

## Schedule (Long: 6 cycles)

```text
roundSchedule: { type: "fixed",
  sequence: [SR1, OR1.1, OR1.2, MR1, … SR6, OR6.1, OR6.2, MR6],
  conditional: [{ slotPrefix: "MR", phaseReached: "green" }],
  events: [] }
endTriggers: [{ type: "cyclesComplete" }]
customRules: [auctionLaunch, mergers,
  corporateBankruptcy { trigger: "closedCell", companyTrainsTo: "pool", companyStatus: "closed",
                        playerMode: "liquidatePresided", presidentPays: true }]
```

## Options

| Option | Choice | Patch summary |
|---|---|---|
| `mode` | `long` (default) | none; the base data above. `recommendedPlayers` 3–5. |
| | `short` | `removeCompanies: [ADP, BRG, OVN, SPC]`; every non-unlimited train count −1 (2×6, 3×5/4, 4×3, 5×2, 6×2/1); 4-cycle schedule; `startingCash` unchanged (the base table); `recommendedPlayers` 2–4 (B p.6–7) |
| | `micro2` | Minors-in-play size 4; trains 2×3, 3×3, 4×3 only; 4 cycles; `trainExport: null`; cash 225; `recommendedPlayers` 2–2 (B p.22–23) |
| | `micro3` | Minors-in-play size 6; trains 2×5, 3×4, 4×4 only; 4 cycles; `trainExport: null`; cash 225; `recommendedPlayers` 3–3 |
| `expansion` | `off` (default), `landmarks` | `addCompanies` (4 minors, 2 majors, the special M2 train), `addCustomRules: [landmarks]` |
| `stockDrops` | `perSale` (default), `perShare` | `market.moves.sell.per` |
| `bankBreak` | `off` (default), `on` | `bank`, certificate limits, `endTriggers += bankBroken, bankruptcy` |
| `hostileMergers` | `off` (default), `on` | none (recorded only) |
| `headquarters` | `off` (default), `on` | Adds `payments: [{ id: "headquarters", labelEs: "Sede", amount: 0 }]` to majors. Amount 0 means it is entered at use (half the city's printed value). |
| `minorsInPlay` | `companySubset` over every minor | Default: all of the mode's minors |

## Verification map

| Status | Fields |
|---|---|
| `verified` | `bank`, `startingCash`, `capitalization`, `ipoPrice`, `unownedDividends`, `revenueParts`, `payoutModes`, `market` (cells and moves), `trains` (types, prices, counts), `phases`, `roundSchedule`, `orOrder`, `limits`, `auction`, `trainExport` |
| `unverified` | `companies` and the expansion companies: the majors' second identities only |

All company names (except second identities) and colors, `rounding` and `currency` are verified (user-confirmed 2026-10-09). Two behaviors the rulebook does not state are also user-confirmed (2026-10-09), so `market` and `customRules` stay `verified`: prices stop at 500, and a bankrupt player is eliminated, with every company they preside over removed (treasuries to the bank, trains to the pool, other holders paid by the bank) and their leftover shares to the pool and cash to the bank (`playerMode: "liquidatePresided"`).

`hasUnverified` therefore stays true until the user confirms these, and New Session shows the existing "datos sin verificar" badge.
