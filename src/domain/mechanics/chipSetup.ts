import { colorNameEs } from "../games/chips";
import type { GameDefinition } from "../games/schema";
import type { ChipSet } from "../types";
import { boundedFewest } from "./chips";

/**
 * The setup plan (feature 008, data-model §4): the chips each player takes and the chips that
 * make up the bank, from the chips the table owns. Derived and never stored (R7); only the bank
 * pins are saved (R17). Pure and synchronous.
 */

export type ChipCount = { value: number; count: number };

export interface ChipPortion {
  /** What these chips add up to. */
  amount: number;
  /** Chips taken from the table, highest value first. */
  owned: ChipCount[];
  /** Chips the table lacks, highest value first; [] when none. */
  missing: ChipCount[];
}

export interface SetupPlan {
  playerCount: number;
  /** The same for every player (R4). */
  perPlayer: ChipPortion;
  bank:
    | {
        kind: "fixed";
        total: number;
        /** Pinned and refilled colors. */
        portion: ChipPortion;
        setAside: ChipCount[];
        /** Values the user pinned that still exist, for the UI. */
        pinned: number[];
        /** Bank chips − portion.amount: > 0 over, < 0 short (R16); otherwise 0. */
        difference: number;
      }
    | { kind: "unlimited"; owned: ChipCount[]; unlimitedValues: number[] };
  /** Per value: perPlayer.missing × playerCount + the bank's missing chips. */
  missing: ChipCount[];
}

type Available = readonly { readonly value: number; readonly count: number | undefined }[];
type Counts = Map<number, number>;

/** A missing chip outweighs any number of owned ones, so fewer missing chips always wins (R6). */
const MISSING = 1_000_000;

const add = (into: Counts, value: number, n: number) => {
  if (n !== 0) into.set(value, (into.get(value) ?? 0) + n);
};
const toList = (counts: Counts): ChipCount[] =>
  [...counts]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([value, count]) => ({ value, count }));
const toCounts = (chips: readonly ChipCount[]): Counts => new Map(chips.map((c) => [c.value, c.count]));
const worth = (chips: readonly ChipCount[]) => chips.reduce((s, c) => s + c.value * c.count, 0);

/**
 * The chips that make `amount`, fewest missing chips first and fewest chips second (R6). Owned
 * chips come from `available` (`count: undefined` = unlimited, never missing); missing chips may
 * be any of `values` that is not unlimited. Limited counts are split into 1, 2, 4, … bundles, as
 * in `boundedFewest`. When nothing can make the amount, the portion has no chips.
 */
export function fill(amount: number, available: Available, values: readonly number[]): ChipPortion {
  if (amount <= 0) return { amount, owned: [], missing: [] };
  type Item = { value: number; per: number; unbounded: boolean; missing: boolean };
  const items: Item[] = [];
  const unlimited = new Set(available.filter((c) => c.count === undefined).map((c) => c.value));
  for (const chip of available) {
    if (chip.value <= 0) continue;
    if (chip.count === undefined) {
      items.push({ value: chip.value, per: 1, unbounded: true, missing: false });
      continue;
    }
    let left = Math.min(chip.count, Math.floor(amount / chip.value));
    for (let k = 1; left > 0; k *= 2) {
      const take = Math.min(k, left);
      items.push({ value: chip.value, per: take, unbounded: false, missing: false });
      left -= take;
    }
  }
  for (const value of new Set(values)) {
    if (value > 0 && !unlimited.has(value)) items.push({ value, per: 1, unbounded: true, missing: true });
  }

  const INF = Number.POSITIVE_INFINITY;
  const at = (row: Float64Array, i: number): number => (i < 0 ? INF : (row[i] ?? INF));
  const first = new Float64Array(amount + 1).fill(INF);
  first[0] = 0;
  // best[i][a]: lowest cost for amount a with the first i items.
  const best: Float64Array[] = [first];
  for (const item of items) {
    const prev = best[best.length - 1] ?? first;
    const next = Float64Array.from(prev);
    const step = item.value * item.per;
    const cost = item.missing ? MISSING : item.per;
    if (item.unbounded) {
      for (let x = step; x <= amount; x++) next[x] = Math.min(at(next, x), at(next, x - step) + cost);
    } else {
      for (let x = amount; x >= step; x--) next[x] = Math.min(at(next, x), at(prev, x - step) + cost);
    }
    best.push(next);
  }
  if (at(best[items.length] ?? first, amount) === INF) return { amount, owned: [], missing: [] };

  const owned: Counts = new Map();
  const missing: Counts = new Map();
  let a = amount;
  for (let i = items.length; i > 0; i--) {
    const item = items[i - 1];
    const here = best[i];
    const before = best[i - 1];
    if (!item || !here || !before) continue;
    const step = item.value * item.per;
    const cost = item.missing ? MISSING : item.per;
    const into = item.missing ? missing : owned;
    if (item.unbounded) {
      while (a >= step && at(here, a) !== at(before, a) && at(here, a) === at(here, a - step) + cost) {
        add(into, item.value, item.per);
        a -= step;
      }
    } else if (a >= step && at(here, a) !== at(before, a) && at(here, a) === at(before, a - step) + cost) {
      add(into, item.value, item.per);
      a -= step;
    }
  }
  return { amount, owned: toList(owned), missing: toList(missing) };
}

/**
 * The bank's chips for `amount` from what is left of each color (R5): set aside the fewest chips
 * of the surplus (which keeps the lower values), else take every limited chip and fill the rest
 * with unlimited colors and then missing chips, else fill the whole amount.
 */
