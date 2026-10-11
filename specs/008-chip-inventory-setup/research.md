# Research: Chip Inventory and Bank Setup

**Feature**: 008-chip-inventory-setup | **Date**: 2026-10-11

Every decision below was made from the spec and the current code (`src/domain/mechanics/chips.ts`,
`ChipSetEditor`, `ChipStrip`, `NewSession`, `ChipsSheet`, `UndoToast`, `startSession`). No
NEEDS CLARIFICATION items remain.

## R1. Where the default chips and counts live

- **Decision**: Each built-in definition's `chipPreset` becomes the same five chips, with the
  FR-004 counts in the existing `countAvailable` field:
  `500 #2e7d32 (50) · 100 #c62828 (150) · 25 #212121 (50) · 5 #1565c0 (100) · 1 #f5f5f5 (150)`.
  The list is a shared constant (`DEFAULT_CHIPS` in `src/domain/games/chips.ts`) that the four
  definitions reference.
- **Rationale**: `ChipSchema` already has `countAvailable`, so there is no schema change. Sessions
  and custom games store their own copy (`SessionMeta.chipSet`, custom `chipPreset`), so FR-003
  and SC-005 hold without migration. One constant keeps FR-001 ("the same default chip set")
  true by construction.
- **Alternatives considered**: a separate `defaultCounts` field (rejected: duplicates
  `countAvailable`); counts in user settings (rejected: saved user defaults are out of scope).

## R2. Mid-game breakdowns ignore counts (FR-013)

- **Decision**: `breakdown(set, amount)` uses only the chip values. It keeps greedy for
  canonical sets and the unbounded DP otherwise. The bounded DP stays as an internal helper for
  the setup plan.
- **Rationale**: The spec drops the per-transaction count limit (Assumptions). The default set
  (1, 5, 25, 100, 500) has each value dividing the next, so it is canonical and greedy is exact:
  287 → 2×100, 3×25, 2×5, 2×1; 50 → 2×25; 30 → 1×25, 1×5.
- **Alternatives considered**: keep counts as a soft limit mid-game (rejected by FR-013 and
  US2-5).

## R3. Labels

- **Decision**: The editor drops the label field. `chipLabel` is removed and every chip shows
  `String(value)`. `ChipSchema.label` and `Chip.label` stay optional so older sessions and
  exports still load and validate; they are never written and never read for display.
- **Rationale**: FR-010 and FR-012. Removing the field from the schema would make older exports
  fail to import.
- **Alternatives considered**: strip labels on load (rejected: rewrites stored data for no gain).

## R4. Players' chips: one breakdown for every player

- **Decision**: Starting cash is the same for every player (`startingCash` is keyed by player
  count), so the plan computes **one** per-player breakdown and hands it to each player. It is
  the fewest chips for the amount, using at most `floor(owned / players)` chips of each color.
  When that cannot make the amount, missing chips are added (R6).
- **Rationale**: FR-022 asks for the fewest chips, as for transactions. With the default counts
  that gives 600 → 1×500, 1×100 (1830, 4 players) and 630 → 1×500, 1×100, 1×25, 1×5 (1848,
  4 players). One breakdown makes "Cada jugador" (FR-026a) exact and keeps the hand-out fair.
  The per-player share of each color means the last player never gets a different set.
- **Alternatives considered**: allocate seat by seat (rejected: the last players can end up
  with a different set, which breaks "Cada jugador"); always use the unlimited greedy split and
  mark shortages as missing (rejected: with 0 green it would mark 4 green as missing while 24
  red are on the table).

## R5. The bank's chips

- **Decision**: After the players' chips are taken, `rest` is what is left of each limited
  color.
  - **Fixed bank** (`game.bank.total`): the bank amount is `B = total − players × cash`
    (assumption: the bank total includes the starting cash).
    1. If the limited `rest` is worth at least `B`, the surplus `D = value(rest) − B` is **set
       aside** as the fewest chips that make `D` from `rest` (bounded DP). The bank gets the rest.
       Setting aside the fewest chips removes high values first, which keeps as many lower-value
       chips as possible (FR-022a).
    2. Otherwise the bank gets every limited chip, and the remainder is filled with unlimited
       colors, then with missing chips (R6).
    3. If step 1 has no exact set-aside (for example only 500s are left and `D` is 300), the
       bank amount is filled directly (R6).
  - **Unlimited bank**: the bank gets every remaining limited chip; unlimited colors are shown
    as "sin límite". Nothing is set aside or missing for the bank.
  - **All colors unlimited, fixed bank**: the bank is the fewest chips for `B`. The spec's edge
    case ("uses as many chips as it needs") allows this, and there is no inventory to preserve.
