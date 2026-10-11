---

description: "Task list for feature 008: Chip Inventory and Bank Setup"
---

# Tasks: Chip Inventory and Bank Setup

**Input**: Design documents from `specs/008-chip-inventory-setup/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/domain.md](contracts/domain.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution Principle VI makes chip change-making test-first ([R15](research.md#r15-tests-principle-vi)), and the quickstart lists the test files. Write each test task first and confirm it fails before the matching implementation task.

**Organization**: Tasks are grouped by user story so each story can be built and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1–US5)
- Paths are relative to the repository root (single-project PWA: `src/`, `tests/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a green baseline. No new dependency, store or DB version is needed (plan: Technical Context).

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the current tree and note any failures that already exist, so later failures can be told apart (no file changes)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared default chip constant and the disc rendering that every story displays.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Create `src/domain/games/chips.ts` exporting `DEFAULT_CHIPS: readonly Chip[]` exactly as in data-model §3 (`{ value: 500, color: "#2e7d32", countAvailable: 50 }`, `{ value: 100, color: "#c62828", countAvailable: 150 }`, `{ value: 25, color: "#212121", countAvailable: 50 }`, `{ value: 5, color: "#1565c0", countAvailable: 100 }`, `{ value: 1, color: "#f5f5f5", countAvailable: 150 }`, highest value first) and `colorNameEs(color: string): string | undefined` returning "verde" | "roja" | "negra" | "azul" | "blanca" for those five hex colors (case-insensitive) and `undefined` for any other color
- [X] T003 [P] Add a `--chip-ring` token to `src/ui/styles/tokens.css` (dark on the light theme, light in dark mode; define it in every theme block the file already uses, including the `prefers-color-scheme: dark` and explicit dark-theme selectors), and in `src/ui/styles/components.css` give `.chip-disc` a solid 2 px ring in `var(--chip-ring)`, replacing the current dashed border (R11)
- [X] T004 Extract the private `Discs` renderer in `src/ui/components/ChipStrip.tsx` into an exported `ChipDiscs({ chips, set, missing? })` per contracts/ui.md §2: each owned disc shows `{count}×{value}` with `aria-label="{count} × {value}"`; each missing disc uses the same disc with a dashed outline and the text "faltan", with `aria-label="faltan {count} × {value}"`. `ChipStrip` renders through `ChipDiscs`. Add the `.chip-disc--missing` (dashed outline) style to `src/ui/styles/components.css` (depends on T003)

**Checkpoint**: Defaults and discs exist; user stories can start.

---

## Phase 3: User Story 1 - New sessions start with the new default chips (Priority: P1) 🎯 MVP

**Goal**: Every built-in game's chip preset is 500 green, 100 red, 25 black, 5 blue, 1 white with default counts, and new sessions and "Volver al juego" use it.

**Independent Test**: Start a new session of each built-in game with the default chips; the chip set has the five chips and a bank payout of 287 shows 2×100, 3×25, 2×5, 2×1.

### Tests for User Story 1 ⚠️ (write first, see them fail)

- [X] T005 [P] [US1] In `tests/games/definitions.test.ts`, assert that each built-in definition's `chipPreset` deep-equals `DEFAULT_CHIPS` (FR-001, FR-004), and that `colorNameEs` maps the five default colors and returns `undefined` for "#9e9e9e"
- [X] T006 [P] [US1] In `tests/games/customGame.test.ts`, assert that a custom game newly created from each built-in game copies `DEFAULT_CHIPS`, and that a saved custom game with its own `chipPreset` keeps it unchanged (FR-003)
- [X] T007 [P] [US1] In `tests/domain/chips.test.ts`, add breakdowns with `DEFAULT_CHIPS`: 287 → 2×100, 3×25, 2×5, 2×1; 50 → 2×25; 30 → 1×25, 1×5; 7 → 1×5, 2×1 (US1-2..4, edge case)

### Implementation for User Story 1

