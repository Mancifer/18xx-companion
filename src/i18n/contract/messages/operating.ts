/**
 * Feature 014 (contracts/catalogs.md): the operating-round message codes and their params (setup
 * and company status included). Params hold raw ids, amounts and counts, never names or money text.
 */

type None = Record<string, never>;

export type TradeInKind = "notAccepted" | "variantOnly" | "rusts" | "notHeld";

export interface OperatingMessages {
  readonly keptTrain: None;
  readonly trainNotAvailable: { readonly type: string; readonly phase: string };
  readonly trainOrder: { readonly type: string };
  /** `merger`: 1 for the corporation a merger would form (RotLA). */
  readonly trainLimit: { readonly count: number; readonly limit: number; readonly merger?: number };
  /** Why a trade-in doesn't work; `type` is the train bought, `tradeIn` the one handed in. */
  readonly tradeIn: { readonly kind: TradeInKind; readonly type?: string; readonly tradeIn?: string; readonly variant?: string };
  readonly leadoffTrain: None;
  readonly "payout.national": None;
  readonly "payout.noChoice": None;
  readonly "payout.noHalf": None;
  readonly "payout.modeNotAllowed": None;
  readonly "payout.unknownPart": { readonly part: string };
  readonly notFloated: None;
  /** A company in receivership withholds every run. */
  readonly forcedWithhold: None;
  readonly "train.unknownType": { readonly type: string };
  readonly "train.noSeller": None;
  readonly "train.selfPurchase": None;
  /** `from`: "bank", "pool" or "company" (then `seller` is the company id). */
  readonly "train.noneAt": { readonly type: string; readonly from: string; readonly seller: string };
  readonly "private.alreadyCompanys": None;
  readonly privatePrice: { readonly min: number; readonly max: number };
  readonly "train.notHeld": None;
  readonly "train.noReserve": None;
  readonly "train.supplyChange": { readonly op: "add" | "remove"; readonly type: string };
  readonly treasuryTradeTwice: None;
  readonly "redeem.noneInPool": None;
  readonly "redeem.onlyInPool": { readonly left: number };
  readonly "payment.noAbility": None;
  /** `payment`: the payment id; its label comes from the game text. */
  readonly paymentAmount: { readonly payment: string };
  readonly playerCount: { readonly min: number; readonly max: number; readonly count: number };
  /** `aliases`: the repeated aliases, as typed, joined with ", ". */
  readonly duplicateAlias: { readonly aliases: string };
  readonly "receivership.already": None;
  readonly "player.unknown": None;
  readonly "bankruptcy.already": None;
}
