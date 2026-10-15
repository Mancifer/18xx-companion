import type { PrimitiveEvent } from "../events/types";
import { reduceAll } from "../events/reduce";
import { floatTrigger } from "../mechanics/capitalization";
import { enabledMechanics } from "../mechanics/custom";
import { phaseChangeEvents, phasesTriggeredBy, trainsLeavingBank } from "../mechanics/phases";
import { presidencyTrigger } from "../mechanics/presidency";
import { assetKind, parseHolder } from "../types";
import type { Trigger, TriggerContext } from "./context";

/** Corrections of what was recorded (feature 011): never a purchase, so they trigger no phase or closing. */
export const CORRECTION_ACTIONS: ReadonlySet<string> = new Set(["correctTrain"]);

/**
 * Phase change (FR-035): the first train of a type to leave the bank starts its phase, with the
 * phase's effects in the same group. A train removed from the bank also counts as sold (1848
 * §5.4.4), except when the table changes the supply on purpose (21Moon P2). A correction
 * (`CORRECTION_ACTIONS`) never starts a phase (FR-016).
 */
export const phaseTrigger: Trigger = (ctx) => {
  if (CORRECTION_ACTIONS.has(ctx.action.type)) return [];
  const countRemoved = ctx.action.type !== "changeTrainSupply";
  for (const type of trainsLeavingBank(ctx.events, countRemoved)) {
    const phases = phasesTriggeredBy(ctx.game, ctx.state, type);
    if (phases.length > 0) return phaseChangeEvents(ctx.game, ctx.state, phases);
  }
  return [];
};

/**
 * Private closings declared as data (`closesOn`): when a given company gets a train, or when a
 * company buys the private. Phase closings run with the phase change; exchanges and scheduled
 * closings with their own actions. A correction (`CORRECTION_ACTIONS`) is not a purchase and
 * closes nothing.
 */
export const privateClosingTrigger: Trigger = (ctx) => {
  if (CORRECTION_ACTIONS.has(ctx.action.type)) return [];
  const events: PrimitiveEvent[] = [];
  for (const p of ctx.game.privates) {
    const asset = `private:${p.id}`;
    const holder = ctx.state.assets[asset];
    if (!holder || holder === "removed") continue;
    const closes = p.closesOn.some((c) => {
      if (c.type === "companyBuysTrain") {
        const ref = `company:${c.company}`;
        return ctx.events.some((e) => e.t === "assetTransfer" && assetKind(e.asset) === "train" && e.to === ref && e.from !== ref);
      }
      if (c.type === "boughtByCompany") {
        return ctx.events.some((e) => e.t === "assetTransfer" && e.asset === asset && parseHolder(e.to).kind === "company");
      }
      return false;
    });
    if (closes) events.push({ t: "assetTransfer", asset, from: holder, to: "removed" });
  }
  return events;
};

/** Core triggers, in order. Mechanics add theirs when enabled. */
export const coreTriggers: Trigger[] = [phaseTrigger, privateClosingTrigger, floatTrigger, presidencyTrigger];

const MAX_ROUNDS = 10;

/**
 * Applies triggers to the interim state until none adds events (a fixpoint), so a trigger can
 * react to another's events within the same group. Triggers are idempotent.
 */
export function runTriggers(ctx: Omit<TriggerContext, "events" | "state">, events: readonly PrimitiveEvent[]): PrimitiveEvent[] {
  const triggers = [...coreTriggers, ...enabledMechanics(ctx.game).flatMap((m) => m.triggers ?? [])];
  let all = [...events];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let added = false;
    for (const trigger of triggers) {
      const state = reduceAll(ctx.stateBefore, all);
      const extra = trigger({ ...ctx, state, events: all });
      if (extra.length > 0) {
        all = [...all, ...extra];
        added = true;
      }
    }
    if (!added) return all;
  }
  throw new Error("Triggers did not settle; a trigger is not idempotent");
}
