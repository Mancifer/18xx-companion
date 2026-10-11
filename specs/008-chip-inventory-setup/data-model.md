# Data Model: Chip Inventory and Bank Setup

**Feature**: 008-chip-inventory-setup | **Date**: 2026-10-11

There is no new store and no IndexedDB version bump. The setup plan is derived and never saved
([R7](research.md#r7-where-the-plan-lives)). The only new saved data is the user's bank pins: one
optional session field, also added as optional to the export
([R17](research.md#r17-saving-the-pins-fr-022d)).

## 1. Chip (changed meaning, same shape)

`src/domain/types.ts` `Chip`, `src/domain/games/schema.ts` `ChipSchema`

| Field | Type | Rule |
|---|---|---|
| `value` | positive integer | What the chip stands for at this table. Shown on every disc. |
| `color` | string (hex) | The physical chip's color. |
| `countAvailable` | non-negative integer, optional | Chips of this color the table owns. Absent = unlimited (FR-011). `0` = none owned. |
| `label` | string, optional | **Deprecated**: kept so older sessions and exports load. Never written by the editor and never displayed (FR-012). |

## 2. Chip set (unchanged)

`{ chips: Chip[] }`: highest value first, values unique and > 0 (`validateChipSet`). It is
stored in `SessionMeta.chipSet` (table configuration, outside the log) and in each definition's
`chipPreset`.

## 3. Default chips (new constant)

`src/domain/games/chips.ts`

```ts
export const DEFAULT_CHIPS: readonly Chip[] = [
  { value: 500, color: "#2e7d32", countAvailable: 50 },  // green
  { value: 100, color: "#c62828", countAvailable: 150 }, // red
  { value: 25,  color: "#212121", countAvailable: 50 },  // black
  { value: 5,   color: "#1565c0", countAvailable: 100 }, // blue
  { value: 1,   color: "#f5f5f5", countAvailable: 150 }, // white
];
```

`g1830`, `g1848`, `g21moon` and `grotla` set `chipPreset: [...DEFAULT_CHIPS]`. Custom games copy
the base game's definition, so new ones inherit it. Saved ones keep theirs (FR-003).

`colorNameEs(color)` gives the Spanish name for the warning ("verde", "roja", "negra", "azul",
"blanca"). The five default colors are mapped exactly. Any other color falls back to "de {value}".

## 4. Setup plan (new, derived)

`src/domain/mechanics/chipSetup.ts`

```ts
type ChipCount = { value: number; count: number };

interface ChipPortion {
  amount: number;                 // what these chips add up to
  owned: ChipCount[];             // chips taken from the table, highest value first
  missing: ChipCount[];           // chips the table lacks, highest first; [] when none
}

interface SetupPlan {
  playerCount: number;
  perPlayer: ChipPortion;         // the same for every player (R4)
  bank:
    | {
        kind: "fixed";
        total: number;
        portion: ChipPortion;     // pinned + refilled colors
        setAside: ChipCount[];
        pinned: number[];         // values the user pinned (that still exist), for the UI
        difference: number;       // bank chips − portion.amount: > 0 over, < 0 short (R16); else 0
      }
    | { kind: "unlimited"; owned: ChipCount[]; unlimitedValues: number[] };
  missing: ChipCount[];           // per value: perPlayer.missing × playerCount + bank missing
}
```

**Inputs**: the session game (options applied), the player count, the chip set and the bank
pins (§5).

**Rules**:

- `perPlayer.amount = game.startingCash[playerCount] ?? 0`. With 0 there are no chips and no
  missing chips.
- Per-player availability: `floor(countAvailable / playerCount)` per limited color; unlimited
  colors stay unlimited ([R4](research.md#r4-players-chips-one-breakdown-for-every-player)).
- `perPlayer = fill(amount, perPlayerAvailable)`.
- `rest` per limited color: `countAvailable − perPlayer.owned × playerCount`.
- **Fixed bank** (`game.bank !== "unlimited"`): `bank.portion.amount = total − playerCount ×
  perPlayer.amount`. It is built from `rest` as in
  [R5](research.md#r5-the-banks-chips): set aside the fewest chips first, else take all and
  `fill` the remainder, else `fill` the whole amount. `setAside` lists the owned chips that are
  not used.
- **Pins** (fixed bank only, [R16](research.md#r16-adjusting-the-bank-pin-and-refill-fr-022b-fr-022c)):
  - Each pinned color gets exactly its pinned count in the bank. The part above that color's
    `rest` is missing.
  - The unpinned colors are built by the rule above for `amount − Σ pinned value`. Their
    missing chips come only from unpinned values, so a pinned color never changes.
  - When that amount is negative, the unpinned colors get 0 and `difference` is the excess.
    When every color is pinned and the pins fall short, `difference` is the (negative) shortfall.
  - Pins for values that aren't in the chip set are ignored.
- **Unlimited bank**: `bank.owned = rest` (colors with count > 0) and `unlimitedValues` = colors
  with no count. Pins are ignored.
- `fill` minimizes the number of missing chips first and the number of chips second
  ([R6](research.md#r6-missing-chips)).

**Invariants** (tested, SC-002 and SC-003):

- `sum(perPlayer.owned ∪ perPlayer.missing) = perPlayer.amount`.
- Fixed bank: `playerCount × perPlayer.amount + bank.portion.amount = total`. The bank's owned
  plus missing chips add up to `bank.portion.amount + bank.difference`. With no pins, `difference` is 0.
- For each limited color: `perPlayer.owned × playerCount + bank owned + setAside = countAvailable`
  (fixed bank), or `perPlayer.owned × playerCount + bank.owned = countAvailable` (unlimited bank).
- An unlimited color never appears in `missing` (edge case).
- With every color unlimited, `missing` is empty.

**State transitions**: none. The plan is recomputed whenever the chip set, the player count, an
option or a pin changes (FR-024). It never adds events or changes balances (FR-027).

## 5. Bank pins (new, saved)

`src/domain/session.ts` `SessionMeta`

| Field | Type | Rule |
|---|---|---|
| `bankPins` | `Readonly<Record<string, number>>`, optional | Chip value (as a string) → the bank count the user set. Absent or `{}` = the suggestion. Counts are non-negative integers. |

- **Written by**: `startSession` (from `NewSessionInput.bankPins`) and the chips sheet's
  "Guardar" (through `updateMeta`, outside the log). "Restablecer" and "Volver al juego" save `{}`.
- **Cleaned**: when the chip set is saved, pins for values that are no longer in it are dropped.
- **Export**: the meta schema gets `bankPins: z.record(z.string(), nonNegInt).optional()`, and
  exports include it when present. Older exports import with no pins.

## 6. Breakdown (changed behavior)

`breakdown(set, amount)` ignores `countAvailable` (FR-013): greedy for canonical sets, unbounded
DP otherwise. `change()` follows. The bounded DP becomes a private helper of `chipSetup.ts`
(through `fill`).

## 7. Removed

- `chipLabel()` and its call sites (`ChipStrip`, `NewSession`): discs show `value`.
- The "Etiqueta" input in `ChipSetEditor`.
