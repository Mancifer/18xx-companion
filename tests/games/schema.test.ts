import { describe, expect, it } from "vitest";
import { GameDefinitionSchema, type GameDefinition } from "../../src/domain/games/schema";
import { validateDefinition } from "../../src/domain/games/validateDefinition";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
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

// ---------------------------------------------------------------------------------------------
// Feature 004 (RotLA): optional schema additions (data-model §1)

const parses = (def: unknown) => GameDefinitionSchema.safeParse(def).success;
const withCompany = (patch: Record<string, unknown>) => ({
  ...miniGame,
  companies: miniGame.companies.map((c, i) => (i === 0 ? { ...c, ...patch } : c)),
});
const withTrain = (patch: Record<string, unknown>) => ({
  ...miniGame,
  trains: miniGame.trains.map((t, i) => (i === 0 ? { ...t, ...patch } : t)),
});
const withPhase = (patch: Record<string, unknown>) => ({
  ...miniGame,
  phases: miniGame.phases.map((p, i) => (i === 0 ? { ...p, ...patch } : p)),
});
const withMoves = (patch: Record<string, unknown>) => ({
  ...miniGame,
  market: { ...miniGame.market, moves: { ...miniGame.market.moves, ...patch } },
});

describe("feature 004 schema fields", () => {
  it("CompanyDef: tier, start, altName, altAliases and traits", () => {
    expect(
      parses(
        withCompany({
          tier: "minor",
          start: "auction",
          altName: "Alpha II",
          altAliases: ["alfa dos"],
          traits: {
            trainLimitBonus: 1,
            keepsRustedTrains: true,
            launchFee: 50,
            launchAssets: ["train:M2:1"],
            noLeadoffTrain: true,
            payments: [{ id: "tunneling", labelEs: "Montaña", amount: 60, direction: "bankPays", cost: 40 }],
          },
        }),
      ),
    ).toBe(true);
    expect(parses(withCompany({ tier: "major", start: "merger" }))).toBe(true);
    expect(parses(withCompany({ tier: "huge" }))).toBe(false);
    expect(parses(withCompany({ start: "draft" }))).toBe(false);
    expect(parses(withCompany({ traits: { trainLimitBonus: -1 } }))).toBe(false);
    expect(parses(withCompany({ traits: { launchFee: 0 } }))).toBe(false);
    expect(parses(withCompany({ traits: { payments: [{ id: "x", labelEs: "X", amount: 10, direction: "sideways" }] } }))).toBe(false);
    expect(
      parses(withCompany({ traits: { payments: [{ id: "x", labelEs: "X", amount: 10, direction: "companyPays", cost: 0 }] } })),
    ).toBe(false);
  });

  it("TrainDef: countByPlayers, special, tradeIn.variant/to, displayName, cost ≥ 0", () => {
    expect(
      parses(
        withTrain({
          countByPlayers: { "2": 1, "3": 2 },
          special: true,
          displayName: "Dos",
          tradeIn: { fromTypes: ["3"], cost: 50, variant: "2", to: "removed" },
        }),
      ),
    ).toBe(true);
    expect(parses(withTrain({ tradeIn: { fromTypes: ["3"], cost: 50, to: "discard" } }))).toBe(true);
    expect(parses(withTrain({ tradeIn: { fromTypes: ["3"], cost: 50, to: "bin" } }))).toBe(false);
    expect(parses(withTrain({ variants: [{ name: "2", cost: 0 }] }))).toBe(true);
    expect(parses(withTrain({ variants: [{ name: "2", cost: -1 }] }))).toBe(false);
    expect(parses(withTrain({ countByPlayers: { "2": 0 } }))).toBe(false);
  });

  it("PhaseDef: trainLimitByTier, launchPriceRange, color", () => {
    expect(parses(withPhase({ trainLimitByTier: { minor: 2, major: 4 }, launchPriceRange: [50, 60], color: "Verde" }))).toBe(true);
    expect(parses(withPhase({ trainLimitByTier: { minor: 2 } }))).toBe(true);
    expect(parses(withPhase({ trainLimitByTier: { minor: 0 } }))).toBe(false);
    expect(parses(withPhase({ launchPriceRange: [50] }))).toBe(false);
  });

  it("MoveRule effect, issue.from, redeem and sell.warnUnlessOperated", () => {
    expect(
      parses(
        withMoves({
          payout: [{ dir: "right", n: 1, effect: "stackBottom" }],
          issue: { from: "treasury", onlyIfFloated: false, n: 1 },
          redeem: { n: 0 },
          sell: { per: "sale", n: 1, onlyIfOperated: false, warnUnlessOperated: true },
        }),
      ),
    ).toBe(true);
    expect(parses(withMoves({ payout: [{ dir: "right", n: 1, effect: "teleport" }] }))).toBe(false);
    expect(parses(withMoves({ issue: { from: "bank", onlyIfFloated: false, n: 1 } }))).toBe(false);
    expect(parses(withMoves({ redeem: { n: -1 } }))).toBe(false);
  });

  it("GameDefinition: auction, trainExport, conditional slots, maxSharesPerBuy, cyclesComplete", () => {
    const def = {
      ...miniGame,
      auction: { minBid: 120, step: 5 },
      trainExport: { allOfType: ["2"] },
      roundSchedule: {
        type: "fixed",
        sequence: ["SR1", "OR1.1", "MR1"],
        conditional: [{ slotPrefix: "MR", phaseReached: "3" }],
        events: [],
      },
      limits: { ...miniGame.limits, maxSharesPerBuy: 1 },
      endTriggers: [{ type: "cyclesComplete" }],
    };
    expect(parses(def)).toBe(true);
    expect(parses({ ...miniGame, trainExport: null })).toBe(true);
    expect(parses({ ...miniGame, auction: { minBid: 0, step: 5 } })).toBe(false);
    expect(parses({ ...miniGame, limits: { ...miniGame.limits, maxSharesPerBuy: 0 } })).toBe(false);
  });

  it("OptionDef: kind, from, size and choice patch / removeCompanies / addCompanies / recommendedPlayers", () => {
    const option = {
      id: "mode",
      label: "Modo",
      default: "a",
      choices: [
        {
          value: "a",
          label: "A",
          patch: { bank: "unlimited" },
          removeCompanies: ["BB"],
          addCompanies: [miniGame.companies[1]],
          recommendedPlayers: { min: 2, max: 3 },
        },
      ],
    };
    const subset = {
      id: "inPlay",
      label: "En juego",
      default: "all",
      kind: "companySubset",
      from: ["AA", "BB"],
      size: { a: 1 },
      choices: [{ value: "all", label: "Todas" }],
    };
    expect(parses({ ...miniGame, options: [option, subset] })).toBe(true);
    expect(parses({ ...miniGame, options: [{ ...subset, kind: "other" }] })).toBe(false);
    expect(parses({ ...miniGame, options: [{ ...option, choices: [{ value: "a", label: "A", patch: 3 }] }] })).toBe(false);
  });

  it.each(["1830", "1848", "21moon"])("%s parses to exactly its own data (no defaults injected)", (id) => {
    const g = getBuiltInGame(id);
    expect(GameDefinitionSchema.parse(g)).toEqual(g);
  });
});