- [X] T008 [P] [US1] Set `chipPreset: [...DEFAULT_CHIPS]` in `src/domain/games/g1830.ts`, importing from `./chips`
- [X] T009 [P] [US1] Set `chipPreset: [...DEFAULT_CHIPS]` in `src/domain/games/g1848.ts`
- [X] T010 [P] [US1] Set `chipPreset: [...DEFAULT_CHIPS]` in `src/domain/games/g21moon.ts`
- [X] T011 [P] [US1] Set `chipPreset: [...DEFAULT_CHIPS]` in `src/domain/games/grotla.ts` (this adds the 1 chip to RotLA)
- [X] T012 [US1] In `src/ui/sheets/ChipsSheet.tsx`, make "Volver al juego" restore `builtInGames.find((g) => g.id === meta.game.id)?.chipPreset` when the session's game id is a built-in game, otherwise `meta.game.chipPreset` (R10, FR-002); add a test in `tests/ui/chips.test.tsx` that an older session whose frozen definition holds the old preset gets the five new chips
- [X] T013 [US1] Update existing tests and helpers that assume the old built-in chip presets (search `tests/` and `tests/eval/` for old chip values or breakdown text from the old presets) so the full suite passes with the new defaults; do not change `tests/helpers/miniGame.ts` presets unless a test depends on built-in chips

**Checkpoint**: US1 works on its own: new sessions of every built-in game use the five default chips.

---

## Phase 4: User Story 2 - Record the chips the table owns (Priority: P1)

**Goal**: A chip is a color, a value and a count. The label field is gone, labels from older data are ignored, and mid-game breakdowns ignore counts.

**Independent Test**: Edit counts and values in the chip editor, start the session, reopen the editor and check they were kept; a stored label is shown as the value.

### Tests for User Story 2 ⚠️ (write first, see them fail)

- [X] T014 [P] [US2] In `tests/domain/chips.test.ts`, remove the `chipLabel` describe block and its import; add "counts are ignored mid-game" tests: with green `countAvailable: 2`, `breakdown(2000)` = 4×500 (US2-5, FR-013), and `change()` likewise ignores counts; add `boundedFewest(available, amount)` tests moved from the old bounded behavior (respects counts, returns `null` when there is no exact combination)
- [X] T015 [P] [US2] In `tests/ui/chips.test.tsx`, assert editor rows have "Valor" and "Cantidad" (placeholder "∞") and no "Etiqueta" (US2-1); swapping black to 5 and blue to 25 changes the discs in breakdowns (US2-2); clearing Cantidad stores `countAvailable: undefined` and typing 0 stores `0` (US2-3); a stored chip with `label: "5"` and `value: 1` displays "1" (US2-4, FR-012); "Añadir ficha" adds `{ value: 1, color: "#9e9e9e" }` unlimited
- [X] T016 [P] [US2] In `tests/persistence/export.test.ts`, assert an export whose chips carry `label` still imports, with values and colors unchanged (SC-005), and that a stored label is written back on re-export

### Implementation for User Story 2

- [X] T017 [US2] In `src/domain/mechanics/chips.ts`: make `breakdown(set, amount)` ignore `countAvailable` (greedy for canonical sets, unbounded DP otherwise; `null` only when the values cannot make the amount); `change()` follows through `breakdown`; export the current bounded DP as `boundedFewest(available: readonly { value: number; count: number | undefined }[], amount: number)` returning `null` when there is no exact combination; delete `chipLabel()` (contracts/domain.md)
- [X] T018 [P] [US2] Mark `Chip.label` as `@deprecated` in `src/domain/types.ts` with a comment that it is kept only so older sessions and exports load, never written or displayed; keep `ChipSchema.label` optional in `src/domain/games/schema.ts` (R3)
- [X] T019 [US2] In `src/ui/components/ChipStrip.tsx`, replace both `chipLabel(...)` uses (discs and the "pagó con" buttons) with the chip's `value` (depends on T004, T017)
- [X] T020 [US2] In `src/ui/components/ChipSetEditor.tsx`, remove the "Etiqueta" column so a row is color picker, **Valor**, **Cantidad** (placeholder "∞"), ✕; no label handling remains; in `src/ui/styles/components.css` change the chip row grid from 3 middle columns to 2 (contracts/ui.md §1)
- [X] T021 [US2] In `src/ui/screens/NewSession.tsx`, remove the `chipLabel` import and make the collapsed "Fichas" button show small `ChipDiscs`-style discs with values (no counts needed) followed by "· Editar" instead of the joined label text, keeping "Sin fichas" when the set is empty (contracts/ui.md §4)