function buildBank(amount: number, colors: Available, missingValues: readonly number[]): { owned: Counts; missing: Counts } {
  const limited = colors.filter((c): c is { value: number; count: number } => c.count !== undefined);
  const value = limited.reduce((s, c) => s + c.value * c.count, 0);
  const all = (): Counts => new Map(limited.map((c) => [c.value, c.count]));
  if (amount <= 0) return { owned: new Map(), missing: new Map() };
  if (value >= amount) {
    const aside = boundedFewest(limited, value - amount);
    if (aside) {
      const owned = all();
      for (const c of aside.chips) add(owned, c.value, -c.count);
      return { owned, missing: new Map() };
    }
    const f = fill(amount, colors, missingValues);
    return { owned: toCounts(f.owned), missing: toCounts(f.missing) };
  }
  const f = fill(
    amount - value,
    colors.filter((c) => c.count === undefined),
    missingValues,
  );
  const owned = all();
  for (const c of f.owned) add(owned, c.value, c.count);
  return { owned, missing: toCounts(f.missing) };
}

/** The pins with values that are no longer in the set dropped (saved with the chip set). */
export function cleanPins(pins: Readonly<Record<string, number>> | undefined, chipSet: ChipSet): Record<string, number> {
  const values = new Set(chipSet.chips.map((c) => String(c.value)));
  return Object.fromEntries(Object.entries(pins ?? {}).filter(([value]) => values.has(value)));
}

/**
 * How to set up the money on the table (data-model §4): the same chips for every player, then a
 * fixed bank from what is left (adjusted by the pins, R16) or, for an unlimited bank, every
 * remaining chip. Missing chips fill any gap, so the totals are always exact (SC-002).
 */
export function setupPlan(
  game: GameDefinition,
  playerCount: number,
  chipSet: ChipSet,
  bankPins?: Readonly<Record<string, number>>,
): SetupPlan {
  const players = Math.max(1, playerCount);
  const chips = [...chipSet.chips].sort((a, b) => b.value - a.value);
  const limitedValues = chips.filter((c) => c.countAvailable !== undefined).map((c) => c.value);

  const cash = game.startingCash[String(playerCount)] ?? 0;
  const share = chips.map((c) => ({
    value: c.value,
    count: c.countAvailable === undefined ? undefined : Math.floor(c.countAvailable / players),
  }));
  const perPlayer = fill(cash, share, limitedValues);
  const given = toCounts(perPlayer.owned);
  const rest = chips.map((c) => ({
    value: c.value,
    count: c.countAvailable === undefined ? undefined : c.countAvailable - (given.get(c.value) ?? 0) * players,
  }));

  const missing: Counts = new Map();
  for (const c of perPlayer.missing) add(missing, c.value, c.count * players);

  if (game.bank === "unlimited") {
    return {
      playerCount,
      perPlayer,
      bank: {
        kind: "unlimited",
        owned: toList(new Map(rest.flatMap((c) => (c.count === undefined ? [] : [[c.value, c.count] as const])))),
        unlimitedValues: rest.filter((c) => c.count === undefined).map((c) => c.value),
      },
      missing: toList(missing),
    };
  }

  const total = game.bank.total;
  const amount = total - players * cash;
  const pins = cleanPins(bankPins, chipSet);
  const isPinned = (value: number) => String(value) in pins;
  const owned: Counts = new Map();
  const bankMissing: Counts = new Map();
  let pinnedWorth = 0;
  for (const c of rest.filter((r) => isPinned(r.value))) {
    const n = pins[String(c.value)] ?? 0;
    const own = c.count === undefined ? n : Math.min(n, c.count);
    add(owned, c.value, own);
    add(bankMissing, c.value, n - own);
    pinnedWorth += n * c.value;
  }
  const unpinned = rest.filter((r) => !isPinned(r.value));
  const refill = buildBank(
    amount - pinnedWorth,
    unpinned,
    limitedValues.filter((v) => !isPinned(v)),
  );
  for (const [value, n] of refill.owned) add(owned, value, n);
  for (const [value, n] of refill.missing) add(bankMissing, value, n);

  const setAside: Counts = new Map();
  for (const c of rest) if (c.count !== undefined) add(setAside, c.value, c.count - (owned.get(c.value) ?? 0));
  for (const [value, n] of bankMissing) add(missing, value, n);

  const portion: ChipPortion = { amount, owned: toList(owned), missing: toList(bankMissing) };
  return {
    playerCount,
    perPlayer,
    bank: {
      kind: "fixed",
      total,
      portion,
      setAside: toList(setAside),
      pinned: chips.filter((c) => isPinned(c.value)).map((c) => c.value),
      difference: worth(portion.owned) + worth(portion.missing) - amount,
    },
    missing: toList(missing),
  };
}

/** "verde" → "verdes", "azul" → "azules". */
const pluralEs = (word: string) => (/[aeiou]$/.test(word) ? `${word}s` : `${word}es`);

/**
 * "Faltan 8 fichas verdes (500), 1 roja (100)" (US5): per value, highest first, with the color's
 * Spanish name, or "de {value}" for a color outside the defaults. null when nothing is missing.
 */
export function missingWarningEs(plan: SetupPlan, chipSet: ChipSet): string | null {
  if (plan.missing.length === 0) return null;
  const parts = plan.missing.map(({ value, count }, i) => {
    const color = chipSet.chips.find((c) => c.value === value)?.color;
    const name = color === undefined ? undefined : colorNameEs(color);
    const what = name === undefined ? `de ${value}` : `${count === 1 ? name : pluralEs(name)} (${value})`;
    const noun = i === 0 ? (count === 1 ? " ficha" : " fichas") : "";
    return `${count}${noun} ${what}`;
  });
  return `Faltan ${parts.join(", ")}`;
}
