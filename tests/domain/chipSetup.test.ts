import { describe, expect, it } from "vitest";
import { applyOptions, builtInGames, getBuiltInGame, resolveOptions } from "../../src/domain/games";
import { DEFAULT_CHIPS } from "../../src/domain/games/chips";
import type { GameDefinition } from "../../src/domain/games/schema";
import { cleanPins, fill, missingWarningEs, setupPlan, type ChipPortion, type SetupPlan } from "../../src/domain/mechanics/chipSetup";
import type { Chip, ChipSet } from "../../src/domain/types";

/** Feature 008: the setup plan (contracts/domain.md, data-model §4, research R4–R6, R16). */

const game = (id: string, options: Record<string, string> = {}): GameDefinition => {
  const base = getBuiltInGame(id);
  return applyOptions(base, resolveOptions(base, options));
};
const defaults: ChipSet = { chips: DEFAULT_CHIPS };
/** The default chips with some counts changed: `{ 500: 10 }`; `undefined` = unlimited. */
const withCounts = (counts: Record<number, number | undefined>): ChipSet => ({
  chips: DEFAULT_CHIPS.map((c): Chip => (c.value in counts ? { value: c.value, color: c.color, countAvailable: counts[c.value] } : c)),
});
/** "46×500, 69×100" → [{ value: 500, count: 46 }, …] */
const cc = (text: string) =>
  text === ""
    ? []
    : text.split(", ").map((part) => {
        const [count, value] = part.split("×").map(Number);
        return { value: value!, count: count! };
      });
const sum = (chips: readonly { value: number; count: number }[]) => chips.reduce((s, c) => s + c.value * c.count, 0);
const countOf = (chips: readonly { value: number; count: number }[], value: number) => chips.find((c) => c.value === value)?.count ?? 0;
const fixedBank = (plan: SetupPlan) => {
  if (plan.bank.kind !== "fixed") throw new Error("expected a fixed bank");
  return plan.bank;
};

describe("setupPlan: worked examples (US3, R5)", () => {
  it("1830, 4 players, default chips", () => {
    const plan = setupPlan(game("1830"), 4, defaults);
    expect(plan.perPlayer).toEqual({ amount: 600, owned: cc("1×500, 1×100"), missing: [] });
    const bank = fixedBank(plan);
    expect(bank.total).toBe(12000);
    expect(bank.portion).toEqual({ amount: 9600, owned: cc("77×100, 50×25, 100×5, 150×1"), missing: [] });
    expect(bank.setAside).toEqual(cc("46×500, 69×100"));
    expect(bank.pinned).toEqual([]);
    expect(bank.difference).toBe(0);
    expect(plan.missing).toEqual([]);
  });

  it("1848, 4 players, default chips", () => {
    const plan = setupPlan(game("1848"), 4, defaults);
    expect(plan.perPlayer.owned).toEqual(cc("1×500, 1×100, 1×25, 1×5"));
    const bank = fixedBank(plan);
    expect(bank.portion.amount).toBe(7480);
    expect(bank.portion.owned).toEqual(cc("57×100, 46×25, 96×5, 150×1"));
    expect(bank.setAside).toEqual(cc("46×500, 89×100"));
    expect(plan.missing).toEqual([]);
  });

  it("21Moon, 3 players: an unlimited bank gets every other chip", () => {
    const plan = setupPlan(game("21moon"), 3, withCounts({ 1: undefined }));
    expect(plan.perPlayer).toEqual({ amount: 540, owned: cc("1×500, 1×25, 3×5"), missing: [] });
    expect(plan.bank).toEqual({ kind: "unlimited", owned: cc("47×500, 150×100, 47×25, 91×5"), unlimitedValues: [1] });
    expect(plan.missing).toEqual([]);
  });

  it("RotLA with the bank-breaking variant, 4 players: a fixed 8,000 bank", () => {
    const plan = setupPlan(game("rotla", { bankBreak: "on" }), 4, defaults);
    const bank = fixedBank(plan);
    expect(bank.total).toBe(8000);
    expect(4 * plan.perPlayer.amount + bank.portion.amount).toBe(8000);
    expect(sum(bank.portion.owned) + sum(bank.portion.missing)).toBe(bank.portion.amount);
  });

  it("every count empty: nothing is missing and a fixed bank is the fewest chips", () => {
    const unlimited: ChipSet = { chips: DEFAULT_CHIPS.map(({ value, color }) => ({ value, color })) };
    const plan = setupPlan(game("1830"), 4, unlimited);
    expect(plan.missing).toEqual([]);
    expect(fixedBank(plan).portion).toEqual({ amount: 9600, owned: cc("19×500, 1×100"), missing: [] });
    expect(fixedBank(plan).setAside).toEqual([]);
  });

  it("no starting cash: the players get no chips and miss none", () => {
    const g = { ...game("1830"), startingCash: { "4": 0 } };
    const plan = setupPlan(g, 4, defaults);
    expect(plan.perPlayer).toEqual({ amount: 0, owned: [], missing: [] });
    expect(fixedBank(plan).portion.amount).toBe(12000);
  });
});

