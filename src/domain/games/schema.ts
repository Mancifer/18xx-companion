import { z } from "zod";

/**
 * Game definitions are pure data (constitution III; data-model §4; contracts/game-definition.md).
 * Behavior that does not fit goes into `customRules`, validated through the mechanics registry.
 */

const int = z.number().int();
const posInt = int.positive();
const nonNegInt = int.nonnegative();
const id = z.string().min(1);
const holderRef = z
  .string()
  .regex(/^(bank|pool|removed|(player|company|ipo):.+)$/, "invalid holder reference");

export const ChipSchema = z.object({
  value: posInt,
  color: z.string().min(1),
  /** Deprecated (feature 008, R3): accepted so older sessions and exports load, never displayed. */
  label: z.string().optional(),
  countAvailable: nonNegInt.optional(),
});

export const CellTagSchema = z.enum(["par", "receivership", "closed", "top", "noUp"]);

export const CellSchema = z.object({
  price: nonNegInt,
  tags: z.array(CellTagSchema).optional(),
  zone: z.enum(["yellow", "orange", "brown"]).optional(),
  leftEdge: z.enum(["down", "none"]).optional(),
  rightEdge: z.enum(["up", "none"]).optional(),
});

export const DirectionSchema = z.enum(["right", "left", "up", "down"]);

export const MoveRuleSchema = z.object({
  when: z
    .object({
      dividendAtLeast: z.object({ priceTimes: z.number().positive() }).optional(),
      dividendEquals: nonNegInt.optional(),
    })
    .optional(),
  dir: DirectionSchema,
  n: posInt,
  /** "stackBottom": the price stays and the token goes to the bottom of its cell (research R2). */
  effect: z.enum(["move", "stackBottom"]).optional(),
});

export const MarketSchema = z.object({
  shape: z.enum(["2d", "1d"]),
  /** Staggered rows use null padding. */
  cells: z.array(z.array(CellSchema.nullable())),
  edges: z.object({ right: z.enum(["up", "none"]), left: z.enum(["down", "none"]) }),
  moves: z.object({
    payout: z.array(MoveRuleSchema),
    withhold: z.array(MoveRuleSchema),
    half: z.array(MoveRuleSchema).optional(),
    sell: z.object({
      per: z.enum(["share", "sale"]),
      n: posInt,
      onlyIfOperated: z.boolean(),
      /** Warns (never blocks) on selling a company that has not operated (RotLA B p.10). */
      warnUnlessOperated: z.boolean().optional(),
    }),
    soldOut: z
      .object({ heldBy: z.enum(["players", "playersAndCompanies"]), at: z.enum(["endSR", "endCR"]) })
      .nullable(),
    poolPenalty: z.object({ at: z.literal("endCR"), onlyIfOperated: z.boolean() }).optional(),
    /** Where issued shares come from: the IPO (default, 21Moon) or the company treasury (RotLA). */
    issue: z.object({ from: z.enum(["ipo", "treasury"]).optional(), onlyIfFloated: z.boolean(), n: posInt }).optional(),
    /** Present means `redeemShare` is available; n = steps up per redemption. */
    redeem: z.object({ n: nonNegInt }).optional(),
  }),
  /** 1-D price tracks: the price after n loans = byLoansIssued[n − 1]. */
  tracks: z
    .record(
      z.string(),
      z.object({
        startPrice: posInt,
        byLoansIssued: z.array(posInt),
        endGameAtIndex: nonNegInt.optional(),
      }),
    )
    .optional(),
});

export const NamedPaymentSchema = z.object({
  id,
  labelEs: z.string().min(1),
  amount: nonNegInt,
  direction: z.enum(["bankPays", "companyPays"]),
  /** Paid by the company to the bank first, in the same group (Tunneling's mountain). */
  cost: posInt.optional(),
});

/** Money- and train-relevant abilities as data (research R3). */
export const CompanyTraitsSchema = z.object({
  trainLimitBonus: nonNegInt.optional(),
  keepsRustedTrains: z.boolean().optional(),
  launchFee: posInt.optional(),
  launchAssets: z.array(z.string().min(1)).optional(),
  noLeadoffTrain: z.boolean().optional(),
  payments: z.array(NamedPaymentSchema).optional(),
});

export const CompanyDefSchema = z.object({
  id,
  shortName: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  color: z.string().min(1),
  textColor: z.string().min(1),
  shareCount: posInt,
  /** Units in the president's certificate. 0 = no presidency (a national company). */
  presidencyUnits: nonNegInt,
  /** Units per certificate, presidency first. */
  certificates: z.array(posInt).min(1),
  parOptions: z.union([z.array(posInt), z.literal("parCells")]),
  fixedPar: posInt.optional(),
  kind: z.enum(["public", "national"]),
  /** Round slot from which the company can be started (21Moon late company). */
  availableFrom: z.string().optional(),
  /** Per-tier train limit and merger role (RotLA minors and majors). */
  tier: z.enum(["minor", "major"]).optional(),
  /** How the company enters play; absent = "par". */
  start: z.enum(["par", "auction", "merger"]).optional(),
  /** A major's second identity (FR-005a). */
  altName: z.string().min(1).optional(),
  altAliases: z.array(z.string()).optional(),
  traits: CompanyTraitsSchema.optional(),
});

