import type { CompanyDef, GameDefinition } from "./schema";
import { parseMarket } from "./marketText";

/**
 * 1830 (Mayfair 2011 rulebook, docs/rules/1830-Rules-V1_0.pdf). Values and rule sections are in
 * research.md R14. The market is from the user's image, matching fwtwr.com.
 */

const company = (
  id: string,
  shortName: string,
  name: string,
  color: string,
  textColor: string,
  aliases: string[],
): CompanyDef => ({
  id,
  shortName,
  name,
  aliases,
  color,
  textColor,
  shareCount: 10,
  presidencyUnits: 2,
  certificates: [2, 1, 1, 1, 1, 1, 1, 1, 1],
  parOptions: [67, 71, 76, 82, 90, 100],
  kind: "public",
});

const closesOnFirst5 = { type: "phase", phase: "5" } as const;

export const g1830: GameDefinition = {
  id: "1830",
  name: "1830",
  version: "1.0.0",
  currency: { symbol: "$" },
  playerCount: { min: 2, max: 7 },
  options: [
    {
      id: "ruleset",
      label: "Reglas",
      default: "base",
      choices: [
        {
          value: "base",
          label: "Juego base",
          // §7.6.2, §7.7: the Bank lends the shortfall; the company enters receivership.
          addCustomRules: [
            { id: "bankDebt", config: { debtors: ["company"], interest: 0, autoRepayFromIncome: true } },
            { id: "forcedWithhold", config: {} },
          ],
        },
        {
          value: "classic",
          label: "1830 Classic",
          // C-2.3–2.5: a president who cannot pay goes bankrupt and the game ends.
          addCustomRules: [{ id: "corporateBankruptcy", config: { trigger: "manual", endsGame: true } }],
        },
      ],
    },
  ],
  bank: { total: 12000 },
  initialTreasuries: [],
  startingCash: { "2": 1200, "3": 800, "4": 600, "5": 480, "6": 400, "7": 350 },
  companies: [
    company("PRR", "PRR", "Pennsylvania Railroad", "#32763f", "#ffffff", ["pennsylvania", "pennsy", "la pennsy", "pe erre erre"]),
    company("NYC", "NYC", "New York Central", "#474548", "#ffffff", ["new york central", "nueva york", "ene i ce"]),
    company("CPR", "CPR", "Canadian Pacific", "#d1232a", "#ffffff", ["canadian", "canadiense", "pacific"]),
    company("B&O", "B&O", "Baltimore & Ohio", "#025aaa", "#ffffff", ["baltimore", "be y o", "b and o", "bi and ou"]),
    company("C&O", "C&O", "Chesapeake & Ohio", "#a3d4e8", "#0b2533", ["chesapeake", "ce y o", "c and o"]),
    company("Erie", "Erie", "Erie Railroad", "#f2c500", "#1b1b1b", ["erie", "la erie", "la iri", "iri"]),
    company("NNH", "NNH", "New York, New Haven & Hartford", "#f07c22", "#1b1b1b", ["new haven", "ene ene hache"]),
    company("B&M", "B&M", "Boston & Maine", "#8b5a2b", "#ffffff", ["boston", "be y eme", "b and m"]),
  ],
  privates: [
    { id: "SV", name: "Schuylkill Valley", aliases: ["schuylkill"], cost: 20, income: 5,
      companyPriceRange: { multipleOfFace: [0.5, 2] }, closesOn: [closesOnFirst5] },
    { id: "CS", name: "Champlain & St. Lawrence", aliases: ["champlain"], cost: 40, income: 10,
      companyPriceRange: { multipleOfFace: [0.5, 2] }, closesOn: [closesOnFirst5] },
    { id: "DH", name: "Delaware & Hudson", aliases: ["delaware"], cost: 70, income: 15,
      companyPriceRange: { multipleOfFace: [0.5, 2] }, closesOn: [closesOnFirst5] },
    { id: "MH", name: "Mohawk & Hudson", aliases: ["mohawk"], cost: 110, income: 20,
      companyPriceRange: { multipleOfFace: [0.5, 2] },
      // Exchangeable for a 10% NYC share from the IPO or the pool, closing the MH.
      exchange: { company: "NYC", units: 1, source: "ipoOrPool" },
      closesOn: [closesOnFirst5, { type: "exchanged" }] },
    { id: "CA", name: "Camden & Amboy", aliases: ["camden"], cost: 160, income: 25,
      companyPriceRange: { multipleOfFace: [0.5, 2] },
      grants: [{ company: "PRR", units: 1, source: "ipo" }],
      closesOn: [closesOnFirst5] },
    { id: "BO", name: "Baltimore & Ohio (privada)", aliases: ["privada baltimore"], cost: 220, income: 30,
      companyPriceRange: { multipleOfFace: [0.5, 2] },
      grants: [{ company: "B&O", units: 2, presidency: true, source: "ipo", par: "ownerChooses" }],
      closesOn: [closesOnFirst5, { type: "companyBuysTrain", company: "B&O" }] },
  ],
  capitalization: { type: "full", timing: "endOfSR" },
  ipoPrice: "par",
  floatPercent: 60,
  floatCounts: "soldFromIpo",
  unownedDividends: { ipo: "none", pool: "company", treasury: "none" },
  revenueParts: [{ id: "revenue", label: "Ingresos", to: "choice" }],
  payoutModes: ["full", "withhold"],
  // Revenues are multiples of 10, so per-share amounts are always whole.
  rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 1 },
  market: {
    shape: "2d",
    cells: parseMarket([
      "60y  67   71   76   82   90  100* 112 126 142 160 180 200 225 250 275 300 325 350#",
      "53y  60y  66   70   76   82   90* 100 112 126 142 160 180 200 220 240 260 280 300",
      "46y  55y  60y  65   70   76   82*  90 100 111 125 140 155 170 185 200",
      "39o  48y  54y  60y  66   71   76*  82  90 100 110 120 130",
      "32o  41o  48y  55y  62   67   71*  76  82  90 100",
      "25b  34o  42o  50y  58y  65   67*  71  75  80",
      "18b  27b  36o  45o  54y  63   67   69  70",
      "10b  20b  30b  40o  50y  60y  67   68",
      "-    10b  20b  30b  40o  50y  60y",
      "-    -    10b  20b  30b  40o  50y",
      "-    -    -    10b  20b  30b  40o",
    ]),
    edges: { right: "up", left: "down" },
    moves: {
      payout: [{ dir: "right", n: 1 }],
      withhold: [{ dir: "left", n: 1 }],
      sell: { per: "share", n: 1, onlyIfOperated: false },
      soldOut: { heldBy: "players", at: "endSR" },
    },
  },
  trains: [
    { type: "2", variants: [{ name: "2", cost: 80 }], count: 6, rustsOnPhase: "4", permanent: false, countsForLimit: true },
    { type: "3", variants: [{ name: "3", cost: 180 }], count: 5, rustsOnPhase: "6", permanent: false, countsForLimit: true },
    { type: "4", variants: [{ name: "4", cost: 300 }], count: 4, rustsOnPhase: "D", permanent: false, countsForLimit: true },
    { type: "5", variants: [{ name: "5", cost: 450 }], count: 3, permanent: true, countsForLimit: true },
    { type: "6", variants: [{ name: "6", cost: 630 }], count: 2, permanent: true, countsForLimit: true },
    { type: "D", variants: [{ name: "D", cost: 1100 }], count: 6, availableFromPhase: "6", permanent: true,
      tradeIn: { fromTypes: ["4", "5", "6"], cost: 800 }, countsForLimit: true },
  ],
  trainLimitScope: "company",
  phases: [
    { id: "2", triggeredBy: null, orsPerSet: 1, trainLimit: 4, effects: [] },
    { id: "3", triggeredBy: "3", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "4", triggeredBy: "4", orsPerSet: 2, trainLimit: 3, effects: [] },
    { id: "5", triggeredBy: "5", orsPerSet: 3, trainLimit: 2, effects: [{ type: "closePrivates" }] },
    { id: "6", triggeredBy: "6", orsPerSet: 3, trainLimit: 2, effects: [] },
    { id: "D", triggeredBy: "D", orsPerSet: 3, trainLimit: 2, effects: [] },
  ],
  roundSchedule: { type: "byPhase" },
  srOrder: "priorityDeal",
  orOrder: { by: "priceDesc", ties: ["stackTop", "columnRight", "rowTop"], dynamic: true },
  limits: {
    certificates: { "2": 28, "3": 20, "4": 16, "5": 13, "6": 11, "7": 11 },
    perCompanyPercent: 60,
    pool: { maxCerts: 5 },
  },
  endTriggers: [{ type: "bankBroken" }, { type: "bankruptcy" }],
  customRules: [{ id: "privateGrants", config: {} }],
  chipPreset: [
    { value: 500, color: "#6a1b9a", label: "500" },
    { value: 100, color: "#212121", label: "100" },
    { value: 50, color: "#ef6c00", label: "50" },
    { value: 20, color: "#2e7d32", label: "20" },
    { value: 10, color: "#1565c0", label: "10" },
    { value: 5, color: "#c62828", label: "5" },
    { value: 1, color: "#f5f5f5", label: "1" },
  ],
  verification: {
    bank: "verified",
    startingCash: "verified",
    companies: "verified",
    privates: "verified",
    capitalization: "verified",
    ipoPrice: "verified",
    floatPercent: "verified",
    unownedDividends: "verified",
    payoutModes: "verified",
    rounding: "verified",
    market: "verified",
    trains: "verified",
    phases: "verified",
    orOrder: "verified",
    limits: "verified",
    options: "verified",
    endTriggers: "verified",
  },
};
