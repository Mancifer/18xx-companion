import { z } from "zod";
import { holdsMoney, holdsShares, isHolderRef, type HolderRef } from "../types";

/**
 * Source of truth for high-level actions (contracts/actions.md). Touch builds these payloads,
 * voice tools are generated from them, and imports validate against them (research R5).
 * Optional fields are nullable: null means "use the default" (the current company, the
 * current price, …). Schemas avoid transforms so they convert cleanly to JSON Schema.
 */

export const money = z.number().int().positive();
export const units = z.number().int().positive();
export const companyId = z.string().min(1);

export const holderRef = z.string().refine(isHolderRef, "invalid holder");

const isMoneyHolder = (h: string): h is HolderRef => isHolderRef(h) && holdsMoney(h);
const isShareHolder = (h: string): h is HolderRef => isHolderRef(h) && holdsShares(h);
const isPlayerOrCompany = (h: string): h is HolderRef => /^(player|company):.+$/.test(h);

/** The bank, a player or a company treasury: the only holders of money. */
export const moneyHolderRef = z.string().refine(isMoneyHolder, "only the bank, players and companies hold money");
/** Any holder except the bank. */
export const shareHolderRef = z.string().refine(isShareHolder, "the bank does not hold shares");
export const playerOrCompanyRef = z.string().refine(isPlayerOrCompany, "a player or a company");

export const WarningSchema = z.object({
  code: z.string(),
  messageEs: z.string(),
  severity: z.enum(["info", "warn"]),
});
export type Warning = z.infer<typeof WarningSchema>;

export const PlayerSchema = z.object({
  id: z.string().regex(/^p[1-7]$/, "player ids are p1..p7"),
  name: z.string().trim().min(1),
  aliases: z.array(z.string()),
  color: z.string().min(1),
  seat: z.number().int().positive(),
});

// ---------------------------------------------------------------------------------------------
// Setup and manual actions (US1)

export const createSessionAction = z
  .object({
    type: z.literal("createSession"),
    players: z.array(PlayerSchema).min(1).max(7, "at most 7 players"),
    walletMode: z.enum(["appTruth", "bankOnly"]),
  })
  .superRefine((a, ctx) => {
    const names = a.players.map((p) => p.name.trim().toLocaleLowerCase("es"));
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", message: "player names must be unique" });
    const ids = a.players.map((p) => p.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "player ids must be unique" });
    const seats = a.players.map((p) => p.seat).sort((x, y) => x - y);
    if (!seats.every((s, i) => s === i + 1)) {
      ctx.addIssue({ code: "custom", message: "seat order must be a permutation of 1..n" });
    }
  });

export const transferMoneyAction = z.object({
  type: z.literal("transferMoney"),
  from: moneyHolderRef,
  to: moneyHolderRef,
  amount: money,
});

export const adjustMoneyAction = z
  .object({
    type: z.literal("adjustMoney"),
    holder: playerOrCompanyRef,
    delta: z.number().int().nullable(),
    setTo: z.number().int().nullable(),
  })
  .refine((a) => (a.delta === null) !== (a.setTo === null), "give exactly one of delta or setTo");

export const transferSharesAction = z.object({
  type: z.literal("transferShares"),
  company: companyId,
  from: shareHolderRef,
  to: shareHolderRef,
  units,
  presidency: z.boolean().nullable(),
});

export const noteAction = z.object({ type: z.literal("note"), text: z.string().min(1) });

// ---------------------------------------------------------------------------------------------
// Operating round (US3). A null company is the operating company.

/** null = the operating company (turn.currentCompany). */
export const currentCompanyId = companyId.nullable();
export const PayoutModeSchema = z.enum(["full", "withhold", "half"]);

export const runAndPayoutAction = z.object({
  type: z.literal("runAndPayout"),
  company: currentCompanyId,
  /** One part normally ("revenue"); 21Moon has "local" and "spacePort". */
  parts: z.array(z.object({ part: z.string().min(1), amount: z.number().int().nonnegative() })).min(1),
  /** null = full, or no choice in games without a choice part. */
  mode: PayoutModeSchema.nullable(),
});

export const buyTrainAction = z.object({
  type: z.literal("buyTrain"),
  company: currentCompanyId,
  trainType: z.string().min(1),
  /** Variant name ("2+", "D"); null = the first variant. */
  variant: z.string().min(1).nullable(),
  from: z.enum(["bank", "pool", "company"]),
  /** The selling company when `from` is "company". */
  seller: companyId.nullable(),
  /** null = the list cost (or the trade-in cost). Company-to-company prices are agreed, ≥ 1. */
  price: money.nullable(),
  /** The type of the train traded in (1830 D for a 4/5/6). */
  tradeIn: z.string().min(1).nullable(),
});

export const payCostAction = z.object({
  type: z.literal("payCost"),
  company: currentCompanyId,
  amount: money,
  reason: z.string().nullable(),
});

