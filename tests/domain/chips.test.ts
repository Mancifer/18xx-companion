import { describe, expect, it } from "vitest";
import { boundedFewest, breakdown, change, isCanonical, validateChipSet } from "../../src/domain/mechanics/chips";
import type { ChipSet } from "../../src/domain/types";
import { DEFAULT_CHIPS } from "../../src/domain/games/chips";

/** US6, research R11: fewest-chip breakdowns, change, limited counts. */

const set = (...values: (number | [number, number])[]): ChipSet => ({
  chips: values.map((v) =>
    Array.isArray(v) ? { value: v[0], color: "#000", countAvailable: v[1] } : { value: v, color: "#000" },
  ),
});
const standard = set(500, 100, 50, 10, 5, 1);

describe("breakdown", () => {
  it("US6-1: 287 → 2×100, 1×50, 3×10, 1×5, 2×1", () => {
    expect(breakdown(standard, 287)).toEqual({
      total: 287,
      chips: [
        { value: 100, count: 2 },
        { value: 50, count: 1 },
        { value: 10, count: 3 },
        { value: 5, count: 1 },
        { value: 1, count: 2 },
      ],
    });
  });

  it("0 needs no chips", () => {
    expect(breakdown(standard, 0)).toEqual({ total: 0, chips: [] });
  });

  it("a non-canonical set is solved by DP, not greedy (1, 3, 4: 6 → 2×3)", () => {
    expect(breakdown(set(4, 3, 1), 6)).toEqual({ total: 6, chips: [{ value: 3, count: 2 }] });
  });

  it("null only when the values cannot make the amount", () => {
    expect(breakdown(set(5), 7)).toBeNull();
    expect(breakdown(set(50, 10), 35)).toBeNull();
  });

  it("handles a full-bank amount quickly", () => {
    const started = performance.now();
    expect(breakdown(set([500, 10], 100, 50, 20, 10, 5, 1), 12000)?.total).toBe(12000);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("breakdown with the default chips (feature 008, US1)", () => {
  const defaults: ChipSet = { chips: DEFAULT_CHIPS };
  it.each([
    [287, [[100, 2], [25, 3], [5, 2], [1, 2]]],
    [50, [[25, 2]]],
    [30, [[25, 1], [5, 1]]],
    [7, [[5, 1], [1, 2]]],
  ] as const)("%i", (amount, chips) => {
    expect(breakdown(defaults, amount)).toEqual({ total: amount, chips: chips.map(([value, count]) => ({ value, count })) });
  });
});

describe("counts are ignored mid-game (feature 008, US2-5, FR-013)", () => {
  it("with only 2 greens owned, 2,000 is still 4×500", () => {
    const owned: ChipSet = { chips: DEFAULT_CHIPS.map((c) => (c.value === 500 ? { ...c, countAvailable: 2 } : c)) };
    expect(breakdown(owned, 2000)).toEqual({ total: 2000, chips: [{ value: 500, count: 4 }] });
  });

  it("a count of 0 does not stop a chip from being suggested", () => {
    expect(breakdown(set([100, 0], [10, 0], 1), 280)).toEqual({
      total: 280,
      chips: [
        { value: 100, count: 2 },
        { value: 10, count: 8 },
      ],
    });
  });

  it("change ignores counts too", () => {
    expect(change(set([500, 1], [100, 0], 1), 500, 300)).toEqual({ total: 200, chips: [{ value: 100, count: 2 }] });
  });
});

describe("boundedFewest (the setup plan's bounded DP)", () => {
  const avail = (...values: (number | [number, number])[]) =>
    values.map((v) => (Array.isArray(v) ? { value: v[0], count: v[1] } : { value: v, count: undefined }));

  it("limited counts give the fewest-chip valid combination", () => {
    // Only one 100 and no 50s: 280 = 1×100 + 18×10.
    expect(boundedFewest(avail([100, 1], [50, 0], 10), 280)).toEqual({
      total: 280,
      chips: [
        { value: 100, count: 1 },
        { value: 10, count: 18 },
      ],
    });
  });

  it("null when there is no exact combination", () => {
    // A 50 is too big and two 10s are not enough.
    expect(boundedFewest(avail([50, 1], [10, 2]), 30)).toBeNull();
    expect(boundedFewest(avail([50, 3]), 30)).toBeNull();
    expect(boundedFewest(avail(5), 7)).toBeNull();
  });

  it("0 needs no chips", () => {
    expect(boundedFewest(avail([5, 0]), 0)).toEqual({ total: 0, chips: [] });
  });

  it("handles a full-bank amount quickly", () => {
    const started = performance.now();
    expect(boundedFewest(avail([500, 10], 100, 50, 20, 10, 5, 1), 12000)?.total).toBe(12000);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("change (US6-2)", () => {
  it("30 paid with a 50 → change 20 as 2×10", () => {
    expect(change(standard, 50, 30)).toEqual({ total: 20, chips: [{ value: 10, count: 2 }] });
  });

  it("no change when the chip is not larger than the amount", () => {
    expect(change(standard, 10, 30)).toBeNull();
  });
});

describe("chip sets", () => {
  it("Kozen–Zaks: the usual sets are canonical, 1/3/4 is not", () => {
    expect(isCanonical([500, 100, 50, 10, 5, 1])).toBe(true);
    expect(isCanonical([500, 100, 50, 20, 10, 5, 1])).toBe(true);
    expect(isCanonical([4, 3, 1])).toBe(false);
    expect(isCanonical([25, 10])).toBe(false);
  });

  it("validation: sorted by value descending, unique values > 0", () => {
    expect(validateChipSet(standard)).toEqual([]);
    expect(validateChipSet(set(1, 5))).toContain("Las fichas deben ir de mayor a menor valor.");
    expect(validateChipSet(set(10, 10))).toContain("Hay valores de ficha repetidos.");
    expect(validateChipSet(set(10, 0))).toContain("Los valores deben ser mayores que cero.");
  });
});
