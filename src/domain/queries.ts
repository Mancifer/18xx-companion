import type { Action } from "./actions/schemas";
import type { SessionState } from "./events/state";
import type { PrimitiveEvent } from "./events/types";
import { privateResaleOpen } from "./actions/expand/stock";
import type { GameDefinition, PrivateDef } from "./games/schema";
import { operatingOrder } from "./mechanics/operatingOrder";
import type { CompanyId, PlayerId } from "./types";

export type QueryKind = "cash" | "shares" | "price" | "treasury" | "trains" | "bank" | "president" | "turn";
export const QUERY_KINDS: readonly QueryKind[] = ["cash", "shares", "price", "treasury", "trains", "bank", "president", "turn"];

export interface Query {
  readonly kind: QueryKind;
  readonly player: PlayerId | null;
  readonly company: CompanyId | null;
}

/**
 * The groups recorded in the current operating round: those after the latest group that started
 * an OR (a turnAdvance with an OR index). All groups when no OR has started yet.
 */
export function currentORGroups<G extends { readonly events: readonly PrimitiveEvent[] }>(groups: readonly G[]): G[] {
  let start = -1;
  groups.forEach((g, i) => {
    if (g.events.some((e) => e.t === "turnAdvance" && e.orIndex !== undefined)) start = i;
  });
  return groups.slice(start + 1);
}

export interface TurnActivity<G> {
  /** A run (or "no run") is recorded for the company in this OR. */
  readonly runRecorded: boolean;
  /** It is the company's turn and its run is recorded, so the turn can be finished. */
  readonly canFinish: boolean;
  /** This company's groups in the current OR. */
  readonly groups: readonly G[];
}

/** A company's operating turn so far (data-model "Operating turn"), derived from the log. */
export function turnActivity<G extends { readonly action: Action; readonly events: readonly PrimitiveEvent[] }>(
  groups: readonly G[],
  state: SessionState,
  company: CompanyId,
): TurnActivity<G> {
  const runRecorded = state.turn.operatedThisOR.includes(company);
  return {
    runRecorded,
    canFinish: state.turn.round === "OR" && state.turn.currentCompany === company && runRecorded,
    groups: currentORGroups(groups).filter((g) => "company" in g.action && g.action.company === company),
  };
}

/** The next companies to operate after the current one, by the game's order (FR-010). */
export function upcomingCompanies(game: GameDefinition, state: SessionState, n = 2): CompanyId[] {
  return operatingOrder(game, state)
    .filter((id) => id !== state.turn.currentCompany && !state.turn.operatedThisOR.includes(id))
    .slice(0, n);
}

export type CompanyGroup = "inPlay" | "available" | "closed";

/**
 * The Companies tab's sections: companies in play, ones that can still be opened, and closed or
 * bankrupt ones last. Each group keeps the game's definition order.
 */
export function companyGroups(game: GameDefinition, state: SessionState): Record<CompanyGroup, CompanyId[]> {
  const groups: Record<CompanyGroup, CompanyId[]> = { inPlay: [], available: [], closed: [] };
  for (const c of game.companies) {
    const status = state.companies[c.id]?.status;
    if (status === undefined) continue;
    const group: CompanyGroup = status === "unstarted" ? "available" : status === "closed" || status === "bankrupt" ? "closed" : "inPlay";
    groups[group].push(c.id);
  }
  return groups;
}

/**
 * The privates a player can buy right now (FR-014): unsold ones in the bank, or, where the game
 * allows trading and the round permits it, ones already owned. Closed privates never qualify.
 */
export function purchasablePrivates(game: GameDefinition, state: SessionState): PrivateDef[] {
  const resale = privateResaleOpen(game, state);
  return game.privates.filter((p) => {
    const holder = state.assets[`private:${p.id}`] ?? "bank";
    return holder !== "removed" && (holder === "bank" || resale);
  });
}
