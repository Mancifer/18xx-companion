import type { AssetId, CellRef, CompanyId, HolderRef } from "../types";

/**
 * The closed primitive event vocabulary (contracts/events.md). Adding a primitive needs a plan
 * amendment (constitution I).
 */
export type MarketMoveReason =
  | "payout"
  | "withhold"
  | "half"
  | "sell"
  | "soldOut"
  | "poolPenalty"
  | "issue"
  | "loan"
  | "par"
  | "manual"
  | "receivership";

export type CompanyStatus = "unstarted" | "parred" | "floated" | "receivership" | "bankrupt" | "closed";

export type Round = "PRIVATES" | "SR" | "CR" | "OR";

export type PrimitiveEvent =
  /** amount > 0, integer */
  | { readonly t: "moneyTransfer"; readonly from: HolderRef; readonly to: HolderRef; readonly amount: number }
  /** units > 0 */
  | {
      readonly t: "shareTransfer";
      readonly company: CompanyId;
      readonly from: HolderRef;
      readonly to: HolderRef;
      readonly units: number;
      readonly presidency?: boolean;
    }
  | { readonly t: "marketMove"; readonly company: CompanyId; readonly to: CellRef; readonly reason: MarketMoveReason }
  | {
      readonly t: "companyStatus";
      readonly company: CompanyId;
      readonly status: CompanyStatus;
      readonly parPrice?: number;
      readonly floatConfirmed?: boolean;
      readonly capitalPending?: boolean;
    }
  | { readonly t: "assetTransfer"; readonly asset: AssetId; readonly from: HolderRef; readonly to: HolderRef }
  | {
      readonly t: "turnAdvance";
      readonly round?: Round;
      readonly srNumber?: number;
      readonly scheduleIndex?: number;
      readonly orSet?: number;
      readonly orIndex?: number;
      readonly orsInSet?: number;
      readonly operatingOrder?: readonly CompanyId[];
      readonly company?: CompanyId | null;
      readonly phase?: string;
    }
  /** Standard keys: debt, eastWestTokens, runs, bankrupt, nationalTakeovers. */
  | { readonly t: "counterChange"; readonly subject: HolderRef; readonly key: string; readonly delta: number }
  | { readonly t: "note"; readonly text: string };

export type EventOf<T extends PrimitiveEvent["t"]> = Extract<PrimitiveEvent, { t: T }>;
