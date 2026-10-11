import type { CompanyDef, GameDefinition } from "./schema";
import { parseMarket } from "./marketText";

/**
 * 1848 Australia (GMT 2021 rulebook, docs/rules/1848-RULES-11a.pdf). Values and rule sections
 * are in research.md R13; the market grid is from fwtwr.com, the BoE track from the user and
 * the BoE charter photo (rulebook p. 3). Company and private details: rulebook §4 and §5.
 */

const PAR = [70, 80, 90, 100];

const company = (
  id: string,
  name: string,
  color: string,
  textColor: string,
  aliases: string[],
  extra: Partial<CompanyDef> = {},
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
  parOptions: PAR,
  kind: "public",
  ...extra,
});

const closesOnFirst5 = { type: "phase", phase: "5" } as const;

export const g1848: GameDefinition = {
  id: "1848",
  name: "1848 Australia",
  version: "1.0.0",
  currency: { symbol: "£" },
  playerCount: { min: 3, max: 6 },
  options: [],
  bank: { total: 10000 },
  // §2.4.1, §5.4.1: the BoE's £2,000 and 20 loan markers are outside the Bank's £10,000.
  initialTreasuries: [
    { company: "BOE", money: 2000, assets: Array.from({ length: 20 }, (_, i) => `loan:${i + 1}`) },
  ],
  startingCash: { "3": 840, "4": 630, "5": 510, "6": 430 },
  companies: [
    {
      id: "BOE",
      shortName: "BoE",
      name: "Bank of England",
      aliases: ["banco de inglaterra", "bank of england", "el banco de inglaterra", "be o e"],
      color: "#5b5b5b",
      textColor: "#ffffff",
      shareCount: 10,
      presidencyUnits: 0,
      certificates: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      parOptions: [],
      kind: "national",
    },
    company("QR", "Queensland Government Railway", "#7b1f3a", "#ffffff", ["queensland", "cu erre"]),
    company("COM", "Commonwealth Railways", "#1c3f8f", "#ffffff", ["commonwealth", "la com"]),
    company("FED", "Federal Territory Railway", "#2f7d4f", "#ffffff", ["federal", "la federal"]),
    company("VR", "Victorian Railway", "#e7c32b", "#1b1b1b", ["victoria", "victorian", "la victoria"]),
    company("SAR", "South Australian Railway", "#c8242b", "#ffffff", ["south australian", "sur de australia", "sar"]),
    company("WA", "West Australian Railway", "#111111", "#ffffff", ["west australian", "australia occidental", "uve a"]),
    company("NSW", "New South Wales Railway", "#ef7d1a", "#1b1b1b", ["new south wales", "nueva gales"]),
    company("CAR", "Central Australian Railway", "#7a4b2a", "#ffffff", ["central australian", "central", "car"], {
      parOptions: [100],
      fixedPar: 100,
    }),
  ],
  privates: [
    { id: "P1", name: "Melbourne & Hobson's Bay Railway", aliases: ["melbourne", "hobson"], cost: 30, income: 5,
      companyPriceRange: { range: [1, 40] }, closesOn: [closesOnFirst5] },
    { id: "P2", name: "Oodnadatta Railway", aliases: ["oodnadatta"], cost: 70, income: 10,
      companyPriceRange: { range: [1, 80] }, closesOn: [closesOnFirst5] },
    { id: "P3", name: "Tasmanian Railways", aliases: ["tasmania", "tasmanian"], cost: 110, income: 15,
      companyPriceRange: { range: [1, 140] }, closesOn: [closesOnFirst5] },
    { id: "P4", name: "The Ghan", aliases: ["ghan", "el ghan"], cost: 170, income: 20,
      companyPriceRange: { range: [1, 220] }, closesOn: [closesOnFirst5] },
    { id: "P5", name: "Trans-Australian Railway", aliases: ["trans australian", "transaustraliano"], cost: 170, income: 25,
      grants: [{ company: "QR", units: 1, source: "ipo" }], closesOn: [closesOnFirst5] },
    { id: "P6", name: "North Australian Railway", aliases: ["north australian", "norte de australia"], cost: 230, income: 30,
      grants: [{ company: "CAR", units: 2, presidency: true, source: "ipo", par: 100 }],
      closesOn: [closesOnFirst5, { type: "companyBuysTrain", company: "CAR" }] },
  ],
  /** §4.1: privates are never traded between players. */
  privateTrading: "none",
  capitalization: { type: "full", timing: "onFloat" },
  ipoPrice: "par",
  floatPercent: 60,
  floatCounts: "soldFromIpo",
  // §5.1.5: dividends of unsold and pool shares are retained by the Bank.
  unownedDividends: { ipo: "none", pool: "none", treasury: "none" },
  revenueParts: [{ id: "revenue", label: "Ingresos", to: "choice" }],
  payoutModes: ["full", "withhold"],
  // User-confirmed: per-share dividends are always rounded down; the remainder stays in the Bank.
  rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 1 },
  market: {
    shape: "2d",
    cells: parseMarket([
      "RCV  70  80  90 100 110  120 140 160 190 220 250 280 320 360 400 450!",
      "RCV  60  70  80  90 100* 110 130 150 180 210 240 270 310 350 390 440",
      "RCV  50  60  70  80  90* 100 120 140 170 200 230 260 300",
      "RCV  40  50  60  70  80*  90 110 130 160 190",
      "RCV  30  40  50  60  70*  80 100 120",
      "RCV  20  30  40  50  60   70",
    ]),
    // §11.1: at the end of a row, up one. §11.2: withholding moves left, into the RCV column.
    edges: { right: "up", left: "none" },
    moves: {
      payout: [{ dir: "right", n: 1 }],
      withhold: [{ dir: "left", n: 1 }],
      sell: { per: "sale", n: 1, onlyIfOperated: false },
      soldOut: { heldBy: "players", at: "endSR" },
    },
    tracks: {
      BOE: {
        startPrice: 70,
        byLoansIssued: [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 195, 210, 225, 240, 260, 280, 300, 320, 340],
        endGameAtIndex: 15,
      },
    },
  },
  trains: [
    { type: "2", variants: [{ name: "2", cost: 100 }, { name: "2+", cost: 120 }], count: 6, rustsOnPhase: "4",
      permanent: false, countsForLimit: true },
    { type: "3", variants: [{ name: "3", cost: 200 }, { name: "3+", cost: 230 }], count: 5, rustsOnPhase: "6",
      permanent: false, countsForLimit: true },
    { type: "4", variants: [{ name: "4", cost: 300 }, { name: "4+", cost: 340 }], count: 4, rustsOnPhase: "8",
      permanent: false, countsForLimit: true },
    { type: "5", variants: [{ name: "5", cost: 500 }, { name: "5+", cost: 550 }], count: 3, permanent: true, countsForLimit: true },
    { type: "6", variants: [{ name: "6", cost: 600 }, { name: "6+", cost: 660 }], count: 2, permanent: true, countsForLimit: true },
    { type: "8", variants: [{ name: "8", cost: 800 }, { name: "D", cost: 1100 }], count: "unlimited", permanent: true,
      tradeIn: { fromTypes: ["4"], cost: 800 }, countsForLimit: true },
    { type: "2E", variants: [{ name: "2E", cost: 200 }], count: "unlimited", availableFromPhase: "5", permanent: true,
      countsForLimit: false },
  ],
  trainLimitScope: "company",
  // §8.1: trains in excess of the limit are removed from the game.
  discardedTrainsTo: "removed",
  phases: [
    { id: "start", triggeredBy: null, orsPerSet: 1, trainLimit: 4, effects: [] },
    { id: "2", triggeredBy: "2", orsPerSet: 1, trainLimit: 4, effects: [] },
    { id: "3", triggeredBy: "3", orsPerSet: 2, trainLimit: 4, effects: [] },
    { id: "4", triggeredBy: "4", orsPerSet: 2, trainLimit: 3, effects: [] },
    { id: "5", triggeredBy: "5", orsPerSet: 3, trainLimit: 2, effects: [{ type: "closePrivates" }] },
    { id: "6", triggeredBy: "6", orsPerSet: 3, trainLimit: 2, effects: [] },
    { id: "8", triggeredBy: "8", orsPerSet: 3, trainLimit: 2, effects: [] },
  ],
  roundSchedule: { type: "byPhase" },
  srOrder: "priorityDeal",
  orOrder: { by: "priceDesc", ties: ["stackTop", "columnRight"], before: ["BOE"], dynamic: true },
  limits: {
    // §12.2 with no company in receivership (§5.5.4 lowers it per receivership).
    certificates: { "3": 20, "4": 17, "5": 14, "6": 12 },
    perCompanyPercent: 60,
    perCompanyPercentByPlayers: { "3": 70 },
    pool: { maxPercent: 50 },
  },
  loans: {
    amount: 100,
    lender: "company:BOE",
    supply: 20,
    interestPerOR: 0,
    repayable: false,
    voluntaryLimit: 5,
    availableFromPhase: "3",
    marketEffect: { first: 2, subsequentInOR: 3, nationalTrackStep: 1 },
  },
  endTriggers: [
    { type: "bankBroken" },
    { type: "topCell" },
    { type: "loansIssued", count: 16 },
    { type: "takeovers", count: 5 },
  ],
  // §13.1–13.2: the table ends the game; cash plus shares at market value, no tie rule.
  scoring: { autoEnd: [], bankruptPlayers: "eliminated", tieBreak: "shared" },
  customRules: [
    { id: "loans", config: {} },
    { id: "nationalBank", config: { company: "BOE", dividendSource: "bank", minDividendByPhase: { "3": 100, "5": 200, "8": 300 } } },
    { id: "nationalTakeover", config: { compensation: "parPerNonDirectorShare", directorLiable: true,
        removeCheapestPermanentTrainAt: [2, 5], endGameAt: 5 } },
    { id: "bankDebt", config: { debtors: ["player"], interest: 0, autoRepayFromIncome: true } },
    { id: "manualFloatCondition", config: { company: "COM", question: "¿Hay enlace Sídney–Adelaida?", droppedAtPhase: "6" } },
    { id: "privateGrants", config: {} },
  ],
  chipPreset: [
    { value: 500, color: "#6a1b9a" },
    { value: 100, color: "#212121" },
    { value: 50, color: "#ef6c00" },
    { value: 20, color: "#2e7d32" },
    { value: 10, color: "#1565c0" },
    { value: 5, color: "#c62828" },
    { value: 1, color: "#f5f5f5" },
  ],
  verification: {
    privateTrading: "verified",
    bank: "verified",
    initialTreasuries: "verified",
    startingCash: "verified",
    companies: "verified",
    privates: "verified",
    capitalization: "verified",
    floatPercent: "verified",
    unownedDividends: "verified",
    payoutModes: "verified",
    rounding: "verified",
    market: "verified",
    trains: "verified",
    phases: "verified",
    orOrder: "verified",
    limits: "verified",
    loans: "verified",
    endTriggers: "verified",
    customRules: "verified",
    scoring: "verified",
  },
};
