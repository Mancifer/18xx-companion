import type { ActionContext } from "../actions/context";
import { ActionSchema, type Action, type ActionOf, type ActionType } from "../actions/schemas";
import type { TurnState } from "../events/state";
import type { CompanyStatus, PrimitiveEvent } from "../events/types";
import { priceAt } from "../mechanics/market";
import { perShareAmount } from "../mechanics/payout";
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

/** "SR 3", "CR 1", "OR 2.1", or "Privadas" for the initial private sale. */
export function roundLabel(turn: Pick<TurnState, "round" | "srNumber" | "orSet" | "orIndex">): string {
  switch (turn.round) {
    case "PRIVATES":
      return "Privadas";
    case "SR":
      return `SR ${turn.srNumber}`;
    case "CR":
      return `CR ${turn.srNumber}`;
    case "OR":
      return `OR ${turn.orSet}.${turn.orIndex}`;
  }
}

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

  // Operating round (US3)
  runAndPayout: (a, ctx) => {
    const company = operating(a.company, ctx);
    const money = (n: number) => formatMoney(n, ctx.game);
    const choice = ctx.game.revenueParts.find((r) => r.to === "choice");
    if (choice && a.parts.length === 1) {
      const amount = a.parts[0]?.amount ?? 0;
      const id = a.company ?? ctx.state?.turn.currentCompany;
      const shares = ctx.game.companies.find((c) => c.id === id)?.shareCount ?? 10;
      if (a.mode === "withhold") return `${company} retiene ${money(amount)}`;
      if (a.mode === "half") return `${company} paga la mitad de ${money(amount)}`;
      return `${company} paga ${money(amount)} (${money(perShareAmount(ctx.game, amount, shares))}/acción)`;
    }
    const parts = a.parts
      .map((p) => `${(ctx.game.revenueParts.find((r) => r.id === p.part)?.label ?? p.part).toLocaleLowerCase("es")} ${money(p.amount)}`)
      .join(", ");
    return `${company}: ${parts}`;
  },
  buyTrain: (a, ctx) => {
    const company = operating(a.company, ctx);
    const train = a.variant ?? a.trainType;
    const from = a.from === "bank" ? "al banco" : a.from === "pool" ? "del pool" : `a ${companyName(a.seller ?? "", ctx)}`;
    const price = a.price !== null ? ` por ${formatMoney(a.price, ctx.game)}` : "";
    const tradeIn = a.tradeIn !== null ? ` entregando un ${a.tradeIn}` : "";
    return `${company} compra un ${train} ${from}${price}${tradeIn}`;
  },
  payCost: (a, ctx) =>
    `${operating(a.company, ctx)} paga ${formatMoney(a.amount, ctx.game)}${a.reason ? ` (${a.reason})` : ""}`,
  bankPays: (a, ctx) => `El banco paga ${formatMoney(a.amount, ctx.game)} a ${operating(a.company, ctx)} (${a.reason})`,
  privateIncome: () => "Ingresos de las privadas",
  buyPrivateByCompany: (a, ctx) =>
    `${operating(a.company, ctx)} compra la privada ${privateName(a.private, ctx)} por ${formatMoney(a.price, ctx.game)}`,
  discardTrain: (a, ctx) =>
    `${companyName(a.company, ctx)} descarta un ${a.train.includes(":") ? (a.train.split(":")[1] ?? a.train) : a.train}`,
  changeTrainSupply: (a) => (a.op === "add" ? `Se añade un ${a.trainType} a la oferta` : `Se quita un ${a.trainType} de la oferta`),
  startOR: () => "Empieza la ronda de operaciones",
  nationalPayout: (a, ctx) => `Pago del banco nacional (+${formatMoney(a.extra, ctx.game)} de ciudades)`,
  takeLoan: (a, ctx) =>
    `${operating(a.company, ctx)} pide ${a.count} ${a.count === 1 ? "préstamo" : "préstamos"}: +${formatMoney(a.count * (ctx.game.loans?.amount ?? 0), ctx.game)}`,
  enterReceivership: (a, ctx) =>
    ctx.game.customRules.some((r) => r.id === "nationalTakeover")
      ? `${companyName(a.company, ctx)} pasa a administración del banco nacional`
      : `${companyName(a.company, ctx)} pasa a administración`,
  declareBankruptcy: (a, ctx) =>
    a.player !== null ? `${name(`player:${a.player}`, ctx)} se declara en quiebra` : `${companyName(a.company ?? "", ctx)} quiebra`,
  closeCompany: (a, ctx) => `Se cierra ${companyName(a.company, ctx)}`,
  // Stock round (US4)
  parCompany: (a, ctx) => `${name(`player:${a.player}`, ctx)} abre la ${companyName(a.company, ctx)} a ${formatMoney(a.price, ctx.game)}`,
  buyShare: (a, ctx) =>
    `${capitalize(name(a.buyer, ctx))} compra ${a.count ?? 1} ${companyName(a.company, ctx)} ${SOURCE_ES[a.source]}`,
  sellShares: (a, ctx) => `${capitalize(name(a.seller, ctx))} vende ${a.count} ${companyName(a.company, ctx)}`,
  swapCertificates: (a, ctx) =>
    `${name(`player:${a.player}`, ctx)} cambia ${a.give.units} ${companyName(a.give.company, ctx)} por ${a.take.units} ${companyName(a.take.company, ctx)} con la tesorería de ${companyName(a.company, ctx)}`,
  buyPrivate: (a, ctx) =>
    `${name(`player:${a.buyer}`, ctx)} compra la privada ${privateName(a.private, ctx)} por ${formatMoney(a.price, ctx.game)}${a.par !== null ? ` (salida a ${formatMoney(a.par, ctx.game)})` : ""}`,
  exchangePrivate: (a, ctx) => {
    const owner = ctx.state?.assets[`private:${a.private}`];
    const company = a.company ?? ctx.game.privates.find((p) => p.id === a.private)?.exchange?.company ?? "";
    return `${owner ? `${capitalize(name(owner, ctx))} canjea` : "Canje de"} la privada ${privateName(a.private, ctx)} por 1 ${companyName(company, ctx)}`;
  },
  stockBatch: (a, ctx) => `Lote: ${a.items.map((item) => summaryEs(item, ctx)).join("; ")}`,
  startSR: () => "Empieza la ronda de acciones",
  endSR: () => "Fin de la ronda de acciones",
  confirmFloatCondition: (a, ctx) => `Condición de flotación confirmada para ${companyName(a.company, ctx)}`,
  issueShares: (a, ctx) => `${companyName(a.company, ctx)} emite ${a.count}`,
  startCR: () => "Empieza la ronda corporativa",
  endCR: () => "Fin de la ronda corporativa",

  // Turns and market (US7)
  nextCompany: () => "Siguiente compañía",
  setPhase: (a) => `Fase fijada a mano: ${a.phase}`,
  setTurn: (a, ctx) => {
    const parts = [
      a.round !== null ? a.round : null,
      a.srNumber !== null ? `SR ${a.srNumber}` : null,
      a.orSet !== null || a.orIndex !== null ? `OR ${a.orSet ?? "?"}.${a.orIndex ?? "?"}` : null,
      a.orsInSet !== null ? `${a.orsInSet} OR por set` : null,
      a.company !== null ? `opera ${companyName(a.company, ctx)}` : null,
    ].filter((x) => x !== null);
    return `Turno fijado a mano: ${parts.join(", ")}`;
  },
  setMarket: (a, ctx) => {
    const price = priceAt(ctx.game, a.company, a.cell);
    return `${companyName(a.company, ctx)} movida a mano${price !== undefined ? ` a ${formatMoney(price, ctx.game)}` : ""}`;
  },

  compound: (a, ctx) =>
    a.actions
      .map((raw) => {
        const parsed = ActionSchema.safeParse(raw);
        return parsed.success ? summaryEs(parsed.data, ctx) : "?";
      })
      .join("; "),

  adjustCounter: (a, ctx) =>
    `${capitalize(COUNTER_LABELS[a.key] ?? a.key)} de ${name(a.subject, ctx)}: ${a.delta > 0 ? "+" : ""}${a.key === "debt" ? formatMoney(a.delta, ctx.game) : a.delta}`,
};