**Checkpoint**: US1 and US2 both work: defaults with counts, editor without labels, counts never limit mid-game breakdowns.

---

## Phase 5: User Story 3 - Build the bank and starting cash from the table's chips (Priority: P2)

**Goal**: A derived setup plan shows each player's chips and the bank's chips (fixed or unlimited), with set-aside chips, adjustable bank pins saved with the session, on the new-session screen and in the chips sheet.

**Independent Test**: 1830, 4 players, default chips: each player gets 1×500, 1×100 (600); the bank gets 77×100, 50×25, 100×5, 150×1 (9,600); pinning green at 6 drops red to 47.

### Tests for User Story 3 ⚠️ (write first, see them fail)

- [X] T022 [P] [US3] Create `tests/domain/chipSetup.test.ts` with the `setupPlan` rows of the contracts/domain.md table: 1830 4p default (perPlayer 1×500, 1×100; fixed bank 9,600 = 77×100, 50×25, 100×5, 150×1; `setAside` 46×500, 69×100; no missing); 1848 4p (perPlayer 1×500, 1×100, 1×25, 1×5; bank 7,480 = 57×100, 46×25, 96×5, 150×1; setAside 46×500, 89×100); 21Moon 3p (perPlayer 540 = 1×500, 1×25, 3×5; unlimited bank gets every other chip, `unlimitedValues` lists colors with no count); RotLA with the bank-breaking variant 4p (fixed, `total` 8,000); every count empty (`missing` empty, fixed bank = fewest chips); `startingCash` 0 → perPlayer has no chips and no missing chips
- [X] T023 [US3] In `tests/domain/chipSetup.test.ts`, add the invariant sweep for every built-in game × every player count in its `startingCash` × default chips (SC-002, SC-003): `sum(perPlayer.owned ∪ perPlayer.missing) = perPlayer.amount`; fixed bank `playerCount × perPlayer.amount + bank.portion.amount = total` and bank owned + missing = `bank.portion.amount + bank.difference` with `difference` 0; per limited color `perPlayer.owned × playerCount + bank owned + setAside = countAvailable` (fixed) or `perPlayer.owned × playerCount + bank.owned = countAvailable` (unlimited); and a timing test that 1830 with 7 players computes in under 50 ms (SC-004, R14)
- [X] T024 [US3] In `tests/domain/chipSetup.test.ts`, add the pin rows of the contracts/domain.md table: 1830 4p pin green 6 → bank 6×500, 47×100, 50×25, 100×5, 150×1, `setAside` 40×500, 99×100, `pinned` [500], `difference` 0 (US3-6); pin green 20 → 20×500, everything else 0, `difference` +400, no missing (FR-022c); green count 10 and pin green 8 → 6 owned + 2 missing green, other colors refill 5,600; pin for value 50 (not in the set) → equals the unpinned plan and `cleanPins` drops it; 21Moon with pins → equals the unpinned plan; pins `{}` → identical to no pins; every color pinned at 0 → `difference` −9,600
- [X] T025 [P] [US3] In `tests/persistence/resume.test.ts` and `tests/persistence/export.test.ts`, assert `bankPins` survives a reload and an export → import, that a session without pins stores no `bankPins` field, and that an export without `bankPins` imports with no pins (FR-022d); also assert that the setup never touches the log (FR-027, Constitution I review gate): after starting a session with pins the log holds only the `createSession` group, and after `SessionStore.updateMeta({ chipSet, bankPins })` the log's groups and every balance are unchanged
- [X] T026 [P] [US3] Create `tests/ui/chipSetup.test.tsx` with new-session tests: for 1830 4p the plan shows "Cada jugador" with 1×500, 1×100 and "Banco" with the 9,600 breakdown and "Apartadas"; changing the player count or an option updates the plan in the same render (FR-024); tapping "Más fichas de 500 en el banco" six times shows 6, "fijada", and red refills to 47 (US3-6); "Restablecer" returns to the suggestion (US3-8); typing 20 in green shows "El banco tiene $400 de más." and "Empezar" stays enabled (US3-9); 21Moon shows no steppers and "sin límite" only for unlimited colors; changing the game clears pins while changing players keeps them; chips sheet: "Preparación" shows the session's plan (US3-5) and pins saved with "Guardar" are shown after reopening (US3-7), with the session's log and balances unchanged by "Guardar" (FR-027)

