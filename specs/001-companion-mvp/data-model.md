# Data Model: 18xx Companion MVP

**Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

The types below are TypeScript-style sketches. Exact shapes, including the Zod schemas, live in
[contracts/](./contracts/). All money is an integer in game currency units. All derived state is
`readonly`.

## 1. Identity and holders

```ts
type PlayerId = string;    // "p1".."p7"
type CompanyId = string;   // from the game definition: "PRR", "QR", "BOE", "VH", ...
type PrivateId = string;   // "SV", "P1", ...
type AssetId = string;     // "train:4:2", "private:P3", "loan:7"

type HolderRef =
  | "bank"
  | `player:${PlayerId}`
  | `company:${CompanyId}`   // treasury: money, its own and other companies' shares, trains, privates, loans
  | `ipo:${CompanyId}`       // unsold shares of that company
  | "pool"                   // bank pool: sold shares, and discarded trains (the 1830 "open market")
  | "removed";               // out of game: rusted trains, closed privates, removed loans, shares of bankrupt companies
```

**Rules**:
- Money can be held by `bank`, `player:*`, and `company:*`. `ipo:*`, `pool` and `removed` hold
  **no money**.
- Shares can be held by `player:*`, `company:*` (its own treasury shares, or another company's
  shares in 21Moon), `ipo:*`, `pool`, and `removed` (21Moon bankruptcy).
- Assets can be held by any holder except `ipo:*`. Only trains may be held by `pool`.

## 2. Session

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `name` | string | defaults to "1830 · 07/10 20:15" |
| `game` | `GameDefinition` | **frozen copy** taken at creation, with session options applied (FR-005) |
| `options` | `Record<string, string>` | game-defined session options, e.g. 1830 `ruleset: "base" \| "classic"`, 21Moon `lateCompany: "KR"` |
| `players` | `Player[]` | `game.playerCount.min..max` (1830 2–7, 1848 3–6, 21Moon 2–5). The app caps every game at **7** (FR-002) |
| `walletMode` | `"appTruth" \| "bankOnly"` | FR-003. In `bankOnly`, player cash is still computed but **hidden** in the UI |
| `chipSet` | `ChipSet` | FR-080. Starts from `game.chipPreset`. **Table configuration, not game state**: it never affects money, shares or turns, so editing it updates session metadata directly rather than the log (like `name`). It is included in exports |
| `createdAt`, `updatedAt` | ISO string | |
| `log` | `LogEntry[]` | stored in the `entries` store, not inline |

Validation: player names are unique and not empty; player and company aliases are unique
across the session (case- and accent-insensitive), and duplicates are a warning, not an error
(FR-072 handles ambiguity); seat order is a permutation of 1..n.

## 3. Player

| Field | Type | Notes |
|---|---|---|
| `id` | PlayerId | |
| `name` | string | |
| `aliases` | string[] | for voice |
| `color` | hex string | always shown together with the name |
| `seat` | number | 1..n |

Derived (`PlayerState`): `cash`, `holdings` (per company, in units), `certificates` (count,
where a presidency counts once), `counters.debt` (from `bankDebt`), `soldThisSR: CompanyId[]` (for
warnings), `bankrupt: boolean`.

## 4. Game definition (data; see [contracts/game-definition.md](./contracts/game-definition.md))

