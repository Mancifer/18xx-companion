# Research: Action Menus UX

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-10-12

No unknowns were left open in the Technical Context. Each decision below was made by reading the
code that the feature touches.

## R1. Selling and buying from the player menu (FR-001 to FR-008)

**Decision**: Add two views to the player sheet:

- "Vender acciones" and "Comprar acción", each one short form.
- They dispatch the existing `sellShares` and `buyShare` actions with `seller`/`buyer` set to the
  player.
- The menu is split into two labeled fieldsets: "Jugada" first, "Ajustes" second.

The company-side `StockSheet` stays as it is.

**Rationale**:

- `sellShares` and `buyShare` ([src/domain/actions/expand/stock.ts](../../src/domain/actions/expand/stock.ts))
  already cover everything: price, payee, market move, pool limits, presidency and warnings.
- Reusing them gives identical money, warnings and voice parity (FR-004, FR-006, FR-008) with no
  domain change.
- `availabilityOf` gives the per-company and per-source enabled state and the reasons (edge cases:
  no price, empty IPO or pool).
- Touch dispatch applies directly, with the undo toast, the same as `StockSheet` today.

**Tap counts (FR-007, SC-001, constitution V's "≤ 2 taps")**:

- In an SR, "Jugada" also shows one quick-sell button per holding with a price, for example
  "Vender 1 PRR · $67". Player tile → that button = **2 taps** for the most common sale.
- Selling more than one goes through "Vender acciones": the company is preselected when there is
  only one, the stepper sets the count, then "Vender N" is tapped. That is 3 taps, or 4 when a
  company has to be picked. The stepper is entry, not a required tap.
- Buying: player tile → "Comprar acción" → company → source = 4 taps. When only one company can
  be bought, the buy view preselects it, so it takes 3 taps. The company card's existing 2-tap buy ("IPO" or "Pool" in the player's row) stays
  as the shortest buy path.
- A mistaken quick sell is one tap to undo (Principle IV).

**How the forms work**:

- **Sell**:
  - Lists the player's holdings with a price (`unitsOf(player) > 0` and `priceOf` defined).
  - Preselects the company when there is exactly one.
  - Stepper from 1 to the units held.
  - The confirm button reads "Vender N · cobra $X". X is the pre-sale price × N, the same formula
    as `sellEvents`.
- **Buy**:
  - Lists companies that are open (not unstarted, closed or bankrupt).
  - Source buttons appear only where `availabilityOf(buyShare)` is ok: "IPO $p", "Pool $p", and
    "Tesorería $p" in games whose default source is the treasury (RotLA).
  - The price comes from `sharePrice`.
  - Parring an unstarted company stays on the company card. It needs a par price and has its own
    flow (`LaunchSheet` for auction companies).

**Order in the menu (spec US1 scenario 6)**:

- In an SR, "Vender acciones" and "Comprar acción" lead the "Jugada" section.
- In other rounds they follow the player's other game actions ("Canjear privada…").
- "Ajustes" holds "Pagar…", "Cobrar del banco", "Fijar dinero", "Mover acciones", "Ajustar deuda"
  and "Declarar quiebra".
- Bankruptcy is a game event, but it is rare and destructive, so it goes last in "Ajustes",
  behind its existing confirmation.

**Alternatives considered**:

- *Open the company's `StockSheet` from the player menu*: it lists every player, so it is not
  player-centric, and it costs an extra tap to pick the company.
- *A new "sell from player" action*: it would duplicate `sellShares`, against Principle I's small
  vocabulary and Principle V's one path.

## R2. `HolderSheet` sections (FR-001, FR-003)

**Decision**:

- `HolderSheet` gets an optional `gameActions` slot, rendered in a fieldset with the legend
  "Jugada" above the existing buttons.
- When `gameActions` is present, the existing buttons and `extraActions` are wrapped in a
  fieldset with the legend "Ajustes".
- `CompanySheet` passes nothing new, so the company details sheet looks the same (spec
  assumption).
