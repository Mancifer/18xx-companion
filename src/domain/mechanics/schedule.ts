import type { SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition, PhaseDef } from "../games/schema";
import { nextToOperate, operatingOrder } from "./operatingOrder";
import { currentPhase, phaseReached, phasesTriggeredBy, trainNumber, trainsHeldBy } from "./phases";
import { trainTypeOf } from "../types";

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
 * Whether a conditional Merger Round slot is due now (RotLA B p.18): the round is the last OR of
 * the cycle, the schedule has an `MR<n>` slot, and its condition's phase has been reached. No
 * export timing is needed: the export that might start that phase comes after this point.
 */
export function mergerRoundDue(game: GameDefinition, state: SessionState): boolean {
  const schedule = game.roundSchedule;
  const turn = state.turn;
  if (schedule.type !== "fixed" || turn.round !== "OR" || turn.orIndex < turn.orsInSet) return false;
  const slot = `MR${turn.srNumber}`;
  if (!schedule.sequence.includes(slot)) return false;
  const condition = schedule.conditional?.find((c) => slot.startsWith(c.slotPrefix));
  return condition === undefined || phaseReached(game, state, condition.phaseReached);
}

/**
 * The export at the start of each new SR (RotLA B p.19, research R7): the top of the train stack
 * leaves the game, every bank-held train of its type when the type is in `allOfType`. An
 * unlimited type creates its next numbered train, as a purchase does. `special` types never go.
 * The phase change and rust follow from `phaseTrigger` (bank → removed counts as a sale).
 */
export function exportEvents(game: GameDefinition, state: SessionState): PrimitiveEvent[] {
  const exported = game.trainExport;
  if (!exported) return [];
  for (const train of game.trains) {
    if (train.special) continue;
    if (train.count === "unlimited") {
      const highest = Object.keys(state.assets)
        .filter((asset) => asset.startsWith("train:") && trainTypeOf(asset) === train.type)
        .reduce((max, asset) => Math.max(max, trainNumber(asset)), 0);
      return [{ t: "assetTransfer", asset: `train:${train.type}:${highest + 1}`, from: "bank", to: "removed" }];
    }
    const held = trainsHeldBy(state, "bank", train.type);
    if (held.length === 0) continue;
    const leaving = exported.allOfType.includes(train.type) ? held : held.slice(0, 1);
    return leaving.map((asset): PrimitiveEvent => ({ t: "assetTransfer", asset, from: "bank", to: "removed" }));
  }
  return [];
}

export interface ExportPreview {
  readonly type: string;
  readonly displayName: string;
  readonly count: number;
  /** The phase the export starts, if any (the last one when it passes several). */
  readonly phase: PhaseDef | undefined;
  /** Train types that rust with it. */
  readonly rusts: readonly string[];
}

/** What the next export takes, and what it starts (the startSR info, the round button's subtitle). */
export function exportPreview(game: GameDefinition, state: SessionState): ExportPreview | undefined {
  const events = exportEvents(game, state);
  const first = events[0];
  if (first?.t !== "assetTransfer") return undefined;
  const type = trainTypeOf(first.asset);
  const phases = phasesTriggeredBy(game, state, type);
  return {
    type,
    displayName: game.trains.find((t) => t.type === type)?.displayName ?? type,
    count: events.length,
    phase: phases.at(-1),
    rusts: game.trains.filter((t) => phases.some((p) => p.id === t.rustsOnPhase)).map((t) => t.type),
  };
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
