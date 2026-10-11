# Contract: Chip Domain Functions

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Research**: [research.md](../research.md)

Everything here is pure, synchronous, and has no I/O.

## `src/domain/games/chips.ts` (new)

```ts
export const DEFAULT_CHIPS: readonly Chip[];
/** "verde" | "roja" | "negra" | "azul" | "blanca" for the default colors; undefined otherwise. */
export function colorNameEs(color: string): string | undefined;
```

- Each built-in definition has `chipPreset` deep-equal to `DEFAULT_CHIPS`. This is FR-001, and
  it is tested in `tests/games/definitions.test.ts`.

## `src/domain/mechanics/chips.ts` (changed)

| Function | Change |
|---|---|
| `breakdown(set, amount)` | Ignores `countAvailable` (FR-013). The result is still `{ chips, total }`. It is `null` only when the values cannot make the amount, which never happens with a 1 chip. |
| `change(set, chipValue, amount)` | Unchanged signature. Ignores counts through `breakdown`. |
| `isCanonical`, `validateChipSet` | Unchanged. |
| `chipLabel` | **Removed.** |
| `boundedFewest(available, amount)` | **New, exported for `chipSetup.ts`.** The current bounded DP, taking `{ value, count \| undefined }[]`. `null` when there is no exact combination. |

**Examples (default chips)**: `breakdown(287)` = 2×100, 3×25, 2×5, 2×1. `breakdown(50)` = 2×25.
`breakdown(30)` = 1×25, 1×5. `breakdown(7)` = 1×5, 2×1. With green `countAvailable: 2`,
`breakdown(2000)` = 4×500 (US2-5).

## `src/domain/mechanics/chipSetup.ts` (new)

```ts
export function setupPlan(
  game: GameDefinition,
  playerCount: number,
  chipSet: ChipSet,
  bankPins?: Readonly<Record<string, number>>,
): SetupPlan;
/** The pins with values that are no longer in the set dropped (saved with the chip set). */
export function cleanPins(pins: Readonly<Record<string, number>> | undefined, chipSet: ChipSet): Record<string, number>;
/** Internal, exported for tests: fewest missing chips, then fewest chips. */
export function fill(amount: number, available: readonly { value: number; count: number | undefined }[], values: readonly number[]): ChipPortion;
/** "Faltan 8 fichas verdes (500), 1 roja (100)": null when nothing is missing. */
export function missingWarningEs(plan: SetupPlan, chipSet: ChipSet): string | null;
```

`SetupPlan` and `ChipPortion` are defined in [data-model.md §4](../data-model.md#4-setup-plan-new-derived).

**Required behavior** (each line is a test):

| Case | Expected |
|---|---|
| 1830, 4 players, default chips | `perPlayer.owned` = 1×500, 1×100. Bank fixed, `amount` 9,600 = 77×100, 50×25, 100×5, 150×1. `setAside` 46×500, 69×100. No missing chips. |
| 1848, 4 players, default chips | `perPlayer.owned` = 1×500, 1×100, 1×25, 1×5. Bank 7,480 = 57×100, 46×25, 96×5, 150×1. |
| 21Moon, 3 players, default chips | `perPlayer` 540 = 1×500, 1×25, 3×5. Bank unlimited: every other chip. |
| RotLA, bank-breaking variant, 4 players | Bank fixed, `total` 8,000. |
| 1830, 4 players, green 10, red 10 | No missing chips for the players. Bank: all owned chips plus missing 8×500, 1×100. `missing` = 8×500, 1×100. |
| Green count 0 | `perPlayer` for 600 = 6×100. Green never appears in `missing` unless nothing else can make the amount. |
| No 1s or 5s, amount 630 | 1 × 25 + missing 1×5 per player (US5-4). |
| Every count empty | `missing` is empty. A fixed bank is the fewest chips for the amount. |
| Every built-in game × every player count × default chips | The totals are exact, and per color, owned + set aside = count (SC-002, SC-003). |
| 1830, 7 players | Computed in under 50 ms (SC-004). |
| 1830, 4 players, pin green 6 | Bank 9,600 = 6×500, 47×100, 50×25, 100×5, 150×1. `setAside` 40×500, 99×100. `pinned` = [500]. `difference` 0 (US3-6). |
| 1830, 4 players, pin green 20 | Bank: 20×500 = 10,000, everything else 0. `difference` +400. No missing chips (FR-022c). |
| 1830, 4 players, green 10, pin green 8 | 6 green are left after the players, so 6 owned + 2 missing. The other colors refill 5,600. |
| Pin for value 50, which isn't in the set | Ignored. The plan equals the unpinned plan. `cleanPins` drops it. |
| 21Moon (unlimited bank) with pins | Pins are ignored. The plan equals the unpinned plan. |
| Pins `{}` | Identical to no pins. |
| Every color pinned at 0 | No refill is possible: `difference` −9,600 (FR-022c). |

## `src/app/sessions.ts`

- `NewSessionInput` gains `bankPins?: Record<string, number>`.
- `startSession` stores `cleanPins(input.bankPins, chipSet)` in the meta, omitting the field when
  there are no pins.
- `input.chipSet ?? { chips: game.chipPreset }` now yields the new defaults with counts.

## `src/app/SessionStore.ts` / `useSession.ts`

- `updateMeta`'s patch type widens to `Pick<Partial<SessionMeta>, "chipSet" | "name" | "bankPins">`.
- `updateChipSet(chipSet)` becomes `updateChips(chipSet, bankPins)`. It saves both in one meta
  write, with the pins passed through `cleanPins`, and never touches the log.

## Persistence

- `exportImport` keeps accepting `label` through `ChipSchema` (old exports), and still writes it
  back when a stored chip has one. Nothing new writes a label.
- The meta schema adds `bankPins` as optional. Export writes it when present, and import restores
  it. A file without it imports with no pins.
