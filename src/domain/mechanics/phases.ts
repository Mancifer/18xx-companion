import { counterOf, type SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition, PhaseDef } from "../games/schema";
import { assetKind, parseHolder, trainTypeOf, type AssetId, type CompanyId, type HolderRef } from "../types";
import { effectiveTraits } from "./traits";

/** Counter on a company: this train rusted but stays for one last run (Resourceful, research R10). */
export const RUSTED = "rusted:";
/** Counter on a company: this train never rusts and should not be sold (Canyon, research R13). */
export const PERMANENT = "permanent:";

const OPERATING: ReadonlySet<string> = new Set(["floated", "receivership"]);

/** Phases (FR-035): triggered by the first train of a type; effects are recorded as events. */

export function phaseIndex(game: GameDefinition, id: string): number {
  return game.phases.findIndex((p) => p.id === id);
}

export function currentPhase(game: GameDefinition, state: SessionState): PhaseDef | undefined {
  return game.phases.find((p) => p.id === state.turn.phase) ?? game.phases[0];
}

/** Whether the current phase is `id` or later. */
export function phaseReached(game: GameDefinition, state: SessionState, id: string): boolean {
  const target = phaseIndex(game, id);
  return target >= 0 && phaseIndex(game, state.turn.phase) >= target;
}

/**
 * The phases a first train of this type starts, in order (several when a type skips phases).
 * Empty when the type triggers no phase or its phase has already been reached (idempotent).
 */
export function phasesTriggeredBy(game: GameDefinition, state: SessionState, trainType: string): PhaseDef[] {
  const target = game.phases.findIndex((p) => p.triggeredBy === trainType);
  const current = phaseIndex(game, state.turn.phase);
  if (target < 0 || target <= current) return [];
  return game.phases.slice(current + 1, target + 1);
}

/** The phase that follows if this train type is bought now. */
export function phaseAfterBuying(game: GameDefinition, state: SessionState, trainType: string): PhaseDef | undefined {
  return phasesTriggeredBy(game, state, trainType).at(-1) ?? currentPhase(game, state);
}

/**
 * The events of entering the given phases: the phase change, rusted trains and closed privates
 * to `removed` (data-model §6: closed = held by `removed`).
 */
export function phaseChangeEvents(game: GameDefinition, state: SessionState, phases: readonly PhaseDef[]): PrimitiveEvent[] {
  const last = phases.at(-1);
  if (!last) return [];
  const events: PrimitiveEvent[] = [{ t: "turnAdvance", phase: last.id }];
  const removed = new Set<AssetId>();
  const remove = (asset: AssetId, from: HolderRef) => {
    if (from === "removed" || removed.has(asset)) return;
    removed.add(asset);
    events.push({ t: "assetTransfer", asset, from, to: "removed" });
  };
  // Resourceful (research R10): its rusting trains stay, marked for one last run.
  const keeps = (holder: HolderRef): boolean => {
    const h = parseHolder(holder);
    return h.kind === "company" && effectiveTraits(game, state, h.id).keepsRustedTrains === true;
  };
  for (const phase of phases) {
    const rusting = new Set(game.trains.filter((t) => t.rustsOnPhase === phase.id).map((t) => t.type));
    const closesAll = phase.effects.some((e) => e.type === "closePrivates");
    for (const [asset, holder] of Object.entries(state.assets)) {
      const kind = assetKind(asset);
      if (kind === "train" && rusting.has(trainTypeOf(asset))) {
        if (!keeps(holder)) remove(asset, holder);
        else if (counterOf(state, holder, `${RUSTED}${asset}`) === 0 && !removed.has(asset)) {
          removed.add(asset);
          events.push({ t: "counterChange", subject: holder, key: `${RUSTED}${asset}`, delta: 1 });
        }
      }
      if (kind === "private") {
        const def = game.privates.find((p) => `private:${p.id}` === asset);
        const closesHere = def?.closesOn.some((c) => c.type === "phase" && c.phase === phase.id) ?? false;
        if (closesAll || closesHere) remove(asset, holder);
      }
    }
  }
  return events;
}

