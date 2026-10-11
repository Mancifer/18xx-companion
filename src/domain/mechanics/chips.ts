import type { Chip, ChipSet } from "../types";

/** data-model §12. null = no exact change with the chips available. */
export type ChipBreakdown = { readonly chips: readonly { readonly value: number; readonly count: number }[]; readonly total: number } | null;

/**
 * Whether greedy is optimal for these denominations (Kozen–Zaks): if a counterexample exists, the
 * smallest lies between c3 + 1 and c_n + c_(n−1), so only that range is checked against the DP.
 */
export function isCanonical(values: readonly number[]): boolean {
  const asc = [...values].sort((a, b) => a - b);
  if (asc[0] !== 1) return false;
  if (asc.length <= 2) return true;
  const lo = (asc[2] ?? 0) + 2;
  const hi = (asc.at(-1) ?? 0) + (asc.at(-2) ?? 0) - 1;
  const unlimited = { chips: asc.map((value) => ({ value, color: "" })) };
  for (let x = lo; x <= hi; x++) {
    const g = greedy(asc, x);
    const d = dp(unlimited, x);
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
 * and respecting `countAvailable`. Unlimited chips use the unbounded recurrence; limited ones are
 * split into 1, 2, 4, … bundles (0/1 items), so a full-bank amount stays fast.
 */
function dp(set: ChipSet, amount: number): ChipBreakdown {
  type Item = { value: number; per: number; unlimited: boolean };
  const items: Item[] = [];
  for (const chip of set.chips) {
    if (chip.value <= 0) continue;
    if (chip.countAvailable === undefined) {
      items.push({ value: chip.value, per: 1, unlimited: true });
      continue;
    }
    let left = Math.min(chip.countAvailable, Math.floor(amount / chip.value));
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

/** The fewest chips that make `amount` (FR-081). Greedy when the set allows it. */
export function breakdown(set: ChipSet, amount: number): ChipBreakdown {
  if (amount < 0) return null;
  if (amount === 0) return { chips: [], total: 0 };
  const values = set.chips.map((c) => c.value);
  const limited = set.chips.some((c) => c.countAvailable !== undefined);
  if (!limited && isCanonical(values)) return greedy([...values].sort((a, b) => a - b), amount);
  return dp(set, amount);
}

/** Paying `amount` with one chip of `chipValue`: the change, as chips (US6-2). */
export function change(set: ChipSet, chipValue: number, amount: number): ChipBreakdown {
  if (chipValue <= amount) return null;
  return breakdown(set, chipValue - amount);
}

/**
 * What a chip shows: its label, or its value. A label made only of digits must match the value
 * (it is what is printed on the chip), so one that differs is a stale echo of an old value and
 * the value is shown instead (bug chip-denomination-stale-label).
 */
export function chipLabel(chip: Pick<Chip, "value" | "label">): string {
  const { label, value } = chip;
  if (!label || (/^\d+$/.test(label) && label !== String(value))) return String(value);
  return label;
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
