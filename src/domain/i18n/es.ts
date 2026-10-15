import type { ActionContext } from "../actions/context";
import { ActionSchema, type Action, type ActionOf, type ActionType } from "../actions/schemas";
import { counterOf, type SessionState, type TurnState } from "../events/state";
import type { CompanyStatus, EventOf, PrimitiveEvent, Round } from "../events/types";
import type { BalanceChange, Movement } from "../ledger/breakdown";
import { launchPrice, priceAt, priceOf } from "../mechanics/market";
import { countedTrains, RUSTED, trainLimitFor, trainNumber, trainsHeldBy } from "../mechanics/phases";
import { mergePreview } from "../mechanics/custom/mergers";
import { cycleCount } from "../mechanics/endTriggers";
import type { ExportPreview } from "../mechanics/schedule";
import { displayName, effectiveTraits } from "../mechanics/traits";
import { perShareAmount } from "../mechanics/payout";
import type { EndTriggerType, GameDefinition } from "../games/schema";
import { parseHolder, trainTypeOf, type CompanyId, type HolderRef, type Player } from "../types";
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
    case "MR":
      return `MR ${turn.srNumber}`;
  }
}

/** Short Spanish round names for games played in cycles: acciones, operaciones, fusiones. */
export const ROUND_SHORT_ES: Readonly<Record<"SR" | "OR" | "MR", string>> = { SR: "RA", OR: "RO", MR: "RF" };

export { cycleCount };

/** "Ciclo 2 de 6 · RO 1/2", "Ciclo 3 de 6 · RF"; undefined for games not played in cycles. */
export function cycleRoundLabel(
  game: GameDefinition,
  turn: Pick<TurnState, "round" | "srNumber" | "orIndex" | "orsInSet">,
): string | undefined {
  const cycles = cycleCount(game);
  if (cycles === undefined || turn.round === "PRIVATES" || turn.round === "CR") return undefined;
  const round = turn.round === "OR" ? `RO ${turn.orIndex}/${turn.orsInSet}` : ROUND_SHORT_ES[turn.round];
  return `Ciclo ${Math.max(1, turn.srNumber)} de ${cycles} · ${round}`;
}

/** History's round icons (feature 011, FR-020): text always goes with them. */
export const ROUND_ICON: Readonly<Record<Round | "SETUP", string>> = {
  PRIVATES: "📜",
  SR: "💼",
  OR: "🚂",
  MR: "🔀",
  CR: "🏛",
  SETUP: "⚙",
};

/**
 * A round's full title for History's sections: "Ronda de operaciones 2.1", "Ronda de acciones 3";
 * in games played in cycles, "Ciclo 2 · Ronda de operaciones 1/2" (matching `cycleRoundLabel`).
 */
export function roundTitleEs(game: GameDefinition, turn: Pick<TurnState, "round" | "srNumber" | "orSet" | "orIndex" | "orsInSet">): string {
  const cycle = cycleCount(game) !== undefined && turn.round !== "PRIVATES" && turn.round !== "CR" ? `Ciclo ${Math.max(1, turn.srNumber)} · ` : undefined;
  switch (turn.round) {
    case "PRIVATES":
      return "Privadas";
    case "SR":
      return cycle ? `${cycle}Ronda de acciones` : `Ronda de acciones ${turn.srNumber}`;
    case "OR":
      return cycle ? `${cycle}Ronda de operaciones ${turn.orIndex}/${turn.orsInSet}` : `Ronda de operaciones ${turn.orSet}.${turn.orIndex}`;
    case "MR":
      return cycle ? `${cycle}Ronda de fusiones` : `Ronda de fusiones ${turn.srNumber}`;
    case "CR":
      return `Ronda corporativa ${turn.srNumber}`;
  }
}

/** The phase's display name: its color ("Verde") when the definition gives one, else its id. */
export function phaseName(game: GameDefinition, id: string): string {
  return game.phases.find((p) => p.id === id)?.color ?? id;
}

/**
 * A company's trains for the operating sheet (feature 011, contracts/ui.md §2): "Trenes 2/4 · 2, 3",
 * "(oxidado)" on a rusted train kept for a last run, "Sin trenes", "· sobre el límite". The count is
 * what the limit counts (the over-limit banner's helpers), so the two never disagree. `warn` pairs a
 * warning style with text that already says the state.
 */