| Field | Type | Notes |
|---|---|---|
| `id`, `name`, `version` | string | `version` lets exports detect definition drift |
| `basedOn` | string? | set for custom games (FR-007) |
| `currency` | `{symbol: "$" \| "£" \| "₡" \| string}` | display only |
| `playerCount` | `{min, max}` | `max ≤ 7` (validated) |
| `options` | `OptionDef[]` | session options, each one a patch on the definition (e.g. 1830 ruleset toggles customRules) |
| `bank` | `{total: number} \| "unlimited"` | 21Moon: unlimited |
| `initialTreasuries` | `{company, money, assets}[]` | company treasuries funded at setup **outside** the bank total, e.g. the BoE: £2,000 and 20 loan markers |
| `startingCash` | `Record<playerCount, number>` | |
| `companies` | `CompanyDef[]` | |
| `privates` | `PrivateDef[]` | |
| `capitalization` | `{type: "full", timing: "onFloat" \| "endOfSR"} \| {type: "incremental"}` | FR-023. 1830 endOfSR, 1848 onFloat, 21Moon incremental |
| `ipoPrice` | `"par" \| "market"` | 1830/1848 par; 21Moon market |
| `floatPercent` | number | 50 or 60 |
| `floatCounts` | `"soldFromIpo"` | shares that have left the IPO, by any route |
| `unownedDividends` | `{ipo: "company"\|"none", pool: same, treasury: same}` | FR-031. `"none"` = not paid; the money stays in the Bank. 1830 pool → company; 1848 and 21Moon pool → none. Company-held shares of *another* company are always paid to the holder |
| `revenueParts` | `{id, label, to: "choice" \| "treasury" \| "dividend"}[]` | default: one part `"choice"` (the pay/withhold/half decision). 21Moon: `local → treasury`, `spacePort → dividend` |
| `payoutModes` | subset of `"full" \| "withhold" \| "half"` | FR-030; only for `"choice"` parts |
| `rounding` | `{perShare: "floor"\|"ceil"\|"round", halfRetain: "floorToCompany"\|..., unit: number}` | FR-032 |
| `market` | `MarketDef` | grid plus movement rules |
| `trains` | `TrainDef[]` | |
| `trainLimitScope` | `"company" \| {perBase: number, bases: string[]}` | 21Moon: 2 per base, 2 bases |
| `phases` | `PhaseDef[]` | |
| `roundSchedule` | `{type: "byPhase"} \| {type: "fixed", sequence: RoundSlot[], events: ScheduledEvent[]}` | 21Moon: ISR, (SR n, CR n, OR n.1, OR n.2)×5, plus OR 5.3 |
| `srOrder` | `"priorityDeal"` | |
| `orOrder` | `{by: "priceDesc", ties: ("stackTop"\|"columnRight"\|"rowTop")[], before?: CompanyId[], dynamic: boolean}` | `dynamic`: pick the next company by current price after each turn |
| `limits` | `{certificates: Record<playerCount, number>, perCompanyPercent, poolMaxPercent \| poolMaxCerts, zones?}` | warnings only |
| `loans` | `LoanDef?` | FR-112. Absent means no loan actions |
| `endTriggers` | `EndTrigger[]` | warnings only (bank broken, top cell, N takeovers, N loans, fixed last round, bankruptcy) |
| `customRules` | `CustomRuleConfig[]` | named reusable mechanics (FR-113; research R16) |
| `chipPreset` | `Chip[]` | |
| `verification` | `Record<fieldPath, "verified" \| "unverified">` | constitution III |

**CompanyDef**: `id, shortName, name, aliases[], color, textColor, shareCount (10),
presidencyUnits (2), certificates[] (units per cert), parOptions: number[] | "parCells",
fixedPar?, kind: "public" | "national", availableFrom?: RoundSlot` (the 21Moon late company).

**PrivateDef**: `id, name, aliases[], cost, income, companyPriceRange?: [min, max] |
{multipleOfFace: [min, max]}, grants?: GrantDef[], exchange?: GrantDef, closesOn: Trigger[]`.
`Trigger` = `phase(id) | companyBuysTrain(company) | boughtByCompany | exchanged | scheduled(slot)
| manual`.

**TrainDef**: `type ("2"), variants: {name: "2"|"2+", cost}[], count: number | "unlimited",
rustsOnPhase?, availableFromPhase?, permanent, tradeIn?: {fromTypes, cost}, countsForLimit,
reserve?: number` (21Moon UN transports held by `removed` until added).

**PhaseDef**: `id, triggeredBy: trainType | null, orsPerSet, trainLimit, effects: Effect[]`,
where `Effect` = `rust(trainType) | closePrivates | enableActions(...) | setNationalMinDividend(n)
| dropFloatCondition(company)`.

