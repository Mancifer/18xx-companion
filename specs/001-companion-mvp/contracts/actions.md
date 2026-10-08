# Contract: High-Level Actions

Source of truth: Zod schemas in `src/domain/actions/schemas.ts`. Touch builds these payloads,
and voice tools are generated from the same schemas (see [voice-tools.md](./voice-tools.md)).

Pipeline (the same for touch and voice; constitution V):

```
Action ─► parse (Zod) ─► availability(game, state) ─► validate(state) → Warning[] ─► expand(state) → PrimitiveEvent[] ─► append group
                             └ not offered / rejected            (warn, never block)
```

- `availability`: whether the action is offered at all (for example, loans only when
  `game.loans` exists, half only if allowed, a mechanic's actions only if enabled, CR actions
  only with `corporateRound`). Voice tools that are unavailable in the session's game are **not
  sent** to the model.
- `validate` returns warnings for likely rule breaks (certificate limit, per-company limit,
  sell-then-buy, insufficient cash, pool limit, train limit). Warnings never block (FR-025).
- `expand` is pure and deterministic given `(state, action)`. After expansion, **triggers** run
  in the same group: float checks, presidency changes, phase changes (rust, private closure),
  market-cell triggers (`receivership` → `nationalTakeover`, `closed` → `corporateBankruptcy`),
  and debt repayment (`bankDebt`).

## Action catalogue

Fields marked `?` are nullable in the tool schema. `null` means "use the default" (the current
company, the current price, and so on).

| Family | Action | Payload | Expands to |
|---|---|---|---|
| Setup | `createSession` | game, options, players, walletMode, chipSet | starting cash bank→players, IPO shares, initial treasuries, assets (reserve trains → `removed`), `turnAdvance` (initial round) |
| Operating | `runAndPayout` | company?, `parts: {part, amount}[]` (one part normally; 21Moon `local` + `spacePort`), mode? `full\|withhold\|half` | per part: `treasury` → bank→company; `dividend` → bank→holders by ownership and `unownedDividends`; `choice` → by mode. Then `marketMove` per moves. Forced to withhold-and-repay in `receivership` (`forcedWithhold`, `bankDebt`) |
| Operating | `buyTrain` | company?, trainType, variant?, from `bank\|pool\|company`, seller?, price?, tradeIn? | money company→bank or seller, `assetTransfer` (a trade-in goes to `pool`); first of its type → `turnAdvance{phase}` plus phase effects (rust → `removed`, close privates, …). With `bankDebt`: shortfall paid by the president, then lent by the Bank |
| Operating | `payCost` | company?, amount, reason? | company→bank |
| Operating | `bankPays` | company?, amount, reason | bank→company (21Moon Space Bridge ₡60, other one-off bonuses) |
| Operating | `privateIncome` | — | bank→owner for each open private |
| Operating | `buyPrivateByCompany` | company?, private, price | company→owner, asset |
| Operating | `nationalPayout` (`nationalBank`) | extra (city values) | bank→BoE shareholders |
| Operating | `discardTrain` | company, train | asset → `pool` (1830) or `removed` (1848) per the game |
| Operating | `changeTrainSupply` | trainType, `add\|remove` | `assetTransfer` between `removed` and `bank` (21Moon P2) |
| Loans | `takeLoan` | company?, count | lender→company `amount × n`, loan assets, `marketMove`(loan) for the company and the national bank |
| Stock | `parCompany` | player, company, price | `companyStatus parred`, presidency shares ipo→player, money player→bank (or →company if incremental) |
| Stock | `buyShare` | buyer (player or company in CR), company, source `ipo\|pool\|treasury`, count? | shares, money at the `ipoPrice` or market price (→company if incremental); float check → `companyStatus floated` plus capital (now, or `capitalPending` until `endSR`) |
| Stock | `sellShares` | seller (player or company in CR), company, count | shares → pool, bank→seller at the pre-sale price, `marketMove` per the sell rule; presidency swap |
| Stock | `swapCertificates` | player, company, `give: {company, units}`, `take: {company, units}` | two `shareTransfer`s, no money (21Moon) |
| Stock | `issueShares` (`corporateRound`) | company, count | ipo→pool, bank→company at market, one `marketMove` (issue) if floated |
| Stock | `buyPrivate` | buyer (player), private, price | money, asset, grants (`privateGrants`) |
| Stock | `exchangePrivate` (`privateGrants`) | private, source `ipo\|pool` | share → owner, private → `removed` (1830 MH, 21Moon P6) |
| Stock | `stockBatch` | `items: (buyShare\|sellShares\|parCompany)[]`, assumedPrices | one group, applied in order with the stated prices (FR-042) |
| Flow | `startSR` / `endSR` | — | `capitalPending` payouts, sold-out moves at the end of the SR, `turnAdvance` |
| Flow | `startCR` / `endCR` (`corporateRound`) | — | sold-out and pool-penalty moves at the end of the CR (descending price order) |
| Flow | `startOR` | — | scheduled events, operating order, private income offer, `turnAdvance` |
| Flow | `nextCompany` | — | `turnAdvance` (next company by `orOrder`, next OR, or next round in the schedule) |
| Status | `confirmFloatCondition` | company | `manualFloatCondition` |
| Status | `enterReceivership` | company | `nationalTakeover` (1848), or `forcedWithhold` status (21Moon), as a manual trigger |
| Status | `declareBankruptcy` | player \| company | `corporateBankruptcy` and player bankruptcy (money → bank, shares → pool, privates → removed) |
| Status | `closeCompany` | company | `companyStatus closed` (assets stay until moved manually) |
| Status | `adjustCounter` | subject, key, delta | `counterChange` (bonus tokens, a manual debt fix) |
| Manual | `adjustMoney` | holder, delta \| setTo | bank↔holder transfer for the difference |
| Manual | `transferMoney` | from, to, amount | one `moneyTransfer` |
| Manual | `transferShares` | company, from, to, units | one `shareTransfer` |
| Manual | `setMarket` | company, cell | `marketMove manual` (US7-3) |
| Manual | `setPhase` / `setTurn` | … | `turnAdvance` |
| Manual | `note` | text | `note` |
| Ledger | `undo` | groupId? (default: last) | `revert` entry (not a group) |
| Ledger | `amend` | groupId? (default: last), action | `amend` entry |