- The sell and buy views are new modes inside `PlayerSheet`, not inside `HolderSheet`.
  `HolderSheet` is shared with companies, and the sale views only make sense for players.

**Alternatives considered**: a tabbed sheet. Rejected: one more tap, and the corrections would be
hidden.

## R3. Train count in the operating menu (FR-009, FR-010)

**Decision**:

- A small `TrainsLine` component shows the company's trains, for example
  "Trenes 2/4 · 2, 3 (oxidado)". It is shared by `OperateSheet` (directly under the title, above
  the revenue entry) and `CompanyCard`, which keeps its look.
- Count = `countedTrains` (what the limit counts). Limit = `trainLimitFor`. Types = every train
  held, in `trainsHeldBy` order.
- A rusted-but-kept train gets "(oxidado)" after its type.
- A train that does not count toward the limit (1848 2E) is listed but not counted.
- No trains: "Sin trenes", with a warning style.
- Over the limit: "3/2 · sobre el límite", with a warning style next to the existing over-limit
  button.
- Text always carries the state, so color is never the only cue (FR-010).
- An infinite limit (no limit in this phase) shows the count only: "Trenes 2 · 2, 3".

**Rationale**: these are the same helpers that drive the over-limit banner, so the menu and the
banner never disagree.

## R4. Train correction action (FR-011 to FR-017)

**Decision**: one new action, `correctTrain`, in the manual-handlers family.

```text
correctTrain { company, train, op: "remove" | "add", to: "bank" | "pool" | "removed" | null, amount: money | null }
```

- **remove**:
  - `train` is an asset id ("train:2:3") or a type ("2"). With a type, the highest-numbered train
    of that type the company holds is chosen, so the most recent purchase is corrected first.
  - `to` is required.
  - Events: `assetTransfer` company → `to`. When the train carried a `rusted:` counter, a
    `counterChange −1` clears it (same as `discardTrain`).
  - When the refund > 0: `moneyTransfer` bank → company.
  - To the bank, the refund is `amount ?? list price` (the first variant's cost, from `trainPrice`
    with `price: null`). `amount: 0` means no refund.
  - To the pool or out of the game, the refund is `amount ?? 0`. The UI never sends one. If voice
    does, the money is recorded with the `refundOffSupply` warning instead of being refused.
- **add**:
  - `train` is a type, and `to` must be null.
  - The train taken is the cheapest-numbered train of that type in the bank. For `unlimited`
    types, the next number is minted, as `trainToBuy` does (the helper is exported and reused).
  - Events: `assetTransfer` bank → company. When `amount > 0`: `moneyTransfer` company → bank.

**Availability (only for impossible actions; rule concerns are warnings, Principle III)**:

- The company must exist.
- remove: the company holds the train.
- add: the bank has one of that type, or the type is unlimited.
- `to === "pool"` only when `game.discardedTrainsTo === "pool"` (spec US3 scenario 3).
  - This is not a rule check. In games that discard trains out of the game, the pool never holds
    trains, so the destination has no meaning there.
  - It follows the existing precedent of `changeTrainSupply`, which is unavailable in games
    without reserve trains ("Este juego no tiene trenes de reserva").
  - See the plan's Constitution Check, Principle III.
- `remove` with `to: null`, and `add` with `to` set, are malformed and unavailable.

**Warnings (never blocking)**:

- **Phase starter (FR-016)**: the train's type is the current phase's `triggeredBy`, and after
  the correction no train of that type is held by any company or the pool. The message says the
  phase and any rusting stay as they are, and points to the "Fase" section of the turn control
  (`TurnSheet`, opened from the round indicator).
- **Not on sale (`notOnSale`)**: returning to the supply a type whose `rustsOnPhase` has been
  reached (`phaseReached(game, state, def.rustsOnPhase)`). That is the only "no longer sold"
  condition the game data defines. Types with no `rustsOnPhase` never get this warning.
- **Refund off supply (`refundOffSupply`)**: `amount > 0` with `to` "pool" or "removed". The
  money is still recorded (FR-012).