**MarketDef**:
```ts
{
  shape: "2d" | "1d";
  cells: (Cell | null)[][];      // staggered rows use null padding
  // Cell = { price, tags?: ("par"|"receivership"|"closed"|"top"|"noUp")[],
  //          zone?: "yellow"|"orange"|"brown",       // 1830 limit relaxations (warnings)
  //          leftEdge?: "down"|"none", rightEdge?: "up"|"none" }  // printed arrows
  edges: { right: "up" | "none"; left: "down" | "none" };   // default edge behavior; cells may override
  moves: {
    payout: MoveRule[];          // 1830/1848: [{dir: "right", n: 1}]
                                 // 21Moon: [{when: {dividendAtLeast: {priceTimes: 2}}, dir: "right", n: 2},
                                 //          {when: {dividendAtLeast: {priceTimes: 0.5}}, dir: "right", n: 1},
                                 //          {when: {dividendEquals: 0}, dir: "left", n: 1}]   // otherwise no move
    withhold: MoveRule[];        // [{dir: "left", n: 1}]
    half?: MoveRule[];
    sell: { per: "share" | "sale", n: 1, onlyIfOperated: boolean };     // always down; no move at the bottom
    soldOut: { heldBy: "players" | "playersAndCompanies", at: "endSR" | "endCR" } | null;
    poolPenalty?: { at: "endCR", onlyIfOperated: true };                 // 21Moon
    issue?: { onlyIfFloated: true, n: 1 };                               // 21Moon
    loan?: { first: number, subsequentInOR: number };                    // always left
  };
  tracks?: Record<CompanyId, { startPrice: number; byLoansIssued: number[]; endGameAtIndex?: number }>;
                                 // 1-D price tracks: the BoE price after n loans = byLoansIssued[n − 1]
}
```
Edge behavior: `MarketDef.edges` gives the default (1830/1848: `{right: "up", left: "down"}`,
"if possible", meaning only when the target cell exists), and per-cell `leftEdge`/`rightEdge`
arrows override it where the board prints them (21Moon). Otherwise the token stays put. Up and
down at the top or bottom of a column don't move.

**LoanDef**: `amount, lender: HolderRef, supply (markers), interestPerOR (0 for 1848),
repayable (false), voluntaryLimit (5), availableFromPhase, marketEffect`. `interestPerOR` and
`repayable` are data only in v1: validation accepts only `0` and `false`, and no interest or
repay logic is built until a game needs it (constitution VII).

**Validation of a definition**: Zod schema plus semantic checks (startingCash for every
player count in range; startingCash × max players ≤ bank unless unlimited; par options exist
as `par` cells; each train `rustsOnPhase` names a defined phase; the sum of certificate units
equals `shareCount`; every row has at least one cell). Runs on built-ins in tests and on custom
games before save.

## 5. Company (derived `CompanyState`)

| Field | Type | Notes |
|---|---|---|
| `id` | CompanyId | |
| `status` | `"unstarted" \| "parred" \| "floated" \| "receivership" \| "bankrupt" \| "closed"` | adds `receivership` and `bankrupt` to the spec's four |
| `parPrice` | number? | set by `companyStatus` |
| `position` | `CellRef?` (`{row, col}` or `{index}` on a track) | |
| `stackOrder` | number | arrival sequence within a cell (for operating order) |
| `cash` | number | derived from money transfers |
| `shareCount` | number | mutable through events (keeps mergers possible later) |
| `president` | PlayerId? | derived: holder of the presidency certificate (never a company) |
| `trains` | AssetId[] | derived from assets |
| `loans` | number | count of loan assets held |
| `hasOperated` | boolean | gates 21Moon sell and pool-penalty moves |
| `operatedThisOR` | boolean | |
| `floatConfirmed` | boolean | `manualFloatCondition` |
| `capitalPending` | boolean | full capitalization with `timing: "endOfSR"` |
| `counters` | `Record<string, number>` | from `counterChange`: `debt` (1830 Base receivership), `eastWestTokens` (21Moon end scoring) |

**State transitions**:
```
unstarted --parCompany--> parred --(left IPO ≥ floatPercent [& manual condition])--> floated
floated --(1848 receivership cell / no loans) | (1830 Base bank loan) | (21Moon presidentless)--> receivership
receivership --(debt repaid, 1830 Base)--> floated
any --(21Moon closed cell / failed train purchase | manual)--> bankrupt
any --closeCompany (manual)--> closed
```
Every transition is a `companyStatus` event. Manual overrides can set any status (FR-024,
constitution III).