describe("setupPlan: exact totals for every game and player count (SC-002, SC-003)", () => {
  const cases = builtInGames.flatMap((g) =>
    [{}, ...(g.id === "rotla" ? [{ bankBreak: "on" }] : [])].flatMap((options) =>
      Object.keys(game(g.id, options).startingCash).map((n) => [g.id, options, Number(n)] as const),
    ),
  );

  it.each(cases)("%s %j with %i players", (id, options, players) => {
    const g = game(id, options);
    const plan = setupPlan(g, players, defaults);
    const portionOk = (p: ChipPortion) => expect(sum(p.owned) + sum(p.missing)).toBe(p.amount);
    portionOk(plan.perPlayer);
    for (const chip of DEFAULT_CHIPS) {
      const given = countOf(plan.perPlayer.owned, chip.value) * players;
      if (plan.bank.kind === "fixed") {
        const bankOwned = countOf(plan.bank.portion.owned, chip.value);
        expect(given + bankOwned + countOf(plan.bank.setAside, chip.value), `${chip.value}`).toBe(chip.countAvailable);
      } else {
        expect(given + countOf(plan.bank.owned, chip.value), `${chip.value}`).toBe(chip.countAvailable);
      }
    }
    if (plan.bank.kind === "fixed") {
      const { portion, difference, total } = plan.bank;
      expect(players * plan.perPlayer.amount + portion.amount).toBe(total);
      expect(difference).toBe(0);
      portionOk(portion);
    }
  });

  it("1830 with 7 players computes in under 50 ms (SC-004, R14)", () => {
    setupPlan(game("1830"), 7, defaults); // warm-up
    const started = performance.now();
    const plan = setupPlan(game("1830"), 7, defaults);
    expect(performance.now() - started).toBeLessThan(50);
    expect(fixedBank(plan).portion.amount).toBe(12000 - 7 * 350);
  });
});

describe("setupPlan: bank pins (US3-6..9, R16)", () => {
  const g1830 = game("1830");

  it("pin green 6: red refills to 47 and the bank stays exact", () => {
    const plan = setupPlan(g1830, 4, defaults, { "500": 6 });
    const bank = fixedBank(plan);
    expect(bank.portion).toEqual({ amount: 9600, owned: cc("6×500, 47×100, 50×25, 100×5, 150×1"), missing: [] });
    expect(bank.setAside).toEqual(cc("40×500, 99×100"));
    expect(bank.pinned).toEqual([500]);
    expect(bank.difference).toBe(0);
  });

  it("pin green 20: everything else is 0 and the bank has 400 too much, nothing missing", () => {
    const plan = setupPlan(g1830, 4, defaults, { "500": 20 });
    const bank = fixedBank(plan);
    expect(bank.portion.owned).toEqual(cc("20×500"));
    expect(bank.portion.missing).toEqual([]);
    expect(bank.difference).toBe(400);
    expect(plan.missing).toEqual([]);
  });

  it("green count 10 and pin green 8: 6 owned + 2 missing green, the other colors refill 5,600", () => {
    const plan = setupPlan(g1830, 4, withCounts({ 500: 10 }), { "500": 8 });
    const bank = fixedBank(plan);
    expect(countOf(bank.portion.owned, 500)).toBe(6);
    expect(bank.portion.missing).toEqual(cc("2×500"));
    expect(sum(bank.portion.owned.filter((c) => c.value !== 500))).toBe(5600);
    expect(bank.difference).toBe(0);
    expect(plan.missing).toEqual(cc("2×500"));
  });

  it("a pin for a value not in the set is ignored, and cleanPins drops it", () => {
    expect(setupPlan(g1830, 4, defaults, { "50": 3 })).toEqual(setupPlan(g1830, 4, defaults));
    expect(cleanPins({ "50": 3, "500": 6 }, defaults)).toEqual({ "500": 6 });
    expect(cleanPins(undefined, defaults)).toEqual({});
  });

  it("an unlimited bank ignores pins", () => {
    const moon = game("21moon");
    expect(setupPlan(moon, 3, defaults, { "500": 2, "100": 4 })).toEqual(setupPlan(moon, 3, defaults));
  });

  it("pins {} are the same as no pins", () => {
    expect(setupPlan(g1830, 4, defaults, {})).toEqual(setupPlan(g1830, 4, defaults));
  });

  it("every color pinned at 0: the bank is short by 9,600", () => {
    const pins = Object.fromEntries(DEFAULT_CHIPS.map((c) => [String(c.value), 0]));
    const bank = fixedBank(setupPlan(g1830, 4, defaults, pins));
    expect(bank.portion.owned).toEqual([]);
    expect(bank.difference).toBe(-9600);
    expect(bank.pinned).toEqual([500, 100, 25, 5, 1]);
  });
});

