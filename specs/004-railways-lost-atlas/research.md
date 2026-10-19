# Research: Railways of the Lost Atlas

**Feature**: 004-railways-lost-atlas | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

Each decision below resolves an open point in the plan's Technical Context or a design choice that
the spec leaves to the implementation. Rule references: "B p.N" = base rulebook, "L p.N" = Landmarks
rulebook (both in `docs/rules/`).

---

## R1. The 1-D stock track is a one-column grid

**Decision**: Model the 27-space track as a `market.cells` grid with 27 rows and 1 column, highest
price in row 0 (500) and the `closed`-tagged 0 in row 26. `market.shape` is `"1d"` (the enum value
already exists and is unused). Edges are `{ right: "none", left: "none" }`.

**Rationale**: Every existing move uses `up`/`down` for "price rises/falls": `sellEvents` (down),
`endOfRoundMoves` (up for sold out), `issueShares` (down), and `moveTarget`/`neighbor` stop at the
grid edge. In a single column, `up n` is "+n spaces" and `down n` is "−n spaces", so all of that
code works unchanged. The top (500) is a natural stop (spec edge case, unverified), and the reducer
already places an arriving token at the bottom of its cell's stack (`stackOrder = max + 1`), which
is exactly FR-011.

**Alternatives considered**:
- *One row, moving right/left*: breaks every hard-coded `up`/`down` in sale, sold-out and issue
  moves.
- *Per-company 1-D tracks (`market.tracks`, `{ index }` refs)*: these are per company and tied to
  loans (the 1848 BoE); companies cannot share cells or stack, and the operating order ignores
  them.

UI: the Market screen draws `shape: "1d"` as one horizontal strip (wrapping on phones) instead of a
27-row column. This is presentation only.

---

## R2. "Paid out, but below the price": move to the bottom of the stack

**Decision**: Add an optional `effect: "move" | "stackBottom"` to `MoveRule` (default `"move"`).
A `stackBottom` rule emits `marketMove { to: <same cell>, reason: "restack" }`. The reducer treats
reason `"restack"` as "leave the cell and enter it again": `stackOrder = max(others in cell) + 1`,
even though the cell is unchanged. All other same-cell moves keep today's behavior, so stored logs
of 1830, 1848 and 21Moon replay identically.

RotLA payout rules, first match wins, compared against the pre-move price (as today):

| Order | Condition | Effect |
|---|---|---|
| 1 | dividend ≥ 2 × price | up 2 |
| 2 | dividend ≥ 1 × price | up 1 |
| 3 | dividend = 0 | down 1 |
| 4 | (otherwise: 0 < dividend < price) | stackBottom |

Withhold: down 1. A zero run is withheld (`zeroRunAction`), so it moves down 1.

**Rationale**: The rule is data, not a RotLA branch. `"restack"` extends the existing `reason`
enum; no new primitive event type is added (constitution I).

**Alternatives considered**: a `stackOrder` field on `marketMove` (more general, but it exposes
internal ordering numbers in the log); a `counterChange` "restack" counter read by the operating
order (it would split one concept across two places).

---

## R3. Minors and majors: a `tier` on companies, traits as data

**Decision**: `CompanyDef` gains:

- `tier?: "minor" | "major"`, which selects the per-tier train limit and the merger roles.
- `start?: "par" | "auction" | "merger"` (default `"par"`). Minors launch by auction. Majors exist
  only through a merger, so `launchCompany` and `parCompany` are unavailable for them.
- `altName?`, `altAliases?`: the second identity of a major (FR-005a). The custom-game editor
  shows both names.
- `traits?`: money- and train-relevant abilities as data:
  - `trainLimitBonus` (Spacious +1)
  - `keepsRustedTrains` (Resourceful)
  - `launchFee` (Manufacturing 50)
  - `launchAssets` (the Manufacturing 2-train)
  - `noLeadoffTrain` (Manufacturing: warning only)
  - `payments: [{ id, labelEs, amount, direction: "bankPays" | "companyPays", cost? }]` (Tunneling:
    the company pays the 40 tile cost and the bank pays 60, in one group; Expansive: the company
    pays 40 for the extra token).