- **Bank broken**: the refund would break a finite bank (`payWarnings`). On add, a payment the
  company cannot afford gives the usual `insufficientCash`.

**Triggers**:

- A correction must not start a phase or close privates (FR-016). `phaseTrigger` already skips
  `changeTrainSupply` for removed trains. It now returns `[]` for `correctTrain` altogether.
- `privateClosingTrigger` ("companyBuysTrain") also skips `correctTrain`: a correction is not a
  purchase.
- Both exemptions use a shared `CORRECTION_ACTIONS` set in `triggers.ts`, not ad hoc type checks.

**Why not reuse `discardTrain` with a destination**:

- `discardTrain` is a rule action: it goes to the game's discard destination and is used by the
  over-limit flow and Resourceful.
- Mixing correction semantics into it would weaken FR-017 and change the voice meaning of
  "descartar".

**Why not two actions (`removeTrain` and `addTrain`)**: `changeTrainSupply` already uses
`op: add|remove`, and one tool keeps the voice prefix smaller.

**Primitive events**: none added. `assetTransfer`, `moneyTransfer` and `counterChange` already
exist (Principle I).

## R5. Where train correction lives in the UI

**Decision**:

- "Corregir trenes…" goes in the company's "Ajustes" (`companyActions` in `Table.tsx`, shown in
  `CompanySheet`).
- `OperateSheet` gains a link to it under the trains line ("Corregir…"), so a mistake seen while
  operating is one tap away.
- The view lists:
  - Each held train as "Quitar el 2".
  - After picking a train, the destination buttons "Al banco (oferta)", "Al pool" (when offered)
    and "Fuera de juego".
  - For "Al banco", a refund row: a "Devolver $X" toggle, on by default, plus a Keypad to edit the
    amount.
  - A second block, "Dar un tren", with the stack's types and an optional amount (Keypad, empty =
    no money).
- Tap count, removal back to the bank with the default refund: company card → "Detalles y
  ajustes…" → "Corregir trenes…" → "Quitar el 2" → "Al banco · devolver $80" = 5 taps (SC-004).
  From the operating menu it is 4.

## R6. Voice (FR-024)

**Decision**:

- Add `correctTrain` to `ACTION_TOOLS`, after `adjustMoney`, with a description and examples:
  - «la PRR no tenía ese dos, devolvelo al banco»
  - «sacale el tres a la B&O, fuera de juego»
  - «dale un dos a la NYC sin pagar»
- The tool goes through the same schema and resolve path as every other tool.
- Prompt snapshot tests are regenerated.
- Eval: add cases to `eval/voice/cases.jsonl` for remove-to-bank, remove-to-removed and add. The
  run itself (`npm run eval:voice`) needs the user's paid key. It is left as a manual task, the
  same as in features 004, 005 and 010.
- `sellShares` and `buyShare` are already voice tools, so Story 1 needs nothing for voice.

**Alternatives considered**: keeping correction touch-only, like `transferShares` and
`discardTrain`. That is allowed by Principle V, but the spec asks for voice (FR-024), and saying
"devolvé ese tren" is natural at the table.

## R7. History round sections (FR-018 to FR-021)

**Decision**: a pure domain helper, `roundSections(game, history)`, in a new
`src/domain/ledger/rounds.ts`.

- **Input**: the `GroupHistory[]` that History already computes, in seq order.
- **How it works**:
  - Walk the groups in seq order and fold only the `turnAdvance` events of active groups into a
    turn, using the reducer's own `advanceTurn` (exported) on a minimal state. This way the round
    fields merge exactly as in the game.
  - Each group gets the round key in effect after it: `round` + `srNumber` / `orSet.orIndex`.
  - A section starts at the first active group whose key differs from the previous one.
  - Reverted groups never start a section. They sit in the section in effect at their position
    (FR-021).
  - Setup groups before any round form a "Preparación" section.
- **Output**: sections, oldest first:
  `{ key, round, title, icon, startGroupId, groupIds, finished }`.
  - `finished` = a later section exists.
  - The last section is in progress (FR-019).
