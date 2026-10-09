import type { ActionContext } from "./actions/context";
import { assetsHeldBy, cashOf, holdersOf, presidentOf, unitsOf } from "./events/state";
import { holderName, roundLabel } from "./i18n/es";
import { formatMoney } from "./i18n/format";
import { priceOf } from "./mechanics/market";
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
