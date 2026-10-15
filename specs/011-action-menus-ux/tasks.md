---

description: "Task list for feature 011 — Action Menus UX"
---

# Tasks: Action Menus UX

**Input**: Design documents from `specs/011-action-menus-ux/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/actions.md](contracts/actions.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first domain logic. UI and tap-count tests back the spec's measurable outcomes (SC-001, SC-003, SC-004). Write each test task first and see it fail before the matching implementation task.

**Organization**: Tasks are grouped by user story. Phases follow the plan's delivery order, smallest first: US5 → US1 → US2 → US3 → US4. Spec priorities still hold: US1 is P1 and the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Path Conventions

Single-project PWA: `src/`, `tests/`, `eval/` and `docs/` at the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline, so failures are not blamed on this feature.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the current tree. Record any pre-existing failures in this task's note. Note the latest voice eval result file under `eval/voice/results/` as the accuracy baseline for T053.
  - Note (2026-10-12): typecheck and lint clean. 1632/1633 tests pass. Pre-existing flaky failure: `tests/domain/perf.test.ts` "replays a 1500-group RotLA log with mergers in under 50 ms" (~100 ms under full-suite load, passes when run alone). Eval baseline: `eval/voice/results/2026-10-12-gemini-3.6-flash-cache.json`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Nothing blocks every story. Each story's shared helpers live in that story's phase, so this phase is empty on purpose.

**Checkpoint**: User story work can begin after T001.

---

## Phase 3: User Story 5 - Name the entry that ends the operating rounds (Priority: P3)

**Goal**: A `nextCompany` entry that ends an OR or a set of ORs gets a round-end title in History, the undo toast, the undo range sheet, the operating "Este turno" list and the voice card. Older sessions get it too.

**Independent Test**: Finish the last company of OR 1.1 (not the last OR of its set): the entry reads "Fin de la OR 1.1 · empieza la OR 1.2". Finish the last company of the set: "Fin de las rondas de operaciones".

### Tests for User Story 5 ⚠️

- [X] T002 [P] [US5] In `tests/domain/summaries.test.ts`, add `nextCompany` title tests (data-model §3):
  - Events with a `turnAdvance` carrying `round: "OR", orSet: 2, orIndex: 2` → "Fin de la OR 2.1 · empieza la OR 2.2".
  - Events with a `turnAdvance` of `company: null` and no `round` → "Fin de las rondas de operaciones".
  - Events with only `turnAdvance { company: "NYC" }` → "Siguiente compañía".
  - A group that also recorded a zero run with a market move → "PRR no corrió · Fin de la OR 2.1 · empieza la OR 2.2" (the no-run line is joined, no longer replacing the title).
  - A RotLA (cycle game) mid-set end uses the cycle wording "Fin de RO 1/2 · empieza RO 2/2".
  - No events → "Siguiente compañía".
  - A RotLA game in the green phase, ending OR n.2 (a merger round comes next): the title is "Fin de las rondas de operaciones", with no stock-round wording (spec US5-2).
  - The `setComplete` warning from `nextCompany` validation reads "Fin de las rondas de operaciones." (no next round named).
- [X] T003 [P] [US5] In `tests/ui/history.test.tsx`, play a 1830 session in which OR 1.1 ends by `nextCompany` (2 ORs per set). History shows the "Fin de la OR 1.1 · empieza la OR 1.2" entry, and the "Fin de las rondas de operaciones" entry after the set ends. The undo toast after the end-of-set `nextCompany` shows the same title (FR-023).

### Implementation for User Story 5

- [X] T004 [US5] In `src/domain/i18n/es.ts`, make the `nextCompany` summarizer read `events`:
  - A `turnAdvance` with `round === "OR"` gives "Fin de la OR S.(I−1) · empieza la OR S.I" from that event's `orSet`/`orIndex`. For games where `cycleCount(game)` is defined, use "Fin de RO (I−1)/N · empieza RO I/N" with `orsInSet` as N.
  - A `turnAdvance` with `company === null` and no `round` gives "Fin de las rondas de operaciones".
  - Otherwise "Siguiente compañía".
  - Never name the round that follows a set: it is an SR or, in RotLA from green on, an MR.
  - In `summaryEs`, join `noRunSummary` with the title as `"<noRun> · <title>"` when the title is a round end, and keep `noRunSummary` alone otherwise.
  - In `src/domain/actions/expand/flow.ts`, change the `setComplete` warning in `nextCompany.validate` from "Fin de las rondas de operaciones: empieza la ronda de acciones." to "Fin de las rondas de operaciones." (FR-022).
  - Depends on T002.
- [X] T005 [US5] Make T002 and T003 pass. Check that `tests/ui/operate.test.tsx` and `tests/voice/` still pass, and update any test expectations that asserted "Siguiente compañía" for a round-ending group.

**Checkpoint**: US5 works on its own. No data or schema change.

---

## Phase 4: User Story 1 - Sell and buy shares from the player menu (Priority: P1) 🎯 MVP

**Goal**: The player sheet has a "Jugada" section (SR quick sell, "Vender acciones", "Comprar acción", "Canjear privada…") above an "Ajustes" section (every current adjustment). These buttons dispatch the existing `sellShares` and `buyShare`.

**Independent Test**: In a 1830 or RotLA SR, sell and buy from the player sheet. Money, holdings, pool and market match the company-card path, and the quick sell takes 2 taps from the Table.

### Tests for User Story 1 ⚠️

- [X] T006 [P] [US1] Create `tests/ui/playerSheet.test.tsx` (use `openSeededTable` from `tests/ui/helpers.tsx`):
  - **Sections**: the player sheet shows a "Jugada" group before an "Ajustes" group (fieldset legends).
  - **"Ajustes" contents**: "Pagar…", "Cobrar del banco", "Fijar dinero", "Mover acciones", "Ajustar deuda" and "Declarar quiebra" (FR-001, FR-003).
  - **Quick sell (SR only)**: "Vender 1 PRR · $<price>" appears for each holding with a price, and dispatching it gives the same state as `sellShares { seller: player:p1, company: PRR, count: 1 }` (cash, pool units, market cell) (US1-1, FR-004).
  - **No quick sell outside the SR**: there are no quick-sell buttons in an OR, and "Canjear privada…" comes before "Vender acciones" when the player holds an exchangeable private (US1-6).
  - **"Vender acciones" view**: with a single holding, the company is preselected (US1-3). The stepper is capped at the units held. The confirm reads "Vender N · cobra $X" with X = price × N, and dispatching it equals `sellShares` with that count (FR-005).
  - **No shares**: "Vender acciones" is disabled with the title "No tiene acciones para vender", and "Comprar acción" stays enabled (US1-4).
  - **"Comprar acción" view**:
    - Unstarted, closed and bankrupt companies are not listed.
    - The source buttons "IPO $p" and "Pool $p" are enabled only when `availabilityOf(buyShare)` is ok, and otherwise show its reason as the title.
    - One tap on a source dispatches `buyShare { buyer: player:<id>, company, source, count }` (FR-006).
    - With only one open company, it is preselected and the source buttons show at once.
  - **Warnings**: a sale over the pool limit or in the parred round still applies and shows the same warning as the company-side sale (US1-5, FR-008).
- [X] T007 [P] [US1] In `tests/ui/taps.test.tsx`, count taps from the Table with the existing `counting` helper (FR-007, SC-001):
  - SR quick sell of 1 PRR = 2 taps (player tile, "Vender 1 PRR").
  - "Vender acciones" with one holding = 3 taps.
  - "Vender acciones" with two holdings = 4 taps.
  - "Comprar acción" with several open companies = 4 taps (player tile, "Comprar acción", company, source).
  - "Comprar acción" with only one company that can be bought = 3 taps (it is preselected).
- [X] T008 [P] [US1] In `tests/ui/rotla.test.tsx`, in a RotLA SR the player's "Comprar acción" view offers "Tesorería $p" (game `defaultBuySource: "treasury"`) and the buy pays the company treasury, the same as the company card's "Tesorería" button.

### Implementation for User Story 1

- [X] T009 [US1] In `src/ui/sheets/HolderSheet.tsx`, add an optional `gameActions?: ReactNode` prop. When it is present:
  - Render it first, in `<fieldset className="choice-fieldset"><legend className="muted">Jugada</legend><div className="choice-grid">…</div></fieldset>`.
  - Wrap the existing menu buttons and `extraActions` in a second fieldset with the legend "Ajustes".
  - When it is absent, render exactly as today, so `CompanySheet` is unchanged (research R2).
- [X] T010 [US1] In `src/ui/sheets/PlayerSheet.tsx`, add the modes `"menu" | "sell" | "buy"` and a `gameActions?: ReactNode` prop for the Table's extra game actions. Build the "Jugada" content per contracts/ui.md §1 and data-model §4:
  - In an SR (`state.turn.round === "SR"`): one quick-sell button per company with `unitsOf(state, player:<id>, c) > 0` and a defined `priceOf`, labeled "Vender 1 <shortName> · <formatMoney(price)>", dispatching `sellShares { seller, company, count: 1 }` and closing on ok. Then "Vender acciones", "Comprar acción", then the Table's game actions.
  - In other rounds: the Table's game actions first, then "Vender acciones" and "Comprar acción".
  - "Vender acciones" is disabled with the title "No tiene acciones para vender" when there are no holdings with a price.
  - Pass the result to `HolderSheet` as `gameActions`. Depends on T009.
- [X] T011 [US1] In `src/ui/sheets/PlayerSheet.tsx`, implement the sell view ("Vender · <name>", contracts/ui.md §1):
  - Company buttons (`CompanyBadge` + "<shortName> <pct>% · <price>"), one per holding with a price, preselected when there is exactly one.
  - A stepper from 1 to the units held.
  - A primary button "Vender N · cobra <formatMoney(price × N)>" that dispatches `sellShares` and closes on ok.
  - "← Volver" goes back to the menu. Depends on T010.
- [X] T012 [US1] In `src/ui/sheets/PlayerSheet.tsx`, implement the buy view ("Comprar · <name>"):
  - Company buttons for companies whose status is not `unstarted`, `closed` or `bankrupt`. Preselect the company when exactly one is listed (FR-007).
  - A count stepper (min 1).
  - Source buttons, built from `sharePrice` and `availabilityOf(ctx, "buyShare", …)`:
    - "IPO <price>", shown unless `game.defaultBuySource === "treasury"`.
    - "Tesorería <price>", shown when the company holds its own shares.
    - "Pool <price>".
  - Each source button is disabled with `reasonEs` as its title when unavailable, and one tap dispatches `buyShare { buyer: player:<id>, company, source, count }` and closes on ok.
  - "← Volver" goes back to the menu. Depends on T010.
- [X] T013 [US1] In `src/ui/screens/Table.tsx`, split `playerActions(id)`:
  - A new `playerGameActions(id)` returns "Canjear privada…" when the player holds an exchangeable private.
  - `playerActions(id)` keeps "Ajustar deuda" and "Declarar quiebra" (last).
  - Pass both to `<PlayerSheet gameActions={playerGameActions(open.id)} extraActions={playerActions(open.id)} />`. Depends on T010.
- [X] T014 [P] [US1] In `src/ui/styles/components.css`, space the two fieldsets in the player sheet and keep buttons ≥ 48 px. Reuse the `.choice-fieldset` and `.choice-grid` rules, adding only what is missing.
- [X] T015 [US1] Make T006–T008 pass, then run `tests/ui/stock.test.tsx` to confirm the company-side `StockSheet` behaves exactly as before.

**Checkpoint**: US1 (MVP) is complete and testable on its own.

---

## Phase 5: User Story 2 - See a company's trains in the operating menu (Priority: P2)

**Goal**: The operating menu shows "Trenes 2/4 · 2, 3", with a rusted mark, "Sin trenes", the over-limit state, or no limit.

**Independent Test**: Open PRR's operating menu with no trains ("Sin trenes"), buy a 2, reopen ("Trenes 1/4 · 2").

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] In `tests/domain/summaries.test.ts` (or a new `describe` block there), test the pure formatter `trainsLineEs(game, state, company)` against contracts/ui.md §2:
  - A 2 and a 3 with limit 4 → "Trenes 2/4 · 2, 3".
  - A rusted kept 2 (counter `rusted:<asset>` on the company) → "Trenes 1/4 · 2 (oxidado), 3".
  - None → "Sin trenes".
  - Over the limit → "Trenes 3/2 · 2, 3, 3 · sobre el límite".
  - An infinite limit → "Trenes 2 · 2, 3".
  - 1848: a 2E is listed but not counted.
  - The function also returns `{ text, warn: boolean }`, where `warn` is true for "Sin trenes" and over the limit.
- [X] T017 [P] [US2] In `tests/ui/operate.test.tsx`, the operating sheet shows `data-testid="trains-line"` under the title with "Sin trenes". After `buyTrain` of a 2 and reopening, it shows "Trenes 1/4 · 2". When the company is over the limit, the line reads "sobre el límite" and the existing over-limit button is still present (US2-1 to US2-4).

### Implementation for User Story 2

- [X] T018 [US2] In `src/domain/i18n/es.ts`, add `trainsLineEs(game, state, company): { text: string; warn: boolean }`:
  - Count = `countedTrains(game, state, company).length`.
  - Limit = `trainLimitFor(game, state, company)`, omitted when it is `Infinity`.
  - Types = `trainsHeldBy(state, company:<id>).map(trainTypeOf)` in that order, with " (oxidado)" when `counterOf(state, ref, RUSTED + asset) > 0`.
  - "Sin trenes" when the company holds none. " · sobre el límite" when count > limit.
  - Depends on T016.
- [X] T019 [US2] Create `src/ui/components/TrainsLine.tsx`. It renders `trainsLineEs` in a `<p data-testid="trains-line" className={warn ? "trains-line warn" : "trains-line"}>`, with an optional `onCorrect?: () => void`. When `onCorrect` is given, a trailing "Corregir…" button is rendered (it is wired in T034). Depends on T018.
- [X] T020 [US2] In `src/ui/sheets/OperateSheet.tsx`, render `<TrainsLine company={companyId} />` directly under the sheet title, above the out-of-turn note, the over-limit button and the revenue entry, in the main ("run") view. Depends on T019.
- [X] T021 [P] [US2] In `src/ui/styles/components.css`, add `.trains-line` and `.trains-line.warn`. The warning style must pair with the text: color is never the only cue.
- [X] T022 [US2] Make T016 and T017 pass. Optionally switch `src/ui/components/CompanyCard.tsx` to the shared formatter only if its visible text stays "Trenes: 2 · 3" (no visual change required).
  - Note: the optional CompanyCard switch was skipped; the card keeps its own "Trenes: 2 · 3" text.

**Checkpoint**: US2 works on its own.

---

## Phase 6: User Story 3 - Correct the trains a company holds (Priority: P2)

**Goal**: A `correctTrain` action removes a train to the bank (refund defaults to list price), the pool (only when `discardedTrainsTo === "pool"`) or out of the game, or gives a company a train. It never changes the phase or closes privates. It is reachable by touch and voice.

**Independent Test**: Buy a 2 twice by mistake, record a run, then correct one 2 back to the bank with a refund. Trains, treasury, the supply and the bank match a game without the second purchase, and the run entry is untouched.

### Tests for User Story 3 ⚠️

- [X] T023 [P] [US3] Create `tests/domain/correctTrain.test.ts` (1830 unless noted), per contracts/actions.md and data-model §1:
  - **Expansion**:
    - remove → bank with `amount: null`: `assetTransfer(train, company:PRR → bank)` plus `moneyTransfer(bank → company:PRR, 80)`, the 2's list price.
    - `amount: 0` → no money. `amount: 50` → 50.
    - remove → removed and remove → pool with `amount: null`: no money.
    - remove → pool with `amount: 30`: `moneyTransfer(bank → company, 30)` is recorded, with the `refundOffSupply` warning (not refused).
    - remove with a type picks the company's **highest-numbered** train of that type.
    - remove of a rusted kept train also emits `counterChange(company, "rusted:<asset>", −1)`.
    - add with a type takes the bank's **lowest-numbered** train of that type. For an unlimited type, it mints the next number like `trainToBuy`.
    - add with `amount: 80` → `moneyTransfer(company → bank, 80)`. `amount: null` → no money.
  - **Supply order (FR-013)**: after remove → bank, the next `buyTrain` of that type takes a train again and the stack count is back to its earlier value.
  - **Availability**, with the contract's exact `reasonEs`:
    - A train not held → "La compañía no tiene ese tren".
    - remove with `to: null` → "Falta a dónde va el tren".
    - add with `to` set → "Al dar un tren no hay destino".
    - add with an empty supply → "No quedan trenes {type} en la oferta".
    - `to: "pool"` in 1848 (`discardedTrainsTo: "removed"`) → "En este juego los trenes no van al pool".
  - **Warnings, never blocking**:
    - `phaseStarter` when removing the only 3 in play while the phase is 3. The phase is unchanged, and rusted trains stay removed (FR-016).
    - `notOnSale` when returning to the bank a type whose `rustsOnPhase` has been reached (e.g. a 2 in 1830 phase 4). No warning for a type without `rustsOnPhase`.
    - `bankBroken` on a refund that exceeds a finite bank.
    - `insufficientCash` on an add payment above the treasury.
  - **Invariants (SC-007)**: after each case, bank + players + companies equals the start total, and there are no violations.
  - **Undo (US3-6)**: dispatching `correctTrain`, then `undoLast`, deep-equals the earlier state.
- [X] T024 [P] [US3] In `tests/domain/trains.test.ts` (not `correctTrain.test.ts`, which T023 owns), test the trigger exemption (research R4):
  - `correctTrain { op: "add", train: "3" }` in phase 2 emits no `turnAdvance { phase }` and rusts nothing.
  - A private with `closesOn: companyBuysTrain` (1830 if present, else a test game definition) does not close on a correction add.
  - `buyTrain` of the same type still triggers both (regression).
- [X] T025 [P] [US3] In `tests/domain/summaries.test.ts`, test the `correctTrain` summaries (contracts/actions.md, Summary table):
  - "Corrección: la PRR devuelve un 2 a la oferta y recibe $80"
  - "… devuelve un 2 a la oferta" (no refund)
  - "Corrección: el 2 de la PRR va al pool"
  - "Corrección: el 2 de la PRR queda fuera de juego"
  - "Corrección: la PRR recibe un 2 de la oferta"
  - "… y paga $80"
- [X] T026 [P] [US3] Create `tests/ui/trainCorrection.test.tsx`:
  - **Reachable from both places**: from the company details "Ajustes" ("Corregir trenes…") and from the operating sheet's trains line ("Corregir…").
  - **Remove**: "Quitar el 2" → "Al banco (oferta) · devolver $80" dispatches `correctTrain { op: "remove", to: "bank", amount: null }`. Turning the refund off sends `amount: 0`. An edited amount is sent as typed.
  - **Pool button**: "Al pool" appears in 1830 and RotLA, not in 1848 (US3-3).
  - **Add**: "Dar un tren" with an empty Keypad dispatches `op: "add", amount: null` (US3-5).
  - **Tap count (SC-004)**: company card → "Detalles y ajustes…" → "Corregir trenes…" → "Quitar el 2" → "Al banco (oferta) · devolver $80" ≤ 5 taps.
  - **Discard unchanged**: "Descartar tren" in the operating sheet still sends the train to the game's discard destination (FR-017 regression).
- [X] T027 [P] [US3] In `tests/voice/tools.test.ts`, check that `correctTrain` is in `ACTION_TOOLS` right after `adjustMoney`, that its schema has a `company` enum of the session's companies, `op` enum ["remove","add"], `to` enum ["bank","pool","removed"] (nullable) and a nullable `amount`, and that the description includes the three Spanish examples from contracts/actions.md. Also check that a voice-resolved `correctTrain` passes through `resolve` validation like other tools (`tests/voice/resolve.test.ts`).

### Implementation for User Story 3

- [X] T028 [US3] In `src/domain/actions/schemas.ts`, add `correctTrainAction` exactly as in contracts/actions.md:
  - `company`: companyId
  - `train`: `z.string().min(1)`
  - `op`: `z.enum(["remove","add"])`
  - `to`: `z.enum(["bank","pool","removed"]).nullable()`
  - `amount`: `money.nullable()`
  - Register it in the `ActionSchema` union.
  - Note: `amount` is `z.number().int().nonnegative().nullable()`, not `money.nullable()`: `money` is positive-only and `amount: 0` (no refund) must be valid (data-model §1: integer ≥ 0).
- [X] T029 [US3] In `src/domain/actions/expand/operating.ts`, export `trainPrice` (already exported, confirm) and extract and export the unlimited-type minting from `trainToBuy` as `nextTrainAsset(game, state, trainType): AssetId | undefined`, with no behavior change. Run `tests/domain/trains.test.ts`.
  - Note: the helper is `nextTrainAsset(state, trainType)`; it does not need `game`.
- [X] T030 [US3] In `src/domain/actions/expand/manual.ts`, add the `correctTrain` handler per data-model §1 and contracts/actions.md (availability, warnings `phaseStarter` / `notOnSale` / `refundOffSupply` / `bankBroken` via `payWarnings` / `insufficientCash` via `payWarnings`, expansion):
  - **Train choice**: remove picks the highest-numbered train of the type held. add picks the lowest-numbered in the bank, or `nextTrainAsset` for an unlimited type.
  - **Refund**: to the bank, `amount ?? trainPrice(game, { trainType, variant: null, from: "bank", price: null, tradeIn: null })`. To the pool or out of the game, `amount ?? 0`, with the `refundOffSupply` warning when it is > 0.
  - **Not on sale**: warn `notOnSale` when `to === "bank"` and the type's `rustsOnPhase` is defined and `phaseReached(game, state, rustsOnPhase)`.
  - **Pool**: unavailable only when `game.discardedTrainsTo !== "pool"`, with the contract's reason.
  - **Phase starter**: `currentPhase(game, state)?.triggeredBy === type`, and after the correction no train of that type is held by a company or `pool`.
  - Depends on T023, T028, T029.
- [X] T031 [US3] In `src/domain/actions/triggers.ts`, add `export const CORRECTION_ACTIONS: ReadonlySet<string> = new Set(["correctTrain"])`. `phaseTrigger` and `privateClosingTrigger` return `[]` when `CORRECTION_ACTIONS.has(ctx.action.type)`. Update both doc comments. Depends on T024.
- [X] T032 [US3] In `src/domain/i18n/es.ts`, add the `correctTrain` summarizer with the six lines in contracts/actions.md. Resolve the refund from `events` when present, so `amount: null` shows the actual list price. Use `companyName` and `formatMoney`. Add `correctTrain` to `SELF_DESCRIBED` if the generic effects line would repeat the money. Depends on T025.
- [X] T033 [US3] Create `src/ui/sheets/TrainCorrectionSheet.tsx` ("Corregir trenes · <shortName>", contracts/ui.md §3), using `Sheet`, `Keypad` and `availabilityOf`:
  - **"Quitar un tren"**: one "Quitar el <type>" button per held asset (`trainsHeldBy`). After a pick, the destination buttons:
    - "Al banco (oferta) · devolver <list price>", with a "devolver" toggle (on by default) and an "editar…" Keypad.
    - "Al pool", only when `game.discardedTrainsTo === "pool"`.
    - "Fuera de juego".
  - **"Dar un tren"**: one button per stack type (`trainStack`) with its list price, and an optional Keypad amount (empty = null).
  - Each choice dispatches `correctTrain` at once and closes on ok.
  - Depends on T028, T030.
- [X] T034 [US3] Wire the sheet in:
  - In `src/ui/screens/Table.tsx`, add the open kind `{ kind: "trainCorrection", company }` and a "Corregir trenes…" button in `companyActions(id)` (shown when the game has trains), rendering `TrainCorrectionSheet`.
  - In `src/ui/sheets/OperateSheet.tsx`, pass `onCorrect` to `TrainsLine` (T019) to open the same sheet: add an `onCorrectTrains` prop, given by Table.
  - Depends on T019, T033.
- [X] T035 [US3] In `src/voice/tools.ts`, add `"correctTrain"` to `ACTION_TOOLS` right after `"adjustMoney"`, and add its `DESCRIPTIONS` entry with the exact text from contracts/actions.md ("Voice tool"). Make sure the entity-enum mapping covers `company`. Check `src/voice/resolve.ts` and `src/voice/prompt.ts` for any per-tool allowlist that needs the new name. Depends on T027, T028.
- [X] T036 [US3] Add voice eval cases to `eval/voice/cases.jsonl`, following the existing case format: remove to the bank with the default refund («la PRR no tenía ese dos, devolvelo al banco»), remove out of the game («sacale el tres a la B&O, fuera de juego»), and add without payment («dale un dos a la NYC sin pagar»), with their expected `correctTrain` actions. If grading needs it, extend `eval/voice/grade.ts`.
  - Note: the remove-out-of-game case uses «sacale el dos a la NYC, fuera de juego»: in the `1830-or` fixture the B&O has no 3. `grade.ts` normalizes `correctTrain` (asset id → type; a null amount = list price for remove → bank, else 0). `tests/eval/voice.test.ts` now expects 16 train cases.
- [X] T037 [US3] Regenerate the voice prompt snapshots (`npx vitest run tests/voice -u`) and review the diff: only the new tool should appear. Regenerate the eval fixtures with `npx tsx eval/voice/buildFixtures.ts`, then check that `tests/eval/voice.test.ts` passes. Depends on T035, T036.
- [X] T038 [US3] Make T023–T027 pass, then run the full `tests/domain` suite (the random-game and conservation tests must still pass).

**Checkpoint**: US3 works on its own by touch. Voice works pending the paid eval run (T053).

---

## Phase 7: User Story 4 - Scan the history by round (Priority: P3)

**Goal**: History is split into round sections, newest first. Each has a header (icon + title + "en curso" or "terminada") and an "Inicio · <title>" band. Undone boundaries open nothing.

**Independent Test**: Play SR 1, OR 1.1 and part of SR 2 in 1830. History shows "💼 Ronda de acciones 2 · en curso", "🚂 Ronda de operaciones 1.1 · terminada" and "💼 Ronda de acciones 1 · terminada", each with its entries and "Inicio" band.

### Tests for User Story 4 ⚠️

- [X] T039 [P] [US4] Create `tests/domain/rounds.test.ts` for `roundSections(game, history)` (data-model §2):
  - **Setup**: the setup group(s) form a `SETUP` section titled "Preparación" (icon ⚙).
  - **Keys and titles**: `startSR` opens `SR:1` "Ronda de acciones 1" (💼). `startOR` opens `OR:1.1` "Ronda de operaciones 1.1" (🚂). A mid-set `nextCompany` opens `OR:1.2`.
  - **Finished flag**: `finished` is true for every section but the last.
  - **Undone boundary**: an undone `startOR` stays in the SR section as a reverted group and opens no section (FR-021).
  - **Empty round**: a round whose only group is its opening group still has a section.
  - **Repeated key**: a `setTurn` back to an earlier round forms a new, separate section.
  - **Cycle games**: in RotLA the titles are "Ciclo N · Ronda de operaciones I/S" and "Ciclo N · Ronda de fusiones" (🔀).
  - **CR**: 21Moon's CR is titled "Ronda corporativa N" (🏛).
  - **Coverage**: every group id appears in exactly one section, in seq order.
- [X] T040 [P] [US4] In `tests/domain/perf.test.ts`, `roundSections` over a 300-group random game finishes in under 20 ms in Node, measured like the existing perf cases.
- [X] T041 [P] [US4] In `tests/ui/history.test.tsx`, in a 1830 session through SR 1 → OR 1.1 → SR 2:
  - History renders `<section aria-label="Ronda de acciones 2">` first, with "· en curso", then OR 1.1 and SR 1 with "· terminada".
  - Each section ends with the band "Inicio · <title>".
  - Entries inside each section are newest first.
  - Undo, "Deshacer hasta acá" and the breakdown still work inside sections.
  - After undoing the `startSR` of SR 2, the SR 2 section disappears and the undone entry shows struck through inside OR 1.1.

### Implementation for User Story 4

- [X] T042 [US4] In `src/domain/events/reduce.ts`, export `advanceTurn`, with no behavior change.
- [X] T043 [US4] In `src/domain/i18n/es.ts`, add `roundTitleEs(game, turn)` and `ROUND_ICON`:
  - Icons: PRIVATES 📜 "Privadas", SR 💼, OR 🚂, MR 🔀, CR 🏛, SETUP ⚙ "Preparación".
  - Titles: "Ronda de acciones N", "Ronda de operaciones S.I", "Ronda de fusiones N", "Ronda corporativa N".
  - For cycle games, put "Ciclo N · " in front and give the OR as "I/S" (matching `cycleRoundLabel`).
  - Depends on T039.
- [X] T044 [US4] Create `src/domain/ledger/rounds.ts` with `roundSections(game: GameDefinition, history: readonly GroupHistory[]): RoundSection[]` per data-model §2 and research R7:
  - Sort by `group.seq`.
  - Fold only the `turnAdvance` events of active (non-reverted) groups through `advanceTurn`, starting from `initialState(game, []).turn` (the turn does not depend on players).
  - Key = `SR:n` / `OR:s.i` / `MR:n` / `CR:n` / `PRIVATES` / `SETUP`. Setup groups (`isSetup`) before any round count as `SETUP`.
  - Open a new section only when an active group changes the key. Reverted groups join the current section.
  - Return `{ key, round, title, icon, startGroupId, groupIds, finished }`.
  - Depends on T042, T043.
  - Note: a reverted entry right after setup lands in the first round (e.g. "Privadas"), not in "Preparación": the setup itself opens that round. Covered by a test in `tests/domain/rounds.test.ts`.
- [X] T045 [US4] In `src/ui/screens/History.tsx`, compute `roundSections(meta.game, groupHistory(log))` in a `useMemo` and render the sections newest first, per contracts/ui.md §4. Each section is a `<section aria-label={title}>` with:
  - A header `<h2 className="round-header">{icon} {title} · {finished ? "terminada" : "en curso"}</h2>`.
  - Its `HistoryItem`s, newest first, unchanged.
  - A footer `<p className="round-start">Inicio · {title}</p>`.
  - Keep the violations banner, the empty state, `UndoRangeSheet` and `UndoToast` as they are. Depends on T044.
- [X] T046 [P] [US4] In `src/ui/styles/components.css`, add `.round-header` and `.round-start`: distinct bands (background, border and weight), readable in light and dark themes, and not relying on color alone (they carry the icon and the text). Keep the header from overlapping the entries on phone width.
- [X] T047 [US4] Make T039–T041 pass, and confirm the existing `tests/ui/history.test.tsx` and `tests/ui/undoRange.test.tsx` cases still pass.

**Checkpoint**: All five stories work on their own.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Docs, gates, and validation across stories.

- [X] T048 [P] Update `docs/spec.md` (research R10):
  - §6: `correctTrain` is a correction that never triggers a phase or closes privates.
  - §8.3: the three new voice examples.
  - §9.1 Table: the player sheet's "Jugada" and "Ajustes", the SR quick sell, the operating menu's trains line, and "Corregir trenes".
  - §9.1 History: the round sections and the round-end titles.
- [X] T049 [P] Review every new Spanish string for voseo and Uruguayan wording ("Corregí", "devolvé", "acá"), consistent with `src/domain/i18n/es.ts` (FR-025).
- [X] T050 Run `npm run typecheck`, `npm run lint` and `npm test`. All must pass except the pre-existing failures recorded in T001.
  - Note: typecheck and lint clean; 1711/1712 tests pass. The only failure is the pre-existing flaky RotLA replay perf test recorded in T001; it passes alone.
- [X] T051 Run `npm run build`, then any local Playwright e2e that touches the Table or History (`npm run test:e2e`). Rebuild first so the `:4173` preview does not serve a stale `dist`.
  - Note: `npm run build` then `npx playwright test`: 38/38 passed.
- [ ] T052 Manual check on a phone-sized window, following [quickstart.md](quickstart.md) §2 (steps 1–6, 1830 and RotLA, including the SC-005 timing in step 5), including the regression watch in §3. **Needs the user.**
- [ ] T053 Run the voice eval `npm run eval:voice` with the paid key and compare against the T001 baseline. The new `correctTrain` cases must resolve, and overall accuracy must not drop. **Needs the user's API key.**
- [ ] T054 Mark the spec status as "Implemented" in `specs/011-action-menus-ux/spec.md` once T050–T053 are done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: empty. The stories can start after T001.
- **User stories (Phases 3–7)**: independent of one another, except T034, which needs US2's `TrainsLine` (T019) for the "Corregir…" link. Without US2, T034 wires only the company "Ajustes" entry.
- **Polish (Phase 8)**: after the stories you intend to ship.

### Shared-file notes (sequence, not blockers)

- `src/domain/i18n/es.ts` is edited by T004 (US5), T018 (US2), T032 (US3) and T043 (US4). Do these in order, not in parallel.
- `src/ui/styles/components.css`: T014, T021 and T046 touch different selectors. They are safe in any order but not truly parallel when done together.
- `src/ui/screens/Table.tsx`: T013 (US1), then T034 (US3).
- `src/ui/sheets/OperateSheet.tsx`: T020 (US2), then T034 (US3).
- `tests/domain/summaries.test.ts`: T002, T016 and T025 add separate `describe` blocks.

### Within each story

- Tests first (they must fail), then domain, then i18n, then UI, then wiring.
- In US3: schema (T028) → helper export (T029) → handler (T030) → triggers (T031) → summaries (T032) → UI (T033, T034) → voice (T035–T037).

### Parallel Opportunities

- US5: T002 and T003.
- US1: T006, T007 and T008 (tests). T014 (CSS) next to T010–T012.
- US2: T016 and T017. T021 next to T018–T020.
- US3: T023–T027 (five test files). T028 and T029 (different files).
- US4: T039, T040 and T041. T042 and T043 (different files). T046 next to T044 and T045.
- Polish: T048 and T049.
- With more than one person, the stories can run side by side after T001, minding the shared-file notes.

---

## Parallel Example: User Story 3

```bash
# Tests first, all different files:
Task: "correctTrain expansion/availability/warnings/undo in tests/domain/correctTrain.test.ts"   # T023
Task: "Trigger exemption in tests/domain/trains.test.ts"                                      # T024
Task: "correctTrain summaries in tests/domain/summaries.test.ts"                              # T025
Task: "Correction sheet flows and tap count in tests/ui/trainCorrection.test.tsx"             # T026
Task: "Voice tool schema in tests/voice/tools.test.ts"                                        # T027