**Fields without a dedicated primitive** (the vocabulary stays closed; the reducer derives
these from existing events):

| Field | Derivation |
|---|---|
| `hasOperated` | `counters.runs > 0`. Every `runAndPayout` (and `nationalPayout`) expansion emits `counterChange {subject: company:X, key: "runs", delta: 1}`. `nextCompany` also emits it for the company it moves past when that company has no run recorded this OR (a turn with no trains or revenue still counts as operating) |
| `operatedThisOR` | The reducer adds X to `turn.operatedThisOR` on a `runs` `counterChange`. Any `turnAdvance` that changes `round`, `orSet` or `orIndex` clears it |
| `turn.loansThisOR[X]` | Incremented by an `assetTransfer` of a `loan:*` asset to `company:X`. Cleared like `operatedThisOR` |
| `PlayerState.soldThisSR` | X is added on a `shareTransfer` from `player:P` to `pool` while `turn.round === "SR"`. Any `turnAdvance` that changes `round` or `srNumber` clears it |
| `PlayerState.bankrupt` | `counters.bankrupt > 0`, set by `counterChange {subject: player:P, key: "bankrupt", delta: 1}` |
| Takeover count (1848) | `counterChange {subject: "bank", key: "nationalTakeovers", delta: 1}` per `nationalTakeover` |

Standard counter keys: `debt`, `eastWestTokens`, `runs`, `bankrupt`, `nationalTakeovers`.

**Presidency** (FR-021): after each share transfer, if another **player** holds strictly more
units than the president, the presidency moves. Ties keep the current president. With a tie
for most that excludes the president, it goes to the next player in seat order after the old
president (1830 §6.4, 1848 §6.2, 21Moon §9.4). Presidency is frozen while the company is in
1830 Base receivership. The expander adds the swap as `shareTransfer {presidency: true}` plus
the compensating standard-unit transfers, all in the same group.

## 6. Private company (asset `private:<id>`)

Owner = holder of the asset. Closed = held by `removed`. Income per OR comes from `PrivateDef`;
income of a company-owned private goes to its treasury. Map and discount powers (1830 CS/DH,
1848 P2/P3/P4, 21Moon P1/P4/P5) are **not modelled**: the table applies them by editing the
price on `buyTrain` or `payCost`, or with a manual transfer (constitution III, the table wins).
Money and share effects **are** modelled: grants and exchanges (`privateGrants`), the 21Moon P3
one-time ₡60 bonus (a `bankPays` action), and the P2 add/remove transport (`assetTransfer`
between `removed` and `bank`).

## 7. Holdings

`holdings: Record<HolderRef, Record<CompanyId, number /* units */>>`, plus
`presidencyHolder: Record<CompanyId, HolderRef>`. The presidency certificate counts as
`presidencyUnits` (2) inside the holder's units.

**Invariant**: for each company, Σ units across all holders (including `removed`) =
`shareCount`.

## 8. Market

Each company's token is at a `CellRef` with a `stackOrder`. Moves follow `MoveRule`s and the
per-cell edge arrows, which covers the spec's edge case for ceiling and floor. Entering a cell
tagged `receivership` (1848) or `closed` (21Moon) emits a trigger that the matching mechanic
consumes. Entering `top` sets an end-trigger warning (1848). A cell tagged `noUp` (1830 at 350)
blocks upward moves.

## 9. Turn state

| Field | Type | Notes |
|---|---|---|
| `round` | `"PRIVATES" \| "SR" \| "CR" \| "OR"` | PRIVATES covers the initial private sale (1830 groups or auction, 1848 price reduction, 21Moon waterfall). CR only with `corporateRound` |
| `srNumber` | number | |
| `orSet`, `orIndex`, `orsInSet` | number | display "OR 2.1" |
| `scheduleIndex` | number? | position in a fixed `roundSchedule` |
| `operatingOrder` | CompanyId[] | computed from `orOrder`; with `dynamic`, only the *next* company is fixed |
| `currentCompany` | CompanyId? | |
| `phase` | string | |
| `loansThisOR` | `Record<CompanyId, number>` | for the extra-loan market effect; derived (§5) |
| `operatedThisOR` | `CompanyId[]` | derived (§5) |

