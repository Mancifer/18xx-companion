import type { AreaText } from "../../contract/domain";
import type { OperatingMessages } from "../../contract/messages/operating";
import { money, paymentLabel } from "./helpers";

/** English operating-round messages (feature 014). */

export const operating: AreaText<OperatingMessages> = {
  keptTrain: () => "This train can't be sold or traded in.",
  trainNotAvailable: ({ type, phase }) => `${type} trains aren't available until phase ${phase}.`,
  trainOrder: ({ type }) => `There are still ${type} trains in the bank.`,
  trainLimit: ({ count, limit, merger }) =>
    merger ? `The corporation would have ${count} trains; the limit is ${limit}.` : `With this train it would have ${count}; the limit is ${limit}.`,
  tradeIn: (p) => {
    switch (p.kind) {
      case "notAccepted":
        return `A ${p.type ?? ""} can't be bought by trading in a ${p.tradeIn ?? ""}.`;
      case "variantOnly":
        return `The trade-in price only applies to the ${p.variant ?? ""}.`;
      case "rusts":
        return `The ${p.tradeIn ?? ""} rusts with this purchase: it can't be traded in.`;
      case "notHeld":
        return `The company has no ${p.tradeIn ?? ""} to trade in.`;
    }
  },
  leadoffTrain: () => "This company doesn't buy the starting train: it already has its own.",
  "payout.national": () => "The national bank uses its own payout",
  "payout.noChoice": () => "In this game there's no choice of how to pay",
  "payout.noHalf": () => "This game doesn't allow half pays",
  "payout.modeNotAllowed": () => "Payout mode not allowed",
  "payout.unknownPart": ({ part }) => `Unknown revenue part: ${part}`,
  notFloated: () => "The company hasn't floated.",
  forcedWithhold: () => "In receivership: withholds all revenue.",
  "train.unknownType": ({ type }) => `There are no ${type} trains in this game`,
  "train.noSeller": () => "The selling company is missing",
  "train.selfPurchase": () => "A company can't buy a train from itself",
  "train.noneAt": ({ type, from, seller }) => `There's no ${type} train in ${from === "bank" ? "the bank" : from === "pool" ? "the pool" : seller}`,
  "private.alreadyCompanys": () => "The company already owns that private",
  privatePrice: ({ min, max }, ctx) => `The price must be between ${money(min, ctx)} and ${money(max, ctx)}.`,
  "train.notHeld": () => "The company doesn't have that train",
  "train.noReserve": () => "This game has no reserve trains",
  "train.supplyChange": ({ op, type }) => `A ${type} can't be ${op === "add" ? "added" : "removed"}`,
  treasuryTradeTwice: () => "This company already issued or redeemed a share in this operating round.",
  "redeem.noneInPool": () => "There are no shares of the company in the pool",
  "redeem.onlyInPool": ({ left }) => `There are only ${left} in the pool`,
  "payment.noAbility": () => "The company doesn't have that ability",
  paymentAmount: ({ payment }, ctx) => `The amount for ${paymentLabel(payment, ctx)} is missing.`,
  playerCount: ({ min, max, count }, ctx) => `${ctx.game.name} is played with ${min}–${max} players; there are ${count}.`,
  duplicateAlias: ({ aliases }) => `Repeated aliases: ${aliases}. Voice will ask.`,
  "receivership.already": () => "Already in receivership",
  "player.unknown": () => "Unknown player",
  "bankruptcy.already": () => "Already bankrupt",
};