const SOURCE_ES: Readonly<Record<"ipo" | "pool" | "treasury", string>> = {
  ipo: "de la IPO",
  pool: "del pool",
  treasury: "de la tesorería",
};

export const COUNTER_LABELS: Readonly<Record<string, string>> = {
  debt: "deuda",
  eastWestTokens: "fichas Este-Oeste",
  runs: "operaciones",
  bankrupt: "quiebra",
  nationalTakeovers: "administraciones",
};

/** The named company, or the operating one when null. */
function operating(id: string | null, ctx: SummaryContext): string {
  const resolved = id ?? ctx.state?.turn.currentCompany;
  return resolved ? companyName(resolved, ctx) : "La compañía que opera";
}

function privateName(id: string, ctx: SummaryContext): string {
  return ctx.game.privates.find((p) => p.id === id)?.name ?? id;
}

/**
 * What a group did beyond the action itself, read from its events: price moves, phase changes,
 * trains and privates leaving the game, status changes and debt. For multi-step groups
 * (takeovers, bankruptcies, forced purchases) this is what the table needs to see.
 */
export function effectsEs(events: readonly PrimitiveEvent[], ctx: SummaryContext): string[] {
  const effects: string[] = [];
  const moves = new Map<string, string>();
  const removedTrains = new Map<string, number>();
  let closedPrivates = 0;
  for (const e of events) {
    switch (e.t) {
      case "marketMove": {
        if (e.reason === "par" || e.reason === "manual") break;
        const price = priceAt(ctx.game, e.company, e.to);
        if (price === undefined) break;
        const tags = "index" in e.to ? [] : (ctx.game.market.cells[e.to.row]?.[e.to.col]?.tags ?? []);
        const where = tags.includes("receivership")
          ? "zona de administración"
          : tags.includes("closed")
            ? "casilla cerrada"
            : formatMoney(price, ctx.game);
        moves.set(e.company, `${companyName(e.company, ctx)} → ${where}`);
        break;
      }
      case "turnAdvance":
        if (e.phase !== undefined && e.round === undefined) effects.push(`fase ${e.phase}`);
        if (e.round === "OR" && e.orSet !== undefined && e.orIndex !== undefined) effects.push(`OR ${e.orSet}.${e.orIndex}`);
        if (e.company) effects.push(`turno de ${companyName(e.company, ctx)}`);
        break;
      case "shareTransfer":
        if (e.presidency && (e.from.startsWith("player:") || e.from === "pool")) {
          effects.push(`Presidencia de la ${companyName(e.company, ctx)}: ${name(e.from, ctx)} → ${name(e.to, ctx)}`);
        }
        break;
      case "assetTransfer":
        if (e.to !== "removed") break;
        if (e.asset.startsWith("train:")) {
          const type = e.asset.split(":")[1] ?? "";
          removedTrains.set(type, (removedTrains.get(type) ?? 0) + 1);
        } else if (e.asset.startsWith("private:")) {
          closedPrivates += 1;
        }
        break;
      case "companyStatus":
        if (e.status === "receivership") effects.push(`${companyName(e.company, ctx)} en administración`);
        else if (e.status === "bankrupt") effects.push(`${companyName(e.company, ctx)} en quiebra`);
        else if (e.status === "floated" && e.capitalPending) {
          effects.push(`${companyName(e.company, ctx)} flota (capital al final de la ronda)`);
        } else if (e.status === "floated" && e.capitalPending === undefined) {
          effects.push(`${companyName(e.company, ctx)} flota`);
        }
        break;
      case "counterChange":
        if (e.key === "debt") {
          const sign = e.delta > 0 ? "+" : "−";
          effects.push(`deuda de ${name(e.subject, ctx)} ${sign}${formatMoney(Math.abs(e.delta), ctx.game)}`);
        }
        break;
      default:
        break;
    }
  }
  for (const [type, n] of removedTrains) effects.push(`fuera del juego: ${n} × ${type}`);
  if (closedPrivates > 0) effects.push(closedPrivates === 1 ? "cierra una privada" : `cierran ${closedPrivates} privadas`);
  return [...moves.values(), ...effects];
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

/** "PRR no corrió" when a nextCompany group recorded a zero run (it carries a run's market move). */
function noRunSummary(events: readonly PrimitiveEvent[], ctx: SummaryContext): string | undefined {
  const run = events.find((e) => e.t === "counterChange" && e.key === "runs");
  if (run?.t !== "counterChange") return undefined;
  const company = parseHolder(run.subject);
  if (company.kind !== "company") return undefined;
  const moved = events.some((e) => e.t === "marketMove" && e.company === company.id);
  return moved ? `${companyName(company.id, ctx)} no corrió` : undefined;
}

/** Summary of an undo, for the toast and History. */
export function undoSummaryEs(undone: Action, ctx: SummaryContext): string {
  return `Deshecho: ${summaryEs(undone, ctx)}`;
}

/**
 * One line describing an action, e.g. "Ana paga $100 al banco". With the group's events, the
 * effects follow: "PRR paga $240 ($24/acción) · PRR → $112".
 */
export function summaryEs(action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]): string {
  const fn = summaries[action.type] as Summarizer<ActionType> | undefined;
  const base = (events && action.type === "nextCompany" && noRunSummary(events, ctx)) || (fn ? fn(action, ctx) : action.type);
  const effects = events ? effectsEs(events, ctx) : [];
  return effects.length > 0 ? `${base} · ${effects.join(" · ")}` : base;
}
