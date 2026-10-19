import type { CompanyDef, CompanyTraits, GameDefinition, PhaseDef, TrainDef } from "./schema";
import { DEFAULT_CHIPS } from "./chips";

/**
 * Railways of the Lost Atlas (docs/rules: "B p.N" = base rulebook, "L p.N" = Landmarks).
 * Values and sources: specs/004-railways-lost-atlas/contracts/game-definition.md. Long mode is
 * the base data; the other modes and the variants are option patches (research R5).
 */

const minor = (
  id: string,
  name: string,
  color: string,
  textColor: string,
  aliases: string[],
  traits?: CompanyTraits,
): CompanyDef => ({
  id,
  shortName: id,
  name,
  aliases,
  color,
  textColor,
  shareCount: 5,
  presidencyUnits: 2,
  certificates: [2, 1, 1, 1],
  parOptions: [],
  kind: "public",
  tier: "minor",
  start: "auction",
  ...(traits ? { traits } : {}),
});

const major = (
  id: string,
  name: string,
  color: string,
  textColor: string,
  aliases: string[],
  altName: string,
  altAliases: string[],
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
  parOptions: [],
  kind: "public",
  tier: "major",
  start: "merger",
  altName,
  altAliases,
});

/** B p.24; colors confirmed by the user (2026-10-09). */
export const ROTLA_MINORS: readonly CompanyDef[] = [
  minor("ADP", "Adaptive", "#b39ddb", "#1b1b1b", ["adaptive", "adaptativa"]),
  minor("AGR", "Agricultural", "#2e7d32", "#ffffff", ["agricultural", "agrícola"]),
  minor("BRG", "Bridging", "#4fc3f7", "#1b1b1b", ["bridging", "puentes"]),
  minor("EMN", "Eastern Mining", "#6d4c41", "#ffffff", ["eastern mining", "minera del este"]),
  minor("EXV", "Expansive", "#ec407a", "#ffffff", ["expansive", "expansiva"], {
    payments: [{ id: "expansiveToken", labelEs: "Ficha extra", amount: 40, direction: "companyPays" }],
  }),
  minor("EXP", "Express", "#c62828", "#ffffff", ["express", "expreso"]),
  minor("NPT", "Northern Port", "#1565c0", "#ffffff", ["northern port", "puerto del norte"]),
  minor("OVN", "Overnight", "#212121", "#ffffff", ["overnight", "nocturno"]),
  minor("RES", "Resourceful", "#c19a6b", "#1b1b1b", ["resourceful", "recursos"], { keepsRustedTrains: true }),
  minor("SPC", "Spacious", "#9ccc65", "#1b1b1b", ["spacious", "espacioso"], { trainLimitBonus: 1 }),
  minor("SUB", "Suburban", "#f8bbd0", "#1b1b1b", ["suburban", "suburbano"]),
  // The mountain tile: the company pays 40 and the bank pays 60, one action.
  minor("TUN", "Tunneling", "#757575", "#ffffff", ["tunneling", "túnel"], {
    payments: [{ id: "tunneling", labelEs: "Montaña", amount: 60, direction: "bankPays", cost: 40 }],
  }),
];

/** B p.18. Second identities from the user's copy (2026-10-15, feature 013). */
export const ROTLA_MAJORS: readonly CompanyDef[] = [
  major("CON", "Consortium", "#e53935", "#ffffff", ["consortium", "consorcio"], "Conglomerate", ["conglomerate", "conglomerado"]),
  major("UNI", "Union", "#ef6c00", "#ffffff", ["union", "unión"], "Unlimited", ["unlimited", "ilimitada"]),
  major("SYS", "System", "#fdd835", "#1b1b1b", ["system", "sistema"], "Syndicate", ["syndicate", "sindicato"]),
  major("INT", "International", "#00bcd4", "#1b1b1b", ["international", "internacional"], "Inc.", ["inc", "ink", "incorporated"]),
  major("FED", "Federation", "#43a047", "#ffffff", ["federation", "federación"], "Firm", ["firm", "firma"]),
  major("EXM", "Experiment", "#7b1fa2", "#ffffff", ["experiment", "experimento"], "Enterprise", ["enterprise", "empresa"]),
];

/** Landmarks (L p.3, 10): colors from the user (2026-10-09). */
export const LANDMARKS_MINORS: readonly CompanyDef[] = [
  minor("CIR", "Circus", "#9c27b0", "#ffffff", ["circus", "circo"]),
  minor("CPL", "Coupling", "#26c6da", "#1b1b1b", ["coupling", "enganche"]),
  // L p.10: pays 50 to the bank at launch, comes with its own 2-train, and buys no leadoff train.
  minor("MFG", "Manufacturing", "#c9a227", "#1b1b1b", ["manufacturing", "manufactura", "fábrica"], {
    launchFee: 50,
    launchAssets: ["train:M2:1"],
    noLeadoffTrain: true,
  }),
  minor("TWC", "Twin Cities", "#81d4fa", "#1b1b1b", ["twin cities", "ciudades gemelas"]),
];

