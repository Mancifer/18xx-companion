import type { ChipSet } from "../types";

/** data-model §12. null = the chips cannot make the amount exactly. */
export type ChipBreakdown = { readonly chips: readonly { readonly value: number; readonly count: number }[]; readonly total: number } | null;

/**
 * Whether greedy is optimal for these denominations (Kozen–Zaks): if a counterexample exists, the
 * smallest lies between c3 + 1 and c_n + c_(n−1), so only that range is checked against the DP.
 */
export function isCanonical(values: readonly number[]): boolean {
  const asc = [...values].sort((a, b) => a - b);
  const key = asc.join(",");
  const known = canonicalCache.get(key);
  if (known !== undefined) return known;
  const result = checkCanonical(asc);
  canonicalCache.set(key, result);
  return result;
}

/** Chip sets are few and rarely change, while breakdowns run on every toast. */
const canonicalCache = new Map<string, boolean>();

function checkCanonical(asc: readonly number[]): boolean {
  if (asc[0] !== 1) return false;
  if (asc.length <= 2) return true;
  const lo = (asc[2] ?? 0) + 2;
  const hi = (asc.at(-1) ?? 0) + (asc.at(-2) ?? 0) - 1;
  const unlimited = asc.map((value) => ({ value, count: undefined }));
  for (let x = lo; x <= hi; x++) {
    const g = greedy(asc, x);
    const d = boundedFewest(unlimited, x);
    if (!g || !d || count(g) > count(d)) return false;
  }
  return true;
}

const count = (b: NonNullable<ChipBreakdown>) => b.chips.reduce((n, c) => n + c.count, 0);

function greedy(ascending: readonly number[], amount: number): NonNullable<ChipBreakdown> | null {
  let left = amount;
  const chips: { value: number; count: number }[] = [];
  for (const value of [...ascending].reverse()) {
    const n = Math.floor(left / value);
    if (n > 0) chips.push({ value, count: n });
    left -= n * value;
  }
  return left === 0 ? { chips, total: amount } : null;
}

/**
 * Bounded change-making by dynamic programming (research R11), minimizing the number of chips
 * within each value's `count` (`undefined` = unlimited). Unlimited chips use the unbounded
 * recurrence; limited ones are split into 1, 2, 4, … bundles (0/1 items), so a full-bank amount
 * stays fast. Used by the setup plan (feature 008); mid-game breakdowns ignore counts.
 */
export function boundedFewest(
  available: readonly { readonly value: number; readonly count: number | undefined }[],
  amount: number,
): ChipBreakdown {
  if (amount < 0) return null;
  type Item = { value: number; per: number; unlimited: boolean };
  const items: Item[] = [];
  for (const chip of available) {
    if (chip.value <= 0) continue;
    if (chip.count === undefined) {
      items.push({ value: chip.value, per: 1, unlimited: true });
      continue;
    }
    let left = Math.min(chip.count, Math.floor(amount / chip.value));
    for (let k = 1; left > 0; k *= 2) {
      const take = Math.min(k, left);
      items.push({ value: chip.value, per: take, unlimited: false });
      left -= take;
    }
  }
  const INF = Number.POSITIVE_INFINITY;
  const get = (row: Float64Array | undefined, i: number): number => (i < 0 ? INF : (row?.[i] ?? INF));
  // best[i][a]: fewest chips for amount a with the first i items.
  const first = new Float64Array(amount + 1).fill(INF);
  first[0] = 0;
  const best: Float64Array[] = [first];
  for (const item of items) {
    const prev = best[best.length - 1] ?? first;
    const next = Float64Array.from(prev);
    const step = item.value * item.per;
    if (item.unlimited) {
      for (let x = step; x <= amount; x++) next[x] = Math.min(get(next, x), get(next, x - step) + 1);
    } else {
      for (let x = amount; x >= step; x--) next[x] = Math.min(get(next, x), get(prev, x - step) + item.per);
    }
    best.push(next);
  }
  if (get(best[items.length], amount) === INF) return null;

  const used = new Map<number, number>();
  let a = amount;
  for (let i = items.length; i > 0; i--) {
    const item = items[i - 1];
    if (!item) continue;
    const step = item.value * item.per;
    const here = best[i];
    const before = best[i - 1];
    if (item.unlimited) {
      while (a >= step && get(here, a) !== get(before, a) && get(here, a) === get(here, a - step) + 1) {
        used.set(item.value, (used.get(item.value) ?? 0) + 1);
        a -= step;
      }
    } else if (a >= step && get(here, a) !== get(before, a) && get(here, a) === get(before, a - step) + item.per) {
      used.set(item.value, (used.get(item.value) ?? 0) + item.per);
      a -= step;
    }
  }
  const chips = [...used].filter(([, n]) => n > 0).sort((x, y) => y[0] - x[0]).map(([value, n]) => ({ value, count: n }));
  return { chips, total: amount };
}

/**
 * The fewest chips that make `amount` (FR-081). Greedy when the set allows it. Counts are ignored
 * (feature 008, FR-013): mid-game, making change is up to the table.
 */
export function breakdown(set: ChipSet, amount: number): ChipBreakdown {
  if (amount < 0) return null;
  if (amount === 0) return { chips: [], total: 0 };
  const values = set.chips.map((c) => c.value);
  if (isCanonical(values)) return greedy([...values].sort((a, b) => a - b), amount);
  return boundedFewest(values.map((value) => ({ value, count: undefined })), amount);
}

/** Paying `amount` with one chip of `chipValue`: the change, as chips (US6-2). */
export function change(set: ChipSet, chipValue: number, amount: number): ChipBreakdown {
  if (chipValue <= amount) return null;
  return breakdown(set, chipValue - amount);
}

/** "sorted by value descending; values unique and > 0" (data-model §12). */
export function validateChipSet(set: ChipSet): string[] {
  const errors: string[] = [];
  const values = set.chips.map((c) => c.value);
  if (values.some((v, i) => i > 0 && v > (values[i - 1] ?? Infinity))) errors.push("Las fichas deben ir de mayor a menor valor.");
  if (new Set(values).size !== values.length) errors.push("Hay valores de ficha repetidos.");
  if (values.some((v) => v <= 0 || !Number.isInteger(v))) errors.push("Los valores deben ser mayores que cero.");
  return errors;
}
