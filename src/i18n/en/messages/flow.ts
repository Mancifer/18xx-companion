import type { AreaText } from "../../contract/domain";
import type { FlowMessages } from "../../contract/messages/flow";
import { domain } from "../domain";
import { exportPreviewOf } from "../../shared";
import { company, money } from "./helpers";

/** English flow messages (feature 014). */
export const flow: AreaText<FlowMessages> = {
  "compound.invalidStep": ({ index }) => `Action ${index} is not valid`,
  "compound.nested": () => "A compound action can't contain another one",
  "compound.gameEndStep": ({ index }) => `Action ${index}: ending or reopening the game goes in its own entry`,
  "compound.notOffered": ({ index }) => `Action ${index}: not available in this game`,
  "compound.stepUnavailable": ({ index, reason }) => `Action ${index}: ${reason}`,
  gameOver: () => "The game is over.",
  export: (p, ctx) => domain.exportInfo(exportPreviewOf(p, ctx), ctx.game),
  "round.onlySR": () => "Only in the stock round",
  "round.srEnded": () => "The end of the stock round was already applied",
  newSet: () => "This set's ORs have been played: a new set starts without a stock round.",
  "round.onlyOR": () => "Only in the operating round",
  noRunRecorded: (p, ctx) =>
    p.ran
      ? `No run was recorded for ${company(p.company, ctx)}: it counts as not run and its price drops.`
      : `No run was recorded for ${company(p.company, ctx)}: it counts as operated.`,
  setComplete: () => "End of the operating rounds.",
  alreadyEnded: () => domain.gameEnd.alreadyEnded,
  noEndCondition: () => domain.gameEnd.noEndCondition,
  "game.notEnded": () => domain.gameEnd.notEnded,
  "phase.unknown": ({ phase }) => `Unknown phase: ${phase}`,
  bankBroken: () => "The bank runs out of money (bank broken).",
  insufficientCash: ({ have }, ctx) => `Only has ${money(have, ctx)}; will go negative.`,
  phaseStarter: ({ phase, type }, ctx) =>
    `The ${domain.phaseName(ctx.game, phase)} phase started with a ${type}: the phase and rusted trains don't change by themselves. If needed, correct them in Phase (turn control).`,
  notOnSale: ({ type }) => `The ${type} is no longer sold in this phase.`,
  refundOffSupply: () => "The refund is recorded, though the train doesn't return to the supply.",
  "correct.noDestination": () => "Where the train goes is missing",
  "correct.noDestinationOnAdd": () => "Giving a train takes no destination",
  "correct.noneInSupply": ({ type }) => `No ${type} trains left in the supply`,
  "correct.noPool": () => "In this game trains don't go to the pool",
  "market.noCell": () => "That cell doesn't exist",
  "action.notInGame": () => "Not available in this game",
  "action.unknown": () => "Unknown action",
  "company.noneOperating": () => "No company is operating: pick one",
  "company.unknown": (p) => `Unknown company: ${p.company}`,
  outOfTurn: (p, ctx) => `${company(p.company, ctx)} operates out of turn (it's ${company(p.current, ctx)}'s turn).`,
};