export function trainsLineEs(game: GameDefinition, state: SessionState, company: CompanyId): { text: string; warn: boolean } {
  const ref = `company:${company}` as const;
  const order = (asset: string) => game.trains.findIndex((t) => t.type === trainTypeOf(asset));
  const held = trainsHeldBy(state, ref).sort((a, b) => order(a) - order(b) || trainNumber(a) - trainNumber(b));
  if (held.length === 0) return { text: "Sin trenes", warn: true };
  const types = held.map((asset) => {
    const type = trainTypeOf(asset);
    const label = game.trains.find((t) => t.type === type)?.displayName ?? type;
    return counterOf(state, ref, `${RUSTED}${asset}`) > 0 ? `${label} (oxidado)` : label;
  });
  const count = countedTrains(game, state, company).length;
  const limit = trainLimitFor(game, state, company);
  const over = count > limit;
  const head = Number.isFinite(limit) ? `Trenes ${count}/${limit}` : `Trenes ${count}`;
  return { text: `${head} · ${types.join(", ")}${over ? " · sobre el límite" : ""}`, warn: over };
}

export type SummaryContext = Pick<ActionContext, "game" | "players"> & Partial<Pick<ActionContext, "state">>;

/** With the group's events (History, toasts), a summarizer may read what actually happened. */
type Summarizer<T extends ActionType> = (a: ActionOf<T>, ctx: SummaryContext, events?: readonly PrimitiveEvent[]) => string;
type SummaryMap = { [K in ActionType]?: Summarizer<K> };

const name = (h: string, ctx: SummaryContext) => holderName(h as HolderRef, ctx.game, ctx.players);
const companyName = (id: string, ctx: SummaryContext) => ctx.game.companies.find((c) => c.id === id)?.shortName ?? id;
/** The full name; a major merged into its second identity goes by that name (FR-005a). */
const fullName = (id: string, ctx: SummaryContext) =>
  ctx.state ? displayName(ctx.game, ctx.state, id) : (ctx.game.companies.find((c) => c.id === id)?.name ?? id);