A major's effective traits are its own plus those of the minors that formed it (B p.18: "A Major
Corporation retains all abilities of the Minor Companies"). The minors that formed it are recorded
as counters (R8).

**Rationale**: Constitution III. No code branches on a company id. Route-only abilities have no
traits, and the rulebook text stays in `name`/notes.

**Alternatives considered**: new `kind` values (`kind` is already read as "public vs national" in
several places, so overloading it would spread changes); a `customRules` mechanic per ability (too
fine-grained, and the effects are plain numbers).

---

## R4. Launching a minor from an auction

**Decision**: A new action `launchCompany { player, company, bid }`, owned by a new mechanic
`auctionLaunch` (enabled in RotLA). It expands to:

1. `companyStatus floated`, with `parPrice` set to the starting price (shown in summaries).
2. `marketMove` to the starting-price cell, `reason: "par"`. The reducer puts the token at the
   bottom of the stack.
3. `shareTransfer ipo:X → player` of 2 units with `presidency: true`.
4. `shareTransfer ipo:X → company:X` of the other 3 units (the treasury).
5. `moneyTransfer player → company:X` of the bid.
6. With traits: `moneyTransfer company:X → bank` of `launchFee`, and an `assetTransfer` of each
   `launchAssets` item from `removed` to `company:X`.

Starting price = `floorToTrack(clamp(⌊bid / 2⌋, phase.launchPriceRange))`, where `floorToTrack`
is the highest printed price ≤ x (spec assumption) and `launchPriceRange` is new phase data
(yellow 60–90, green 60–110, purple and grey 60–135; B p.10, 16). An optional `price` field lets
the table override it (US2-2). Warnings, never blocks: bid < `auction.minBid` (120), bid not a
multiple of `auction.step` (5), half the bid outside the range (the price used is shown), or a
company that is not in play.

**Rationale**: One intent, one group. The minor floats on launch because it operates in the next
OR (B p.10–12), so no float threshold is involved (`floatPercent` is irrelevant for auction
companies).

**Alternatives considered**: reusing `parCompany` with a computed price (its semantics are "pay
par × presidency units to the bank or company", while RotLA pays the whole bid and seeds the
treasury, so it would need a branch); a two-step "auction, then par" (two groups for one intent).

---

## R5. Game modes and variants: option choices that patch the definition

**Decision**: Extend `OptionDef.choices[]` with:

- `patch?`: a JSON merge patch (RFC 7386 semantics: objects merge, arrays and scalars replace,
  `null` deletes) applied to the frozen session copy.
- `removeCompanies?: string[]` and `addCompanies?: CompanyDef[]`, because companies are an array
  that two options touch: Short removes 4 minors, and the expansion adds 4 minors and 2 majors.

Options are applied in definition order. The result goes through `validateDefinition`, so a bad
patch fails at session creation, never mid-game.

RotLA options:

| Option | Choices | What the choice changes |
|---|---|---|
| `mode` | `long` (default), `short`, `micro2`, `micro3` | Starting cash, train counts, schedule (cycles), `trainExport`, companies, player range |
| `expansion` | `off` (default), `landmarks` | Adds the 4 minors and 2 majors, and the `landmarks` mechanic |
| `stockDrops` | `perSale` (default), `perShare` | `market.moves.sell.per` |
| `bankBreak` | `off` (default), `on` | `bank: { total: 8000 }`, the `bankBroken` end trigger, certificate limits 16/12/10, and player bankruptcy ends the game |
| `hostileMergers` | `off`, `on` | Nothing in the definition. The choice is recorded in the session for display only (spec edge case) |
| `headquarters` | `off`, `on` | Adds the named payment "Sede" to majors, recorded through `bankPays` with a preset reason |
| `minorsInPlay` | company subset (R6) | Removes the minors that are not in play |

