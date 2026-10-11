import type { CompanyDef, GameDefinition } from "./schema";
import { parseMarket } from "./marketText";
import { DEFAULT_CHIPS } from "./chips";

/**
 * 21Moon (docs/rules/21Moon_Rules.pdf). Values and rule sections are in research.md R15; the
 * market grid is transcribed from the board image (rulebook p. 3). Company and private details:
 * rulebook §6.
 */

const company = (
  id: string,
  name: string,
  color: string,
  textColor: string,
  aliases: string[],
): CompanyDef => ({
  id,
  shortName: id,
  name,
  aliases,
  color,
  textColor,
  shareCount: 10,
  presidencyUnits: 2,
  certificates: [2, 1, 1, 1, 1, 1, 1, 1, 1],
  parOptions: [60, 70, 80, 90],
  kind: "public",
});

const COMPANIES = ["SWP", "HMQ", "VH", "ITC", "SSF", "LG", "KR"] as const;
const closesAtOR41 = { type: "scheduled", slot: "OR4.1" } as const;

const sequence = [
  "PRIVATES",
  ...[1, 2, 3, 4, 5].flatMap((n) => [`SR${n}`, `CR${n}`, `OR${n}.1`, `OR${n}.2`]),
  "OR5.3",
];

export const g21moon: GameDefinition = {
  id: "21moon",
  name: "21Moon",
  version: "1.0.0",
  currency: { symbol: "₡" },
  playerCount: { min: 2, max: 5 },
  options: [
    {
      id: "lateCompany",
      label: "Compañía disponible desde SR3",
      // §2.4: chosen at random at setup.
      default: null,
      choices: COMPANIES.map((id) => ({ value: id, label: id, companyAvailableFrom: "SR3" })),
    },
  ],
  // §2.13: "in practical terms unlimited". The money invariant is skipped.
  bank: "unlimited",
  initialTreasuries: [],
  startingCash: { "2": 600, "3": 540, "4": 410, "5": 340 },
  companies: [
    company("SWP", "Suijin Water Plants", "#1f5fbf", "#ffffff", ["suijin", "water plants"]),
    company("HMQ", "Hematite Low-G Mining and Quarry", "#c62828", "#ffffff", ["hematite", "hache eme cu"]),
    company("VH", "Varuna Hydroculture", "#f4c20d", "#1b1b1b", ["varuna", "uve hache", "la uve"]),
    company("ITC", "International Tritium Consortium", "#7b3fa0", "#ffffff", ["tritium", "i te ce"]),
    company("SSF", "Shamsum Solar Farms", "#ef7d1a", "#1b1b1b", ["shamsum", "solar"]),
    company("LG", "Lunar Geodynamics", "#2e7d32", "#ffffff", ["lunar", "geodynamics", "ele ge"]),
    company("KR", "Kiviuq Rovertech", "#7a4b2a", "#ffffff", ["kiviuq", "rovertech", "ka erre"]),
  ],
  privates: [
    { id: "P1", name: "Old Landing Site", aliases: ["ols", "landing site"], cost: 30, income: 0,
      companyPriceRange: { range: [1, 1] }, closesOn: [{ type: "boughtByCompany" }, closesAtOR41] },
    { id: "P2", name: "UN Contract", aliases: ["un contract", "contrato"], cost: 30, income: 5,
      companyPriceRange: { range: [1, 45] }, closesOn: [{ type: "boughtByCompany" }, closesAtOR41] },
    { id: "P3", name: "Space Bridge Company", aliases: ["space bridge", "puente"], cost: 40, income: 10,
      companyPriceRange: { range: [1, 60] }, closesOn: [{ type: "manual" }, closesAtOR41] },
    { id: "P4", name: "Research Lab", aliases: ["research lab", "laboratorio"], cost: 60, income: 10,
      companyPriceRange: { range: [1, 90] }, closesOn: [{ type: "manual" }, closesAtOR41] },
    { id: "P5", name: "Passenger Terminal", aliases: ["terminal"], cost: 80, income: 15,
      companyPriceRange: { range: [1, 120] }, closesOn: [{ type: "manual" }, closesAtOR41] },
    { id: "P6", name: "Tunnel Company", aliases: ["tunnel", "tunel"], cost: 100, income: 15,
      companyPriceRange: { range: [1, 150] },
      // §6.1.6: take one certificate of any company from the pool for free, closing it.
      exchange: { company: "*", units: 1, source: "pool" },
      closesOn: [{ type: "exchanged" }, closesAtOR41] },
  ],
  // §9.2, §10.1.2: IPO purchases and issues pay the company at the current market price.
  /** Only corporations buy privates from players; players never trade them. */
  privateTrading: "none",
  capitalization: { type: "incremental" },
  ipoPrice: "market",
  floatPercent: 50,
  floatCounts: "soldFromIpo",
  // §11.5; own treasury shares are paid to the company (user-confirmed).
  unownedDividends: { ipo: "none", pool: "none", treasury: "company" },
  revenueParts: [
    { id: "local", label: "Base local", to: "treasury" },
    { id: "spacePort", label: "Puerto espacial", to: "dividend" },
  ],
  payoutModes: [],
  // The rulebook states no rounding rule; revenues are built from multiples of 10, so
  // per-share amounts are whole. Floor is a safe default if that ever changes.
  rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 1 },
  market: {
    shape: "2d",
    cells: parseMarket([
      "-    -    -    -    -    -    -    -    -    -    -    -    -    -    330↓ 360  395  430",
      "-    -    100↓ 110  120  130  140  150  160  175  195  215  240  265  295  325  360  395↑",
      "70↓  80   90*  100  110  120  130  140  150  160  175  190  215  235  260  285  315  345↑",
      "60↓  70   80*  90   100  110  120  130  140  150  160  175  190  200  220  250  275  300↑",
      "50↓  60   70*  80   90   100  110  120  130  140  150  160  175  190↑",
      "40↓  50   60*  70   80   90   100  110  120  130  140  150↑",
      "CLOSED 40 50   60   70   80   90   100  110  120↑",
    ]),
    // Only the printed arrows move a token off the end of a row.
    edges: { right: "none", left: "none" },
    moves: {
      // §11.5: Space Port earnings E against the pre-move price P.
      payout: [
        { when: { dividendEquals: 0 }, dir: "left", n: 1 },
        { when: { dividendAtLeast: { priceTimes: 2 } }, dir: "right", n: 2 },
        { when: { dividendAtLeast: { priceTimes: 0.5 } }, dir: "right", n: 1 },
      ],
      withhold: [{ dir: "left", n: 1 }],
      sell: { per: "sale", n: 1, onlyIfOperated: true },
      soldOut: { heldBy: "playersAndCompanies", at: "endCR" },
      poolPenalty: { at: "endCR", onlyIfOperated: true },
      issue: { onlyIfFloated: true, n: 1 },
    },
  },
  trains: [
    { type: "2", variants: [{ name: "2", cost: 120 }], count: 5, rustsOnPhase: "5", permanent: false, countsForLimit: true },
    { type: "3", variants: [{ name: "3", cost: 150 }], count: 4, rustsOnPhase: "6", permanent: false, countsForLimit: true, reserve: 1 },
    { type: "4", variants: [{ name: "4", cost: 240 }], count: 3, rustsOnPhase: "10", permanent: false, countsForLimit: true, reserve: 1 },
    { type: "5", variants: [{ name: "5", cost: 500 }], count: 2, permanent: true, countsForLimit: true, reserve: 1 },
    { type: "6", variants: [{ name: "6", cost: 540 }], count: 2, permanent: true, countsForLimit: true, reserve: 1 },
    { type: "10", variants: [{ name: "10", cost: 730 }], count: "unlimited", permanent: true, countsForLimit: true },
  ],
  trainLimitScope: { perBase: 2, bases: ["local", "spacePort"] },
  phases: [
    { id: "2", triggeredBy: null, orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "3", triggeredBy: "3", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "4", triggeredBy: "4", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "5", triggeredBy: "5", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "6", triggeredBy: "6", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "10", triggeredBy: "10", orsPerSet: 2, trainLimit: 4, effects: [] },
  ],
  roundSchedule: {
    type: "fixed",
    sequence,
    events: [
      { at: "OR3.1", effect: { type: "note", text: "El puerto espacial vale 30" } },
      { at: "OR4.1", effect: { type: "closePrivates" } },
      { at: "OR5.1", effect: { type: "note", text: "El puerto espacial vale 40" } },
    ],
  },
  srOrder: "priorityDeal",
  orOrder: { by: "priceDesc", ties: ["columnRight", "stackTop"], dynamic: true },
  limits: {
    certificates: { "2": 15, "3": 15, "4": 12, "5": 10 },
    perCompanyPercent: 50,
    perCompanyPercentByPlayers: { "2": 60 },
    pool: { maxPercent: 50 },
  },
  endTriggers: [{ type: "lastRound" }, { type: "scheduleComplete" }, { type: "bankruptcy" }],
  // §13: the game ends at the conclusion of OR 5.3; each share is worth its price plus 50 per
  // East-West bonus token its company holds. §11.8.1: a bankrupt player leaves the game.
  scoring: {
    autoEnd: ["scheduleComplete"],
    bankruptPlayers: "eliminated",
    tieBreak: "shared",
    shareBonus: { counter: "eastWestTokens", perUnit: 50 },
  },
  customRules: [
    { id: "corporateRound", config: {} },
    { id: "forcedWithhold", config: {} },
    { id: "corporateBankruptcy", config: { trigger: "closedCell" } },
    { id: "privateGrants", config: {} },
  ],
  chipPreset: [...DEFAULT_CHIPS],
  verification: {
    privateTrading: "verified",
    bank: "verified",
    startingCash: "verified",
    companies: "verified",
    privates: "verified",
    capitalization: "verified",
    ipoPrice: "verified",
    floatPercent: "verified",
    unownedDividends: "verified",
    revenueParts: "verified",
    rounding: "verified",
    market: "verified",
    trains: "verified",
    phases: "verified",
    roundSchedule: "verified",
    orOrder: "verified",
    limits: "verified",
    endTriggers: "verified",
    customRules: "verified",
    scoring: "verified",
  },
};
