# Contract: Actions (feature 004)

This contract extends `specs/001-companion-mvp/contracts/actions.md`. Every action follows the one pipeline: parse (Zod) → references → availability → validate (warnings, never blocks) → expand → triggers. Each action produces one event group, undone with one tap (FR-030).

Conventions: `X` is a company id and `M` is a major. Prices are read from state *before* the group, unless a step says otherwise. Every action below is reachable by touch and by voice (constitution V).

---

## New actions

### `launchCompany`: auction win (US2, FR-007)

```ts
{ type: "launchCompany", player: PlayerId, company: CompanyId, bid: int>0, price: int>0 | null }
```

- **Owner**: mechanic `auctionLaunch`.
- **Available**: the company has `start: "auction"` and status `unstarted`.
- **Warnings**:
  - `bid < auction.minBid`
  - `bid % auction.step ≠ 0`
  - ⌊bid/2⌋ is outside the current phase's `launchPriceRange` (the message names the price used)
  - `price` is not a track price
  - the player cannot pay
  - `noLeadoffTrain` info for companies with that trait
- **Expands to**: research R4, steps 1–6. `price: null` means `launchPrice(...)`.
- **Summary (es)**: "Ana abre Tunneling por ₳140 · precio ₳70 · tesorería ₳140 · 3 acciones en tesorería".

### `mergeCompanies`: Merger Round (US7, FR-026)

```ts
{ type: "mergeCompanies", a: CompanyId, b: CompanyId, into: CompanyId, identity: "primary" | "alt" | null }
```

- **Owner**: mechanic `mergers`.
- **Available**: a and b are distinct `tier: "minor"` companies with status `floated`; `into` is a `tier: "major"` company with status `unstarted`.
- **Warnings**:
  - the round is not `MR`
  - the merged major is over its train limit (US7-4)
  - a presidency tie was broken by operating order (info; it names the winner)
- **Expands to**: research R8, steps 1–6. `identity: null` means `"primary"`.
- **Summary**: "Express + Tunneling → Union · presidente Bruno · precio ₳70 · tesorería ₳310 · 3 trenes". The full share exchange appears in History (US7-7).

### `startMR`: begin the Merger Round (FR-024, FR-027)

```ts
{ type: "startMR" }
```

- **Owner**: `mergers`.
- **Available**: `mergerRoundDue` is true.
- **Expands to**: the end step of the OR being left (feature 003, empty for an OR), then `turnAdvance { round: "MR", scheduleIndex, company: null, operatingOrder }`. The order lists the minors in operating order (FR-027).

### `redeemShare`: buy back one share (US5, FR-017)

```ts
{ type: "redeemShare", company: CompanyId | null, count: int>0 | null }
```

- **Owner**: core.
- **Available**: `market.moves.redeem` is defined, and the pool holds the shares.
- **Warnings**: more than one issue or redeem by this company in this OR; the company cannot pay.
- **Expands to**:
  - `shareTransfer pool → company:X` (count, default 1)
  - `moneyTransfer company:X → bank` at count × current price
  - when `redeem.n > 0`, `marketMove up n` (RotLA: n = 0, so no move)

### `forcedTrainPurchase`: president funds a train, possibly by selling (US6-4, FR-021)

```ts
{ type: "forcedTrainPurchase", company: CompanyId | null, trainType: string, variant: string | null,
  from: "bank" | "pool", sales: { company: CompanyId, count: int>0 }[] }
```

- **Owner**: `corporateBankruptcy` (with config `presidentPays: true`).
- **Expands to**: research R16. The sales come first, then the president → company transfer of exactly the shortfall, then the purchase, then one `marketMove down 1, reason "sell"` per company sold.
- **Warnings** (B p.17):
  - a sale that would change the active company's presidency
  - a sale that would put the pool above 50%
  - the company still short after the sales (suggests `declareBankruptcy`)
  - the company already has a train

### `namedPayment`: minor ability money (FR-023, US5-7)

```ts
{ type: "namedPayment", company: CompanyId | null, payment: string }
```

- **Owner**: core.
- **Available**: `payment` is in the company's effective `traits.payments`.
- **Expands to**: when the trait has a `cost`, first `moneyTransfer company → bank` of the cost; then one `moneyTransfer`, bank → company (`bankPays`) or company → bank (`companyPays`), with the trait's amount. All in one group (constitution I: one intent, one group; one undo).
- **Summary**: "Tunneling: montaña −₳40 · bonificación +₳60".

The Operate sheet's "Montaña" chip records this one action, so the turn summary and History show both lines in one entry.

### Landmarks (mechanic `landmarks`, US11, FR-032)

```ts
{ type: "rockFormation", company: CompanyId | null }
{ type: "cliffSale", company: CompanyId | null, train: string }   // type ("5") or asset id
{ type: "canyonTrain", company: CompanyId | null }
```