export const bankPaysAction = z.object({
  type: z.literal("bankPays"),
  company: currentCompanyId,
  amount: money,
  reason: z.string().min(1),
});

export const privateIncomeAction = z.object({ type: z.literal("privateIncome") });

export const buyPrivateByCompanyAction = z.object({
  type: z.literal("buyPrivateByCompany"),
  company: currentCompanyId,
  private: z.string().min(1),
  price: money,
});

export const discardTrainAction = z.object({
  type: z.literal("discardTrain"),
  company: companyId,
  /** A train type ("3") or a train asset id ("train:3:2"). */
  train: z.string().min(1),
});

export const changeTrainSupplyAction = z.object({
  type: z.literal("changeTrainSupply"),
  trainType: z.string().min(1),
  op: z.enum(["add", "remove"]),
});

export const startORAction = z.object({ type: z.literal("startOR") });

/** nationalBank: the BoE pays its phase minimum plus the city values entered as `extra`. */
export const nationalPayoutAction = z.object({
  type: z.literal("nationalPayout"),
  extra: z.number().int().nonnegative(),
});

/** loans (FR-112). There is no repay action: v1 loans are never repaid (constitution VII). */
export const takeLoanAction = z.object({
  type: z.literal("takeLoan"),
  company: currentCompanyId,
  count: z.number().int().positive().max(20),
});

// Status and counters (US3, T090)

export const enterReceivershipAction = z.object({ type: z.literal("enterReceivership"), company: companyId });

export const declareBankruptcyAction = z
  .object({
    type: z.literal("declareBankruptcy"),
    player: z.string().min(1).nullable(),
    company: companyId.nullable(),
  })
  .refine((a) => (a.player === null) !== (a.company === null), "give exactly one of player or company");

export const closeCompanyAction = z.object({ type: z.literal("closeCompany"), company: companyId });

export const adjustCounterAction = z.object({
  type: z.literal("adjustCounter"),
  subject: holderRef,
  key: z.string().min(1),
  delta: z.number().int().refine((d) => d !== 0, "delta must not be 0"),
});

// ---------------------------------------------------------------------------------------------
// Stock round (US4). Buyers and sellers are holder refs: a player, or a company in a corporate
// round (only when the game enables `corporateRound`).

export const playerId = z.string().min(1);
export const ShareSourceSchema = z.enum(["ipo", "pool", "treasury"]);

export const parCompanyAction = z.object({
  type: z.literal("parCompany"),
  player: playerId,
  company: companyId,
  price: money,
});

export const buyShareAction = z.object({
  type: z.literal("buyShare"),
  buyer: playerOrCompanyRef,
  company: companyId,
  source: ShareSourceSchema,
  /** null = 1 */
  count: units.nullable(),
});

export const sellSharesAction = z.object({
  type: z.literal("sellShares"),
  seller: playerOrCompanyRef,
  company: companyId,
  count: units,
});

const certificatePart = z.object({ company: companyId, units });

/** 21Moon §9.2.2: the president swaps certificates 1-for-1 with the company treasury, no money. */
export const swapCertificatesAction = z.object({
  type: z.literal("swapCertificates"),
  player: playerId,
  company: companyId,
  give: certificatePart,
  take: certificatePart,
});

export const buyPrivateAction = z.object({
  type: z.literal("buyPrivate"),
  buyer: playerId,
  private: z.string().min(1),
  price: z.number().int().nonnegative(),
  /** The par the owner chooses when the private grants a presidency (1830 BO). */
  par: money.nullable(),
});

/** privateGrants: exchange a private for a share (1830 MH, 21Moon P6), closing it. */
export const exchangePrivateAction = z.object({
  type: z.literal("exchangePrivate"),
  private: z.string().min(1),
  source: z.enum(["ipo", "pool"]),
  /** The company whose share is taken; null = the one the private names. */
  company: companyId.nullable(),
});

export const stockBatchAction = z
  .object({
    type: z.literal("stockBatch"),
    items: z.array(z.discriminatedUnion("type", [buyShareAction, sellSharesAction, parCompanyAction])).min(1),
    /** Per item: the price assumed when it happened; null = the price at that point. */
    assumedPrices: z.array(money.nullable()),
  })
  .refine((a) => a.assumedPrices.length === a.items.length, "one assumed price (or null) per item");

/** auctionLaunch (RotLA): the auction winner launches a company; price null = half the bid. */
export const launchCompanyAction = z.object({
  type: z.literal("launchCompany"),
  player: playerId,
  company: companyId,
  bid: money,
  price: money.nullable(),
});

export const startSRAction = z.object({ type: z.literal("startSR") });
export const endSRAction = z.object({ type: z.literal("endSR") });
export const confirmFloatConditionAction = z.object({ type: z.literal("confirmFloatCondition"), company: companyId });
export const issueSharesAction = z.object({ type: z.literal("issueShares"), company: companyId, count: units });
/** A company buys its own shares back from the pool (RotLA); count null = 1. */
export const redeemShareAction = z.object({ type: z.literal("redeemShare"), company: currentCompanyId, count: units.nullable() });
/**
 * corporateBankruptcy with presidentPays (RotLA B p.17): the president sells shares to fund a train
 * the company must buy; each sold company drops once, after all the sales.
 */