const summaries: SummaryMap = {
  createSession: (a, ctx) =>
    `Nueva partida de ${ctx.game.name} con ${a.players.map((p) => p.name).join(", ")}`,
  transferMoney: (a, ctx) =>
    a.to === "bank"
      ? `${capitalize(name(a.from, ctx))} paga ${formatMoney(a.amount, ctx.game)} al banco`
      : a.from === "bank"
        ? `El banco paga ${formatMoney(a.amount, ctx.game)} a ${name(a.to, ctx)}`
        : `${capitalize(name(a.from, ctx))} paga ${formatMoney(a.amount, ctx.game)} a ${name(a.to, ctx)}`,
  adjustMoney: (a, ctx, events) => {
    if (a.setTo === null) return `Ajuste de ${formatMoney(a.delta ?? 0, ctx.game)} a ${name(a.holder, ctx)}`;
    // The difference comes from the group's own event (feature 010, R6).
    const moved = events?.find((e): e is EventOf<"moneyTransfer"> => e.t === "moneyTransfer");
    const diff = moved ? ` (${signedMoney(moved.to === a.holder ? moved.amount : -moved.amount, ctx)})` : "";
    return `${capitalize(name(a.holder, ctx))}: dinero fijado en ${formatMoney(a.setTo, ctx.game)}${diff}`;
  },
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
  buyTrain: (a, ctx, events) => {
    const company = operating(a.company, ctx);
    const train = a.variant ?? a.trainType;
    const from = a.from === "bank" ? "al banco" : a.from === "pool" ? "del pool" : `a ${companyName(a.seller ?? "", ctx)}`;
    const price = a.price !== null ? ` por ${formatMoney(a.price, ctx.game)}` : paidEs(events, ctx);
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
  startOR: (_a, ctx, events) => `Empieza la ronda de operaciones${capitalEs(events, ctx)}`,
  nationalPayout: (a, ctx) => `Pago del banco nacional (+${formatMoney(a.extra, ctx.game)} de ciudades)`,
  takeLoan: (a, ctx) =>
    `${operating(a.company, ctx)} pide ${a.count} ${a.count === 1 ? "préstamo" : "préstamos"}: +${formatMoney(a.count * (ctx.game.loans?.amount ?? 0), ctx.game)}`,
  enterReceivership: (a, ctx) =>
    ctx.game.customRules.some((r) => r.id === "nationalTakeover")
      ? `${companyName(a.company, ctx)} pasa a administración del banco nacional`
      : `${companyName(a.company, ctx)} pasa a administración`,
  declareBankruptcy: (a, ctx, events) => {
    if (a.player === null) return `${companyName(a.company ?? "", ctx)} quiebra`;
    const who = name(`player:${a.player}`, ctx);
    // RotLA (liquidatePresided): the companies the player presided close, other players are paid.
    const closed = (events ?? []).flatMap((e) => (e.t === "companyStatus" && e.status === "closed" ? [fullName(e.company, ctx)] : []));
    if (closed.length === 0) return `${who} se declara en quiebra`;
    const paid = (events ?? []).reduce(
      (sum, e) => sum + (e.t === "moneyTransfer" && e.from === "bank" && e.to.startsWith("player:") && e.to !== `player:${a.player}` ? e.amount : 0),
      0,
    );
    const list = closed.length === 1 ? closed[0] : `${closed.slice(0, -1).join(", ")} y ${closed.at(-1)}`;
    const verb = closed.length === 1 ? "se cierra" : "se cierran";
    return `Quiebra de ${who}: sale de la partida; ${verb} ${list}${paid > 0 ? `; se pagan ${formatMoney(paid, ctx.game)} a otros accionistas` : ""}`;
  },
  closeCompany: (a, ctx) => `Se cierra ${companyName(a.company, ctx)}`,
  // Stock round (US4)
  parCompany: (a, ctx, events) => {
    const paid = singleTransfer(events);
    const base = `${name(`player:${a.player}`, ctx)} abre la ${companyName(a.company, ctx)} a ${formatMoney(a.price, ctx.game)}`;
    return paid ? `${base} y paga ${formatMoney(paid.amount, ctx.game)}` : base;
  },
  buyShare: (a, ctx, events) =>
    `${capitalize(name(a.buyer, ctx))} compra ${a.count ?? 1} ${companyName(a.company, ctx)} ${SOURCE_ES[a.source]}${paidEs(events, ctx)}`,
  sellShares: (a, ctx, events) => `${capitalize(name(a.seller, ctx))} vende ${a.count} ${companyName(a.company, ctx)}${paidEs(events, ctx)}`,
  swapCertificates: (a, ctx) =>
    `${name(`player:${a.player}`, ctx)} cambia ${a.give.units} ${companyName(a.give.company, ctx)} por ${a.take.units} ${companyName(a.take.company, ctx)} con la tesorería de ${companyName(a.company, ctx)}`,
  buyPrivate: (a, ctx) =>
    `${name(`player:${a.buyer}`, ctx)} compra la privada ${privateName(a.private, ctx)} por ${formatMoney(a.price, ctx.game)}${a.par !== null ? ` (salida a ${formatMoney(a.par, ctx.game)})` : ""}`,
  exchangePrivate: (a, ctx) => {
    const owner = ctx.state?.assets[`private:${a.private}`];
    const company = a.company ?? ctx.game.privates.find((p) => p.id === a.private)?.exchange?.company ?? "";
    return `${owner ? `${capitalize(name(owner, ctx))} canjea` : "Canje de"} la privada ${privateName(a.private, ctx)} por 1 ${companyName(company, ctx)}`;
  },
  launchCompany: (a, ctx) => {
    const money = (n: number) => formatMoney(n, ctx.game);
    const def = ctx.game.companies.find((c) => c.id === a.company);
    const price = a.price ?? (ctx.state ? launchPrice(ctx.game, ctx.state, a.bid).price : undefined);
    const shares = def ? def.shareCount - def.presidencyUnits : 0;
    const treasury = a.bid - (def?.traits?.launchFee ?? 0);
    return [
      `${name(`player:${a.player}`, ctx)} abre ${def?.name ?? a.company} por ${money(a.bid)}`,
      ...(price !== undefined ? [`precio ${money(price)}`] : []),
      `tesorería ${money(treasury)}${def?.traits?.launchFee ? ` (${money(def.traits.launchFee)} al banco)` : ""}`,
      `${shares} ${shares === 1 ? "acción" : "acciones"} en tesorería`,
      ...(def?.traits?.launchAssets?.length ? ["con su propio tren"] : []),
    ].join(" · ");
  },
  stockBatch: (a, ctx) => `Lote: ${a.items.map((item) => summaryEs(item, ctx)).join("; ")}`,
  startSR: (_a, ctx, events) => {
    const exported = events ? exportedEs(events, ctx) : undefined;
    return exported ? `Empieza la ronda de acciones · ${exported}` : "Empieza la ronda de acciones";
  },
  endSR: () => "Fin de la ronda de acciones",
  endGame: (a) => `Fin de la partida ${endConditionsEs(a.triggers ?? [])}`,
  reopenGame: () => "Partida reabierta",
  confirmFloatCondition: (a, ctx) => `Condición de flotación confirmada para ${companyName(a.company, ctx)}`,
  issueShares: (a, ctx, events) =>
    ctx.game.market.moves.issue?.from === "treasury"
      ? `${companyName(a.company, ctx)} emite ${shareCountEs(a.count)} de su tesorería al pool${paidEs(events, ctx)}`
      : `${companyName(a.company, ctx)} emite ${a.count}${paidEs(events, ctx)}`,
  redeemShare: (a, ctx) => {
    const id = a.company ?? ctx.state?.turn.currentCompany ?? "";
    const price = ctx.state ? priceOf(ctx.game, ctx.state, id) : undefined;
    const count = a.count ?? 1;
    return `${operating(a.company, ctx)} recompra ${shareCountEs(count)} del pool${price !== undefined ? ` por ${formatMoney(price * count, ctx.game)}` : ""}`;
  },
  forcedTrainPurchase: (a, ctx) => {
    const from = a.from === "bank" ? "al banco" : "del pool";
    const sales = a.sales.map((s) => `${s.count} ${companyName(s.company, ctx)}`);
    const sold = sales.length > 0 ? ` · el presidente vende ${sales.slice(0, -1).join(", ")}${sales.length > 1 ? " y " : ""}${sales.at(-1)}` : "";
    return `Compra forzada: ${operating(a.company, ctx)} compra un ${a.variant ?? a.trainType} ${from}${sold}`;
  },
  namedPayment: (a, ctx) => {
    const id = a.company ?? ctx.state?.turn.currentCompany ?? "";
    const company = ctx.game.companies.find((c) => c.id === id);
    // Without state (toasts), any company's trait of that id: a major's come from its minors.
    const payments = ctx.state
      ? (effectiveTraits(ctx.game, ctx.state, id).payments ?? [])
      : ctx.game.companies.flatMap((c) => c.traits?.payments ?? []);
    const payment = payments.find((p) => p.id === a.payment);
    const label = (payment?.labelEs ?? a.payment).toLocaleLowerCase("es");
    const amount = formatMoney(a.amount ?? payment?.amount ?? 0, ctx.game);
    const lines = payment?.cost
      ? [`${label} −${formatMoney(payment.cost, ctx.game)}`, `bonificación +${amount}`]
      : [`${label} ${payment?.direction === "companyPays" ? "−" : "+"}${amount}`];
    return `${company ? fullName(company.id, ctx) : id}: ${lines.join(" · ")}`;
  },
  mergeCompanies: (a, ctx, events) => {
    const def = ctx.game.companies.find((c) => c.id === a.into);
    const into = a.identity === "alt" ? (def?.altName ?? a.into) : (def?.name ?? a.into);
    const head = `${fullName(a.a, ctx)} + ${fullName(a.b, ctx)} → ${into}`;
    const money = (n: number) => formatMoney(n, ctx.game);
    const player = (id: string | undefined) => ctx.players.find((p) => p.id === id)?.name ?? id ?? "?";
    const treasuryRef = `company:${a.into}`;
    let details: { president: string; price: number; treasury: number; trains: number } | undefined;
    if (events) {
      // What happened: the group's own events.
      const president = events.find((e) => e.t === "shareTransfer" && e.company === a.into && e.presidency);
      const move = events.find((e) => e.t === "marketMove" && e.company === a.into);
      details = {
        president: president?.t === "shareTransfer" ? name(president.to, ctx) : "?",
        price: move?.t === "marketMove" ? (priceAt(ctx.game, a.into, move.to) ?? 0) : 0,
        treasury: events.reduce((sum, e) => sum + (e.t === "moneyTransfer" && e.to === treasuryRef ? e.amount : 0), 0),
        trains: events.filter((e) => e.t === "assetTransfer" && e.to === treasuryRef && e.asset.startsWith("train:")).length,
      };
    } else if (ctx.state) {
      // What will happen: the preview, from the state before the merger.
      const p = mergePreview(ctx.game, ctx.players, ctx.state, a.a, a.b);
      details = { president: player(p.president), price: p.price, treasury: p.treasury, trains: p.trains.length };
    }
    if (!details) return head;
    const trains = `${details.trains} ${details.trains === 1 ? "tren" : "trenes"}`;
    return `${head} · presidente ${details.president} · precio ${money(details.price)} · tesorería ${money(details.treasury)} · ${trains}`;
  },
  startMR: () => "Empieza la ronda de fusiones",
  rockFormation: (a, ctx) => `${operating(a.company, ctx)}: formación rocosa (+2)`,
  cliffSale: (a, ctx) => {
    const type = a.train.includes(":") ? (a.train.split(":")[1] ?? a.train) : a.train;
    const cost = ctx.game.trains.find((t) => t.type === type)?.variants[0]?.cost ?? 0;
    return `${operating(a.company, ctx)} vende el ${type} en el acantilado: +${formatMoney(Math.floor(cost / 2), ctx.game)}`;
  },
  canyonTrain: (a, ctx) => {
    const type = ctx.game.trains.find((t) => t.rustsOnPhase !== undefined && !t.special)?.type ?? "2";
    return `${operating(a.company, ctx)} recibe el tren del cañón (un ${type} que no se oxida)`;
  },
  startCR: () => "Empieza la ronda corporativa",
  endCR: () => "Fin de la ronda corporativa",

  correctTrain: (a, ctx, events) => {
    const moved = events?.find((e) => e.t === "assetTransfer" && e.asset.startsWith("train:"));
    const type = trainTypeOf(moved?.t === "assetTransfer" ? moved.asset : a.train.includes(":") ? a.train : `train:${a.train}:0`);
    const co = companyName(a.company, ctx);
    // With events, the money is what was recorded (the list price when amount was null).
    const paid = events ? (singleTransfer(events)?.amount ?? 0) : (a.amount ?? 0);
    const money = paid > 0 ? formatMoney(paid, ctx.game) : undefined;
    if (a.op === "add") return `Corrección: la ${co} recibe un ${type} de la oferta${money ? ` y paga ${money}` : ""}`;
    if (a.to === "pool") return `Corrección: el ${type} de la ${co} va al pool${money ? ` y recibe ${money}` : ""}`;
    if (a.to === "removed") return `Corrección: el ${type} de la ${co} queda fuera de juego${money ? ` y recibe ${money}` : ""}`;
    const refund = events ? money : a.amount === null ? "el precio de lista" : money;
    return `Corrección: la ${co} devuelve un ${type} a la oferta${refund ? ` y recibe ${refund}` : ""}`;
  },

  // Turns and market (US7)
  nextCompany: (_a, ctx, events) => roundEndEs(events, ctx) ?? "Siguiente compañía",
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

/** End conditions as the History and the end confirmation name them (feature 007). */
export const END_TRIGGER_LABELS: Readonly<Record<EndTriggerType, string>> = {
  bankBroken: "banca quebrada",
  topCell: "casilla final del mercado",
  loansIssued: "préstamos emitidos",
  takeovers: "compañías en administración",
  lastRound: "última ronda",
  bankruptcy: "quiebra",
  cyclesComplete: "ciclos completos",
  scheduleComplete: "última ronda de operaciones",
};

export const GAME_END_ES = {
  noEndCondition: "Todavía no se cumplió ninguna condición de fin de partida.",
  alreadyEnded: "La partida ya estaba terminada: el final pasa a esta entrada.",
  notEnded: "La partida no está terminada",
} as const;

/** "(banca quebrada, quiebra)" or "(sin condición de fin)". */
export function endConditionsEs(triggers: readonly EndTriggerType[]): string {
  return triggers.length > 0 ? `(${triggers.map((t) => END_TRIGGER_LABELS[t]).join(", ")})` : "(sin condición de fin)";
}

export const COUNTER_LABELS: Readonly<Record<string, string>> = {
  debt: "deuda",
  eastWestTokens: "fichas Este-Oeste",
  runs: "operaciones",
  bankrupt: "quiebra",
  nationalTakeovers: "administraciones",
};

/** The group's only money transfer, if it has exactly one (FR-014). */
function singleTransfer(events: readonly PrimitiveEvent[] | undefined): EventOf<"moneyTransfer"> | undefined {
  const transfers = (events ?? []).filter((e): e is EventOf<"moneyTransfer"> => e.t === "moneyTransfer");
  return transfers.length === 1 ? transfers[0] : undefined;
}

/** " por $X" from the group's only transfer: the price actually paid (feature 010, R6). */
function paidEs(events: readonly PrimitiveEvent[] | undefined, ctx: SummaryContext): string {
  const paid = singleTransfer(events);
  return paid ? ` por ${formatMoney(paid.amount, ctx.game)}` : "";
}

/** " · capital de PRR: $X" for each company paid its capital at the end of the round. */
function capitalEs(events: readonly PrimitiveEvent[] | undefined, ctx: SummaryContext): string {
  return (events ?? [])
    .filter((e): e is EventOf<"moneyTransfer"> => e.t === "moneyTransfer" && e.from === "bank" && e.to.startsWith("company:"))
    .map((e) => ` · capital de ${name(e.to, ctx)}: ${formatMoney(e.amount, ctx.game)}`)
    .join("");
}

/** "+$40" / "−$80". */
function signedMoney(delta: number, ctx: SummaryContext): string {
  return delta < 0 ? formatMoney(delta, ctx.game) : `+${formatMoney(delta, ctx.game)}`;
}

/** The named company, or the operating one when null. */
function operating(id: string | null, ctx: SummaryContext): string {
  const resolved = id ?? ctx.state?.turn.currentCompany;
  return resolved ? companyName(resolved, ctx) : "La compañía que opera";
}

const shareCountEs = (n: number) => `${n} ${n === 1 ? "acción" : "acciones"}`;

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
        if (e.reason === "restack") {
          moves.set(e.company, `${companyName(e.company, ctx)} pasa al fondo de la pila`);
          break;
        }
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
        if (e.roundEnd === "SR") effects.push("fin de la ronda de acciones");
        if (e.roundEnd === "CR") effects.push("fin de la ronda corporativa");
        if (e.phase !== undefined && e.round === undefined) effects.push(`fase ${phaseName(ctx.game, e.phase)}`);
        if (e.round === "OR" && e.orSet !== undefined && e.orIndex !== undefined) effects.push(`OR ${e.orSet}.${e.orIndex}`);
        if (e.company) effects.push(`turno de ${companyName(e.company, ctx)}`);
        break;
      case "shareTransfer":
        // A certificate leaving the game (dissolution, merger, bankruptcy) is not a change of president.
        if (e.presidency && e.to !== "removed" && (e.from.startsWith("player:") || e.from === "pool")) {
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
        else if (e.status === "closed" && events.some((m) => m.t === "marketMove" && m.company === e.company && !("index" in m.to) && (ctx.game.market.cells[m.to.row]?.[m.to.col]?.tags ?? []).includes("closed"))) {
          effects.push(`${companyName(e.company, ctx)} se disuelve`);
        }
        else if (e.status === "bankrupt") effects.push(`${companyName(e.company, ctx)} en quiebra`);
        else if (e.status === "floated" && e.capitalPending) {
          effects.push(`${companyName(e.company, ctx)} flota (capital al final de la ronda)`);
        } else if (e.status === "floated" && e.capitalPending === undefined) {
          effects.push(`${companyName(e.company, ctx)} flota`);
        }
        break;
      case "counterChange":
        if (e.key.startsWith(RUSTED) && e.delta > 0) {
          effects.push(`${name(e.subject, ctx)}: el ${e.key.split(":")[2] ?? ""} queda oxidado, última carrera`);
        }
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

/** The OR that a nextCompany group started, if it started one (feature 011, data-model §3). */
function startedOR(events: readonly PrimitiveEvent[] | undefined): EventOf<"turnAdvance"> | undefined {
  const e = events?.find((x) => x.t === "turnAdvance" && x.round === "OR" && x.orSet !== undefined && x.orIndex !== undefined);
  return e?.t === "turnAdvance" ? e : undefined;
}

/**
 * The title of a nextCompany group that ends an OR: "Fin de la OR 2.1 · empieza la OR 2.2", or
 * "Fin de las rondas de operaciones" when the set is complete. The round after a set is not named:
 * it is an SR or, in RotLA from green on, an MR (FR-022).
 */
function roundEndEs(events: readonly PrimitiveEvent[] | undefined, ctx: SummaryContext): string | undefined {
  const or = startedOR(events);
  if (or) {
    const [set, index] = [or.orSet ?? 0, or.orIndex ?? 0];
    if (cycleCount(ctx.game) !== undefined) {
      const of = or.orsInSet ?? index;
      return `Fin de RO ${index - 1}/${of} · empieza RO ${index}/${of}`;
    }
    return `Fin de la OR ${set}.${index - 1} · empieza la OR ${set}.${index}`;
  }
  const done = events?.some((e) => e.t === "turnAdvance" && e.company === null && e.round === undefined);
  return done ? "Fin de las rondas de operaciones" : undefined;
}

type Summarized = { readonly action: Action; readonly events: readonly PrimitiveEvent[] };

/**
 * The toast after an undo (feature 010), `groups` newest first: "Deshecho: <summary>", or for a
 * range "Deshechas N entradas: desde <oldest> hasta <newest>".
 */
export function undoneEs(groups: readonly Summarized[], ctx: SummaryContext): string {
  const newest = groups[0];
  const oldest = groups[groups.length - 1];
  if (!newest || !oldest) return "";
  const line = (g: Summarized) => summaryEs(g.action, ctx, g.events);
  return groups.length === 1 ? `Deshecho: ${line(newest)}` : `Deshechas ${groups.length} entradas: desde ${line(oldest)} hasta ${line(newest)}`;
}

/** The range confirmation (feature 010, contracts/history-ui.md). Uruguayan voseo (FR-020). */
export const UNDO_RANGE_ES = {
  title: (count: number) => `¿Deshacer ${count} entradas?`,
  from: (summary: string) => `Desde: ${summary}`,
  to: (summary: string) => `Hasta: ${summary}`,
  note: "Quedan en el historial marcadas como deshechas. Después volvé a anotar lo que corresponda.",
  confirm: (count: number) => `Deshacer ${count}`,
  cancel: "Cancelar",
  undoBackToHere: "Deshacer hasta acá",
} as const;

/**
 * One line describing an action, e.g. "Ana paga $100 al banco". With the group's events, the
 * effects follow: "PRR paga $240 ($24/acción) · PRR → $112".
 */
const SELF_DESCRIBED: ReadonlySet<string> = new Set(["launchCompany", "mergeCompanies", "correctTrain"]);

export function summaryEs(action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]): string {
  const fn = summaries[action.type] as Summarizer<ActionType> | undefined;
  const title = fn ? fn(action, ctx, events) : action.type;
  const noRun = events && action.type === "nextCompany" ? noRunSummary(events, ctx) : undefined;
  // A zero run that ends a round keeps the round-end title (feature 011, US5).
  const base = noRun ? (roundEndEs(events, ctx) ? `${noRun} · ${title}` : noRun) : title;
  // A launch's or merger's line already says where everything went (History lists each transfer).
  let effects =
    events && !SELF_DESCRIBED.has(action.type) && !(action.type === "startSR" && exportedEs(events, ctx)) ? effectsEs(events, ctx) : [];
  const or = action.type === "nextCompany" ? startedOR(events) : undefined;
  if (or) effects = effects.filter((e) => e !== `OR ${or.orSet}.${or.orIndex}`); // the title names it
  return effects.length > 0 ? `${base} · ${effects.join(" · ")}` : base;
}

/**
 * The voice confirmation card's line: a proposal, so "Terminar la partida (…)" where History
 * records "Fin de la partida (…)" (feature 007).
 */
export function proposalSummaryEs(action: Action, ctx: SummaryContext, events?: readonly PrimitiveEvent[]): string {
  if (action.type === "endGame") return `Terminar la partida ${endConditionsEs(action.triggers ?? [])}`;
  return summaryEs(action, ctx, events);
}

/** A holder in a breakdown line: "Banco", "Pool", "IPO", a player's or company's name. */
function lineHolder(holder: HolderRef, ctx: SummaryContext): string {
  const h = parseHolder(holder);
  switch (h.kind) {
    case "bank":
      return "Banco";
    case "pool":
      return "Pool";
    case "removed":
      return "Fuera del juego";
    case "ipo":
      return "IPO";
    default:
      return name(holder, ctx);
  }
}

/** Where a price move lands, labelled as effectsEs does (restack, receivership zone, closed cell). */
function priceTo(m: Extract<Movement, { kind: "price" }>, ctx: SummaryContext): string {
  if (m.to === null) return "sin precio";
  return formatMoney(m.to, ctx.game);
}

/**
 * One line of an entry's "Movimientos" (feature 010, contracts/history-ui.md): "$240: Banco →
 * Ana", "2 PRR: IPO → Ana (presidencia)", "tren 3: Banco → PRR", "PRR: $100 → $112".
 */
export function movementLineEs(m: Movement, ctx: SummaryContext): string | undefined {
  switch (m.kind) {
    case "money":
      return `${formatMoney(m.amount, ctx.game)}: ${lineHolder(m.from, ctx)} → ${lineHolder(m.to, ctx)}`;
    case "shares":
      return `${m.units} ${companyName(m.company, ctx)}: ${lineHolder(m.from, ctx)} → ${lineHolder(m.to, ctx)}${m.presidency ? " (presidencia)" : ""}`;
    case "asset": {
      const [kind, id = ""] = m.asset.split(":");
      const what = kind === "train" ? `tren ${id}` : kind === "private" ? `privada ${id}` : m.asset;
      return `${what}: ${lineHolder(m.from, ctx)} → ${lineHolder(m.to, ctx)}`;
    }
    case "price": {
      const company = companyName(m.company, ctx);
      if (m.reason === "restack") return `${company}: pasa al fondo de la pila`;
      const from = m.from === null ? "sin precio" : formatMoney(m.from, ctx.game);
      return `${company}: ${from} → ${priceTo(m, ctx)}${m.zone ? ` (${m.zone === "receivership" ? "zona de administración" : "casilla cerrada"})` : ""}`;
    }
    case "status":
      return `${companyName(m.company, ctx)}: ${statusLabel[m.from]} → ${statusLabel[m.to]}`;
    case "counter": {
      const label = COUNTER_LABELS[m.key] ?? m.key;
      const amount = m.key === "debt" ? signedMoney(m.delta, ctx) : `${m.delta > 0 ? "+" : "−"}${Math.abs(m.delta)}`;
      return `${label} de ${name(m.subject, ctx)}: ${amount}`;
    }
    case "turn": {
      const words = effectsEs([m.event], ctx);
      return words.length > 0 ? words.join(" · ") : undefined;
    }
  }
}

/** One line of "Saldos": "Ana: $480 → $720 (+$240)"; an unlimited bank shows only "Banco: −$240" (FR-011). */
export function balanceLineEs(b: BalanceChange, ctx: SummaryContext): string {
  const who = lineHolder(b.holder, ctx);
  if (b.before === null || b.after === null) return `${who}: ${signedMoney(b.delta, ctx)}`;
  return `${who}: ${formatMoney(b.before, ctx.game)} → ${formatMoney(b.after, ctx.game)} (${signedMoney(b.delta, ctx)})`;
}

/** "Se exporta un tren 3: empieza la fase verde; se oxidan los 2." (the startSR info, US8). */
export function exportInfoEs(preview: ExportPreview): string {
  const what = preview.count === 1 ? `Se exporta un tren ${preview.displayName}` : `Se exportan ${preview.count} trenes ${preview.displayName}`;
  const phase = preview.phase ? `: empieza la fase ${(preview.phase.color ?? preview.phase.id).toLocaleLowerCase("es")}` : "";
  const rust = preview.rusts.length > 0 ? `; se oxidan los ${preview.rusts.join(", ")}` : "";
  return `${what}${phase}${rust}.`;
}

/**
 * The export inside a startSR group (US8, contracts/ui.md "History"): "Exportado: 3 → fase verde;
 * se oxidan los 2". The exported trains leave the bank before the new SR starts; the phase and
 * the rust come after, from the phase change.
 */
function exportedEs(events: readonly PrimitiveEvent[], ctx: SummaryContext): string | undefined {
  const sr = events.findIndex((e) => e.t === "turnAdvance" && e.round === "SR");
  const exported = events
    .slice(0, sr < 0 ? events.length : sr)
    .filter((e) => e.t === "assetTransfer" && e.from === "bank" && e.to === "removed" && e.asset.startsWith("train:"));
  const first = exported[0];
  if (first?.t !== "assetTransfer") return undefined;
  const type = first.asset.split(":")[1] ?? "";
  const display = ctx.game.trains.find((t) => t.type === type)?.displayName ?? type;
  const after = events.slice(sr < 0 ? events.length : sr);
  const phase = after.find((e) => e.t === "turnAdvance" && e.phase !== undefined && e.round === undefined);
  const rusted = new Set<string>();
  for (const e of after) {
    if (e.t === "assetTransfer" && e.to === "removed" && e.asset.startsWith("train:")) rusted.add(e.asset.split(":")[1] ?? "");
    if (e.t === "counterChange" && e.key.startsWith(RUSTED) && e.delta > 0) rusted.add(e.key.split(":")[2] ?? "");
  }
  const what = exported.length === 1 ? display : `${exported.length} × ${display}`;
  const into = phase?.t === "turnAdvance" && phase.phase ? ` → fase ${phaseName(ctx.game, phase.phase).toLocaleLowerCase("es")}` : "";
  const rust = rusted.size > 0 ? `; se oxidan los ${[...rusted].join(", ")}` : "";
  return `Exportado: ${what}${into}${rust}`;
}
