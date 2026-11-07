/**
 * Feature 014 (contracts/catalogs.md): the flow message codes (rounds, game end, corrections,
 * money checks, action lookup) and their params. Params hold raw ids, amounts and counts.
 */

type None = Record<string, never>;

export interface FlowMessages {
  /** `index` counts from 1. */
  readonly "compound.invalidStep": { readonly index: number };
  readonly "compound.nested": None;
  readonly "compound.gameEndStep": { readonly index: number };
  readonly "compound.notOffered": { readonly index: number };
  readonly "compound.stepUnavailable": { readonly index: number; readonly reason: string };
  readonly gameOver: None;
  /** The next export (startSR info): `phase` is a phase id or "", `rusts` the rusting types joined with ",". */
  readonly export: { readonly type: string; readonly displayName: string; readonly count: number; readonly phase: string; readonly rusts: string };
  readonly "round.onlySR": None;
  readonly "round.srEnded": None;
  readonly newSet: None;
  readonly "round.onlyOR": None;
  /** `ran`: 1 when the missing run counts as not run (and the price drops), 0 when it counts as operated. */
  readonly noRunRecorded: { readonly company: string; readonly ran: number };
  readonly setComplete: None;
  readonly alreadyEnded: None;
  readonly noEndCondition: None;
  readonly "game.notEnded": None;
  readonly "phase.unknown": { readonly phase: string };
  readonly bankBroken: None;
  readonly insufficientCash: { readonly have: number };
  readonly phaseStarter: { readonly phase: string; readonly type: string };
  readonly notOnSale: { readonly type: string };
  readonly refundOffSupply: None;
  readonly "correct.noDestination": None;
  readonly "correct.noDestinationOnAdd": None;
  readonly "correct.noneInSupply": { readonly type: string };
  readonly "correct.noPool": None;
  readonly "market.noCell": None;
  readonly "action.notInGame": None;
  readonly "action.unknown": None;
  readonly "company.noneOperating": None;
  readonly "company.unknown": { readonly company: string };
  readonly outOfTurn: { readonly company: string; readonly current: string };
}
