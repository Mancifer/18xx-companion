import type { GameDefinition } from "../../src/domain/games/schema";
import type { Player } from "../../src/domain/types";

/**
 * A tiny but valid game used by domain tests. Values are invented; per-game rule tests use the
 * real built-in definitions instead.
 *
 * Market (2 rows):
 *   row0:  50p  60   70   80t
 *   row1:  40   45p  55   --
 */
export const miniGame: GameDefinition = {
  id: "mini",
  name: "Mini",
  version: "1.0.0",
  currency: { symbol: "$" },
  playerCount: { min: 2, max: 3 },
  options: [],
  bank: { total: 1000 },
  initialTreasuries: [],
  startingCash: { "2": 300, "3": 200 },
  companies: [
    {
      id: "AA",
      shortName: "AA",
      name: "Alpha",
      aliases: ["alfa"],
      color: "#cc0000",
      textColor: "#ffffff",
      shareCount: 10,
      presidencyUnits: 2,
      certificates: [2, 1, 1, 1, 1, 1, 1, 1, 1],
      parOptions: [50, 45],
      kind: "public",
    },
    {
      id: "BB",
      shortName: "BB",
      name: "Beta",
      aliases: [],
      color: "#0033cc",
      textColor: "#ffffff",
      shareCount: 10,
      presidencyUnits: 2,
      certificates: [2, 1, 1, 1, 1, 1, 1, 1, 1],
      parOptions: [50, 45],
      kind: "public",
    },
  ],
  privates: [
    { id: "P1", name: "Private One", aliases: [], cost: 20, income: 5, closesOn: [{ type: "phase", phase: "3" }] },
  ],
  capitalization: { type: "full", timing: "onFloat" },
  ipoPrice: "par",
  floatPercent: 60,
  floatCounts: "soldFromIpo",
  unownedDividends: { ipo: "none", pool: "company", treasury: "none" },
  revenueParts: [{ id: "revenue", label: "Ingresos", to: "choice" }],
  payoutModes: ["full", "withhold", "half"],
  rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 1 },
  market: {
    shape: "2d",
    cells: [
      [{ price: 50, tags: ["par"] }, { price: 60 }, { price: 70 }, { price: 80, tags: ["top"] }],
      [{ price: 40 }, { price: 45, tags: ["par"] }, { price: 55 }, null],
    ],
    edges: { right: "up", left: "down" },
    moves: {
      payout: [{ dir: "right", n: 1 }],
      withhold: [{ dir: "left", n: 1 }],
      half: [],
      sell: { per: "share", n: 1, onlyIfOperated: false },
      soldOut: { heldBy: "players", at: "endSR" },
    },
  },
  trains: [
    { type: "2", variants: [{ name: "2", cost: 80 }], count: 2, rustsOnPhase: "4", permanent: false, countsForLimit: true },
    { type: "3", variants: [{ name: "3", cost: 180 }], count: 2, permanent: false, countsForLimit: true },
    { type: "4", variants: [{ name: "4", cost: 300 }], count: 1, permanent: true, countsForLimit: true },
  ],
  trainLimitScope: "company",
  phases: [
    { id: "2", triggeredBy: null, orsPerSet: 1, trainLimit: 4, effects: [] },
    { id: "3", triggeredBy: "3", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "4", triggeredBy: "4", orsPerSet: 2, trainLimit: 3, effects: [{ type: "closePrivates" }] },
  ],
  roundSchedule: { type: "byPhase" },
  srOrder: "priorityDeal",
  orOrder: { by: "priceDesc", ties: ["stackTop", "columnRight", "rowTop"], dynamic: true },
  limits: { certificates: { "2": 20, "3": 15 }, perCompanyPercent: 60, pool: { maxPercent: 50 } },
  endTriggers: [{ type: "bankBroken" }],
  customRules: [],
  chipPreset: [
    { value: 100, color: "#222222" },
    { value: 10, color: "#2a6" },
    { value: 1, color: "#eee" },
  ],
  verification: { "*": "verified" },
};

export const miniPlayers: Player[] = [
  { id: "p1", name: "Ana", aliases: [], color: "#e53935", seat: 1 },
  { id: "p2", name: "Bruno", aliases: [], color: "#1e88e5", seat: 2 },
];
