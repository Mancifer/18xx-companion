import { describe, expect, it } from "vitest";
import { zeroRunAction } from "../../src/domain/actions/expand/operating";
import { getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";
import { createCustomGame, editCustomGame } from "../../src/domain/games/customGame";
import { DEFAULT_CHIPS } from "../../src/domain/games/chips";
import { builtInGames } from "../../src/domain/games";

describe("custom games (FR-007, contracts/game-definition.md rule 4)", () => {
  it("copies a built-in with a new id and basedOn", () => {
    const custom = createCustomGame(getBuiltInGame("1830"), "1830 corto");
    expect(custom.id).not.toBe("1830");
    expect(custom.id).toMatch(/^custom-/);
    expect(custom.basedOn).toBe("1830");
    expect(custom.name).toBe("1830 corto");
  });

  it.each(builtInGames.map((g) => [g.id] as const))("a new custom game based on %s copies the default chips (FR-003)", (id) => {
    expect(createCustomGame(getBuiltInGame(id), "Casera").chipPreset).toEqual(DEFAULT_CHIPS);
  });

  it("a saved custom game keeps its own chip preset (FR-003)", () => {
    const own = [{ value: 50, color: "#ef6c00", label: "50" }, { value: 10, color: "#1565c0" }];
    const result = editCustomGame(createCustomGame(getBuiltInGame("1830"), "Vieja"), { chipPreset: own });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.chipPreset).toEqual(own);
  });

  it("inherits the base game's scoring block (feature 007)", () => {
    expect(createCustomGame(getBuiltInGame("rotla"), "RotLA casero").scoring).toEqual(getBuiltInGame("rotla").scoring);
  });

  it("edits the bank and a company name without touching the built-in (US1-5)", () => {
    const builtIn = getBuiltInGame("1830");
    const before = JSON.stringify(builtIn);
    const custom = createCustomGame(builtIn, "Variante");
    const result = editCustomGame(custom, {
      bank: { total: 15000 },
      companies: { PRR: { name: "Pennsylvania Railroad" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.bank).toEqual({ total: 15000 });
    expect(result.definition.companies.find((c) => c.id === "PRR")?.name).toBe("Pennsylvania Railroad");
    expect(JSON.stringify(builtIn)).toBe(before);
  });

  it("edits starting cash, private cost/income, train cost/count and the chip preset", () => {
    const custom = createCustomGame(getBuiltInGame("1830"), "Variante");
    const result = editCustomGame(custom, {
      startingCash: { "4": 650 },
      privates: { SV: { cost: 25, income: 6 } },
      trains: { "2": { cost: 90, count: 5 } },
      chipPreset: [{ value: 100, color: "#000" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.startingCash["4"]).toBe(650);
    expect(result.definition.privates.find((p) => p.id === "SV")).toMatchObject({ cost: 25, income: 6 });
    const two = result.definition.trains.find((t) => t.type === "2");
    expect(two?.count).toBe(5);
    expect(two?.variants[0]?.cost).toBe(90);
  });

  it("rejects edits to non-editable fields", () => {
    const custom = createCustomGame(getBuiltInGame("1830"), "Variante");
    for (const field of ["market", "phases", "payoutModes", "revenueParts", "rounding", "capitalization", "roundSchedule", "customRules"]) {
      const result = editCustomGame(custom, { [field]: [] });
      expect(result.ok, field).toBe(false);
    }
  });

  it("edits both names of a RotLA major (FR-005a)", () => {
    const custom = createCustomGame(getBuiltInGame("rotla"), "RotLA casera");
    const result = editCustomGame(custom, { companies: { INT: { name: "Internacional", altName: "Intercontinental" } } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.definition.companies.find((c) => c.id === "INT")).toMatchObject({ name: "Internacional", altName: "Intercontinental" });
    expect(getBuiltInGame("rotla").companies.find((c) => c.id === "INT")?.altName).toBe("Inc.");
  });

  it("rejects an edit that fails validation (starting cash × max players > bank)", () => {
    const custom = createCustomGame(getBuiltInGame("1830"), "Variante");
    expect(editCustomGame(custom, { bank: { total: 1000 } }).ok).toBe(false);
  });
});

describe("zero run in a custom game without withhold (T005)", () => {
  it("uses a zero full payout, which counts as a withhold", () => {
    const base = getBuiltInGame("1830");
    const game = { ...base, payoutModes: ["full"] as const };
    expect(zeroRunAction(game as never, "PRR").mode).toBe("full");
    const s = seedCompany(TestSession.start(game as never, makePlayers(["Ana", "Bruno", "Carla"])), "PRR", {
      cell: { row: 0, col: 8 },
      holders: { "player:p1": 6 },
    });
    s.do(zeroRunAction(s.game, "PRR"));
    expect(s.state.companies["PRR"]?.position).toEqual({ row: 0, col: 7 });
  });
});
