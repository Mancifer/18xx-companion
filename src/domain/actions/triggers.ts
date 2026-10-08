import type { PrimitiveEvent } from "../events/types";
import { reduceAll } from "../events/reduce";
import { enabledMechanics } from "../mechanics/custom";
import type { Trigger, TriggerContext } from "./context";

/** Core triggers, in order. Stories add theirs (float, presidency, phase, market cells). */
export const coreTriggers: Trigger[] = [];

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