// ---------------------------------------------------------------------------------------------
// Feature 004: definition validation rules 1–9 (data-model §6)

const auctionMinor = { tier: "minor", start: "auction", shareCount: 5, presidencyUnits: 2, certificates: [2, 1, 1, 1] };
const ranged = <T extends object>(def: T) => ({
  ...def,
  phases: miniGame.phases.map((p) => ({ ...p, launchPriceRange: [45, 60] })),
  auction: { minBid: 100, step: 5 },
});

describe("validateDefinition: feature 004 rules", () => {
  it("1. start: auction needs game.auction and a launchPriceRange in every phase", () => {
    const def = withCompany(auctionMinor);
    expect(errorsOf(def).join()).toMatch(/auction/);
    expect(errorsOf({ ...def, auction: { minBid: 100, step: 5 } }).join()).toMatch(/launchPriceRange/);
    expect(errorsOf(ranged(def))).toEqual([]);
  });

  it("2. launchPriceRange bounds must be cell prices", () => {
    const def = { ...ranged(withCompany(auctionMinor)), phases: miniGame.phases.map((p) => ({ ...p, launchPriceRange: [45, 65] })) };
    expect(errorsOf(def).join()).toMatch(/launchPriceRange.*65/);
  });

  it("3. a merger major's shareCount = min minor + max minor shareCount", () => {
    const minor = { ...miniGame.companies[0], ...auctionMinor };
    const major = (shareCount: number) => ({
      ...miniGame.companies[1],
      tier: "major",
      start: "merger",
      shareCount,
      certificates: [2, ...Array<number>(shareCount - 2).fill(1)],
    });
    expect(errorsOf(ranged({ ...miniGame, companies: [minor, major(9)] })).join()).toMatch(/shareCount/);
    expect(errorsOf(ranged({ ...miniGame, companies: [minor, major(10)] }))).toEqual([]);
  });

  it("4. launchAssets must name special trains", () => {
    const def = withCompany({ traits: { launchAssets: ["train:2:1"] } });
    expect(errorsOf(def).join()).toMatch(/launchAssets/);
    const m2 = { type: "M2", variants: [{ name: "2", cost: 0 }], count: 1, permanent: true, countsForLimit: true, special: true };
    const ok = { ...withCompany({ traits: { launchAssets: ["train:M2:1"] } }), trains: [...miniGame.trains, m2] };
    expect(errorsOf(ok)).toEqual([]);
  });

  it("5. trainExport.allOfType must name known types", () => {
    expect(errorsOf({ ...miniGame, trainExport: { allOfType: ["9"] } }).join()).toMatch(/trainExport/);
    expect(errorsOf({ ...miniGame, trainExport: { allOfType: ["2"] } })).toEqual([]);
  });

  it("6. conditional slots must name a defined phase", () => {
    const sched = (phase: string) => ({
      ...miniGame,
      roundSchedule: {
        type: "fixed",
        sequence: ["SR1", "OR1.1", "MR1"],
        conditional: [{ slotPrefix: "MR", phaseReached: phase }],
        events: [],
      },
    });
    expect(errorsOf(sched("9")).join()).toMatch(/conditional/);
    expect(errorsOf(sched("3"))).toEqual([]);
  });

  it("7. countByPlayers keys lie within playerCount", () => {
    expect(errorsOf(withTrain({ countByPlayers: { "5": 1 } })).join()).toMatch(/countByPlayers/);
    expect(errorsOf(withTrain({ countByPlayers: { "3": 1 } }))).toEqual([]);
  });

  it("8. companySubset.from must name known companies", () => {
    const subset = (from: string[]) => ({
      ...miniGame,
      options: [
        { id: "inPlay", label: "En juego", default: "all", kind: "companySubset", from, choices: [{ value: "all", label: "Todas" }] },
      ],
    });
    expect(errorsOf(subset(["AA", "ZZ"])).join()).toMatch(/ZZ/);
    expect(errorsOf(subset(["AA", "BB"]))).toEqual([]);
  });

  it("9. startingCash coverage runs on the patched copy", () => {
    const def = {
      ...miniGame,
      options: [{ id: "cash", label: "Cash", default: "low", choices: [{ value: "low", label: "Low", patch: { startingCash: { "2": 100, "3": null } } }] }],
    } as unknown as GameDefinition;
    expect(() => applyOptions(def, {})).toThrow(/startingCash/);
  });
});