### Implementation for User Story 3

- [X] T027 [US3] Create `src/domain/mechanics/chipSetup.ts` with the `ChipCount`, `ChipPortion` and `SetupPlan` types exactly as in data-model §4, and `fill(amount, available, values)`: a weighted change-making DP where each owned chip costs 1 and each missing chip costs 1,000,000, with available counts bounded through binary bundles (reuse or mirror `boundedFewest`'s bundling), so the result has the fewest missing chips first and the fewest chips second; unlimited colors (`count: undefined`) are never missing; returns `{ amount, owned, missing }` highest value first (R6) (depends on T017)
- [X] T028 [US3] In `src/domain/mechanics/chipSetup.ts`, implement `setupPlan(game, playerCount, chipSet, bankPins?)` per data-model §4 rules without pins: `perPlayer.amount = game.startingCash[playerCount] ?? 0`; per-player availability `floor(countAvailable / playerCount)` per limited color; `perPlayer = fill(...)`; `rest = countAvailable − perPlayer.owned × playerCount`; fixed bank (`game.bank !== "unlimited"`) builds `total − playerCount × perPlayer.amount` from `rest` per R5 (set aside the fewest chips of the surplus via `boundedFewest`, else take all limited chips and `fill` the remainder with unlimited colors then missing, else `fill` the whole amount); unlimited bank: `bank.owned = rest` (colors with count > 0) and `unlimitedValues`; `missing` = `perPlayer.missing × playerCount` + bank missing, summed per value, highest first (make T022 and T023 pass)
- [X] T029 [US3] In `src/domain/mechanics/chipSetup.ts`, add pins per R16 and export `cleanPins(pins, chipSet)` (drops values not in the set; returns `{}` for `undefined`): pins apply to a fixed bank only; each pinned color gets exactly its count, the part above that color's `rest` is missing; unpinned colors are built by the R5 rule for `amount − Σ pinned value`, with missing chips only from unpinned values; when that amount is negative the unpinned colors get 0 and `difference` is the excess; when every color is pinned and the pins fall short `difference` is the negative shortfall; `pinned` lists the pinned values that still exist (make T024 pass)
- [X] T030 [P] [US3] Add optional `bankPins?: Readonly<Record<string, number>>` to `SessionMeta` in `src/domain/session.ts` ("Chip value (as a string) → the bank count the user set. Absent or `{}` = the suggestion. Counts are non-negative integers.")
- [X] T031 [US3] In `src/app/sessions.ts`, add `bankPins?: Record<string, number>` to `NewSessionInput`; `startSession` stores `cleanPins(input.bankPins, chipSet)` in the meta and omits the field when it is empty (depends on T029, T030)
- [X] T032 [US3] In `src/app/SessionStore.ts`, widen `updateMeta`'s patch to `Pick<Partial<SessionMeta>, "chipSet" | "name" | "bankPins">`; in `src/app/useSession.ts`, replace `updateChipSet(chipSet)` with `updateChips(chipSet, bankPins)` that saves both in one meta write with the pins passed through `cleanPins`, never touching the log; update the `ChipsSheet` caller (depends on T030)
- [X] T033 [US3] In `src/persistence/exportImport.ts`, add `bankPins: z.record(z.string(), nonNegInt).optional()` to the meta schema, write it in the export when present and restore it on import (make T025 pass) (depends on T030)
- [X] T034 [US3] Create `src/ui/components/ChipSetupPlan.tsx` with props `{ plan, set, game: Pick<GameDefinition, "currency">, pins?, onPinsChange?, variant?: "full" | "notice" }` per contracts/ui.md §3 (default `"full"`; `"notice"` renders only "Cada jugador", the fixed bank's "Banco" and the warning — no "Apartadas", no unlimited-bank row, no steppers): "Cada jugador {money}" row with `ChipDiscs` (owned + missing); fixed bank "Banco {money}" with `ChipDiscs`; "Apartadas" muted "no se usan" when `setAside` is not empty; unlimited bank "Banco" with `ChipDiscs` for `bank.owned` plus "sin límite: {values}" and no steppers; when `onPinsChange` is given and the bank is fixed, the bank becomes one row per chip color with disc + value, − / number field / + (each button ≥ 48 px, `aria-label="Menos fichas de {value} en el banco"` / "Más fichas de {value} en el banco", − disabled at 0; any change calls `onPinsChange({ ...pins, [value]: n })`), "fijada" text on pinned rows, "Restablecer" when there is a pin (calls `onPinsChange({})`), and when `difference ≠ 0` a warning "El banco tiene {money} de más." / "Al banco le faltan {money}." followed by "Cambiá alguna ficha fijada o tocá Restablecer."; format money with the game's currency like other screens (depends on T004, T028)
- [X] T035 [P] [US3] Add plan layout styles (rows, stepper row with 48 px buttons, muted "Apartadas", warning box) to `src/ui/styles/components.css`
- [X] T036 [US3] In `src/ui/screens/NewSession.tsx`, add `pins` state (starts `{}`, cleared when the game changes, kept when players or options change); always render `ChipSetupPlan` below the "Fichas" fieldset for `setupPlan(patched, rows.length, chipSet ?? { chips: game.chipPreset }, pins)` with `pins` and `onPinsChange={setPins}`; pass `bankPins: pins` to `newSession` from "Empezar" (depends on T031, T034)
- [X] T037 [US3] In `src/ui/sheets/ChipsSheet.tsx`, add a "Preparación" section above the editor showing `ChipSetupPlan` for the draft chip set and draft pins (starting from `meta.bankPins ?? {}`) with `meta.game` and `meta.players.length`, adjustable; "Guardar" calls `updateChips(sorted, pins)` and stays enabled whenever the chip set is valid; "Volver al juego" also clears the draft pins (depends on T012, T032, T034)

**Checkpoint**: US3 works: the plan, set-aside chips and bank pins show on the new-session screen and in the chips sheet, and pins are saved and exported.

---

## Phase 6: User Story 4 - Starting-chips notice when the game starts (Priority: P2)

**Goal**: When a session starts, the Table shows a dismissible "Fichas iniciales" notice with each player's chips and, for a fixed bank, the bank's chips.

**Independent Test**: Start an 1830 session with 4 players; the notice shows "Cada jugador" and "Banco"; "Entendido" dismisses it.

### Tests for User Story 4 ⚠️ (write first, see them fail)

- [X] T038 [P] [US4] In `tests/ui/chipSetup.test.tsx`, add Table tests: after starting 1830 4p, a `role="status"` notice titled "Fichas iniciales" shows "Cada jugador" once (not one row per player) and "Banco" (US4-1, US4-2); with pins saved, the notice shows the pinned bank (US3-7); missing chips show "faltan" (US4-3); the 1830 notice has no "Apartadas" row; for 21Moon (unlimited bank) the notice shows only "Cada jugador", with no "Banco" row (FR-026a); it disappears after "Entendido" and after the first applied action (US4-4)

### Implementation for User Story 4

- [X] T039 [US4] Create `src/ui/components/StartChipsNotice.tsx` per contracts/ui.md §6: computes `setupPlan(meta.game, meta.players.length, meta.chipSet, meta.bankPins)`; title "Fichas iniciales"; renders `ChipSetupPlan` with `variant="notice"` and no `onPinsChange`, which gives "Cada jugador {money}", the fixed bank's "Banco {money}" (none for an unlimited bank), no "Apartadas", and marked missing chips; uses the `.toast` container with `role="status"`, no auto-hide, and an "Entendido" button that hides it in component state; no Undo (depends on T034)
- [X] T040 [US4] In `src/ui/screens/Table.tsx`, render `StartChipsNotice` while `effective` holds only the `createSession` group and the notice has not been dismissed in this view (local state only, nothing written) (R9) (depends on T039)

**Checkpoint**: US4 works: starting a session shows the starting chips once, and the first action or "Entendido" hides it.

---

## Phase 7: User Story 5 - Warn and fill in when the chips are not enough (Priority: P2)

**Goal**: When owned chips can't cover the setup, the plan adds marked missing chips and shows "Faltan …"; the user can fix counts in place or start anyway.

**Independent Test**: 1830, 4 players, green 10 and red 10 (R13): the warning reads "Faltan 8 fichas verdes (500), 1 roja (100)"; raising green to 50 removes it.

### Tests for User Story 5 ⚠️ (write first, see them fail)

- [X] T041 [US5] In `tests/domain/chipSetup.test.ts`, add: 1830 4p with green 10, red 10 → no missing chips for the players, bank uses all owned chips plus missing 8×500, 1×100, `missing` = 8×500, 1×100; `missingWarningEs` returns "Faltan 8 fichas verdes (500), 1 roja (100)" for it and `null` for the default plan; green count 0 → perPlayer for 600 = 6×100 and green is not in `missing`; no 1s or 5s with amount 630 → 1×25 + missing 1×5 per player (US5-4); an unlimited color is never missing; a non-default color falls back to "de {value}" in the warning
- [X] T042 [P] [US5] In `tests/ui/chipSetup.test.tsx`, add: with green 10 and red 10 on the new-session screen the warning (`role="status"`) shows, the editor opens on its own, the bank discs show "faltan", raising green to 50 removes the warning without leaving the screen (US5-2), and "Empezar" stays enabled (FR-025); after starting anyway, the chips sheet's "Preparación" still shows the warning (US5-3)

### Implementation for User Story 5

- [X] T043 [US5] In `src/domain/mechanics/chipSetup.ts`, export `missingWarningEs(plan, chipSet)`: `null` when `plan.missing` is empty, otherwise "Faltan " + per value, highest first, "{n} ficha(s) {colorNameEs(color)} ({value})" with Spanish plural agreement for the color (verdes/rojas/negras/azules/blancas; singular for 1, and only the first item repeats "fichas" — e.g. "Faltan 8 fichas verdes (500), 1 roja (100)"), falling back to "de {value}" for unknown colors (depends on T002, T028)
- [X] T044 [US5] In `src/ui/components/ChipSetupPlan.tsx`, show the missing-chips warning box (`role="status"`) when `plan.missing` is not empty: `missingWarningEs(plan, set)` followed by " Podés cambiar cantidades o valores, o empezar igual y usar otras fichas." (depends on T034, T043)
- [X] T045 [US5] In `src/ui/screens/NewSession.tsx`, open the chip editor on its own when the plan has missing chips, so counts can be changed in place; never disable "Empezar" because of the warning (US5-2, FR-025) (depends on T036)

**Checkpoint**: All user stories work on their own.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Docs, a11y and validation across stories.

- [X] T046 [P] Update `docs/spec.md` §7 "Chips & Bank" (chip shape without label, counts used only for the setup plan, the setup plan, set-aside chips and bank adjustments) and §9.1 step 2 (new session: chips with counts and the plan) and step 3 (start notice "Fichas iniciales")
- [X] T047 [P] Check `e2e/a11y.spec.ts` covers the new-session screen with the plan and steppers; extend it if the new controls are not reached, then run `npm run build` and `npx playwright test e2e/a11y.spec.ts` (the :4173 preview may serve an old dist)
- [X] T048 Run the automated checks in [quickstart.md](quickstart.md) §1 (`npm run typecheck`, `npm run lint`, the targeted test files, the full `npm test`) and fix any failures
- [X] T049 Manual check on a phone with `npm run dev` following [quickstart.md](quickstart.md) §2 steps 1–10 (needs the user)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup; blocks every story. T004 depends on T003.
- **US1 (Phase 3)** and **US2 (Phase 4)**: after Foundational; independent of each other.
- **US3 (Phase 5)**: needs T017 (`boundedFewest`, US2) for the domain and T012 (US1) for the chips sheet. Its domain tests can be written as soon as Foundational is done.
- **US4 (Phase 6)**: needs `ChipSetupPlan` and `setupPlan` from US3.
- **US5 (Phase 7)**: needs `setupPlan` (T028) and `ChipSetupPlan` (T034) from US3; can run in parallel with US4.
- **Polish (Phase 8)**: after the stories you want to ship.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P1)**: Foundational only.
- **US3 (P2)**: US2 (T017) for the bounded DP; US1 (T012) only for the chips sheet's "Volver al juego" edit in the same file.
- **US4 (P2)**: US3.
- **US5 (P2)**: US3 (the missing chips are computed by `fill`; US5 adds the warning text and UI).

### Within Each User Story

- Tests first, and they must fail before the implementation.
- Domain (`chipSetup.ts`) before app/persistence, before UI components, before screens.
- Same-file tasks run in order: `tests/domain/chipSetup.test.ts` T022 → T023 → T024 → T041; `tests/ui/chipSetup.test.tsx` T026 → T038 → T042; `chipSetup.ts` T027 → T028 → T029 → T043; `NewSession.tsx` T021 → T036 → T045; `ChipsSheet.tsx` T012 → T037; `ChipSetupPlan.tsx` T034 → T044; `components.css` T003 → T004 → T020 → T035.

### Parallel Opportunities

- Foundational: T002 and T003.
- US1: tests T005–T007 together; definitions T008–T011 together.
- US2: tests T014–T016 together; T018 alongside T017.
- US3: tests T022, T025 and T026 together (different files); T023 and T024 follow T022 in the same file; T030 and T035 alongside the domain work.
- US4 and US5 can be worked on in parallel once T034 is done.
- Polish: T046 and T047.

---

## Parallel Example: User Story 3

```bash
# Write all US3 tests together (they must fail first):
Task: "setupPlan worked examples in tests/domain/chipSetup.test.ts"        # T022
Task: "bankPins reload and export round-trip in tests/persistence/*"        # T025
Task: "new-session plan and steppers in tests/ui/chipSetup.test.tsx"        # T026

# Independent files while the domain is being built:
Task: "SessionMeta.bankPins in src/domain/session.ts"                        # T030
Task: "Plan layout styles in src/ui/styles/components.css"                   # T035
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 and Phase 2.
2. Phase 3 (US1): the new default chips everywhere.
3. **Stop and validate**: new sessions of each built-in game use the five chips; breakdowns of 287, 50, 30 and 7 are right.

### Incremental Delivery

1. Setup + Foundational → defaults and discs ready.
2. US1 → default chips (MVP).
3. US2 → counts without labels; mid-game breakdowns ignore counts.
4. US3 → setup plan with bank pins on the new-session screen and the chips sheet.
5. US4 → "Fichas iniciales" notice on the Table.
6. US5 → missing-chip warning and in-place fixes.
7. Polish → docs, a11y, quickstart.

---

## Notes

- [P] tasks touch different files and have no unfinished dependencies.
- The plan is derived and never stored; only `bankPins` is saved, through `updateMeta`, never through the log (FR-022d, FR-027).
- Out of scope (plan findings): the 1848 Bank of England £2,000 treasury (R12). The spec's US5 independent test now uses green 10 and red 10, matching R13.
- Leave changes uncommitted for review.