- **Rationale**: Worked examples with the default counts:
  - 1830, 4 players: the bank is 9,600 = 77×100 + 50×25 + 100×5 + 150×1. Set aside: 46×500, 69×100.
  - 1848, 4 players: the bank is 7,480 = 57×100 + 46×25 + 96×5 + 150×1. Set aside: 46×500, 89×100.
  This follows FR-022a literally. The bank holds no 500s, and mid-game breakdowns may still say
  "1×500" (FR-013: making change is up to the table).
- **Alternatives considered**: fewest chips for the bank too (rejected: FR-022a); a fixed
  per-color ratio (rejected: not in the spec, and arbitrary).

## R6. Missing chips

- **Decision**: One helper, `fill(amount, available)`, does a weighted change-making DP. Each
  owned chip costs 1 and each missing chip costs 1,000,000 (any value), so the result has the
  fewest missing chips first and the fewest chips second. Available counts are bounded through
  binary bundles, as the current `dp` does. Missing chips are summed per value across the
  players (× player count) and the bank, and shown as "Faltan N fichas {color} ({value})".
- **Rationale**: FR-023 and US5-4. One rule covers too little money overall and the wrong
  denominations. Missing chips are always possible because every value can be added, so the
  plan is always exact (SC-002).
- **Alternatives considered**: report "no se puede armar" (rejected: FR-023 says always fill
  in); missing chips only in the smallest value (rejected: 4,100 short becomes 4,100 white chips).

## R7. Where the plan lives

- **Decision**: The plan is a pure function, `setupPlan(game, playerCount, chipSet, bankPins)`
  in the new `src/domain/mechanics/chipSetup.ts`. The plan itself is **derived, never stored**.
  Only its inputs are stored: the chip set and the user's bank pins (R16, R17). The new-session
  screen computes it from the draft. The chips sheet and the start notice compute it from
  `meta.game`, `meta.players.length`, `meta.chipSet` and `meta.bankPins`.
- **Rationale**: FR-027 (no events, no balances), FR-024 (updates at once) and US5-3 (the
  warning is still there when the plan is reopened): recomputing from the same inputs gives the
  same plan. Constitution I is untouched.
- **Alternatives considered**: storing the plan in `SessionMeta` (rejected: a cache with no
  reader that cannot be derived); logging a note event (rejected by FR-027).

## R8. Wallet mode

- **Decision**: The plan ignores `walletMode`. Players get their starting cash in chips in both
  modes.
- **Rationale**: Spec edge case ("Solo banco": players still receive chips). `docs/spec.md` §7
  says players' chips are optional in "La app lleva el dinero", but the plan is guidance only, so
  showing it costs nothing.

## R9. The start notice (US4)

- **Decision**: A new `StartChipsNotice` in the Table is shown while the effective log holds
  only the `createSession` group, until the user dismisses it (component state). It reuses the
  chip discs from `ChipStrip` (extracted as `ChipDiscs`), with a "Cada jugador" row and, for a
  fixed bank, a "Banco" row. Missing chips are marked.
- **Rationale**: `newSession` clears feedback and `createSession` is dispatched by the system,
  so the undo toast never shows it. "Only `createSession` in the log" makes "goes away on the
  first action" (US4-4) free, and reopening a just-started session shows it again, which helps.
  It does not auto-hide: handing out chips takes longer than the toast's 6 s.
- **Alternatives considered**: push a synthetic feedback on start (rejected: the toast
  auto-hides and offers Undo, which would revert `createSession`); a persisted "seen" flag
  (rejected: nothing needs it).

## R10. "Volver al juego" for older sessions (FR-002)

- **Decision**: The chips sheet restores the **built-in** game's current preset when
  `meta.game.id` is a built-in game, otherwise the frozen `meta.game.chipPreset`.
- **Rationale**: An older session's frozen definition still holds the old seven-chip preset;
  FR-002 says the button restores the default set. This is the same fallback as feature 007's
  `scoringOf` (007 R16). Custom games keep their own preset.

## R11. Chip visibility (edge case)

- **Decision**: `.chip-disc` gets a solid ring from a new token, `--chip-ring`: dark on light
  themes and light in dark mode. The dashed border goes. Value text always sits next to the disc.
- **Rationale**: Without a ring, white discs disappear on a light background and black ones in
  dark mode. Constitution V: color is never the only cue.

## R12. 1848 Bank of England treasury (found during research)

- **Finding**: 1848 starts the BoE with £2,000 outside the £10,000 bank
  (`initialTreasuries`, rulebook §2.4.1). Its money is also chips on the table, but the spec
  only covers the bank total and players.
- **Decision**: Out of scope for this plan. The plan covers the bank total (10,000) as the spec
  says. Adding initial treasuries as extra rows is an easy later change (one more `fill` call).
  Flagged to the user.

## R13. US5 independent test (found during design)

