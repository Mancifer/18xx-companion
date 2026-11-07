import type { AreaText } from "../../contract/domain";
import type { MechanicsMessages } from "../../contract/messages/mechanics";
import { company, money, player } from "./helpers";

/** English custom-rule messages (feature 014). */
export const mechanics: AreaText<MechanicsMessages> = {
  notMergerRound: () => "It isn't the merger round.",
  unknownIdentity: () => "This corporation has no second identity.",
  presidencyTie: (p, ctx) =>
    `Tied at ${p.units}: ${player(p.president, ctx)} becomes president (president of ${company(p.minor, ctx)}, which operates first).`,
  "merge.sameMinor": () => "Pick two different minors",
  "merge.notFloated": () => "Only two minors in play can merge",
  "merge.intoNotUnstarted": () => "The corporation must not have started",
  "merge.notDue": () => "No merger round is due",
  "landmark.notOnMarket": () => "The company isn't on the market",
  landmarkUsed: ({ landmark }) => (landmark === "rock" ? "This company already used the rock formation." : "This company already has the canyon train."),
  cliffTwice: () => "This company already used the cliff in this operating round.",
  trainNotOwned: () => "The company doesn't have that train.",
  "landmark.noRustedTrain": () => "There's no rusted train out of the game",
  canyonEarly: ({ type }) => `The ${type}s haven't rusted yet: the canyon gives a rusted ${type}.`,
  minBid: ({ amount }, ctx) => `The minimum bid is ${money(amount, ctx)}.`,
  bidStep: ({ step }, ctx) => `Bids go up in steps of ${money(step, ctx)}.`,
  launchPriceClamped: ({ half, price }, ctx) =>
    `Half the bid (${money(half, ctx)}) is outside the phase's range: ${money(price, ctx)} is used.`,
  notTrackPrice: ({ price }, ctx) => `${money(price, ctx)} isn't a market price.`,
  noLeadoffTrain: () => "This company doesn't buy the starting train.",
  "launch.notAuction": () => "This company doesn't start by auction",
  "loan.none": () => "This game has no loans",
  "loan.notYet": ({ phase }) => `Loans start in phase ${phase}`,
  "loan.noneLeft": () => "No loans left",
  loanLimit: ({ count, limit }) => `Would have ${count} loans; the voluntary limit is ${limit}.`,
  loanSupply: ({ left }) => `Only ${left} loans left.`,
  hasTrain: () => "The company already has a train: the purchase isn't forced.",
  presidencyChange: () => "That sale would change the presidency of the company buying the train.",
  presidentShort: ({ trigger }) =>
    trigger
      ? "The president can't cover it: they must sell shares or declare bankruptcy."
      : "Even selling, the president can't cover it: they may declare bankruptcy.",
  "company.noPresident": () => "The company has no president",
  grantPar: () => "The par price the owner picks is missing; set it later.",
  "private.notPlayers": () => "The private isn't owned by a player",
  "exchange.notExchangeable": () => "This private can't be exchanged",
  "exchange.pickCompany": () => "Pick the company",
  "exchange.onlyFor": (p) => `Only exchanges for ${p.company}`,
  "exchange.onlyIpo": () => "Only from the IPO",
  "exchange.onlyPool": () => "Only from the pool",
  "exchange.noneInIpo": () => "None left in the IPO",
  "exchange.noneInPool": () => "None in the pool",
  "round.onlyCR": () => "Only in the corporate round",
  "round.crEnded": () => "The end of the corporate round was already applied",
  "float.noCondition": () => "This company has no float condition",
  "float.alreadyConfirmed": () => "Already confirmed",
  "nationalBank.none": () => "There's no national bank",
  forcedPurchase: ({ fromPresident = 0, lent = 0, difference }, ctx) =>
    difference
      ? "Forced purchase: the president pays the difference."
      : lent > 0
        ? `Forced purchase: the president puts in ${money(fromPresident, ctx)} and the bank lends ${money(lent, ctx)}; the company goes into receivership.`
        : `Forced purchase: the president puts in ${money(fromPresident, ctx)}.`,
};
