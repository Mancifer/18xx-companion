import type { SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { nextToOperate, operatingOrder } from "./operatingOrder";
import { currentPhase } from "./phases";

/**
 * Round schedules (data-model §9): `byPhase` (ORs per set from the phase when the set starts,
 * 1830 §3.3) or `fixed` (21Moon: PRIVATES, SR n, CR n, OR n.1, OR n.2 …, OR 5.3, with events).
 */

export function slotIndex(game: GameDefinition, slot: string): number | undefined {
  const schedule = game.roundSchedule;
  if (schedule.type !== "fixed") return undefined;
  const i = schedule.sequence.indexOf(slot);
  return i >= 0 ? i : undefined;
}

export function orsInSetFor(game: GameDefinition, state: SessionState, set: number): number {
  const schedule = game.roundSchedule;
  if (schedule.type === "fixed") {
    const count = schedule.sequence.filter((s) => s.startsWith(`OR${set}.`)).length;
    if (count > 0) return count;
  }
  return currentPhase(game, state)?.orsPerSet ?? 1;
}

/** Scheduled events at a slot (21Moon OR4.1 closes the privates), as events. */
export function scheduledEvents(game: GameDefinition, state: SessionState, slot: string): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = [];
  const schedule = game.roundSchedule;
  const closeAll = schedule.type === "fixed" && schedule.events.some((e) => e.at === slot && e.effect.type === "closePrivates");
  if (schedule.type === "fixed") {
    for (const e of schedule.events) {
      if (e.at === slot && e.effect.type === "note") events.push({ t: "note", text: e.effect.text });
    }
  }
  for (const p of game.privates) {
    const asset = `private:${p.id}`;
    const holder = state.assets[asset];
    if (!holder || holder === "removed") continue;
    if (closeAll || p.closesOn.some((c) => c.type === "scheduled" && c.slot === slot)) {
      events.push({ t: "assetTransfer", asset, from: holder, to: "removed" });
    }
  }
  return events;
}

/**
 * Starting an OR: the next OR in the set, or a new set when the round is not an OR or the set is
 * complete. Scheduled events run first (before private income), then the order and the first
 * company are set.
 */
export function startOREvents(game: GameDefinition, state: SessionState): PrimitiveEvent[] {
  const turn = state.turn;
  const sameSet = turn.round === "OR" && turn.orIndex < turn.orsInSet;
  const orSet = sameSet ? turn.orSet : turn.orSet + 1;
  const orIndex = sameSet ? turn.orIndex + 1 : 1;
  const orsInSet = sameSet ? turn.orsInSet : orsInSetFor(game, state, orSet);
  const slot = `OR${orSet}.${orIndex}`;
  const scheduleIndex = slotIndex(game, slot);
  const events = scheduledEvents(game, state, slot);

  // The order is computed as of the new OR (nobody has operated yet).
  const fresh: SessionState = { ...state, turn: { ...state.turn, operatedThisOR: [] } };
  const order = operatingOrder(game, fresh);
  events.push({
    t: "turnAdvance",
    round: "OR",
    orSet,
    orIndex,
    orsInSet,
    ...(scheduleIndex !== undefined ? { scheduleIndex } : {}),
    operatingOrder: order,
    company: nextToOperate(game, fresh) ?? null,
  });
  return events;
}
