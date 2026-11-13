import type { Action } from "../actions/schemas";
import { advanceTurn } from "../events/reduce";
import { initialState, type SessionState } from "../events/state";
import type { MarketMoveReason, PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import type { CompanyId } from "../types";
import type { EffectiveGroup } from "./effectiveLog";
import type { GroupId } from "./entries";
import type { OrRef } from "./operatingPhase";

/**
 * Feature 017 (US2, research R5–R6, data-model §5): what a company's trains made the last time it
 * ran. Derived from the effective log, never stored, so an undo falls back to the previous run.
 */

export type RunMode = "full" | "withhold" | "half";

export interface RevenuePartAmount {
  readonly part: string;
  readonly amount: number;
}

export interface LastRun {
  readonly company: CompanyId;
  readonly groupId: GroupId;
  /** The OR the run belongs to. */
  readonly or: OrRef;
  /** Sum of the parts; null when the run's amount could not be read (a legacy compound). */
  readonly revenue: number | null;
  /** In `game.revenueParts` order; one entry in most games, two in 21Moon. */
  readonly parts: readonly RevenuePartAmount[];
  /** null: the game's parts are fixed (no payout choice), or the amount is unknown. */
  readonly mode: RunMode | null;
}

/** A run's market move says how it was really paid (a forced withhold, a full payout of 0). */
const MOVE_MODE: Partial<Record<MarketMoveReason, RunMode>> = { payout: "full", restack: "full", withhold: "withhold", half: "half" };

function hasPayoutChoice(game: GameDefinition): boolean {
  return game.revenueParts.length === 1 && game.revenueParts[0]?.to === "choice";
}

interface RunItem {
  readonly company: string | null;
  readonly parts: readonly RevenuePartAmount[];
  readonly mode: RunMode | null;
}

/** A `runAndPayout` read loosely: compound items are stored as raw records. */
function asRun(item: unknown): RunItem | undefined {
  if (typeof item !== "object" || item === null) return undefined;
  const r = item as Record<string, unknown>;
  if (r["type"] !== "runAndPayout" || !Array.isArray(r["parts"])) return undefined;
  const parts: RevenuePartAmount[] = [];
  for (const p of r["parts"] as unknown[]) {
    const part = (p as Record<string, unknown> | null)?.["part"];
    const amount = (p as Record<string, unknown> | null)?.["amount"];
    if (typeof part !== "string" || typeof amount !== "number") return undefined;
    parts.push({ part, amount });
  }
  const company = typeof r["company"] === "string" ? r["company"] : null;
  const mode = r["mode"] === "full" || r["mode"] === "withhold" || r["mode"] === "half" ? r["mode"] : null;
  return { company, parts, mode };
}

/** The run behind C's `runs` mark in a group (R5); undefined when none can be matched. */
function runItemFor(game: GameDefinition, action: Action, company: CompanyId, operating: CompanyId | undefined): RunItem | undefined {
  if (action.type === "runAndPayout") return asRun(action);
  if (action.type === "compound") {
    const matching = action.actions
      .map(asRun)
      .filter((r): r is RunItem => r !== undefined && (r.company === company || (r.company === null && operating === company)));
    return matching.at(-1);
  }
  // nextCompany with no recorded run: the game's "did not run" (flow.ts, zeroRunAction).
  if (action.type === "nextCompany") {
    return { company, parts: game.revenueParts.map((p) => ({ part: p.id, amount: 0 })), mode: hasPayoutChoice(game) ? "withhold" : null };
  }
  return undefined;
}

function inPartOrder(game: GameDefinition, parts: readonly RevenuePartAmount[]): RevenuePartAmount[] {
  const rank = (id: string) => {
    const i = game.revenueParts.findIndex((p) => p.id === id);
    return i < 0 ? game.revenueParts.length : i;
  };
  return [...parts].sort((a, b) => rank(a.part) - rank(b.part));
}

function modeOf(game: GameDefinition, events: readonly PrimitiveEvent[], company: CompanyId, item: RunItem): RunMode | null {
  if (!hasPayoutChoice(game)) return null;
  for (const e of events) {
    if (e.t !== "marketMove" || e.company !== company) continue;
    const mode = MOVE_MODE[e.reason];
    if (mode) return mode;
  }
  return item.mode ?? "full";
}

/**
 * One fold over the effective groups, event by event: `turnAdvance` moves the OR and the operating
 * company (as rounds.ts does); each `runs` mark on a non-national company is its newest run.
 */
export function lastRuns(game: GameDefinition, effective: readonly EffectiveGroup[]): ReadonlyMap<CompanyId, LastRun> {
  const national = new Set(game.companies.filter((c) => c.kind === "national").map((c) => c.id));
  const runs = new Map<CompanyId, LastRun>();
  let state: SessionState = initialState(game, []);
  for (const g of [...effective].sort((a, b) => a.seq - b.seq)) {
    for (const e of g.events) {
      if (e.t === "turnAdvance") {
        state = advanceTurn(state, e);
        continue;
      }
      if (e.t !== "counterChange" || e.key !== "runs" || e.delta <= 0 || !e.subject.startsWith("company:")) continue;
      const company = e.subject.slice("company:".length);
      if (national.has(company)) continue;
      const or = { orSet: state.turn.orSet, orIndex: state.turn.orIndex };
      const item = runItemFor(game, g.action, company, state.turn.currentCompany);
      runs.set(
        company,
        item
          ? {
              company,
              groupId: g.id,
              or,
              revenue: item.parts.reduce((sum, p) => sum + p.amount, 0),
              parts: inPartOrder(game, item.parts),
              mode: modeOf(game, g.events, company, item),
            }
          : { company, groupId: g.id, or, revenue: null, parts: [], mode: null },
      );
    }
  }
  return runs;
}

export function lastRun(game: GameDefinition, effective: readonly EffectiveGroup[], company: CompanyId): LastRun | undefined {
  return lastRuns(game, effective).get(company);
}
