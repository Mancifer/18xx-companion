---

description: "Task list for feature 013 — UI Readability Polish and RotLA Major Names"
---

# Tasks: UI Readability Polish and RotLA Major Names

**Input**: Design documents from `specs/013-ui-readability-polish/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md), [contracts/game-data.md](contracts/game-data.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first domain logic (`mentions`, `companyTrains`, `shareSources`), and SC-001 and SC-005 are checked by tests. Write each test task first, and see it fail before doing the matching implementation task.

**Organization**: Tasks are grouped by user story in spec priority order: US1 (P1), US2 and US3 (P2), US4 (P3). Phase 2 extends `CompanyBadge` for US1. US1 is the MVP. The `MergerSheet` site listed in research R2 is handled in US4 (T042), together with the identity names it shows.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Path Conventions

Single-project PWA: `src/`, `tests/`, `docs/`, `eval/` and `e2e/` at the repository root.

## Testing notes

- **Domain tests** use `TestSession` and `makePlayers` from `tests/helpers/dispatch.ts`. Stock
  helpers (`par`, `buy`, `sell`) are in `tests/helpers/stock.ts`, and company seeding is
  `seedCompany` in `tests/helpers/seed.ts`. RotLA has `rotlaSession` and `seedCompany` in
  `tests/helpers/rotla.ts`.
- **UI tests** use `openSeededTable({ game, actions })` and `openMenuItem` from
  `tests/ui/helpers.tsx`. A badge is `.company-badge`, and its `style.background` is the
  company's `color`.
- **Plain text**: badges show the same text as the plain string, so existing assertions on
  `textContent` and accessible names should keep passing. A failure there is a bug, not an
  outdated test, unless the task says that text changes (trains line, stock availability line).
  - Correction (implementation, 2026-10-15): Testing Library's `getByText` and `findByText` read
    only an element's own text nodes, so whole-line assertions on lines that now contain a badge
    stopped matching. The new `byLine()` helper in `tests/ui/helpers.tsx` matches the innermost
    element by its full `textContent`. 57 lines of existing assertions in 10 UI test files were wrapped with
    it. Assertions on `textContent` and accessible names did not change.
  - The direct sites also cover the "Después: …" next-company line on the Table, which research R2
    missed. It is done with a `CompanyName` helper, exported next to `CompanyBadge`.
- **Snapshots**: update voice snapshots only with
  `npx vitest run tests/voice -u`, after T041 (that is T043), and review the diff (names and
  aliases only).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Record a baseline, so pre-existing failures are not blamed on this feature.

- [X] T001 Create or switch to a feature branch `013-ui-readability-polish`. The repository is on `main`. Don't commit: changes stay uncommitted for review. Then run `npm run typecheck`, `npm run lint` and `npm test` on the current tree, and record any pre-existing failures in a note under this task. A known flaky case is the `tests/domain/perf.test.ts` 1500-group RotLA replay, which is slow under full-suite load.
  - Note (2026-10-15): on branch `013-ui-readability-polish` (from `720ea35`). Typecheck and lint clean, 1752/1752 tests pass (89 files). No pre-existing failures.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `CompanyBadge` extensions (the plain `title` hint stays, per FR-006) from [contracts/ui.md](contracts/ui.md) "CompanyBadge (extended)" and [research.md R3](research.md#r3-badge-legibility-in-text-and-in-both-themes-fr-004-edge-cases). US1 and US4 render badges with them.

**⚠️ CRITICAL**: US1 UI work needs this phase. US2, US3 and US4 do not.

- [X] T002 Create `tests/ui/companyBadge.test.tsx`. Render `CompanyBadge` directly with `getBuiltInGame("1830")`'s PRR definition and check:
  - (a) Without `label`, the text is `shortName`, and the `title` is the company name.
  - (b) With `label="Pennsylvania"`, the text is `"Pennsylvania"`, and the background and color are still the company's.
  - (c) With `name="X"`, the `title` is `"X"`.
  - (d) `size="inline"` gives the class `company-badge-inline`.
- [X] T003 Extend `src/ui/components/CompanyBadge.tsx` so that T002 passes:
  - Add an optional `label?: string`. The visible text is `label ?? company.shortName`.
  - Add `"inline"` to `size`.
  - Keep `title={name ?? company.name}`.
- [X] T004 [P] In `src/ui/styles/components.css`:
  - Give `.company-badge` `box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent)`.
  - Add `.company-badge-inline` with `font-size: 0.9em; padding: 0 0.35em; line-height: 1.3; vertical-align: baseline;` (research R3).

---

## Phase 3: User Story 1 - Recognize companies at a glance everywhere (Priority: P1) 🎯 MVP

**Goal**: every company mention in the history, the income summary and the other screens from [research.md R2](research.md#r2-inventory-of-plain-text-company-mentions-fr-001-sc-001) is a colored badge, and plain-text consumers are unchanged.

**Independent Test**: In 1830, par PRR and NYC, buy shares and run an OR. Open History and Ingresos de las ORs, and check that every PRR and NYC mention is a `.company-badge` with the company color while the line's `textContent` is unchanged.

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] Create `tests/domain/mentions.test.ts` for `src/domain/i18n/mentions.ts`, following [data-model.md](data-model.md) "Mention":
  - (a) `markMention("PRR", "PRR")` equals `"\uE000PRR\uE002PRR\uE001"`.
  - (b) `splitMentions("Ana compra 1 " + markMention("PRR","PRR") + " de la IPO")` returns `["Ana compra 1 ", { company: "PRR", text: "PRR" }, " de la IPO"]`.
  - (c) Two adjacent mentions, and a mention at the start and at the end, give no empty strings.
  - (d) `stripMentions` of (b) equals `"Ana compra 1 PRR de la IPO"`.
  - (e) Malformed markers follow data-model.md:
    - `"x \uE000PRR\uE002PRR"`, with no terminator, splits to `["x PRR"]`.
    - `"x \uE000PRR"`, with no separator, splits to `["x PRR"]`.
    - Neither output contains U+E000, U+E001 or U+E002.
  - (f) A string with no markers is returned as `[text]` and stripped unchanged.
- [X] T006 [P] [US1] In `tests/domain/summaries.test.ts`, add a `describe("company mentions (feature 013)")` block, using an 1830 `TestSession` with PRR parred by Ana and NYC floated:
  - (a) With `{ ...ctx, marks: true }`, `summaryEs` of a buyShare contains `markMention("PRR","PRR")`.
  - (b) A `transferMoney` from `company:PRR` contains a mention whose text is `"PRR"`, and the sentence still starts with "PRR".
  - (c) A holder `ipo:PRR` gives "la IPO de " followed by a PRR mention.
  - (d) In a RotLA merger summary (`mergeCompanies` into UNI with `identity: "alt"`), the full-name parts are mentions whose text is the full or alt name (`"Unlimited"`).
  - (e) `movementLineEs` and `balanceLineEs` with `marks` contain mentions for the shares, price, status and company holder lines.
  - (f) Without `marks`, none of the outputs above contains `\uE000`, `\uE001` or `\uE002`.
  - (g) For each case, `stripMentions(marked) === plain`.
- [X] T007 [P] [US1] In `tests/domain/randomGames.test.ts`, add a property over the existing seeded walks (each built-in game, and the RotLA walks). For every effective group, sampling every 10 steps to stay fast:
  - `stripMentions(summaryEs(g.action, { ...ctx, marks: true }, g.events)) === summaryEs(g.action, ctx, g.events)`;
  - the same for each `movementLineEs` and `balanceLineEs` of the group's breakdown, built with `entryBreakdown` from `src/domain/ledger/breakdown.ts` the way `src/ui/screens/History.tsx` calls it.
- [X] T008 [P] [US1] Create `tests/ui/richText.test.tsx`:
  - (a) `<RichText game={1830} text={"Ana compra " + markMention("PRR","PRR")} />` renders one `.company-badge` with text "PRR" and PRR's background, and the container `textContent` is "Ana compra PRR".
  - (b) An unknown id (`markMention("ZZZ","ZZZ")`) renders plain "ZZZ" with no badge.
  - (c) A plain string renders unchanged.
- [X] T009 [P] [US1] In `tests/ui/history.test.tsx`, add tests seeded with an 1830 game (par PRR by Ana, buys, `startOR`, a PRR dividend):
  - (a) The PRR entry's summary holds a `.company-badge` with text "PRR", and the line's `textContent` equals the previous plain text, so existing assertions still pass.
  - (b) After expanding the entry, the movements and balances lines contain badges.
  - (c) A reverted entry (undo the latest) still renders inside `<s>` and contains the badge.
- [X] T010 [P] [US1] In `tests/ui/income.test.tsx`, add a test: in the expanded movements of a player who received a PRR dividend, the label contains a PRR `.company-badge`.
- [X] T011 [P] [US1] In `tests/ui/operate.test.tsx`, add tests:
  - (a) The operate view's recent-entries list shows a company badge.
  - (b) The out-of-turn notice ("Fuera de turno: le toca a …") shows the current company as a badge.
  - (c) The undo toast after an action naming PRR contains a PRR badge.
- [X] T012 [P] [US1] In `tests/ui/voice.test.tsx`, add a test: the confirmation card for a `buyShare` proposal on PRR shows a PRR badge, and `proposal.summaryEs` stays plain (no `\uE000`).
- [X] T013 [P] [US1] Add direct-site tests:
  - `tests/ui/taps.test.tsx`, a new `describe("company badges on the Table (feature 013)")`:
    - (a) With 1830 PRR floated, open PRR's company actions (`companyActions` in `src/ui/screens/Table.tsx`) and tap "Cerrar compañía". The dialog found with `findByRole("dialog", { name: "Cerrar PRR" })` has a PRR `.company-badge` in its title. The accessible name stays "Cerrar PRR" because the title is linked through `aria-labelledby`.
    - (b) In an OR, the "Operar PRR" round-control button contains a PRR badge, and its accessible name is unchanged.
  - `tests/ui/results.test.tsx`: the company column shows badges.
  - `tests/ui/market.test.tsx`: after selecting a token, the prompt shows the badge.
  - `tests/ui/stock.test.tsx` (SC-001, spec US1 scenario 4): in a 21Moon corporate round (`game: "21moon"`, a floated company, `state.turn.round === "CR"`; see `tests/domain/corporateRound.test.ts` for the actions that reach it), another floated company's trader row shows that company as a `.company-badge`. The buttons' accessible names ("IPO {short}", "Pool {short}") are unchanged.

### Implementation for User Story 1

- [X] T014 [US1] Create `src/domain/i18n/mentions.ts` with `markMention`, `splitMentions` and `stripMentions`, with the encoding `"\uE000" + company + "\uE002" + text + "\uE001"` (contracts/ui.md, data-model.md "Mention"). T005 must pass.
- [X] T015 [US1] In `src/domain/i18n/es.ts`:
  - Add `readonly marks?: true` to `SummaryContext`.
  - Make the internal `name`, `companyName` and `fullName` helpers wrap company mentions with `markMention` when `ctx.marks`. `name` covers `company:` holders, and `ipo:X` becomes "la IPO de " + mention. Do not change the exported `holderName`.
  - Check `lineHolder` and every other site that reads a short or full name from `ctx.game.companies` directly, and route them through the helpers.
  - T006 must pass, and `tests/voice` must pass with no snapshot change.
- [X] T016 [US1] Create `src/ui/components/RichText.tsx` per [contracts/ui.md](contracts/ui.md) "RichText":
  - Read the game from the `game` prop, or else from `useContext(SessionContext)` (`src/app/contexts.ts`) and the store's meta, without requiring a session.
  - Render the plain parts as text and each mention as `<CompanyBadge size="inline" label={m.text} />`, or as plain text when the id is unknown.
  - T008 must pass.
- [X] T017 [US1] In `src/ui/screens/History.tsx`:
  - Build the `SummaryContext` with `marks: true`.
  - Render the summary, the struck original, the movements (`movementLineEs`) and the balances (`balanceLineEs`) through `RichText`.
  - Any `title` or `aria-label` built from these strings uses `stripMentions`.
  - T009 must pass.
- [X] T018 [P] [US1] In `src/ui/sheets/IncomeSheet.tsx`, render the movement labels (`summaryEs(m.action, { ...ctx, marks: true })`) through `RichText`. T010 must pass.
- [X] T019 [US1] In `src/ui/sheets/OperateSheet.tsx`:
  - Render the recent entries list through `RichText` with `marks: true`.
  - In the out-of-turn notice, replace the `shortName` text with `<CompanyBadge company={…} size="inline" />`, falling back to the id.
  - T011 (a) and (b) must pass.
- [X] T020 [P] [US1] Render `summaryEs` and `undoneEs` through `RichText` with `marks: true` in `src/ui/components/UndoToast.tsx`, `src/ui/components/UndoRangeSheet.tsx` and `src/ui/sheets/BatchSheet.tsx`. Any `aria-label` or `role="status"` text that is set as a string attribute stays plain with `stripMentions`. T011 (c) must pass.
- [X] T021 [P] [US1] In `src/ui/components/ConfirmationCard.tsx`, render `proposalSummaryEs(proposal.action, { game, players, state, marks: true }, proposal.events)` through `RichText` instead of `proposal.summaryEs`. Leave `src/voice/resolve.ts` and `src/app/voiceController.ts` untouched. T012 must pass.
- [X] T022 [US1] In `src/ui/screens/Table.tsx`, replace the `companyName(id)` text with `<CompanyBadge size="inline" />` in:
  - the confirmation titles "Administración de …", "Quiebra de …" and "Cerrar …". The `confirm` variant of the `Open` union (about line 62) declares `title: string`, so widen it to `title: ReactNode`. `Sheet` already takes a `ReactNode` title. If anything else reads `title` as a string (for example an `aria-label`), give it the plain `companyName(id)` text;
  - the "Operar …" button.
  
  T013 (Table part) must pass.
- [X] T023 [P] [US1] Replace the short-name text with `CompanyBadge size="sm"` (keeping `aria-label`s plain) in:
  - `src/ui/screens/Results.tsx`: the `short(id)` uses;
  - `src/ui/screens/Market.tsx`: the move prompt at about line 116.
  
  T013 (Results and Market parts) must pass.
- [X] T024 [P] [US1] In `src/ui/sheets/StockSheet.tsx`, make `traderName` render a `CompanyBadge size="sm"` for `company:` traders in a CR. The `aria-label`s on the buttons still use the plain short name, and `tests/ui/stock.test.tsx` plus the e2e `trade()` selectors (`"IPO Ana"`) stay valid.

**Checkpoint**: US1 works. Run `npx vitest run tests/domain tests/ui tests/voice` with no snapshot change.

---

## Phase 4: User Story 2 - See a company's trains as cards (Priority: P2)

**Goal**: each train is a card on the company card and in the operate view, with rusted and over-limit cues as text ([research.md R4](research.md#r4-train-cards-fr-007fr-011)).

**Independent Test**: Give PRR a 2-train and a 3-train. On the Table, PRR's card shows two `listitem` cards, "2" then "3". The operate view shows "Trenes 2/4", the two cards, and "Corregir…".

### Tests for User Story 2 ⚠️

- [X] T025 [P] [US2] Create `tests/domain/companyTrains.test.ts` for `companyTrains(game, state, company)` (data-model.md "Train card"):
  - (a) Trains bought out of order come back sorted by definition order, then number, with `label` equal to `displayName`.
  - (b) A rusted train kept by RotLA Resourceful (`RES`, `keepsRustedTrains`) has `rusted: true`. Reuse the setup in `tests/domain/traits.test.ts:111-119`: `seedCompany(s, "RES", { …, trains: ["train:2:1", "train:2:2"] })`, then reach the first 4.
  - (c) `count`, `limit` and `over` match `countedTrains` and `trainLimitFor`, including `over: true` past the limit.
  - (d) No trains gives `cards: []`.
  - (e) `trainsLineEs` still returns exactly its current strings for the same states (pin 3 examples taken from the current output before refactoring).
- [X] T026 [P] [US2] Update `tests/ui/operate.test.tsx` (around lines 310–330), replacing the `/^Trenes 1\/4 · 2/` text assertions:
  - (a) With no trains, `trains-line` shows "Sin trenes".
  - (b) With a 2-train, it shows "Trenes 1/4" and one `listitem` named "2" inside `role="list"` named "Trenes".
  - (c) Over the limit, it shows "sobre el límite".
  - (d) The "Corregir…" button is still inside `trains-line` (`tests/ui/trainCorrection.test.tsx` must still pass).
- [X] T027 [P] [US2] Add a Table test (in `tests/ui/operate.test.tsx` or `tests/ui/taps.test.tsx`): PRR's company card contains a `role="list"` named "Trenes" with one `listitem` per train in type order, and the old "Trenes: " text is gone. In a RotLA test (`tests/ui/rotla.test.tsx`), a rusted RES train's card contains "oxidado".

### Implementation for User Story 2

- [X] T028 [US2] In `src/domain/i18n/es.ts`, add `companyTrains(game, state, company)` returning `{ cards: { asset, label, rusted }[], count, limit, over }`, reusing the ordering and rusted test from the current `trainsLineEs`. Rebuild `trainsLineEs` on top of it with identical output. T025 must pass.
- [X] T029 [US2] Create `src/ui/components/TrainCards.tsx` per [contracts/ui.md](contracts/ui.md) "TrainCards":
  - Render `<span role="list" aria-label="Trenes" className="train-cards train-cards-{size}">`.
  - Render one `<span role="listitem" className="train-card[ rusted]">` per card, with the label and, when rusted, `<span className="train-card-note">oxidado</span>`.
  - Read the session through `useSession`.
- [X] T030 [P] [US2] In `src/ui/styles/components.css`:
  - Add `.train-cards` (`display: flex; flex-wrap: wrap; gap`).
  - Add `.train-card`: a portrait rectangle with `min-width` about 2em and a `max-width`, a border using the existing border token, a raised surface background, a bold label, `border-radius: var(--radius-sm)`, and long labels wrapping.
  - Add `.train-card.rusted`: dashed border and muted label.
  - Add `.train-card-note`: small text.
  - Add `sm` and `md` sizes.
  - Check that there is no horizontal overflow at 360 px width (FR-011).
- [X] T031 [US2] Rework `src/ui/components/TrainsLine.tsx` per contracts/ui.md "TrainsLine":
  - Keep `data-testid="trains-line"`.
  - Show "Sin trenes" (warn) when there are no trains.
  - Otherwise show the header "Trenes {count}/{limit}" (or "Trenes {count}" with no limit), then `<TrainCards size="md" />`, then "sobre el límite" (warn) when `over`, then "Corregir…" when `onCorrect` is set.
  - Use `companyTrains`.
  - T026 must pass.
- [X] T032 [US2] In `src/ui/components/CompanyCard.tsx`, replace the `Trenes: …` text with `<TrainCards company={companyId} size="sm" />`. Keep "Préstamos: N" as text, and remove the now-unused `trains` mapping. T027 must pass.

**Checkpoint**: US2 works independently of US1.

---

## Phase 5: User Story 3 - Read share availability clearly when buying (Priority: P2)

**Goal**: separate IPO, Pool and Tesorería tiles with count and price. Empty sources say "agotada". Taps are unchanged ([research.md R5](research.md#r5-buy-shares-view-fr-012fr-014)).

**Independent Test**: In an 1830 SR with PRR floated and shares in the IPO and the pool, PRR's stock view shows `source-ipo` and `source-pool` tiles with the count and "a $X". Buying out the IPO shows "0 agotada".

### Tests for User Story 3 ⚠️

- [X] T033 [P] [US3] Create `tests/domain/shareSources.test.ts` for `shareSources(ctx, company)` (data-model.md "Share source"). Quote these visibility rules in the test names:
  - "`ipo`: hidden when `defaultBuySource === "treasury"`, or when the IPO is empty and the treasury holds shares"
  - "`treasury`: shown when it holds shares, or always when `defaultBuySource === "treasury"`"
  - "`pool`: always shown"
  
  Cases:
  - (a) 1830 PRR parred: `[ipo, pool]`, with units and prices equal to `unitsOf` and `sharePrice`.
  - (b) An 1830 IPO bought out: `ipo` still listed with `units: 0`.
  - (c) A RotLA major or minor (`defaultBuySource: "treasury"`): `[treasury, pool]`, with no `ipo`.
  - (d) The company holds treasury shares and the IPO is empty: `ipo` hidden, `treasury` shown. Use 1830 PRR with `seedCompany` from `tests/helpers/seed.ts`, with `holders` placing every IPO unit: `{ "player:p1": 6, "player:p2": 2, "company:PRR": 2 }` (`holders` takes units from the IPO for any holder key).
  - (e) The order is always ipo, treasury, pool.
- [X] T034 [P] [US3] In `tests/ui/stock.test.tsx`, add tests:
  - (a) A floated company shows `data-testid="source-ipo"` with "IPO", the count and "a $…", and `source-pool` the same way.
  - (b) Buying until the IPO is empty shows "agotada" in `source-ipo`, with the class `empty`.
  - (c) The old inline "IPO n · Pool n" line and the trailing "Pool a $X" paragraph are gone.
  - (d) The trader-row buttons ("IPO Ana", "Pool Ana") work as before: one tap buys.
  
  In `tests/ui/rotla.test.tsx`, check that the `source-treasury` tile shows for a RotLA company and `source-ipo` does not.

### Implementation for User Story 3

- [X] T035 [US3] In `src/domain/actions/expand/stock.ts`, add `shareSources(ctx, company)` returning `{ source, units, price }[]` in the order ipo, treasury, pool, with the visibility rules quoted in T033. Move the `showIpo` logic out of `StockSheet` and into it. T033 must pass.
- [X] T036 [US3] In `src/ui/sheets/StockSheet.tsx`:
  - Replace the muted "IPO … · Pool … · Tesorería … · IPO a $…" span with `<ul className="share-sources" aria-label="Acciones disponibles">`.
  - Render one `<li className="share-source[ empty]" data-testid="source-{source}">` per `shareSources` item. Each holds the label ("IPO", "Pool", "Tesorería"), the units (plus " agotada" when 0), and "a {money(price)}" or "—".
  - Keep the stepper row (−, count, +) below it.
  - Remove the trailing `Pool a $X` paragraph.
  - Use `shareSources` for the IPO and treasury button visibility in the trader rows, so the behavior is unchanged.
- [X] T037 [P] [US3] In `src/ui/styles/components.css`:
  - Add `.share-sources`: a grid of up to 3 equal columns that wraps on narrow screens.
  - Add `.share-source`: a bordered tile, the label small and muted, the units large and bold, the price small.
  - Add `.share-source.empty`: muted.
  
  T034 must pass.

**Checkpoint**: US3 works independently of US1 and US2.

---

## Phase 6: User Story 4 - Real second names for RotLA majors (Priority: P3)

**Goal**: the real second identities and aliases are in place, and the placeholders and the "unverified" flag are gone ([contracts/game-data.md](contracts/game-data.md)).

**Independent Test**: In RotLA with Landmarks, the merger sheet lists all 8 pairs. Merging into FED with the alt identity shows "Firm" on the card. No "… II" appears anywhere.

### Tests for User Story 4 ⚠️

- [X] T038 [P] [US4] Update `tests/games/rotla.test.ts`:
  - Change the AUT and LGE expectations at lines 172–173 to `altName: "Alliance"` and `"LLC"`.
  - Add a table test asserting all 8 pairs from contracts/game-data.md: `name`, `altName` and `altAliases` for CON, UNI, SYS, INT, FED, EXM, AUT and LGE, with short names and colors unchanged.
  - Assert `verification.companies === "verified"`.
  - Assert no company's `altName` ends with " II".
- [X] T039 [P] [US4] Update `tests/games/customGame.test.ts:81` to expect `"Inc."`.
- [X] T040 [P] [US4] In `tests/ui/rotla.test.tsx`, add tests:
  - (a) The merger "into" choices include the badge and the "Federation / Firm" and "International / Inc." texts.
  - (b) After a `mergeCompanies` into FED with `identity: "alt"`, FED's company card shows "Firm" (`.company-alt-name`).
  - (c) With Landmarks, AUT shows "Authority / Alliance" and LGE shows "League / LLC".

### Implementation for User Story 4

- [X] T041 [US4] In `src/domain/games/grotla.ts`:
  - Set `altName` and `altAliases` per [contracts/game-data.md](contracts/game-data.md):
    - INT "Inc.": inc, ink, incorporated.
    - FED "Firm": firm, firma.
    - EXM "Enterprise": enterprise, empresa.
    - AUT "Alliance": alliance, alianza.
    - LGE "LLC": llc, ele ele ce.
    - CON, UNI and SYS are unchanged.
  - Change the doc comments that mention "unverified placeholders" to cite "the user's copy (2026-10-15)".
  - Set `verification.companies: "verified"` and drop its placeholder comment.
  - T038 and T039 must pass.
- [X] T042 [US4] In `src/ui/sheets/MergerSheet.tsx`, render each "into" button as `<CompanyBadge company={c} size="sm" /> {c.name}{c.altName ? \` / ${c.altName}\` : ""}` instead of the `shortName · ` text. Keep the identity buttons ("Union", "Unlimited") as they are. T040 and the existing `tests/ui/rotla.test.tsx` identity tests must pass.
- [X] T043 [US4] Regenerate the voice snapshots with `npx vitest run tests/voice -u`. Review the diff in `tests/voice/__snapshots__/prompt-rotla-*.txt` and `tools-rotla-*.json`: only the RotLA second names and aliases may change. Then run `npx vitest run tests/voice` clean.
- [X] T044 [US4] Regenerate the eval fixtures with `npx tsx eval/voice/buildFixtures.ts`, and check that the `eval/voice/fixtures/rotla-*.json` diff only touches `altName` and `altAliases`. Then add two cases to `eval/voice/cases.jsonl`, following the format of `rl-mr-merge-02` (line 82):
  - `rl-mr-merge-03`: "Express y Tunneling se fusionan en Firm" → `{ type: "mergeCompanies", a: "EXP", b: "TUN", into: "FED", identity: "alt" }`, tags `["rotla","merger","alt-identity"]`, `heldout: true`.
  - `rl-mr-merge-04`: "Express y Tunneling se fusionan en Inc" → `into: "INT", identity: "alt"`, `heldout: false`.
  
  Run `npx vitest run tests/eval` clean.
- [X] T045 [P] [US4] In `specs/004-railways-lost-atlas/research.md` R14, move the "Major second identities" and "Second identities of the expansion majors" rows to the "Resolved by the user (2026-10-15)" list with the 8 pairs, citing feature 013.
- [ ] T046 [US4] Run the paid voice eval: `npm run eval:voice` with the current default model (gemini-3.6-flash). The merger alt-identity cases (`rl-mr-merge-02`, `-03`, `-04`) must resolve correctly, and overall accuracy must be no lower than `eval/voice/results/2026-10-13-gemini-3.6-flash.json`. Record the result file name here. Needs the user's API key (Constitution VI gate before merge).

**Checkpoint**: US4 is done. No "… II" appears in `src/`, `tests/` or `eval/` (`grep -rn " II\"" src tests eval`).

---

## Phase 6b: User Story 5 - The market shows only companies still in play (Priority: P3)

*Added 2026-10-15, after testing.* The polish tasks below (T047–T050) ran before this phase. T055 re-runs their checks.

**Goal**: the Market screen leaves out the tokens of closed companies, and undo brings them back ([research.md R8](research.md#r8-market-without-closed-companies-fr-020fr-022), [contracts/ui.md](contracts/ui.md) "Market: companies in play only").

**Independent Test**: In 1830, close a floated PRR. The Market shows no PRR token, and NYC's is unchanged. Undo the close, and PRR is back on its cell.

### Tests for User Story 5 ⚠️

- [X] T052 [P] [US5] In `tests/ui/market.test.tsx`, add a `describe("closed companies (feature 013, US5)")` block. Use the file's `startSR` and `par` helpers, and reach a close with `{ type: "closeCompany", company: "PRR" }`:
  - (a) 1830, PRR and NYC parred, then PRR closed: on the Market, `queryByRole("button", { name: "Ficha PRR" })` is null, both on the grid and in the "Sin ficha en el mercado" section, and "Ficha NYC" is still on its cell.
  - (b) Undo the close from the toast or with `undoLast` through History: "Ficha PRR" is back in the same cell as before the close.
  - (c) 21Moon VH in receivership (`{ type: "enterReceivership", company: "VH" }`; see `tests/ui/operate.test.tsx:163` for the setup): "Ficha VH" is still shown (FR-022).
  - (d) RotLA: after `launchCompany` EXP and TUN, a `setTurn` to MR and `mergeCompanies` into UNI (see the "Merger sheet (US7)" helpers in `tests/ui/rotla.test.tsx`), the Market strip has no "Ficha EXP" or "Ficha TUN", has "Ficha UNI", and the "Cerrada" cell is still drawn (`data-testid="market-strip"`, aria-label starting "Casilla cerrada").

### Implementation for User Story 5

- [X] T053 [US5] In `src/ui/screens/Market.tsx`:
  - Add `const inPlay = (c: CompanyDef) => state.companies[c.id]?.status !== "closed";`.
  - Apply it in `tokensAt`, before the sort, and in `unplaced`.
  - If `selected` names a company that is no longer in play, clear the selection (for example, `useEffect` on `state`, or derive `const active = selected && inPlay(...) ? selected : null` and use `active` for the prompt and for moves).
  - T052 must pass, and the existing market tests must still pass.
- [X] T054 [P] [US5] In `docs/spec.md` §9.1, item 8 "Market view": add that companies whose status is closed are not shown, and that a correction to their price goes through the manual actions.
- [X] T055 [US5] Re-run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e`, and compare with the T049 and T050 notes. Leave the changes uncommitted.
  - Note (2026-10-15): all clean. 1819/1819 tests pass in 94 files (T049 had 1815, plus the 4 US5 tests). The build passes, and E2E 38/38 pass.

**Checkpoint**: US5 is done. Closed companies are gone from the Market in every built-in game (SC-007).

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T047 [P] Update `docs/spec.md`:
  - §9.1 (Screens): note that company mentions in History, Ingresos, toasts and the confirmation card are colored badges.
  - The Operate sheet item at about line 442: the trains line becomes "Trenes n/limit" plus train cards, with "oxidado" and the over-limit warning.
  - The company card and the stock view: availability tiles per source, with count, price and "agotada".
  - The RotLA section: the 8 identity pairs.
- [X] T048 [P] Grep for remaining plain short-name renders: `grep -rn "shortName" src/ui`. Every remaining hit must be an `aria-label`, an `<option>` label (`src/ui/actionFields.ts`), a `CustomGame.tsx` input, or a badge prop. Record any other hit and fix it (SC-001).
  - Note (2026-10-15): the sweep found more plain names, now badges. Through a new `HolderName` component (next to `CompanyBadge`): the CompanySheet holders, the PrivatesSheet owner, the counter sheet title and the undo toast money flows. Also the PlayerSheet quick-sell button, the StockSheet swap buttons, the TrainCorrectionSheet title and the operate sheet "Terminar turno → siguiente: …" button. Left plain on purpose: `<option>` labels (`actionFields.ts`), `CustomGame.tsx` inputs, `aria-label`s, and the chip strip flow labels, which are string props. (2026-10-19, bug `pay-modal-company-colors`: the HolderSheet "Pagar…" and "Mover acciones" target grids and the pay button were missed here; their render props take ReactNode, so they are badges now.)
- [X] T049 Run `npm run typecheck`, `npm run lint` and `npm test`. Fix any new failures, and compare against the T001 baseline. Leave the changes uncommitted.
  - Note (2026-10-15): typecheck and lint clean. 1815/1815 tests pass in 94 files, up from 1752 in 89 files at the T001 baseline, including perf. No regressions.
- [X] T050 Run `npm run build`, then `npm run test:e2e`. Rebuild first: a stale `:4173` preview server can serve an old `dist`. Fix any failures in `e2e/` caused by the trains line or stock view text changes.
  - Note (2026-10-15): the build passes, with only the existing warning about chunks over 500 kB. E2E 38/38 pass (phone and tablet). Port 4173 was free, so no stale server was involved.
- [ ] T051 Manual check: follow [quickstart.md](quickstart.md) "Manual check" steps 1–7 (step 7 is US5, added 2026-10-15) on a phone (portrait) and a tablet (landscape), in light and dark themes, after `npm run build` and `npm run preview`. Needs the user.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after T001. T003 blocks US1's UI tasks (T016 onward).
- **US1 (Phase 3)**: after Phase 2. This is the MVP. T014 → T015 → T016, then T017–T024 in any order.
- **US2 (Phase 4)**: after T001 only. It is independent of US1, but T028 also edits `es.ts`, so sequence it after T015 if both are in flight.
- **US3 (Phase 5)**: after T001 only. T036 edits `StockSheet.tsx`, which T024 also edits, so do one after the other.
- **US4 (Phase 6)**: T038–T041 and T043–T045 need only T001. T042 uses the existing `size="sm"` and does not wait for Phase 2. T046 needs T043 and T044.
- **US5 (Phase 6b)**: added after the polish ran. T052 and T053 need only T001. T055 re-runs the T049 and T050 checks after them.
- **Polish (Phase 7)**: after the stories are done.

### Within each story

Tests first, and see them fail. Then domain, then components, then screens.

### Parallel Opportunities

- T002 and T004 (Phase 2).
- US1 tests T005–T013 are all in different files, so they can run in parallel.
- T018, T020, T021, T023 and T024 can run in parallel after T016.
- After T001, US2, US3 and the US4 data tasks can proceed alongside US1, with the shared-file
  caveats above (`es.ts`, `StockSheet.tsx`, `components.css`).
- T045 and T047 can run any time after their story's data is settled.

## Parallel Example: User Story 1

```text
Task: "T005 [US1] mentions unit tests in tests/domain/mentions.test.ts"
Task: "T006 [US1] marked summaries in tests/domain/summaries.test.ts"
Task: "T008 [US1] RichText rendering in tests/ui/richText.test.tsx"
Task: "T009 [US1] History badges in tests/ui/history.test.tsx"
```

## Parallel Example: User Story 2 and 3 alongside US1

```text
Task: "T025 [US2] companyTrains tests in tests/domain/companyTrains.test.ts"
Task: "T033 [US3] shareSources tests in tests/domain/shareSources.test.ts"
Task: "T038 [US4] RotLA identity table test in tests/games/rotla.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 (T001), then Phase 2 (T002–T004).
2. Phase 3 (T005–T024).
3. **Stop and validate**: quickstart manual steps 1–2. History and income show badges.

### Incremental Delivery

1. Add US2 (T025–T032): train cards on the Table and in the operate view.
2. Add US3 (T033–T037): the share-source tiles.
3. Add US4 (T038–T045): the real RotLA names. The paid eval (T046) gates the merge.
4. Do the polish (T047–T051).
5. Add US5 (T052–T055), the market without closed companies. Then T051 checks it by hand (step 7).

## Notes

- There are no new actions, events, voice tools or storage changes. If a task seems to need one,
  stop and re-check [research.md](research.md).
- Voice prompts, snapshots and replies stay plain: never pass `marks: true` outside `src/ui`.
- Leave the changes uncommitted for review. Ignore any "commit after each task" habit.
