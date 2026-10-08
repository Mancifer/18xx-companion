import type { ActionContext } from "../actions/context";
import type { Action, ActionOf, ActionType } from "../actions/schemas";
import type { CompanyStatus } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { parseHolder, type HolderRef, type Player } from "../types";
import { formatMoney } from "./format";

export { formatMoney } from "./format";

/** Spanish text for cards, toasts and History. Shared by touch and voice. */

export function holderName(holder: HolderRef, game: GameDefinition, players: readonly Player[]): string {
  const h = parseHolder(holder);
  switch (h.kind) {
    case "bank":
      return "el banco";
    case "pool":
      return "el pool";
    case "removed":
      return "fuera del juego";
    case "player":
      return players.find((p) => p.id === h.id)?.name ?? h.id;
    case "company":
      return game.companies.find((c) => c.id === h.id)?.shortName ?? h.id;
    case "ipo":
      return `la IPO de ${game.companies.find((c) => c.id === h.id)?.shortName ?? h.id}`;
  }
}

export const statusLabel: Readonly<Record<CompanyStatus, string>> = {
  unstarted: "sin abrir",
  parred: "abierta",
  floated: "flotada",
  receivership: "administrada",
  bankrupt: "en quiebra",
  closed: "cerrada",
};

export type SummaryContext = Pick<ActionContext, "game" | "players"> & Partial<Pick<ActionContext, "state">>;

type Summarizer<T extends ActionType> = (a: ActionOf<T>, ctx: SummaryContext) => string;
type SummaryMap = { [K in ActionType]?: Summarizer<K> };

const name = (h: string, ctx: SummaryContext) => holderName(h as HolderRef, ctx.game, ctx.players);
const companyName = (id: string, ctx: SummaryContext) => ctx.game.companies.find((c) => c.id === id)?.shortName ?? id;

const summaries: SummaryMap = {
  createSession: (a, ctx) =>
    `Nueva partida de ${ctx.game.name} con ${a.players.map((p) => p.name).join(", ")}`,
  transferMoney: (a, ctx) =>
    a.to === "bank"
      ? `${capitalize(name(a.from, ctx))} paga ${formatMoney(a.amount, ctx.game)} al banco`
      : a.from === "bank"
        ? `El banco paga ${formatMoney(a.amount, ctx.game)} a ${name(a.to, ctx)}`
        : `${capitalize(name(a.from, ctx))} paga ${formatMoney(a.amount, ctx.game)} a ${name(a.to, ctx)}`,
  adjustMoney: (a, ctx) =>
    a.setTo !== null
      ? `Dinero de ${name(a.holder, ctx)} fijado en ${formatMoney(a.setTo, ctx.game)}`
      : `Ajuste de ${formatMoney(a.delta ?? 0, ctx.game)} a ${name(a.holder, ctx)}`,
  transferShares: (a, ctx) =>
    `${a.units} ${a.units === 1 ? "acción" : "acciones"} de ${companyName(a.company, ctx)}${a.presidency ? " (presidencia)" : ""}: ${name(a.from, ctx)} → ${name(a.to, ctx)}`,
  note: (a) => `Nota: ${a.text}`,
};

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

/** Summary of an undo, for the toast and History. */
export function undoSummaryEs(undone: Action, ctx: SummaryContext): string {
  return `Deshecho: ${summaryEs(undone, ctx)}`;
}

/** One line describing an action, e.g. "Ana paga $100 al banco". */
export function summaryEs(action: Action, ctx: SummaryContext): string {
  const fn = summaries[action.type] as Summarizer<ActionType> | undefined;
  return fn ? fn(action, ctx) : action.type;
}