/** L p.3: two majors, each with two identities; second names from the user's copy (2026-10-15, feature 013). */
export const LANDMARKS_MAJORS: readonly CompanyDef[] = [
  major("AUT", "Authority", "#e0e0e0", "#1b1b1b", ["authority", "autoridad"], "Alliance", ["alliance", "alianza"]),
  major("LGE", "League", "#424242", "#ffffff", ["league", "liga"], "LLC", ["llc", "ele ele ce"]),
];

/** Manufacturing's own 2-train (L p.10): never in the stack, never exported, held by `removed` until launch. */
const M2_TRAIN: TrainDef = {
  type: "M2",
  displayName: "2 (Manufacturing)",
  variants: [{ name: "2", cost: 0 }],
  count: 1,
  special: true,
  permanent: false,
  countsForLimit: true,
};

/** B p.2, 11: top to bottom; the 0 is the `closed` cell (research R1). */
const TRACK = [500, 450, 400, 360, 330, 300, 270, 245, 220, 200, 180, 165, 150, 135, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

/** B p.16–17 and the user's copy (the revised edition). */
export const ROTLA_TRAINS: readonly TrainDef[] = [
  { type: "2", variants: [{ name: "2", cost: 100 }], count: 7, rustsOnPhase: "green4", permanent: false, countsForLimit: true },
  {
    type: "3",
    variants: [{ name: "3", cost: 200 }],
    count: 6,
    countByPlayers: { "2": 5, "3": 5 },
    rustsOnPhase: "purple6",
    permanent: false,
    countsForLimit: true,
  },
  { type: "4", variants: [{ name: "4", cost: 300 }], count: 4, rustsOnPhase: "grey", permanent: false, countsForLimit: true },
  { type: "5", variants: [{ name: "5", cost: 450 }], count: 3, permanent: true, countsForLimit: true },
  { type: "6", variants: [{ name: "6", cost: 550 }], count: 3, countByPlayers: { "2": 2, "3": 2 }, permanent: true, countsForLimit: true },
  {
    type: "7",
    displayName: "7/∞",
    variants: [
      { name: "7", cost: 750 },
      { name: "∞", cost: 1000 },
    ],
    count: "unlimited",
    permanent: true,
    countsForLimit: true,
    // Rust is checked first; the traded-in train leaves the game (user, 2026-10-09).
    tradeIn: { fromTypes: ["2", "3", "4", "5", "6", "7"], cost: 800, variant: "∞", to: "removed", rustsFirst: true },
  },
];

/** Research R10: finer ids than the colors, since limits and rust change at the 4 and the 6. */
export const ROTLA_PHASES: readonly PhaseDef[] = [
  { id: "yellow", color: "Amarilla", triggeredBy: null, orsPerSet: 2, trainLimit: 2, trainLimitByTier: { minor: 2 }, launchPriceRange: [60, 90], effects: [] },
  { id: "green", color: "Verde", triggeredBy: "3", orsPerSet: 2, trainLimit: 4, trainLimitByTier: { minor: 2, major: 4 }, launchPriceRange: [60, 110], effects: [] },
  { id: "green4", color: "Verde", triggeredBy: "4", orsPerSet: 2, trainLimit: 3, trainLimitByTier: { minor: 2, major: 3 }, launchPriceRange: [60, 110], effects: [] },
  { id: "purple", color: "Morada", triggeredBy: "5", orsPerSet: 2, trainLimit: 2, trainLimitByTier: { minor: 1, major: 2 }, launchPriceRange: [60, 135], effects: [] },
  { id: "purple6", color: "Morada", triggeredBy: "6", orsPerSet: 2, trainLimit: 2, trainLimitByTier: { minor: 1, major: 2 }, launchPriceRange: [60, 135], effects: [] },
  { id: "grey", color: "Gris", triggeredBy: "7", orsPerSet: 2, trainLimit: 2, trainLimitByTier: { minor: 1, major: 2 }, launchPriceRange: [60, 135], effects: [] },
];

/** The fixed schedule: SR n, OR n.1, OR n.2, MR n (research R7). */
export function rotlaSequence(cycles: number): string[] {
  return Array.from({ length: cycles }, (_, i) => i + 1).flatMap((n) => [`SR${n}`, `OR${n}.1`, `OR${n}.2`, `MR${n}`]);
}

/** Short game (B p.6–7): one card fewer of each type except 7/∞. */
const SHORT_TRAINS: TrainDef[] = ROTLA_TRAINS.map((t) =>
  t.count === "unlimited"
    ? t
    : {
        ...t,
        count: t.count - 1,
        ...(t.countByPlayers ? { countByPlayers: Object.fromEntries(Object.entries(t.countByPlayers).map(([k, v]) => [k, v - 1])) } : {}),
      },
);

/** Micro games (B p.22–23): only 2-, 3- and 4-trains; nothing rusts after the first 4. */
const microTrains = (twos: number, threes: number, fours: number): TrainDef[] => [
  { type: "2", variants: [{ name: "2", cost: 100 }], count: twos, rustsOnPhase: "green4", permanent: false, countsForLimit: true },
  { type: "3", variants: [{ name: "3", cost: 200 }], count: threes, permanent: false, countsForLimit: true },
  { type: "4", variants: [{ name: "4", cost: 300 }], count: fours, permanent: false, countsForLimit: true },
];

const fourCycles = { roundSchedule: { sequence: rotlaSequence(4) } };
const micro = (trains: TrainDef[]) => ({
  ...fourCycles,
  trains,
  phases: ROTLA_PHASES.slice(0, 3),
  trainExport: null,
  startingCash: { "2": 225, "3": 225, "4": 225, "5": 225 },
});

const MINOR_IDS = ROTLA_MINORS.map((c) => c.id);

export const grotla: GameDefinition = {
  id: "rotla",
  name: "Railways of the Lost Atlas",
  version: "1.0.0",
  // The game has no money symbol; "$" is a display choice (user, 2026-10-09).
  currency: { symbol: "$" },
  // The 6–7 player mode (L p.12) is out of scope.
  playerCount: { min: 2, max: 5 },
  options: [
    {
      id: "mode",
      label: "Modo",
      default: "long",
      choices: [
        { value: "long", label: "Largo", recommendedPlayers: { min: 3, max: 5 } },
        {
          value: "short",
          label: "Corto",
          recommendedPlayers: { min: 2, max: 4 },
          removeCompanies: ["ADP", "BRG", "OVN", "SPC"],
          patch: { ...fourCycles, trains: SHORT_TRAINS },
        },
        { value: "micro2", label: "Micro 2 jugadores", recommendedPlayers: { min: 2, max: 2 }, patch: micro(microTrains(3, 3, 3)) },
        { value: "micro3", label: "Micro 3 jugadores", recommendedPlayers: { min: 3, max: 3 }, patch: micro(microTrains(5, 4, 4)) },
      ],
    },
    {
      // After the mode, so the M2 train is added to the mode's train list (US11).
      id: "expansion",
      label: "Expansión",
      default: "off",
      choices: [
        { value: "off", label: "No" },
        {
          value: "landmarks",
          label: "Landmarks",
          addCompanies: [...LANDMARKS_MINORS, ...LANDMARKS_MAJORS],
          addTrains: [M2_TRAIN],
          addCustomRules: [{ id: "landmarks", config: {} }],
        },
      ],
    },
    {
      id: "stockDrops",
      label: "Caída por acción",
      default: "perSale",
      choices: [
        { value: "perSale", label: "Una por venta" },
        { value: "perShare", label: "Una por acción", patch: { market: { moves: { sell: { per: "share" } } } } },
      ],
    },
    {
      id: "bankBreak",
      label: "Quiebra de banca",
      default: "off",
      choices: [
        { value: "off", label: "No" },
        {
          value: "on",
          label: "Sí",
          // B p.21: an 8,000 bank, certificate limits, and the game ends when it breaks.
          patch: {
            bank: { total: 8000 },
            limits: { certificates: { "3": 16, "4": 12, "5": 10 } },
            endTriggers: [{ type: "cyclesComplete" }, { type: "bankBroken" }, { type: "bankruptcy" }],
          },
        },
      ],
    },
    {
      id: "hostileMergers",
      label: "Fusiones hostiles",
      default: "off",
      // Recorded only: the table runs them with mergeCompanies (spec edge case).
      choices: [
        { value: "off", label: "No" },
        { value: "on", label: "Sí" },
      ],
    },
    {
      id: "headquarters",
      label: "Sedes",
      default: "off",
      choices: [
        { value: "off", label: "No" },
        {
          value: "on",
          label: "Sí",
          // Amount 0: entered at use (half the city's printed value).
          patchCompanies: [
            { tier: "major", patch: { traits: { payments: [{ id: "headquarters", labelEs: "Sede", amount: 0, direction: "bankPays" }] } } },
          ],
        },
      ],
    },
    {
      id: "minorsInPlay",
      label: "Minors en juego",
      default: "all",
      kind: "companySubset",
      from: MINOR_IDS,
      size: { long: 12, short: 8, micro2: 4, micro3: 6 },
      choices: [{ value: "all", label: "Todas" }],
    },
  ],
  bank: "unlimited",
  initialTreasuries: [],
  // B p.7, 22–23: one table for Long and Short; Micro patches it to 225.
  startingCash: { "2": 450, "3": 300, "4": 275, "5": 220 },
  companies: [...ROTLA_MINORS, ...ROTLA_MAJORS],
  privates: [],
  privateTrading: "none",
  capitalization: { type: "incremental" },
  ipoPrice: "market",
  // Launch hands every share out (president + treasury), so the IPO is always empty.
  defaultBuySource: "treasury",
  // Unused: auction companies float at launch.
  floatPercent: 20,
  floatCounts: "soldFromIpo",
  // B p.15: treasury shares pay the company; pool shares pay no one.
  unownedDividends: { ipo: "none", pool: "none", treasury: "company" },
  revenueParts: [{ id: "revenue", label: "Ingresos", to: "choice" }],
  payoutModes: ["full", "withhold"],
  // Always round down (user, 2026-10-09).
  rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 10 },
  auction: { minBid: 120, step: 5 },
  market: {
    shape: "1d",
    cells: [...TRACK.map((price) => [{ price }]), [{ price: 0, tags: ["closed"] }]],
    edges: { right: "none", left: "none" },
    moves: {
      // B p.14–15, against the pre-move price; the last rule: paid, but below the price.
      payout: [
        { when: { dividendAtLeast: { priceTimes: 2 } }, dir: "up", n: 2 },
        { when: { dividendAtLeast: { priceTimes: 1 } }, dir: "up", n: 1 },
        { when: { dividendEquals: 0 }, dir: "down", n: 1 },
        { dir: "up", n: 1, effect: "stackBottom" },
      ],
      withhold: [{ dir: "down", n: 1 }],
      sell: { per: "sale", n: 1, onlyIfOperated: false, warnUnlessOperated: true },
      soldOut: { heldBy: "players", at: "endSR" },
      issue: { from: "treasury", onlyIfFloated: false, n: 1 },
      redeem: { n: 0 },
    },
  },
  trains: [...ROTLA_TRAINS],
  trainLimitScope: "company",
  discardedTrainsTo: "pool",
  trainExport: { allOfType: ["2"] },
  phases: [...ROTLA_PHASES],
  roundSchedule: {
    type: "fixed",
    sequence: rotlaSequence(6),
    // B p.18: a Merger Round once the first green train has been bought or exported.
    conditional: [{ slotPrefix: "MR", phaseReached: "green" }],
    events: [],
  },
  srOrder: "priorityDeal",
  orOrder: { by: "priceDesc", ties: ["stackTop"], dynamic: true },
  limits: {
    certificates: {},
    perCompanyPercent: 60,
    pool: { maxPercent: 50 },
    maxSharesPerBuy: 1,
  },
  endTriggers: [{ type: "cyclesComplete" }],
  // B p.17, p.19: the game ends after the last cycle (or, with Bank Break, a bankruptcy or the
  // bank breaking once the OR set is over); bankrupt players are removed; a tie goes to the
  // president of the company highest in the operating order.
  scoring: { autoEnd: ["cyclesComplete", "bankBroken", "bankruptcy"], bankruptPlayers: "eliminated", tieBreak: "presidentEarliest" },
  customRules: [
    { id: "auctionLaunch", config: {} },
    { id: "mergers", config: { round: "MR" } },
    {
      id: "corporateBankruptcy",
      // B p.11, 17: a dissolution sends the trains to the pool and does not end the game; a
      // player's bankruptcy closes the companies they preside (user, 2026-10-09).
      config: { trigger: "closedCell", presidentPays: true, companyTrainsTo: "pool", companyStatus: "closed", playerMode: "liquidatePresided" },
    },
  ],
  chipPreset: [...DEFAULT_CHIPS],
  verification: {
    bank: "verified",
    startingCash: "verified",
    companies: "verified",
    currency: "verified",
    capitalization: "verified",
    ipoPrice: "verified",
    unownedDividends: "verified",
    revenueParts: "verified",
    payoutModes: "verified",
    rounding: "verified",
    market: "verified",
    trains: "verified",
    phases: "verified",
    roundSchedule: "verified",
    orOrder: "verified",
    limits: "verified",
    auction: "verified",
    trainExport: "verified",
    customRules: "verified",
    scoring: "verified",
  },
};
