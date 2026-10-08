import { describe, expect, it } from "vitest";
import { GameDefinitionSchema, type GameDefinition } from "../../src/domain/games/schema";
import { validateDefinition } from "../../src/domain/games/validateDefinition";
import { miniGame } from "../helpers/miniGame";

const errorsOf = (def: unknown) => {
  const result = validateDefinition(def);
  return result.ok ? [] : result.errors;
};

describe("definition schema", () => {
  it("accepts the mini game", () => {
    expect(validateDefinition(miniGame)).toEqual({ ok: true, definition: miniGame });
  });

  it("rejects playerCount.max > 7 (`max ≤ 7` (validated))", () => {
    expect(GameDefinitionSchema.safeParse({ ...miniGame, playerCount: { min: 2, max: 8 } }).success).toBe(false);
  });
});

describe("semantic validation", () => {
  it("requires starting cash for every player count in range", () => {
    const def: GameDefinition = { ...miniGame, startingCash: { "2": 300 } };
    expect(errorsOf(def).join()).toMatch(/startingCash.*3/);
  });

  it("requires startingCash × max players ≤ bank, unless unlimited", () => {
    const def: GameDefinition = { ...miniGame, bank: { total: 500 } };
    expect(errorsOf(def).join()).toMatch(/bank/);
    expect(errorsOf({ ...def, bank: "unlimited" })).toEqual([]);
  });

  it("requires each par option to exist as a par-tagged cell", () => {
    const def: GameDefinition = {
      ...miniGame,
      companies: miniGame.companies.map((c) => ({ ...c, parOptions: [60] })),
    };
    expect(errorsOf(def).join()).toMatch(/par/);
  });

  it("requires rustsOnPhase to name a defined phase", () => {
    const def: GameDefinition = {
      ...miniGame,
      trains: miniGame.trains.map((t) => (t.type === "2" ? { ...t, rustsOnPhase: "9" } : t)),
    };
    expect(errorsOf(def).join()).toMatch(/rustsOnPhase/);
  });

  it("requires certificate units to sum to shareCount", () => {
    const def: GameDefinition = {
      ...miniGame,
      companies: miniGame.companies.map((c) => ({ ...c, certificates: [2, 1, 1] })),
    };
    expect(errorsOf(def).join()).toMatch(/certificates/);
  });

  it("requires every market row to have at least one cell", () => {
    const def: GameDefinition = {
      ...miniGame,
      market: { ...miniGame.market, cells: [...miniGame.market.cells, [null, null]] },
    };
    expect(errorsOf(def).join()).toMatch(/row/);
  });

  it("rejects an unknown customRules id", () => {
    const def: GameDefinition = { ...miniGame, customRules: [{ id: "teleport", config: {} }] };
    expect(errorsOf(def).join()).toMatch(/teleport/);
  });

  it("rejects loans with interest or repayment (data only in v1, constitution VII)", () => {
    const loans = {
      amount: 100,
      lender: "bank",
      supply: 5,
      interestPerOR: 10,
      repayable: true,
      voluntaryLimit: 5,
      availableFromPhase: "2",
      marketEffect: { first: 1, subsequentInOR: 1 },
    };
    expect(validateDefinition({ ...miniGame, loans }).ok).toBe(false);
  });
});
