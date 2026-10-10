import type { ActionContext } from "./actions/context";
import type { Action } from "./actions/schemas";
import type { SessionState } from "./events/state";
import type { PrimitiveEvent } from "./events/types";
import { assetsHeldBy, cashOf, holdersOf, presidentOf, unitsOf } from "./events/state";
import { holderName, roundLabel } from "./i18n/es";
import { formatMoney } from "./i18n/format";
import { privateResaleOpen } from "./actions/expand/stock";
import type { GameDefinition, PrivateDef } from "./games/schema";
import { priceOf } from "./mechanics/market";
import { operatingOrder } from "./mechanics/operatingOrder";
import { trainsHeldBy } from "./mechanics/phases";
import { trainTypeOf, type CompanyId, type HolderRef, type PlayerId } from "./types";

export type QueryKind = "cash" | "shares" | "price" | "treasury" | "trains" | "bank" | "president" | "turn";
export const QUERY_KINDS: readonly QueryKind[] = ["cash", "shares", "price", "treasury", "trains", "bank", "president", "turn"];

export interface Query {
  readonly kind: QueryKind;
  readonly player: PlayerId | null;
  readonly company: CompanyId | null;
}

export interface QueryAnswer {
  readonly kind: QueryKind;
  readonly textEs: string;
}

/**
 * State questions for voice (FR-073, US5-4): answered from the app's state, never from the
 * model's text.
 */
export function answerQuery(ctx: Pick<ActionContext, "game" | "players" | "state">, q: Query): QueryAnswer {
  const { game, players, state } = ctx;
  const money = (n: number) => formatMoney(n, game);
  const playerName = (id: PlayerId) => players.find((p) => p.id === id)?.name ?? id;
  const short = (id: CompanyId) => game.companies.find((c) => c.id === id)?.shortName ?? id;
  const shareCount = (id: CompanyId) => state.companies[id]?.shareCount ?? 10;
  const percent = (units: number, id: CompanyId) => `${(units * 100) / shareCount(id)}%`;
  const answer = (textEs: string): QueryAnswer => ({ kind: q.kind, textEs });
  const askCompany = answer("¿De qué compañía?");

  switch (q.kind) {
    case "cash":
      if (q.player) return answer(`${playerName(q.player)} tiene ${money(cashOf(state, `player:${q.player}`))}`);
      if (q.company) return answer(`${short(q.company)} tiene ${money(cashOf(state, `company:${q.company}`))} en caja`);
      return answer("¿De quién?");
    case "treasury":
      if (!q.company) return askCompany;
      return answer(`${short(q.company)} tiene ${money(cashOf(state, `company:${q.company}`))} en caja`);
    case "shares": {
      if (q.player && q.company) {
        const units = unitsOf(state, `player:${q.player}`, q.company);
        return answer(`${playerName(q.player)} tiene ${units} ${units === 1 ? "acción" : "acciones"} de ${short(q.company)} (${percent(units, q.company)})`);
      }
      if (q.player) {
        const ref: HolderRef = `player:${q.player}`;
        const held = game.companies.filter((c) => unitsOf(state, ref, c.id) > 0);
        if (held.length === 0) return answer(`${playerName(q.player)} no tiene acciones`);
        return answer(`${playerName(q.player)} tiene: ${held.map((c) => `${c.shortName} ${percent(unitsOf(state, ref, c.id), c.id)}`).join(", ")}`);
      }
      if (q.company) {
        const company = q.company;
        const parts = holdersOf(state, company)
          .filter(([, units]) => units > 0)
          // Most first; at equal holdings, players before the IPO and the pool.
          .sort((a, b) => b[1] - a[1] || Number(!a[0].startsWith("player:")) - Number(!b[0].startsWith("player:")))
          .map(([h, units]) => {
            const name = h.startsWith("ipo:") ? "IPO" : h === "pool" ? "pool" : holderName(h, game, players);
            return `${name} ${percent(units, company)}`;
          });
        return answer(`${short(company)}: ${parts.join(", ")}`);
      }
      return answer("¿De quién o de qué compañía?");
    }
    case "price": {
      if (!q.company) return askCompany;
      const price = priceOf(game, state, q.company);
      return answer(price === undefined ? `${short(q.company)} no tiene precio todavía` : `${short(q.company)} está a ${money(price)}`);
    }
    case "trains": {
      if (q.company) {
        const trains = assetsHeldBy(state, `company:${q.company}`, "train").map(trainTypeOf);
        return answer(trains.length === 0 ? `${short(q.company)} no tiene trenes` : `${short(q.company)} tiene trenes: ${trains.join(", ")}`);
      }
      const onSale = game.trains
        .map((t) => {
          const left = t.count === "unlimited" ? "∞" : String(trainsHeldBy(state, "bank", t.type).length);
          return { t, left };
        })
        .filter(({ left }) => left !== "0")
        .map(({ t, left }) => `${t.type} (${left} a ${money(t.variants[0]?.cost ?? 0)})`);
      return answer(`En el banco: ${onSale.join(", ")}`);
    }
    case "bank":
      return answer(game.bank === "unlimited" ? "El banco es ilimitado" : `El banco tiene ${money(cashOf(state, "bank"))}`);
    case "president": {
      if (!q.company) return askCompany;
      const president = presidentOf(state, q.company);
      return answer(president ? `Preside ${short(q.company)}: ${playerName(president)}` : `${short(q.company)} no tiene presidente`);
    }
    case "turn": {
      const current = state.turn.currentCompany;
      return answer(`${roundLabel(state.turn)} · fase ${state.turn.phase}${current ? ` · opera ${short(current)}` : ""}`);
    }
  }
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