describe("fill (R6)", () => {
  it("fewest missing chips first, then fewest chips", () => {
    const available = [
      { value: 500, count: 0 },
      { value: 100, count: 3 },
      { value: 25, count: undefined },
    ];
    expect(fill(1000, available, [500, 100])).toEqual({ amount: 1000, owned: cc("3×100, 28×25"), missing: [] });
    expect(fill(1000, [{ value: 500, count: 1 }], [500])).toEqual({ amount: 1000, owned: cc("1×500"), missing: cc("1×500") });
  });
});

describe("missing chips and their warning (US5, FR-023, R6)", () => {
  const g1830 = game("1830");

  it("1830, 4 players, green 10 and red 10: the bank misses 8 green and 1 red (R13)", () => {
    const set = withCounts({ 500: 10, 100: 10 });
    const plan = setupPlan(g1830, 4, set);
    expect(plan.perPlayer).toEqual({ amount: 600, owned: cc("1×500, 1×100"), missing: [] });
    const bank = fixedBank(plan);
    expect(bank.portion.owned).toEqual(cc("6×500, 6×100, 50×25, 100×5, 150×1"));
    expect(bank.portion.missing).toEqual(cc("8×500, 1×100"));
    expect(bank.setAside).toEqual([]);
    expect(plan.missing).toEqual(cc("8×500, 1×100"));
    expect(missingWarningEs(plan, set)).toBe("Faltan 8 fichas verdes (500), 1 roja (100)");
  });

  it("no warning for the default plan", () => {
    expect(missingWarningEs(setupPlan(g1830, 4, defaults), defaults)).toBeNull();
  });

  it("green count 0: each player gets 6×100 and green is never missing", () => {
    const plan = setupPlan(g1830, 4, withCounts({ 500: 0 }));
    expect(plan.perPlayer.owned).toEqual(cc("6×100"));
    expect(countOf(plan.missing, 500)).toBe(0);
  });

  it("US5-4: no 1s or 5s and 630 each: 1×25 plus a missing 5 per player", () => {
    const set = withCounts({ 5: 0, 1: 0 });
    const plan = setupPlan(game("1848"), 4, set);
    expect(plan.perPlayer).toEqual({ amount: 630, owned: cc("1×500, 1×100, 1×25"), missing: cc("1×5") });
    expect(countOf(plan.missing, 5)).toBeGreaterThanOrEqual(4);
    expect(missingWarningEs(plan, set)).toMatch(/^Faltan \d+ fichas azules \(5\)/);
  });

  it("an unlimited color is never missing", () => {
    const set = withCounts({ 500: 0, 100: 0, 25: undefined });
    const plan = setupPlan(g1830, 4, set);
    expect(countOf(plan.missing, 25)).toBe(0);
    expect(plan.missing).toEqual([]);
  });

  it("singular agreement, and colors outside the defaults fall back to the value", () => {
    const set: ChipSet = {
      chips: [
        { value: 500, color: "#2e7d32", countAvailable: 0 },
        { value: 50, color: "#ef6c00", countAvailable: 0 },
        { value: 1, color: "#f5f5f5" },
      ],
    };
    const plan: SetupPlan = {
      playerCount: 1,
      perPlayer: { amount: 0, owned: [], missing: [] },
      bank: { kind: "unlimited", owned: [], unlimitedValues: [1] },
      missing: cc("1×500, 3×50"),
    };
    expect(missingWarningEs(plan, set)).toBe("Faltan 1 ficha verde (500), 3 de 50");
    expect(missingWarningEs({ ...plan, missing: cc("2×50") }, set)).toBe("Faltan 2 fichas de 50");
  });
});