- **Rendering**: `History` renders sections newest first, each as its own `<section>`:
  - A header band at the top: an icon and the full title, plus "· en curso" or "· terminada".
  - The section's entries, newest first.
  - An "Inicio · <title>" band at the bottom.
  - The bands are separate elements with their own style (FR-018), not restyled entries.
- **Titles and icons (FR-020)**: text plus an emoji icon, never color alone.

| Round | Icon | Title |
|---|---|---|
| PRIVATES | 📜 | Privadas |
| SR | 💼 | Ronda de acciones N |
| OR | 🚂 | Ronda de operaciones S.I |
| MR | 🔀 | Ronda de fusiones N |
| CR | 🏛 | Ronda corporativa N |

  Cycle games (RotLA) put "Ciclo N · " in front and show the OR as "I/S", matching
  `cycleRoundLabel`. RotLA's landmarks are not a round in the model (`Round` has no landmark
  value), so they stay ordinary entries.
- **Cost**: one pass over the groups, with only turn folding, computed in a `useMemo` on the log.
  That is well under the History budget for 300 groups. The existing perf test is extended.

**Alternatives considered**:

- *Storing round info on each group*: it would mean a new entry field and a migration, and old
  sessions would need a backfill. Derived data is free and works for old sessions.
- *Reducing full state per group*: too costly and unnecessary. Only the turn matters.
- *Collapsible sections*: deferred. The spec asks for scanning, and collapsing adds taps and
  state.

## R8. Titles for round-ending `nextCompany` entries (FR-022, FR-023)

**Decision**: the `nextCompany` summarizer reads its group's events.

- **A `turnAdvance` with `round: "OR"`** (the OR changed within the set):
  "Fin de la OR S.(I−1) · empieza la OR S.I", using `orSet`/`orIndex` from that event. Cycle games
  word it with the round's cycle label ("Fin de RO 1/2 · empieza RO 2/2").
- **A `turnAdvance` with `company: null` and no `round`** (set complete):
  "Fin de las rondas de operaciones".
  - The title does not name the next round. In RotLA, from the green phase on, the schedule
    (`grotla.ts`: SR n, OR n.1, OR n.2, MR n) puts a merger round there, so "empieza la ronda de
    acciones" would be wrong.
  - The next entry (`startSR` or `startMR`) names the new round, and so does its History section
    header.
  - The `setComplete` warning in `flowHandlers.nextCompany.validate`
    ([flow.ts](../../src/domain/actions/expand/flow.ts)) currently reads "Fin de las rondas de
    operaciones: empieza la ronda de acciones." It is shortened to "Fin de las rondas de
    operaciones." for the same reason (FR-022).
- **Otherwise**: "Siguiente compañía", unchanged.
- **No-run line**: `noRunSummary` ("PRR no corrió") is now joined with the round-end title, not
  in place of it: "PRR no corrió · Fin de la OR 2.1 · empieza la OR 2.2".

**Rationale**:

- History, the undo toast, the undo range sheet, the operating "Este turno" list and the voice
  confirmation all call `summaryEs` with the group's events. One change covers them all (FR-023).
- Titles are derived at display time, so older sessions show them with no rewrite.

**Alternatives considered**: a new `endOR` action. That would change what is recorded and the
voice tools, and it would not fix old sessions.

## R9. Export, import and persistence

**Decision**: no format change.

- `correctTrain` is a new action type inside the existing entry shape. Export v2 stays.
- Importing a session that holds `correctTrain` into an older build fails that build's schema
  check. That is the normal forward-compatibility limit, so it needs no version bump.
- Rounds are derived, and nothing new is stored.

## R10. Product reference (FR-026)

**Decision**: update [docs/spec.md](../../docs/spec.md):

- §6: add `correctTrain` to the actions list, as a correction that never triggers a phase.
- §9.1 Table: the player sheet's "Jugada" and "Ajustes" sections; the trains line in the
  operating menu; "Corregir trenes".
- §9.1 History: the round sections and the round-end titles.
- §8.3: the new voice examples.