End triggers are **not stored**. `endTriggers(game, state) → EndTrigger[]` is a pure function
of state: bank cash ≤ 0, a token on a `top` cell, loans issued ≥ threshold, the bank's
`nationalTakeovers` counter ≥ threshold, the last scheduled round reached, or any bankrupt
company or player.

Operating order (FR-051): companies with status `floated` or `receivership`, sorted by price
descending, then by the tie-breakers. Names in `orOrder.before` come first (the BoE in 1848).
With `dynamic: true`, `nextCompany` picks the highest-ranked company that has not yet operated,
using current prices. This is the 21Moon rule and is also correct for 1830 forced-sale price
changes. Privates pay at `startOR` through `privateIncome` (FR-037). Scheduled events (21Moon
OR4.1 private closure) run as a system group before income.

## 10. Log entries (the ledger)

```ts
type LogEntry =
  | { kind: "group"; seq: number; id: GroupId; at: ISO; source: "touch" | "voice" | "system";
      action: Action; events: PrimitiveEvent[]; touches: EntityKey[]; transcript?: string;
      warnings: Warning[] }
  | { kind: "revert"; seq: number; at: ISO; groupId: GroupId }
  | { kind: "amend";  seq: number; at: ISO; groupId: GroupId; action: Action;
      events: PrimitiveEvent[]; touches: EntityKey[] };
```

- **Group status** (derived for History): `active | reverted | amended`. An amended group shows
  its original and the correction (FR-013, US2-2).
- **Dependencies** (FR-014): `dependentsOf(g)` = later active groups whose `touches` intersect
  the keys whose values `g` changes.
- Undoing an amend re-activates the previous version. An amend of a reverted group is not
  allowed (restore first).
- `touches` keys: `money:<holder>`, `shares:<company>`, `market:<company>`,
  `asset:<assetId>`, `turn`, `status:<company>`.

Primitive events are listed in [contracts/events.md](./contracts/events.md). High-level actions
are listed in [contracts/actions.md](./contracts/actions.md).

## 11. Invariants (checked after every reduce, FR-015)

1. **Money**: bank + Σ players + Σ companies = `bank.total` + Σ
   `initialTreasuries.money` (for 1848: £10,000 + £2,000 for the BoE). Skipped when the bank is
   `unlimited` (21Moon). Bank lending (`bankDebt`) is a real payment out of the Bank plus a
   `counterChange` on the debtor's `debt` counter, so it needs no special case.
2. **Shares**: for each company, Σ units = `shareCount`.
3. **Assets**: each asset has exactly one holder. The loan supply plus loans outstanding plus
   removed loans = `loans.supply`.
4. **Non-negative ipo/pool**: unit counts are ≥ 0. Negative holder **money** is allowed
   (bank broken and short companies are recorded and flagged, per the spec's edge cases).

On a violation the result is `InvariantWarning {kind, detail, firstBadGroupId}`. History
highlights the group. Nothing is corrected.

## 12. Chip set

```ts
type Chip = { value: number; color: string; label?: string; countAvailable?: number };
type ChipSet = { chips: Chip[] };   // sorted by value descending; values unique and > 0
type ChipBreakdown = { chips: {value: number; count: number}[]; total: number } | null; // null = no exact change
```

## 13. Settings (device-local, never exported)

`apiKey?: string`, `rememberKey: boolean` (false → the key is kept in memory only; research R17),
`voiceLocale: "es-ES" | "es-MX" | "es-AR" | "es-US" | ...`, `model: string`,
`lastSessionId?: string`.

## 14. Voice proposal (in memory only)

```ts
type Proposal = {
  transcript: string;
  actions: Action[];             // validated
  warnings: Warning[];
  summaryEs: string;             // rendered from actions by the app, not by the model
  flows: MoneyFlow[];
  chips: ChipBreakdown[];
} | { transcript: string; clarification: { question: string; options: { label: string; value: string }[] } }
  | { transcript: string; query: QueryAnswer }      // answered from state
  | { transcript: string; notUnderstood: true };
```
