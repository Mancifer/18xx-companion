import type { AreaText } from "../../contract/domain";
import type { ShareSourceId, StockMessages } from "../../contract/messages/stock";
import { holder, money, player } from "./helpers";

/** English stock messages (feature 014). */

const WHERE: Readonly<Record<ShareSourceId, string>> = { ipo: "the IPO", pool: "the pool", treasury: "the treasury" };

export const stock: AreaText<StockMessages> = {
  "stock.batchRowUnavailable": ({ row, reason }) => `Row ${row}: ${reason}`,
  "par.notOpenable": () => "This company can't be started",
  "par.byAuction": () => "This company starts by auction",
  "par.onlyByMerger": () => "This company only forms from a merger",
  "par.alreadyOpen": () => "The company has already started",
  "par.invalidPrice": ({ price }, ctx) => `Invalid par price: ${money(price, ctx)}`,
  "trade.onlyInCR": () => "Companies only buy and sell in the corporate round",
  "buy.notOpen": () => "The company hasn't started",
  "buy.gone": () => "The company no longer exists",
  "buy.noneLeft": ({ source }) => `No shares left in ${WHERE[source]}`,
  "buy.onlyLeft": ({ left, source }) => `Only ${left} left in ${WHERE[source]}`,
  "sell.noPrice": () => "The company has no price",
  boughtAfterSelling: () => "Already sold this company in this stock round.",
  notEnoughShares: ({ held, side }) =>
    side === "player"
      ? "The player doesn't have those certificates."
      : side === "treasury"
        ? "The treasury doesn't have those certificates."
        : `Only has ${held ?? 0}.`,
  notYetAvailable: ({ from }) => `This company can't be started until ${from}.`,
  "private.unknown": (p) => `Unknown private: ${p.private}`,
  "private.closed": () => "That private is closed",
  "private.alreadyYours": () => "It's already theirs",
  "private.noTrading": (p, ctx) => `${p.private} already belongs to ${holder(p.owner, ctx)}; in ${ctx.game.name} privates can't change hands`,
  "private.tradeLater": (p, ctx) =>
    `${p.private} already belongs to ${holder(p.owner, ctx)}; it can only change hands in a stock round from the second one on`,
  certificateLimit: ({ certs, limit }) => `Would have ${certs} certificates; the limit is ${limit}.`,
  companyLimit: ({ percent, limit }) => `Would have ${percent}% of the company; the limit is ${limit}%.`,
  poolLimit: (p) =>
    p.units !== undefined
      ? `The pool would have ${p.units} certificates; the maximum is ${p.maxCerts ?? ""}.`
      : `The pool would have ${p.percent ?? ""}%; the maximum is ${p.maxPercent ?? ""}%.`,
  maxSharesPerBuy: ({ max }) => `Shares are bought ${max === 1 ? "one at a time" : `up to ${max} at a time`}.`,
  notOperated: () => "This company hasn't operated yet: it can't be sold until it operates.",
  eliminatedPlayer: (p, ctx) => `${player(p.player, ctx)} is no longer in the game (bankrupt).`,
};