export const GrantSchema = z.object({
  company: id,
  units: posInt,
  presidency: z.boolean().optional(),
  source: z.enum(["ipo", "pool", "ipoOrPool"]),
  /** Par set by the grant: a fixed price, or chosen by the new owner. */
  par: z.union([posInt, z.literal("ownerChooses")]).optional(),
});

export const PrivateTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("phase"), phase: z.string() }),
  z.object({ type: z.literal("companyBuysTrain"), company: id }),
  z.object({ type: z.literal("boughtByCompany") }),
  z.object({ type: z.literal("exchanged") }),
  z.object({ type: z.literal("scheduled"), slot: z.string() }),
  z.object({ type: z.literal("manual") }),
]);

export const PrivateDefSchema = z.object({
  id,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  cost: posInt,
  income: nonNegInt,
  companyPriceRange: z
    .union([
      z.object({ multipleOfFace: z.tuple([z.number().positive(), z.number().positive()]) }),
      z.object({ range: z.tuple([posInt, posInt]) }),
    ])
    .optional(),
  grants: z.array(GrantSchema).optional(),
  exchange: GrantSchema.optional(),
  closesOn: z.array(PrivateTriggerSchema),
});

export const TrainDefSchema = z.object({
  type: id,
  variants: z.array(z.object({ name: z.string().min(1), cost: nonNegInt })).min(1),
  count: z.union([posInt, z.literal("unlimited")]),
  rustsOnPhase: z.string().optional(),
  availableFromPhase: z.string().optional(),
  permanent: z.boolean(),
  tradeIn: z
    .object({
      fromTypes: z.array(z.string()).min(1),
      cost: posInt,
      /** The variant the trade-in price applies to; absent = every variant. */
      variant: z.string().min(1).optional(),
      /** Where the traded-in train goes; absent = "discard" (`discardedTrainsTo`). */
      to: z.enum(["removed", "discard"]).optional(),
      /**
       * Rust is applied before the trade-in (RotLA, user 2026-10-09): a train of a type this
       * purchase rusts cannot be traded in. Absent = the trade-in happens first (1830, 1848).
       */
      rustsFirst: z.boolean().optional(),
    })
    .optional(),
  countsForLimit: z.boolean(),
  /** Extra cards held by `removed` until added (21Moon UN transports). */
  reserve: nonNegInt.optional(),
  /** Overrides `count` for the session's player count (FR-005). */
  countByPlayers: z.record(z.string(), posInt).optional(),
  /** Starts in `removed`, never in the stack, never exported (the Manufacturing 2-train). */
  special: z.boolean().optional(),
  /** Shown instead of `type` ("7/∞"). */
  displayName: z.string().min(1).optional(),
});

export const PhaseEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rust"), trainType: z.string() }),
  z.object({ type: z.literal("closePrivates") }),
  z.object({ type: z.literal("enableActions"), actions: z.array(z.string()) }),
  z.object({ type: z.literal("setNationalMinDividend"), company: id, amount: nonNegInt }),
  z.object({ type: z.literal("dropFloatCondition"), company: id }),
]);

export const PhaseDefSchema = z.object({
  id,
  triggeredBy: z.string().nullable(),
  orsPerSet: posInt,
  trainLimit: posInt,
  effects: z.array(PhaseEffectSchema),
  /** Overrides `trainLimit` per company tier. */
  trainLimitByTier: z.object({ minor: posInt.optional(), major: posInt.optional() }).optional(),
  /** Starting-price bounds for `launchCompany`. */
  launchPriceRange: z.tuple([posInt, posInt]).optional(),
  /** Display name of the phase color; several ids may share one. */
  color: z.string().min(1).optional(),
});

export const ScheduledEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("closePrivates") }),
  z.object({ type: z.literal("note"), text: z.string() }),
]);

export const RoundScheduleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("byPhase") }),
  z.object({
    type: z.literal("fixed"),
    /** Slots such as "PRIVATES", "SR1", "CR1", "OR1.1". */
    sequence: z.array(z.string()).min(1),
    /** Slots skipped unless the phase was reached (RotLA: MR* from green). */
    conditional: z.array(z.object({ slotPrefix: z.string().min(1), phaseReached: z.string().min(1) })).optional(),
    events: z.array(z.object({ at: z.string(), effect: ScheduledEffectSchema })),
  }),
]);