/** The number of trains a company may hold in a phase (2 × bases in 21Moon). */
export function trainLimit(game: GameDefinition, phase: PhaseDef | undefined): number {
  const scope = game.trainLimitScope;
  if (scope !== "company") return scope.perBase * scope.bases.length;
  return phase?.trainLimit ?? Number.POSITIVE_INFINITY;
}

/**
 * A company's train limit in a phase (default: the current one): the tier's limit when the phase
 * gives one, else the phase's, plus the effective `trainLimitBonus` (Spacious, research R10).
 */
export function trainLimitFor(
  game: GameDefinition,
  state: SessionState,
  company: CompanyId,
  phase: PhaseDef | undefined = currentPhase(game, state),
): number {
  if (game.trainLimitScope !== "company") return trainLimit(game, phase);
  const tier = game.companies.find((c) => c.id === company)?.tier;
  const base = (tier !== undefined ? phase?.trainLimitByTier?.[tier] : undefined) ?? trainLimit(game, phase);
  return base + (effectiveTraits(game, state, company).trainLimitBonus ?? 0);
}

/** Trains a company holds that count toward the limit (the 1848 2E does not; rusted ones do not). */
export function countedTrains(game: GameDefinition, state: SessionState, company: CompanyId): AssetId[] {
  const ref = `company:${company}` as const;
  return Object.entries(state.assets)
    .filter(([asset, holder]) => holder === ref && assetKind(asset) === "train")
    .map(([asset]) => asset)
    .filter((asset) => counterOf(state, ref, `${RUSTED}${asset}`) === 0)
    .filter((asset) => game.trains.find((t) => t.type === trainTypeOf(asset))?.countsForLimit ?? true);
}

export interface OverLimit {
  readonly company: CompanyId;
  readonly count: number;
  readonly limit: number;
}

/** Operating companies holding more trains than their limit (FR-020: the Table banner). */
export function overLimitCompanies(game: GameDefinition, state: SessionState): OverLimit[] {
  const result: OverLimit[] = [];
  for (const c of game.companies) {
    if (!OPERATING.has(state.companies[c.id]?.status ?? "")) continue;
    const count = countedTrains(game, state, c.id).length;
    const limit = trainLimitFor(game, state, c.id);
    if (count > limit) result.push({ company: c.id, count, limit });
  }
  return result;
}

export interface StackEntry {
  readonly type: string;
  readonly displayName: string;
  readonly left: number | "∞";
}

/** The bank's train stack, top first (`game.trains` order), without `special` types or empty types. */
export function trainStack(game: GameDefinition, state: SessionState): StackEntry[] {
  return game.trains
    .filter((t) => !t.special)
    .map((t) => ({
      type: t.type,
      displayName: t.displayName ?? t.type,
      left: t.count === "unlimited" ? ("∞" as const) : trainsHeldBy(state, "bank", t.type).length,
    }))
    .filter((e) => e.left !== 0);
}

/** Trains held by a holder, cheapest-numbered first, optionally of one type. */
export function trainsHeldBy(state: SessionState, holder: HolderRef, type?: string): AssetId[] {
  return Object.entries(state.assets)
    .filter(([asset, h]) => h === holder && assetKind(asset) === "train" && (type === undefined || trainTypeOf(asset) === type))
    .map(([asset]) => asset)
    .sort((a, b) => trainNumber(a) - trainNumber(b));
}

export function trainNumber(asset: AssetId): number {
  return Number(asset.split(":")[2] ?? 0);
}

/** Whether a train transfer in these events puts a train into play from the bank. */
export function trainsLeavingBank(events: readonly PrimitiveEvent[], countRemoved: boolean): string[] {
  const types: string[] = [];
  for (const e of events) {
    if (e.t !== "assetTransfer" || e.from !== "bank" || assetKind(e.asset) !== "train") continue;
    const to = parseHolder(e.to).kind;
    if (to === "company" || (countRemoved && to === "removed")) types.push(trainTypeOf(e.asset));
  }
  return types;
}