Player-count-dependent train counts: `TrainDef.countByPlayers?: Record<string, posInt>` overrides
`count` for that player count. `trainAssetIds` and `initialState` already receive the players.
Long mode: the 3-train has `{ "3": 5, "4": 6, "5": 6 }`, and so on (FR-005).

Patching player-dependent data: `playerCount` (2–5) and the Long/Short `startingCash` table
(450/300/275/220) are shared by every mode; only Micro replaces the cash (225). A mismatch
between the mode and the number of players is a warning on the New Session screen, never a block
(US1-2). For that, `GameDefinition.playerCount` stays the outer range (2–5), and each mode choice carries a `recommendedPlayers` range used only for the warning.

**Rationale**: Modes change several unrelated fields together. A patch keeps them as data, and
validation after patching protects the invariants. Existing options (`lateCompany` in 21Moon) keep
working, since they use only the existing fields.

**Alternatives considered**: four separate built-in definitions (`rotla-short`, …), which would
duplicate about 90% of the data, and variants would multiply them; per-field option kinds (an
ever-growing list of special cases).

---

## R6. Choosing the minors in play (randomized variants)

**Decision**: `OptionDef.kind?: "choice" | "companySubset"` (default `"choice"`). A
`companySubset` option lists eligible company ids (`from`) and an expected `size` (a warning only).
Its value is a comma-separated list of the companies in play, and `applyOptions` removes the other
eligible companies. The default value is "all" (or, after `mode` is applied, the mode's own
minors). New Session shows it as a checklist of minors, with a counter like "8 de 12".

**Rationale**: FR-003 and US1-4 ask that only the marked minors are offered for launch. Removing
them from the session copy does that everywhere (lists, voice context, operating order) with no
filtering code.

**Alternatives considered**: keeping all minors and hiding the absent ones with a flag (every list
would need to filter); a free-text option.

---

## R7. Cycles, the Merger Round and the export

**Decision**:

- **Schedule**: `roundSchedule: fixed`. The sequence per cycle n is `SRn, ORn.1, ORn.2, MRn`. The
  mode's patch sets the number of cycles (4, 5 or 6).
- **New round value `"MR"`**: `Round` gains `"MR"`. This extends the existing `turnAdvance.round`
  field; it is not a new primitive.
- **Conditional Merger Round**: `RoundScheduleSchema.fixed` gains
  `conditional?: [{ slotPrefix: "MR", phaseReached: "green" }]`. After OR n.2, the Table shows
  "Ronda de fusiones" when the phase is green or later, and "Exportar y nueva ronda de acciones"
  otherwise. The check is only "phase ≥ green at the end of OR 2": B p.18 holds a Merger Round "as
  long as the first green train has been purchased or exported", and B p.19 notes that an export
  which starts green gives no Merger Round "at this time", which follows because the export comes
  after the Merger Round slot (US7-6).
- **Export**: new game data `trainExport?: { allOfType: ["2"] }`. `startSR` (and `startMR`, which
  does not export) expands to: the end step of the round being left (feature 003), then, when the
  definition has `trainExport` and `srNumber ≥ 1`, `exportEvents` (the first bank-held train in
  `game.trains` order, or every bank-held train of that type when it is listed in `allOfType`, as
  `assetTransfer bank → removed`), then `turnAdvance SR`. The existing `phaseTrigger` already
  treats bank → removed as a train leaving the bank (1848 §5.4.4), so the export gets phase changes
  and rusting for free (FR-019, FR-025). For the unlimited 7/∞, the export creates the next
  numbered asset and sends it to `removed`, just as a purchase creates one.
- **Micro games**: the patch sets `trainExport: null`.
- **End of game**: after the last cycle's OR 2 (or MR), the round controls show "Fin de la
  partida", which opens the final scores (R12) instead of `startSR`. A new end trigger
  `{ type: "cyclesComplete" }` reports it, derived from the schedule.