export const LoanDefSchema = z.object({
  amount: posInt,
  lender: holderRef,
  supply: posInt,
  /** Data only in v1: no interest logic is built (constitution VII). */
  interestPerOR: z.literal(0),
  /** Data only in v1: no repay action is built (constitution VII). */
  repayable: z.literal(false),
  voluntaryLimit: posInt,
  availableFromPhase: z.string(),
  marketEffect: z.object({
    first: nonNegInt,
    subsequentInOR: nonNegInt,
    nationalTrackStep: nonNegInt.optional(),
  }),
});

export const EndTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bankBroken") }),
  z.object({ type: z.literal("topCell") }),
  z.object({ type: z.literal("loansIssued"), count: posInt }),
  z.object({ type: z.literal("takeovers"), count: posInt }),
  z.object({ type: z.literal("lastRound") }),
  z.object({ type: z.literal("bankruptcy") }),
  /** The last slot of a fixed schedule has been played. */
  z.object({ type: z.literal("cyclesComplete") }),
  /** The last OR of a fixed schedule is complete (21Moon §13: after OR 5.3). */
  z.object({ type: z.literal("scheduleComplete") }),
]);

export const EndTriggerTypeSchema = z.enum([
  "bankBroken",
  "topCell",
  "loansIssued",
  "takeovers",
  "lastRound",
  "bankruptcy",
  "cyclesComplete",
  "scheduleComplete",
]);

/**
 * How a finished game is ranked (feature 007, data-model §1). Absent on definitions saved before
 * the feature: `scoringOf` then falls back to the built-in game's block (research R16).
 */
export const ScoringSchema = z.object({
  /** End triggers that end the game without the table. bankBroken counts once the OR set is complete. */
  autoEnd: z
    .array(z.enum(["cyclesComplete", "scheduleComplete", "bankBroken", "bankruptcy"]))
    .refine((list) => new Set(list).size === list.length, "autoEnd holds distinct values"),
  /** How a bankrupt player is ranked: listed last with no total, or scored on what they kept. */
  bankruptPlayers: z.enum(["eliminated", "scored"]),
  /** How equal totals are ordered. */
  tieBreak: z.enum(["shared", "presidentEarliest"]),
  /** Added to the final share price per unit of a company counter (21Moon §13). */
  shareBonus: z.object({ counter: z.string().min(1), perUnit: posInt }).optional(),
});

export const CustomRuleSchema = z.object({
  id: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});

/** A JSON object (an RFC 7386 merge patch). */
const JsonObject = z.record(z.string(), z.unknown());

export const OptionDefSchema = z.object({
  id,
  label: z.string().min(1),
  /** "companySubset": the value is a comma-separated list of the `from` companies kept. */
  kind: z.enum(["choice", "companySubset"]).optional(),
  from: z.array(z.string().min(1)).optional(),
  /** companySubset: the expected count by mode value (a warning only). */
  size: z.record(z.string(), posInt).optional(),
  /** null = the app picks one at random at setup (21Moon late company). */
  default: z.string().nullable(),
  choices: z
    .array(
      z.object({
        value: z.string().min(1),
        label: z.string().min(1),
        addCustomRules: z.array(CustomRuleSchema).optional(),
        /** Sets `availableFrom` on the company whose id equals `value`. */
        companyAvailableFrom: z.string().optional(),
        /** An RFC 7386 merge patch applied to the session copy. */
        patch: JsonObject.optional(),
        removeCompanies: z.array(z.string().min(1)).optional(),
        addCompanies: z.array(CompanyDefSchema).optional(),
        /** Train types appended (a merge patch would replace the whole array). */
        addTrains: z.array(TrainDefSchema).optional(),
        /** A merge patch applied to each company (of a tier, when given). */
        patchCompanies: z.array(z.object({ tier: z.enum(["minor", "major"]).optional(), patch: JsonObject })).optional(),
        /** A New Session warning when the player count is outside this range. */
        recommendedPlayers: z.object({ min: posInt, max: posInt }).optional(),
      }),
    )
    .min(1),
});