describe("feature 007 schema fields: scoring and scheduleComplete", () => {
  const scoring = { autoEnd: ["scheduleComplete"], bankruptPlayers: "eliminated", tieBreak: "shared" };

  it("scoring is optional on GameDefinition", () => {
    expect(parses(miniGame)).toBe(true);
    expect(parses({ ...miniGame, scoring })).toBe(true);
  });

  it("autoEnd accepts only the four end types, and holds distinct values (`autoEnd` holds distinct values)", () => {
    for (const t of ["cyclesComplete", "scheduleComplete", "bankBroken", "bankruptcy"]) {
      expect(parses({ ...miniGame, scoring: { ...scoring, autoEnd: [t] } })).toBe(true);
    }
    expect(parses({ ...miniGame, scoring: { ...scoring, autoEnd: [] } })).toBe(true);
    expect(parses({ ...miniGame, scoring: { ...scoring, autoEnd: ["topCell"] } })).toBe(false);
    expect(parses({ ...miniGame, scoring: { ...scoring, autoEnd: ["bankBroken", "bankBroken"] } })).toBe(false);
  });

  it("bankruptPlayers is eliminated | scored, tieBreak is shared | presidentEarliest", () => {
    expect(parses({ ...miniGame, scoring: { ...scoring, bankruptPlayers: "scored" } })).toBe(true);
    expect(parses({ ...miniGame, scoring: { ...scoring, bankruptPlayers: "removed" } })).toBe(false);
    expect(parses({ ...miniGame, scoring: { ...scoring, tieBreak: "presidentEarliest" } })).toBe(true);
    expect(parses({ ...miniGame, scoring: { ...scoring, tieBreak: "seat" } })).toBe(false);
  });

  it("shareBonus.perUnit is a positive integer (`perUnit` is a positive integer)", () => {
    const bonus = (perUnit: number) => ({ ...miniGame, scoring: { ...scoring, shareBonus: { counter: "eastWestTokens", perUnit } } });
    expect(parses(bonus(50))).toBe(true);
    expect(parses(bonus(0))).toBe(false);
    expect(parses(bonus(-50))).toBe(false);
    expect(parses(bonus(2.5))).toBe(false);
  });

  it("{ type: scheduleComplete } is a valid end trigger", () => {
    expect(parses({ ...miniGame, endTriggers: [{ type: "scheduleComplete" }] })).toBe(true);
  });
});