# Then, in parallel:
Task: "correctTrainAction schema in src/domain/actions/schemas.ts"                            # T028
Task: "Export nextTrainAsset in src/domain/actions/expand/operating.ts"                      # T029
```

## Parallel Example: User Story 1

```bash
Task: "Player sheet sections/sell/buy in tests/ui/playerSheet.test.tsx"   # T006
Task: "Tap counts in tests/ui/taps.test.tsx"                              # T007
Task: "RotLA treasury buy in tests/ui/rotla.test.tsx"                     # T008
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. T001 baseline.
2. Phase 4 (US1): the player sheet with "Jugada" and "Ajustes", quick sell, and the sell and buy views.
3. **Stop and validate**: quickstart §2 step 1, and T006–T008 green.

### Incremental Delivery (plan order)

1. US5: titles only, no new UI.
2. US1: the MVP.
3. US2: the trains line.
4. US3: correction (domain → UI → voice). The eval run is a user task.
5. US4: History sections.
6. Polish: docs, gates, manual check, eval.

Each story ships on its own without breaking the earlier ones.

---

## Notes

- [P] = different files, no dependencies on incomplete tasks.
- Do not commit automatically. Leave the changes uncommitted for review (project preference).
- T052 and T053 need the user (a manual check on a device, and the paid API key).
- Verify that tests fail before implementing (constitution VI).