export const GameDefinitionSchema = z.object({
  id,
  name: z.string().min(1),
  version: z.string().min(1),
  basedOn: z.string().optional(),
  currency: z.object({ symbol: z.string().min(1) }),
  playerCount: z
    .object({ min: posInt, max: posInt.max(7, "playerCount.max must be ≤ 7") })
    .refine((p) => p.min <= p.max, "playerCount.min must be ≤ max"),
  options: z.array(OptionDefSchema),
  bank: z.union([z.object({ total: posInt }), z.literal("unlimited")]),
  initialTreasuries: z.array(z.object({ company: id, money: nonNegInt, assets: z.array(z.string()) })),
  startingCash: z.record(z.string(), posInt),
  companies: z.array(CompanyDefSchema).min(1),
  privates: z.array(PrivateDefSchema),
  /**
   * Whether players may sell privates to each other: "players" in stock rounds after the first
   * (1830 §4.1, the default) or "none" (1848 §4.1, 21Moon). The Bank's initial sale is unaffected.
   */
  privateTrading: z.enum(["none", "players"]).optional(),
  capitalization: z.discriminatedUnion("type", [
    z.object({ type: z.literal("full"), timing: z.enum(["onFloat", "endOfSR"]) }),
    z.object({ type: z.literal("incremental") }),
  ]),
  ipoPrice: z.enum(["par", "market"]),
  /** Where a share purchase comes from when no source is named (voice, StockSheet); absent = "ipo". */
  defaultBuySource: z.enum(["ipo", "treasury"]).optional(),
  floatPercent: posInt.max(100),
  floatCounts: z.literal("soldFromIpo"),
  /** "none" = not paid; the money stays in the Bank. */
  unownedDividends: z.object({
    ipo: z.enum(["company", "none"]),
    pool: z.enum(["company", "none"]),
    treasury: z.enum(["company", "none"]),
  }),
  revenueParts: z
    .array(z.object({ id, label: z.string().min(1), to: z.enum(["choice", "treasury", "dividend"]) }))
    .min(1),
  payoutModes: z.array(z.enum(["full", "withhold", "half"])),
  rounding: z.object({
    perShare: z.enum(["floor", "ceil", "round"]),
    halfRetain: z.enum(["floorToCompany", "ceilToCompany"]),
    unit: posInt,
  }),
  market: MarketSchema,
  trains: z.array(TrainDefSchema).min(1),
  trainLimitScope: z.union([
    z.literal("company"),
    z.object({ perBase: posInt, bases: z.array(z.string()).min(1) }),
  ]),
  /** Launch warnings for `start: "auction"` companies. */
  auction: z.object({ minBid: posInt, step: posInt }).optional(),
  /** The train exported at each new SR (research R7); null or absent = none. */
  trainExport: z.object({ allOfType: z.array(z.string()) }).nullable().optional(),
  /** Where discarded and traded-in trains go: the open market (1830) or out of the game (default). */
  discardedTrainsTo: z.enum(["pool", "removed"]).optional(),
  phases: z.array(PhaseDefSchema).min(1),
  roundSchedule: RoundScheduleSchema,
  srOrder: z.literal("priorityDeal"),
  orOrder: z.object({
    by: z.literal("priceDesc"),
    ties: z.array(z.enum(["stackTop", "columnRight", "rowTop"])),
    before: z.array(z.string()).optional(),
    dynamic: z.boolean(),
  }),
  limits: z.object({
    certificates: z.record(z.string(), posInt),
    perCompanyPercent: posInt,
    perCompanyPercentByPlayers: z.record(z.string(), posInt).optional(),
    pool: z.object({ maxPercent: posInt.optional(), maxCerts: posInt.optional() }),
    /** Warns when one purchase takes more shares (RotLA: 1). */
    maxSharesPerBuy: posInt.optional(),
  }),
  loans: LoanDefSchema.optional(),
  endTriggers: z.array(EndTriggerSchema),
  scoring: ScoringSchema.optional(),
  customRules: z.array(CustomRuleSchema),
  chipPreset: z.array(ChipSchema),
  /** Constitution III: every rule-dependent field is verified or marked unverified. */
  verification: z.record(z.string(), z.enum(["verified", "unverified"])),
});

export type GameDefinition = z.infer<typeof GameDefinitionSchema>;
export type CompanyDef = z.infer<typeof CompanyDefSchema>;
export type PrivateDef = z.infer<typeof PrivateDefSchema>;
export type TrainDef = z.infer<typeof TrainDefSchema>;
export type PhaseDef = z.infer<typeof PhaseDefSchema>;
export type PhaseEffect = z.infer<typeof PhaseEffectSchema>;
export type MarketDef = z.infer<typeof MarketSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type CellTag = z.infer<typeof CellTagSchema>;
export type MoveRule = z.infer<typeof MoveRuleSchema>;
export type Direction = z.infer<typeof DirectionSchema>;
export type LoanDef = z.infer<typeof LoanDefSchema>;
export type GrantDef = z.infer<typeof GrantSchema>;
export type EndTriggerDef = z.infer<typeof EndTriggerSchema>;
export type EndTriggerType = z.infer<typeof EndTriggerTypeSchema>;
export type Scoring = z.infer<typeof ScoringSchema>;
export type OptionDef = z.infer<typeof OptionDefSchema>;
export type CustomRule = z.infer<typeof CustomRuleSchema>;
export type PayoutMode = GameDefinition["payoutModes"][number];
export type CompanyTraits = z.infer<typeof CompanyTraitsSchema>;
export type NamedPayment = z.infer<typeof NamedPaymentSchema>;