**Rationale**: The export happens "before each new SR" (B p.19), so it belongs to the SR start,
like the feature 003 end steps. That gives one intent ("next cycle") and one group, which undoes
exactly, including the phase, rust and limits (spec edge case).

**Alternatives considered**: a separate `exportTrain` action (two taps between cycles, and it is
easy to forget, since nothing at the table prompts it); exporting at the end of OR 2 (wrong when a
Merger Round follows, since the merger's train limit must be judged before the export).

---

## R8. Merging two minors

**Decision**: A new action `mergeCompanies { a, b, into, identity }` (`identity: "primary" | "alt"`),
owned by a new mechanic `mergers`. Expansion, in one group:

1. For every holder h of A or B (players, `company:A`/`company:B` treasuries, pool):
   `shareTransfer` of its minor units to `removed`, then `shareTransfer ipo:M → h'` of the same
   number of major units. h' is h, except that a minor's own treasury becomes `company:M`.
2. Presidency: the president's certificate of M (2 units, `presidency: true`) goes to the player
   with the most combined units. A tie goes to the president of whichever of A and B comes first in
   the current operating order (B p.18). The other minor's president's certificate becomes two
   single units for the same holder (this is only a certificate split; the unit counts already
   match).
3. `moneyTransfer company:A → company:M` and `company:B → company:M` (whole treasuries).
4. `assetTransfer` of every train of A and B to `company:M`. Resourceful's rusted marks carry over
   (R10).
5. `marketMove M` to `floorToTrack(⌊(pA + pB) / 2⌋)` with `reason: "merge"` (a new reason value),
   at the bottom of the stack. Then `companyStatus M floated` and `companyStatus A/B closed`.
6. Counters: `mergedFrom:<A>` and `mergedFrom:<B>` on `company:M`, plus `identity` +1 when the alt
   name is chosen.

Validation warns, never blocks: A or B is not a minor in play, M is already in play, it is not a
Merger Round, the merged major is over its train limit (US7-4), or the identity is unknown.

Undo reverts the whole group, which restores both minors, prices and stacks exactly (US7-5): the
reducer's state before the group is simply reduced again.

**Rationale**: Built only from existing primitives (constitution I: "mergers … compose from
existing transfers"; docs/spec.md §5.3). The share invariant holds: each minor still has 5 units
(now in `removed`), and the major's 10 units leave its IPO.

**Alternatives considered**: changing the minors' `shareCount` to 0 (`companyStatus` has no field
for it, so it would need a new event field); a new `companyMerge` primitive (forbidden without
need).

---

## R9. Issuing and redeeming in the operating round

**Decision**: Move `issueShares` from the `corporateRound` mechanic to the core handlers. It is
available only when `market.moves.issue` is defined. A new data field
`market.moves.issue.from: "ipo" | "treasury"` (default `"ipo"`, which keeps 21Moon's behavior)
says where issued shares come from. RotLA uses `from: "treasury"`, `onlyIfFloated: false`, `n: 1`.
A new core action `redeemShare { company, count }` is available only when
`market.moves.redeem` is defined (`{ n: 0 }` for RotLA). It expands to `shareTransfer pool →
company:X` plus `moneyTransfer company:X → bank` at the current price, with no market move
(FR-013, FR-017). Warnings: more than one issue or redeem in the same OR, read from this OR's
groups the same way `operatedThisOR` is.

**Rationale**: `ownerOf` lets only one mechanic own an action type. Since two games need
issuance, it is a core action gated by data.

**Alternatives considered**: a second, RotLA-only issue action (two near-identical actions, and
the voice tool would have to pick between them).

---

## R10. Train limits per tier, Spacious and Resourceful

**Decision**:

- `PhaseDef.trainLimitByTier?: { minor?: posInt; major?: posInt }`. When present, it overrides
  `trainLimit` for companies of that tier. RotLA (minor/major): 2/– from the start (majors
  cannot exist yet), 2/4 from the first 3, 2/3 from the first 4, 1/2 from the first 5 onward
  (B p.16).

  RotLA's limit changes at the first 4 and the first 5, but its phase colors change at the first 3,
  5 and 7. The phases are therefore modeled at the finer grain: `yellow` (2), `green` (3),
  `green4` (4), `purple` (5), `grey` (7). Each has its own `launchPriceRange` and
  `trainLimitByTier`, and the UI shows the color name, so `green4` reads as "Verde". The rust rules
  key off these ids (2s rust on `green4`, 3s on the phase of the first 6, 4s on `grey`). Since the
  6-train rusts 3s without changing color or limit, it gets its own phase id `purple6` with the
  same values as `purple`.
- `trainLimit(game, phase, company)` adds the effective `trainLimitBonus`.
- A new derived query, `overLimitCompanies(game, state)`, feeds a Table banner: "Crédito
  Agrícola: 3 trenes, límite 2. Elegir cuál va al pool" (FR-020). The table resolves it with the
  existing `discardTrain`. Its destination is `discardedTrainsTo: "pool"` (B p.16).
- **Resourceful** (`keepsRustedTrains`): `phaseChangeEvents` does not move that company's rusting
  trains. Instead it emits `counterChange company:X "rusted:<asset>" +1`. `countedTrains` skips
  assets with that counter. The train shows as "oxidado, última carrera", and `discardTrain` sends
  it to `removed` (not the pool) and clears the counter. When a merger moves the train, the mark
  moves with it.

**Rationale**: Everything is in the definition plus one data-driven branch in the core rust code.
There are no new primitives.

**Alternatives considered**: moving rusted Resourceful trains to a special holder (the holder
vocabulary is closed); renaming the asset (asset ids are identities).

---

## R11. The 7/∞ card, train stack and special trains

**Decision**:

- Train type `"7"` with variants `[{ name: "7", cost: 750 }, { name: "∞", cost: 1000 }]`, count
  `"unlimited"`, permanent. `TrainDef.tradeIn` gains `variant?: string`: the trade-in price (800)
  applies only to the ∞ variant, from types `2`–`7`. The warning "train already rusted" uses the
  holdings after this purchase's rust (below). The display name is "7/∞".
- **Where the traded-in train goes** (user, 2026-10-09): it leaves the game. `TrainDef.tradeIn.to?:
  "removed" | "discard"` (default `"discard"`, so 1830 and 1848 are unchanged); RotLA uses
  `"removed"`.
- **Rust comes first** (user, 2026-10-09): when a train is bought, rust is checked before the
  trade-in. The trade-in is judged against the company's trains minus those of the types rusted by
  the phases this purchase triggers (`phasesTriggeredBy` and their `rust` effects). Buying the first
  7/∞ as ∞ while trading in a 4: the 4 rusts and leaves the game through the normal rust events, it
  is not a valid trade-in, the expansion emits no trade-in transfer, and the price is the full ∞
  price (1,000). A warning says so ("El 4 se oxida con esta compra: no se puede entregar"), and the
  table can pick another train to trade in.
- The stack order is `game.trains` order. The "top of the stack" is the first type with bank-held
  cards (the existing `trainOrder` warning already uses this).
- Manufacturing 2-train: train type `"M2"`, count 1, `special: true`. Special types start in
  `removed`, are never in the stack, are never exported, and count for the limit (L p.10). The
  variant `cost` schema is relaxed from `posInt` to `nonNegInt` so it can cost 0. A warning appears
  if it is sold or traded in. It enters play through `launchAssets` (R4).
- The Canyon 2-train (Landmarks): taken from `removed` (a rusted 2) by the `canyonTrain` action, and
  marked with `counterChange "permanent:<asset>" +1` so a warning appears if it is sold (R13).

**Rationale**: It reuses `variants` and `tradeIn`, which 1830 and 1848 already exercise.

---

## R12. Final scores and the tie rule

**Decision**: A pure query, `finalScores(game, players, state)`, returns `{ player, cash,
sharesValue, total, rank }`, with shares at the current price and treasuries excluded (B p.19).
A tie goes to the president of the company highest in the current operating order, then the next
one, and so on (B p.19). A score sheet ("Puntuación") opens automatically when `cyclesComplete`,
`bankBroken` (after the set of ORs) or a Bank Break bankruptcy fires, and the menu can open it at
any time. The query has no state of its own and adds nothing to the log.

**Rationale**: It is generic for every game that scores cash plus shares. 1830, 1848 and 21Moon
can also show it, but their current UI does not change in this feature (SC-007).

---

## R13. Landmarks money effects

**Decision**: A new mechanic `landmarks`, enabled by the `expansion: landmarks` option, owns three
actions:

| Action | Expansion | Once-per-company counter |
|---|---|---|
| `rockFormation { company }` | `marketMove up 2, reason "bonus"` (a new reason value) | `landmark:rockFormation` |
| `cliffSale { company, train }` | `moneyTransfer bank → company` of ⌊printed cost / 2⌋, then `assetTransfer company → pool` | None (once per OR: warning, via this OR's groups) |
| `canyonTrain { company }` | `assetTransfer removed → company` of a rusted 2-train, plus `permanent:<asset>` | `landmark:canyon` |

The validations are warnings: an already-used postcard or Canyon train, no 4-train bought yet
(Canyon), a train the company does not own (Cliff). These actions are recorded before the payout,
in the order the table plays them. Because `rockFormation` is its own group, the payout move is
then judged against the new price (US11-1).

**Rationale**: Each effect is one intent and one group, with plain primitives.

---

## R14. Unverified values and placeholders

These values ship marked `unverified` in `verification`, to be confirmed from the user's physical
copy (spec Dependencies; memory feature-004-rotla):

| Field | Placeholder | Source of the guess |
|---|---|---|
| Over-limit train after a merger | pool (B p.16 general rule; B p.18 says "the bank") | conflicting wording |

**Resolved by the user (2026-10-09)**:

- **Minor colors** (B p.24, images): Adaptive light purple, Overnight black, Bridging aqua or light blue, Spacious light green, Expansive pink, Suburban light pink, Resourceful light brown, Agricultural green, Tunneling gray, Eastern Mining brown, Northern Port blue, Express red.
- **Rounding**: always round down (`floor`). The remainder stays in the bank.
- **Top of the track**: prices stop at 500 (the rulebook does not say).
- **Player bankruptcy**: the player is eliminated. Every company they presided over is removed: other holders are paid the current price by the bank, all its shares leave the game, its trains go to the pool, and its treasury goes to the bank (the rulebook does not say; the company that failed the forced purchase has already spent its treasury on it). Their leftover shares go to the pool and their leftover cash to the bank. They rank last on the score sheet (R15).
- **Currency**: the game has none; use `$`.
- **Expansion majors**: Authority (light gray or white) and League (dark gray or gray).
- **Base major colors**: Consortium red, Union orange, System yellow, International light blue or cyan, Federation green, Experiment purple.
- **Expansion minor colors**: Twin Cities light blue, Circus purple, Coupling cyan, Manufacturing mustard.

**Resolved by the user (2026-10-15, feature 013)**: the majors' second identities, from the user's
copy. They replace the placeholders that used to be listed in the table above (`"<name> II"`, and
the inferred base pairs), and `verification.companies` is now `verified`:

- **Base majors**: Consortium / Conglomerate, Union / Unlimited, System / Syndicate,
  International / Inc., Federation / Firm, Experiment / Enterprise.
- **Expansion majors**: Authority / Alliance, League / LLC.

**The 6–7 player mode is out of scope** (user, 2026-10-09). Its extra trains come from the Landmarks expansion: "3 Train Cards (for 6-7 Player Variant)" (L p.3), shown as one 4-train and two 2-trains, each marked with a 6+ or 7+ player icon (L p.13). Which card has which mark needs the physical copy. A future spec can add the mode with `countByPlayers` (as for the base game's 4+ cards), a `startingCash` of 265/225 and 5 cycles, and raise `playerCount.max` to 7.

---

## R15. Player bankruptcy and company dissolution

**Decision**: Extend `CorporateBankruptcyConfig`:

- `companyTrainsTo?: "removed" | "pool"` (default `"removed"`, 21Moon unchanged). RotLA uses
  `"pool"`.
- `companyStatus?: "bankrupt" | "closed"` (default `"bankrupt"`). RotLA uses `"closed"`, so a
  dissolution at 0 does not fire the `bankruptcy` end trigger (B p.11: it is not a game end).
- `playerMode?: "toPool" | "liquidatePresided"` (default `"toPool"`).

`liquidatePresided` (B p.17): for each company the player presides over, every *other* player
holding shares is paid `units × current price` by the bank. Then that company's shares go to
`removed` (the bankrupt player's own shares included), its trains go to the pool, its treasury
goes to the bank, and it is `closed`. Then the existing `toPool` steps run on what the player has
left: any cash goes to the bank, and any shares they could not sell (in companies presided over by
others) go to the pool, with no payment and no price move. The player is marked bankrupt, which
means **eliminated** (B p.17: "remove the bankrupt player from the game"): they are hidden from the
player pickers (Launch, Stock, voice) and the final score sheet lists them last as "Eliminado",
with no score. A treasury cannot leave the game (money is held only by the bank, players and
companies), so going to the bank is how it leaves play; with an unlimited bank there is no
difference. User-confirmed 2026-10-09. With Bank Break, the `bankruptcy` end trigger is added by
the option's patch.

The existing `closedCell` trigger already dissolves a company whose price enters a
`closed`-tagged cell, in the same group (FR-015, edge case "Price reaches 0 during a forced share
sale").

---

## R16. Forced train purchase with share sales

**Decision**: The plain `buyTrain` shortfall (the president pays the rest) reuses the existing
`trainShortfall` hook through `corporateBankruptcy { trigger: "closedCell", presidentPays: true }`.
That flag is new: today the hook only runs with `trigger: "manual"`. When the president must also
sell shares, a new action `forcedTrainPurchase { company, trainType, variant, from, sales: [{
company, count }] }` (owned by `corporateBankruptcy`) expands to:

1. Each sale at the pre-sale price (`shareTransfer player → pool`, `moneyTransfer bank →
   player`).
2. `moneyTransfer president → company` for the shortfall.
3. The purchase.
4. One `marketMove down 1, reason "sell"` per company sold, after all sales (B p.17), even with the
   per-share variant.

Warnings: a sale that would change the active company's presidency or put the pool above 50%
(B p.17), or the president still being short ("declare bankruptcy instead"). If the purchase cannot
be completed, the table records `declareBankruptcy` on its own (spec edge case).

**Rationale**: One intent, one group. The "once per company after all sales" rule cannot be
expressed as a chain of `sellShares` actions.

---

## R17. Voice

**Decision**: The voice tools are generated from `ActionSchema` (research R5 of feature 001), so
the new actions get tools automatically. Each has a Spanish description, and each is exposed only
when available in the game (`ownerOf` plus availability). New eval fixtures are `rotla-sr`
(launches and purchases), `rotla-or` (issue, redeem, payout, ∞ trade-in, Tunneling), and
`rotla-mr` (a Merger Round). New cases in `eval/voice/cases.jsonl` cover every new action
(FR-031). The voice snapshot adds, per company, the tier, the launch state and the minors in play,
and for the turn, the cycle and the round. Spanish aliases are added for minor names, for example
"túnel" → Tunneling and "expreso" → Express.

The system prompt gains one RotLA-agnostic line: "abre X por N" means `launchCompany` in games
with auction launches. Feature 001 R18 requires re-running the eval for all games; the existing
games' scores must not drop (SC-007).