export const forcedTrainPurchaseAction = z.object({
  type: z.literal("forcedTrainPurchase"),
  company: currentCompanyId,
  trainType: z.string().min(1),
  variant: z.string().min(1).nullable(),
  from: z.enum(["bank", "pool"]),
  sales: z.array(z.object({ company: companyId, count: units })),
});
/** mergers (RotLA B p.18): two minors become a major in the Merger Round; identity null = primary. */
export const mergeCompaniesAction = z.object({
  type: z.literal("mergeCompanies"),
  a: companyId,
  b: companyId,
  into: companyId,
  identity: z.enum(["primary", "alt"]).nullable(),
});
export const startMRAction = z.object({ type: z.literal("startMR") });
/** landmarks (RotLA Landmarks L p.10–11): the postcards' money effects. */
export const rockFormationAction = z.object({ type: z.literal("rockFormation"), company: currentCompanyId });
/** train: a type ("5") or a train asset id ("train:5:1"). */
export const cliffSaleAction = z.object({ type: z.literal("cliffSale"), company: currentCompanyId, train: z.string().min(1) });
export const canyonTrainAction = z.object({ type: z.literal("canyonTrain"), company: currentCompanyId });
/** A company ability's money (traits.payments: Tunneling, Expansive, Sede); amount null = the trait's. */
export const namedPaymentAction = z.object({
  type: z.literal("namedPayment"),
  company: currentCompanyId,
  payment: z.string().min(1),
  amount: money.nullable(),
});
export const startCRAction = z.object({ type: z.literal("startCR") });
export const endCRAction = z.object({ type: z.literal("endCR") });

// ---------------------------------------------------------------------------------------------
// Turns and market (US7)

export const CellRefSchema = z.union([
  z.object({ row: z.number().int().nonnegative(), col: z.number().int().nonnegative() }),
  z.object({ index: z.number().int().nonnegative() }),
]);

export const nextCompanyAction = z.object({ type: z.literal("nextCompany") });
export const setPhaseAction = z.object({ type: z.literal("setPhase"), phase: z.string().min(1) });
/** A manual turn override: null fields stay as they are. */
export const setTurnAction = z.object({
  type: z.literal("setTurn"),
  round: z.enum(["PRIVATES", "SR", "CR", "OR", "MR"]).nullable(),
  srNumber: z.number().int().nonnegative().nullable(),
  orSet: z.number().int().nonnegative().nullable(),
  orIndex: z.number().int().nonnegative().nullable(),
  orsInSet: z.number().int().positive().nullable(),
  company: companyId.nullable(),
});
export const setMarketAction = z.object({ type: z.literal("setMarket"), company: companyId, cell: CellRefSchema });

/**
 * Several actions recorded as one group (FR-071: a compound voice command). The items are
 * parsed with ActionSchema when expanded; a compound cannot contain another compound.
 */
export const compoundAction = z.object({
  type: z.literal("compound"),
  actions: z.array(z.record(z.string(), z.unknown())).min(1),
});

/** All actions that go through the pipeline. Later stories extend this union. */
export const ActionSchema = z.discriminatedUnion("type", [
  createSessionAction,
  transferMoneyAction,
  adjustMoneyAction,
  transferSharesAction,
  noteAction,
  runAndPayoutAction,
  buyTrainAction,
  payCostAction,
  bankPaysAction,
  privateIncomeAction,
  buyPrivateByCompanyAction,
  discardTrainAction,
  changeTrainSupplyAction,
  startORAction,
  nationalPayoutAction,
  takeLoanAction,
  enterReceivershipAction,
  declareBankruptcyAction,
  closeCompanyAction,
  adjustCounterAction,
  parCompanyAction,
  buyShareAction,
  sellSharesAction,
  swapCertificatesAction,
  buyPrivateAction,
  exchangePrivateAction,
  stockBatchAction,
  launchCompanyAction,
  startSRAction,
  endSRAction,
  confirmFloatConditionAction,
  issueSharesAction,
  redeemShareAction,
  namedPaymentAction,
  forcedTrainPurchaseAction,
  mergeCompaniesAction,
  startMRAction,
  rockFormationAction,
  cliffSaleAction,
  canyonTrainAction,
  startCRAction,
  endCRAction,
  nextCompanyAction,
  setPhaseAction,
  setTurnAction,
  setMarketAction,
  compoundAction,
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionType = Action["type"];
export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** Ledger operations: handled by the store, not expanded into events. */
export const undoAction = z.object({ type: z.literal("undo"), groupId: z.string().nullable() });
export type UndoAction = z.infer<typeof undoAction>;