## Expansion rules that need tests (constitution VI)

- **Payout**: `perShare = round(amount / shareCount)` per `rounding`. Each holder gets
  `perShare × units`, routed by holder type: player → player; `company:X` holding X →
  `unownedDividends.treasury`; `ipo:X` → `unownedDividends.ipo`; `pool` → `unownedDividends.pool`;
  `company:Y` holding X → company Y (21Moon). A destination of `"none"` emits **no
  transfer** (the money never leaves the bank). Half: `paid = roundHalf(amount)`, the company
  keeps `amount − paid`, and the paid part is distributed as above.
- **Payout moves**: rules are evaluated in order, and the first whose `when` matches applies
  (21Moon thresholds compare the dividend part with the pre-move price).
- **Full capitalization**: when the share count that has left the IPO first reaches
  `floatPercent`, bank→company `par × shareCount`. This happens immediately (`onFloat`, 1848) or
  at `endSR` (1830). Incremental: each IPO buy and each issue pays the company (21Moon).
- **Sell**: price = the cell before the sale. Units × price from bank→seller. Moves: `per:
  share` moves n × units after all units are sold (1830), and `per: sale` moves once per
  `sellShares` action (1848, 21Moon), skipped when `onlyIfOperated` and the company has not
  operated.
- **Phase change**: idempotent; triggered only by the first train of the type (or by a
  removed train counted as sold, 1848 §5.4.4).
- **Bank debt** (`bankDebt`): lending = bank→debtor `moneyTransfer` + `counterChange debt +x`.
  Any later group that pays the debtor also gets debtor→bank `moneyTransfer` + `counterChange
  debt −y` (y = min(income, debt)). When a company's debt reaches 0, its status goes back to
  `floated`, and a pending presidency change is applied.