See research R13 for the expansion and the once-per-company counters. A repeat use is a warning, never a block.

---

## Changed actions

### `issueShares` (moved to core, research R9)

- **Available**: `market.moves.issue` is defined, and the source (IPO or treasury, per `issue.from`) holds the shares.
- **Expands to**: `shareTransfer <source> → pool`, then `moneyTransfer bank → company:X` at the price, then `marketMove down n` (once per action).
- **Warnings**: pool > limit; more than one issue or redeem in this OR (RotLA). 21Moon's behavior is unchanged.

### `startSR` (research R7)

```text
roundEndEvents(current) ++ exportEvents (if trainExport and srNumber ≥ 1) ++ turnAdvance SR(n+1)
```

**Validation info**: "Se exporta un tren 3: empieza la fase verde" (the export preview: train, phase change, rusting). Warns when it is called with `cyclesComplete` already true ("La partida terminó").

### `startOR`

Unchanged. RotLA's end-of-SR sold-out move comes from `market.moves.soldOut: { heldBy: "players", at: "endSR" }` (US4).

### `runAndPayout`

Unchanged code path. RotLA data:

- `revenueParts: [{ id: "revenue", to: "choice" }]`
- `payoutModes: ["full", "withhold"]`
- `unownedDividends: { ipo: "none", pool: "none", treasury: "company" }`
- `rounding.perShare: "floor"`

The `stackBottom` rule (research R2) produces the `restack` move.

### `buyTrain`

- The trade-in price applies only to `tradeIn.variant` (∞).
- The traded-in train goes to `removed` when `tradeIn.to` is `"removed"` (RotLA), otherwise to `discardedTrainsTo` (unchanged).
- Rust comes first: a trade-in of a train whose type this purchase rusts is not valid. It warns ("El 4 se oxida con esta compra: no se puede entregar"), no trade-in transfer is emitted, the price is the variant's full price, and the train leaves through the normal rust events.
- The train-limit warning uses `trainLimitFor` (tier + bonus).
- Warnings for selling or trading in a `special` or `permanent:` train.
- The shortfall hook runs for RotLA through `presidentPays` (US6-4).

### `sellShares`

- Adds the `warnUnlessOperated` warning.
- `perShare` vs `perSale` comes from the option patch.

### `buyShare`

Adds the `maxSharesPerBuy` warning. Treasury purchases already pay the company (source `"treasury"`).

### `discardTrain`

- A Resourceful rusted train (`rusted:` counter) goes to `removed` and its counter is cleared.
- Any other train goes to `discardedTrainsTo` (`"pool"` for RotLA).

### `declareBankruptcy` (player)

With `playerMode: "liquidatePresided"`, it expands as in research R15, in one group: for each company the player presides over, the bank pays the other holders, all its units go to `removed`, its trains to the pool, its treasury to the bank, and it is `closed`; then the existing `toPool` steps (leftover cash to the bank, leftover shares to the pool); then `counterChange player:P bankrupt +1` (eliminated). Summary: "Quiebra de Carla: se cierran Union y Express; se pagan ₳720 a otros accionistas".

---

## Triggers

| Trigger | Change |
|---|---|
| `phaseTrigger` | Unchanged; covers exports (bank → removed). |
| `phaseChangeEvents` | A company whose effective traits include `keepsRustedTrains` keeps its rusting trains, which get a `rusted:` counter instead (research R10). |
| `corporateBankruptcy.closedCell` | Honors `companyTrainsTo` and `companyStatus`. |
| `presidencyTrigger` | Unchanged; it runs on `launchCompany` and on purchases and sales. `mergeCompanies` sets the presidency explicitly and the trigger finds nothing to change. |
| `floatTrigger` | Skips companies with `start: "auction"` or `"merger"` (they become `floated` explicitly). |

---

## Voice tools (contracts/voice-tools.md of feature 001)

Each new action becomes a tool, generated from its schema. Tool descriptions (Spanish) with example transcripts:

| Tool | Examples |
|---|---|
| `launchCompany` | "Ana abre Tunneling por 140", "Bruno lanza Express en 165" |
| `mergeCompanies` | "Express y Tunneling se fusionan en Union", "… en Conglomerate" (alt identity resolved by name) |
| `startMR` | "ronda de fusiones" |
| `redeemShare` | "recompra una acción" |
| `issueShares` | "emite una acción" |
| `forcedTrainPurchase` | "compra forzada de un 4, Ana vende dos de Express" |
| `namedPayment` | "bonificación de túnel", "ficha extra de Expansive" |
| `rockFormation`, `cliffSale`, `canyonTrain` | "formación rocosa", "vende el 5 en el acantilado", "tren del cañón" |
| `buyTrain` (variant ∞ with trade-in) | "compra un infinito entregando el 5" |

Tools of mechanics a session does not enable are not sent. The cached prefix per game stays stable (constitution, "Platform").
