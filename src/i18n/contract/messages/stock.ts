/**
 * Feature 014 (contracts/catalogs.md): the stock message codes and their params. Every language
 * implements each code; params hold raw ids, amounts and counts, never names or formatted money.
 */

type None = Record<string, never>;
export type ShareSourceId = "ipo" | "pool" | "treasury";

export interface StockMessages {
  /** A row of a stock batch that can't be done; `row` counts from 1. */
  readonly "stock.batchRowUnavailable": { readonly row: number; readonly reason: string };
  readonly "par.notOpenable": None;
  readonly "par.byAuction": None;
  readonly "par.onlyByMerger": None;
  readonly "par.alreadyOpen": None;
  readonly "par.invalidPrice": { readonly price: number };
  readonly "trade.onlyInCR": None;
  readonly "buy.notOpen": None;
  readonly "buy.gone": None;
  readonly "buy.noneLeft": { readonly source: ShareSourceId };
  readonly "buy.onlyLeft": { readonly left: number; readonly source: ShareSourceId };
  readonly "sell.noPrice": None;
  readonly boughtAfterSelling: None;
  /** `held` for a seller; `side` for a certificate swap in the corporate round (21Moon). */
  readonly notEnoughShares: { readonly held?: number; readonly side?: "player" | "treasury" };
  /** `from`: a slot such as "SR3". */
  readonly notYetAvailable: { readonly from: string };
  readonly "private.unknown": { readonly private: string };
  readonly "private.closed": None;
  readonly "private.alreadyYours": None;
  /** `owner`: a holder ref. */
  readonly "private.noTrading": { readonly private: string; readonly owner: string };
  readonly "private.tradeLater": { readonly private: string; readonly owner: string };
  readonly certificateLimit: { readonly certs: number; readonly limit: number };
  readonly companyLimit: { readonly percent: number; readonly limit: number };
  /** Either the certificate form (`units`, `maxCerts`) or the percent form (`percent`, `maxPercent`). */
  readonly poolLimit: { readonly units?: number; readonly maxCerts?: number; readonly percent?: number; readonly maxPercent?: number };
  readonly maxSharesPerBuy: { readonly max: number };
  readonly notOperated: None;
  readonly eliminatedPlayer: { readonly player: string };
}