- **Finding**: With red set to 10 (1830, 4 players), the default 50 greens still cover the
  bank: each player gets 1×500 + 1×100, and the bank is 15×500 + 2×100 + all the small chips. No
  chip is missing, so the spec's independent test shows no warning.
- **Decision**: `quickstart.md` uses green 10 and red 10. Then 8×500 and 1×100 are missing. The
  user may want to adjust the spec's independent-test sentence to match.

## R14. Performance (SC-004)

- **Decision**: `fill` runs over amounts up to the bank total (12,000 in 1830), with
  ~5 values × ~8 bundles of items. That is well under 1 M cell updates, so recomputing on every
  keystroke is fine. A unit test checks the 1830 7-player plan stays under 50 ms, like the
  existing "full-bank amount quickly" test.

## R15. Tests (Principle VI)

- **Decision**: Test-first:
  - `tests/domain/chipSetup.test.ts` (new): the US3/US5 scenarios, the R5 worked examples,
    unlimited colors, count 0, the all-unlimited case, missing aggregation, and exact totals for
    every built-in game and player count (SC-002, SC-003), and pins (R16: the US3-6 example,
    pins above the remaining count, pins over the bank amount, stale pins, an unlimited bank
    ignoring pins).
  - `tests/persistence/*`: `bankPins` survives a reload and an export → import; an export
    without it still imports.
  - `tests/domain/chips.test.ts`: new defaults and the breakdowns that ignore counts; the
    `chipLabel` tests are removed.
  - `tests/games/*`: each preset equals `DEFAULT_CHIPS`.
  - UI tests: the editor rows, the plan and warning on the new-session screen, the start notice,
    and the plan in the chips sheet.
- Voice is unaffected: chips are not in the snapshot or the tools, so no eval re-run is needed.

## R16. Adjusting the bank: pin and refill (FR-022b, FR-022c)

- **Decision**: The user sets a bank count for a color, which **pins** it. The plan then runs
  R5's rule on the unpinned colors only, for the amount the pins leave:
  - `B' = B − Σ pinned value`.
  - Unpinned limited colors get `rest`. Surplus over `B'` is set aside, fewest chips first, so
    lower values are kept. A shortfall is filled with unlimited colors and then missing chips.
  - A pin above what is left of that color after the players marks the excess as missing.
  - If `B' < 0` (the pins alone exceed the bank amount), the unpinned colors get 0 and the plan
    reports the excess in `bank.difference`: "El banco tiene {money} de más." When every
    color is pinned and the pins fall short, there is nothing to refill, so `difference` is
    negative: "Al banco le faltan {money}."
  - Pins apply only to a fixed bank. An unlimited bank gets every remaining chip, so it has
    nothing to adjust.
- **Rationale**: This reuses R5's code path with fixed inputs, so the total stays exact whenever
  it can. Example (1830, 4 players): pinning green at 6 leaves `B'` = 6,600. The unpinned colors
  have 16,500, so 99 red are set aside and the bank's red drops from 77 to 47 (US3-6). Each
  stepper changes one pin. A color the user never touched keeps following the suggestion, which
  matches "colors not changed are recalculated".
- **UI**: a − / + stepper and a number field per bank color, plus "Restablecer" to clear the pins.
  Steppers beat sliders: a 0–146 slider can't be set to an exact count on a phone, and steppers
  keep 48 px targets.
- **Alternatives considered**: free per-color counts with no refill, where the user balances the
  total (rejected: tedious, and the user asked for automatic adjustment); trade buttons between
  neighbor colors ("1 green ↔ 5 red": exact, but only works when values divide evenly); sliders
  (rejected as above).

## R17. Saving the pins (FR-022d)

- **Decision**: A new optional `SessionMeta.bankPins?: Record<string, number>` maps a chip value
  (as a string key) to the pinned bank count. Absent or `{}` means the suggestion.
  - It is saved with `updateMeta` (the `Pick` widens to `"chipSet" | "name" | "bankPins"`), the
    same path as the chip set, outside the log.
  - `NewSessionInput.bankPins` passes the new-session draft to `startSession`.
  - The export schema gets `bankPins` as optional, so older exports import unchanged.
  - Pins whose value isn't in the chip set are ignored when the plan is computed, and dropped
    when the chip set is saved.
  - "Volver al juego" clears them.
  - Changing the game on the new-session screen clears them. Changing the player count or an
    option keeps them (spec edge case).
- **Rationale**: Keying by value matches how the rest of the app identifies chips (values are
  unique). No IndexedDB version bump is needed: meta rows are plain objects, and an absent field
  reads as "no pins".
- **Alternatives considered**: storing the whole bank breakdown (rejected: it goes stale when
  counts, players or options change, while pins plus a refill stay consistent); keying by color
  (rejected: colors aren't required to be unique).
