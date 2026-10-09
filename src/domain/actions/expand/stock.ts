import { reduceAll } from "../../events/reduce";
import { hasOperated, unitsOf, type SessionState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { holderName } from "../../i18n/es";
import { formatMoney } from "../../i18n/format";
import { hooksOf, isEnabled } from "../../mechanics/custom";
import { moveTarget, parCellFor, parPricesFor, priceOf } from "../../mechanics/market";
import { parseHolder, type CompanyId, type HolderRef } from "../../types";
import { AVAILABLE, unavailable, warning, type ActionContext, type AvailabilityResult, type HandlerMap } from "../context";
import type { ActionOf, Warning } from "../schemas";
import { holdingWarnings, poolWarnings } from "../limits";
import { payWarnings } from "./manual";

/** Stock round actions (US4, contracts/actions.md). */

type BuyShare = ActionOf<"buyShare">;
type SellShares = ActionOf<"sellShares">;
type ParCompany = ActionOf<"parCompany">;

/**
 * Whether a private can change hands between players right now: only when the game allows it
 * (privateTrading, default "players") and in a stock round other than the first (1830 §4.1).
 */
export function privateResaleOpen(game: GameDefinition, state: SessionState): boolean {
  if ((game.privateTrading ?? "players") === "none") return false;
  return state.turn.round === "SR" && state.turn.srNumber >= 2;
}

const def = (game: GameDefinition, company: CompanyId) => game.companies.find((c) => c.id === company);

function sourceHolder(company: CompanyId, source: BuyShare["source"]): HolderRef {
  if (source === "ipo") return `ipo:${company}`;
  if (source === "treasury") return `company:${company}`;
  return "pool";
}

/** IPO shares at par (or the market in 21Moon); pool and treasury shares at the market price. */
export function sharePrice(game: GameDefinition, state: SessionState, company: CompanyId, source: BuyShare["source"]): number | undefined {
  const market = priceOf(game, state, company);
  if (source === "ipo" && game.ipoPrice === "par") return state.companies[company]?.parPrice ?? market;
  return market;
}

/** Who receives the money: the company for incremental IPO buys and treasury sales, else the Bank. */
function payee(game: GameDefinition, company: CompanyId, source: BuyShare["source"]): HolderRef {
  if (source === "treasury") return `company:${company}`;
  if (source === "ipo" && game.capitalization.type === "incremental") return `company:${company}`;
  return "bank";
}

function buyEvents(ctx: ActionContext, a: BuyShare, assumed: number | null): PrimitiveEvent[] {
  const count = a.count ?? 1;
  const price = assumed ?? sharePrice(ctx.game, ctx.state, a.company, a.source) ?? 0;
  const events: PrimitiveEvent[] = [
    { t: "shareTransfer", company: a.company, from: sourceHolder(a.company, a.source), to: a.buyer, units: count },
  ];
  if (price * count > 0) {
    events.push({ t: "moneyTransfer", from: a.buyer, to: payee(ctx.game, a.company, a.source), amount: price * count });
  }
  return events;
}

/** Sales: paid at the pre-sale price; the price drops per share (1830) or once per sale. */
function sellEvents(ctx: ActionContext, a: SellShares, assumed: number | null): PrimitiveEvent[] {
  const price = assumed ?? priceOf(ctx.game, ctx.state, a.company) ?? 0;
  const events: PrimitiveEvent[] = [{ t: "shareTransfer", company: a.company, from: a.seller, to: "pool", units: a.count }];
  if (price * a.count > 0) events.push({ t: "moneyTransfer", from: "bank", to: a.seller, amount: price * a.count });
  // Company treasury sales (21Moon CR) do not move the price; the pool penalty does at endCR.
  if (parseHolder(a.seller).kind !== "player") return events;
  const rule = ctx.game.market.moves.sell;
  if (rule.onlyIfOperated && !hasOperated(ctx.state, a.company)) return events;
  const steps = rule.per === "share" ? rule.n * a.count : rule.n;
  const target = moveTarget(ctx.game, ctx.state.companies[a.company]?.position, "down", steps);
  if (target) events.push({ t: "marketMove", company: a.company, to: target, reason: "sell" });
  return events;
}

function parEvents(ctx: ActionContext, a: ParCompany): PrimitiveEvent[] {
  const company = def(ctx.game, a.company);
  const units = company?.presidencyUnits ?? 2;
  const cell = parCellFor(ctx.game, a.price);
  const events: PrimitiveEvent[] = [{ t: "companyStatus", company: a.company, status: "parred", parPrice: a.price }];
  if (cell) events.push({ t: "marketMove", company: a.company, to: cell, reason: "par" });
  events.push(
    { t: "shareTransfer", company: a.company, from: `ipo:${a.company}`, to: `player:${a.player}`, units, presidency: true },
    { t: "moneyTransfer", from: `player:${a.player}`, to: payee(ctx.game, a.company, "ipo"), amount: a.price * units },
  );
  return events;
}

// ---------------------------------------------------------------------------------------------
// Availability

function parAvailable(ctx: ActionContext, a?: ParCompany): AvailabilityResult {
  if (!a) return AVAILABLE;
  const company = def(ctx.game, a.company);
  if (!company || company.kind === "national") return unavailable("Esta compañía no se abre");
  if (ctx.state.companies[a.company]?.status !== "unstarted") return unavailable("La compañía ya está abierta");
  if (!parPricesFor(ctx.game, a.company).includes(a.price) || !parCellFor(ctx.game, a.price)) {
    return unavailable(`Precio de salida no válido: ${formatMoney(a.price, ctx.game)}`);
  }
  return AVAILABLE;
}

function companyTraderAvailable(ctx: ActionContext, trader: string): AvailabilityResult {
  if (parseHolder(trader as HolderRef).kind === "company" && !isEnabled(ctx.game, "corporateRound")) {
    return unavailable("Las compañías solo compran y venden en la ronda corporativa");
  }
  return AVAILABLE;
}

function buyAvailable(ctx: ActionContext, a?: BuyShare): AvailabilityResult {
  if (!a) return AVAILABLE;
  const trader = companyTraderAvailable(ctx, a.buyer);
  if (!trader.ok) return trader;
  const status = ctx.state.companies[a.company]?.status;
  if (status === "unstarted" || sharePrice(ctx.game, ctx.state, a.company, a.source) === undefined) {
    return unavailable("La compañía no está abierta");
  }
  if (status === "bankrupt" || status === "closed") return unavailable("La compañía ya no existe");
  const left = unitsOf(ctx.state, sourceHolder(a.company, a.source), a.company);
  if (left < (a.count ?? 1)) {
    const where = a.source === "ipo" ? "la IPO" : a.source === "pool" ? "el pool" : "la tesorería";
    return unavailable(left === 0 ? `No quedan acciones en ${where}` : `Solo quedan ${left} en ${where}`);
  }
  return AVAILABLE;
}

function sellAvailable(ctx: ActionContext, a?: SellShares): AvailabilityResult {
  if (!a) return AVAILABLE;
  const trader = companyTraderAvailable(ctx, a.seller);
  if (!trader.ok) return trader;
  if (priceOf(ctx.game, ctx.state, a.company) === undefined) return unavailable("La compañía no tiene precio");
  return AVAILABLE;
}

// ---------------------------------------------------------------------------------------------
// Warnings (T111). Never blocking (FR-025). Limits live in ../limits.

function buyWarnings(ctx: ActionContext, a: BuyShare, assumed: number | null = null): Warning[] {
  const events = buyEvents(ctx, a, assumed);
  const after = reduceAll(ctx.state, events);
  const cost = events.reduce((sum, e) => (e.t === "moneyTransfer" ? sum + e.amount : sum), 0);
  const warnings = [...payWarnings(ctx, a.buyer, cost), ...holdingWarnings(ctx, after, a.buyer, a.company)];
  const buyer = parseHolder(a.buyer);
  if (buyer.kind === "player" && ctx.state.turn.round === "SR" && ctx.state.soldThisSR[buyer.id]?.includes(a.company)) {
    warnings.push(warning("boughtAfterSelling", "Ya vendió esta compañía en esta ronda de acciones."));
  }
  return warnings;
}

function sellWarnings(ctx: ActionContext, a: SellShares): Warning[] {
  const warnings: Warning[] = [];
  const held = unitsOf(ctx.state, a.seller, a.company);
  if (held < a.count) warnings.push(warning("notEnoughShares", `Solo tiene ${held}.`));
  const after = reduceAll(ctx.state, sellEvents(ctx, a, null));
  warnings.push(...poolWarnings(ctx, after, a.company));
  return warnings;
}

function parWarnings(ctx: ActionContext, a: ParCompany): Warning[] {
  const events = parEvents(ctx, a);
  const after = reduceAll(ctx.state, events);
  const units = def(ctx.game, a.company)?.presidencyUnits ?? 2;
  const warnings = [...payWarnings(ctx, `player:${a.player}`, a.price * units), ...holdingWarnings(ctx, after, `player:${a.player}`, a.company)];
  const from = def(ctx.game, a.company)?.availableFrom;
  const sr = /^SR(\d+)$/.exec(from ?? "");
  if (sr && ctx.state.turn.srNumber < Number(sr[1])) {
    warnings.push(warning("notYetAvailable", `Esta compañía no se puede abrir hasta la ${from}.`));
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------------

type BatchItem = ActionOf<"stockBatch">["items"][number];

function itemAvailable(ctx: ActionContext, item: BatchItem): AvailabilityResult {
  if (item.type === "buyShare") return buyAvailable(ctx, item);
  if (item.type === "sellShares") return sellAvailable(ctx, item);
  return parAvailable(ctx, item);
}

function itemEvents(ctx: ActionContext, item: BatchItem, assumed: number | null): PrimitiveEvent[] {
  if (item.type === "buyShare") return buyEvents(ctx, item, assumed);
  if (item.type === "sellShares") return sellEvents(ctx, item, assumed);
  return parEvents(ctx, assumed !== null ? { ...item, price: assumed } : item);
}

/** Walks a batch against the interim state: one group, applied in the stated order (FR-042). */
function walkBatch(ctx: ActionContext, a: ActionOf<"stockBatch">) {
  let state = ctx.state;
  const events: PrimitiveEvent[] = [];
  const warnings: Warning[] = [];
  for (const [i, item] of a.items.entries()) {
    const step = { ...ctx, state };
    const ok = itemAvailable(step, item);
    if (!ok.ok) return { unavailable: `Fila ${i + 1}: ${ok.reasonEs}`, events, warnings };
    const assumed = a.assumedPrices[i] ?? null;
    if (item.type === "buyShare") warnings.push(...buyWarnings(step, item, assumed));
    else if (item.type === "sellShares") warnings.push(...sellWarnings(step, item));
    else warnings.push(...parWarnings(step, item));
    const e = itemEvents(step, item, assumed);
    events.push(...e);
    state = reduceAll(state, e);
  }
  return { unavailable: undefined, events, warnings };
}

/**
 * The price each batch row would use at its point in the order, given the earlier rows and their
 * assumed prices (BatchSheet shows these as editable defaults).
 */
export function batchItemPrices(ctx: ActionContext, items: readonly BatchItem[], assumed: readonly (number | null)[]): (number | undefined)[] {
  let state = ctx.state;
  return items.map((item, i) => {
    const step = { ...ctx, state };
    const price =
      item.type === "buyShare"
        ? sharePrice(ctx.game, state, item.company, item.source)
        : item.type === "sellShares"
          ? priceOf(ctx.game, state, item.company)
          : item.price;
    if (itemAvailable(step, item).ok) state = reduceAll(state, itemEvents(step, item, assumed[i] ?? null));
    return assumed[i] ?? price;
  });
}

export const stockHandlers: HandlerMap = {
  parCompany: { available: parAvailable, validate: parWarnings, expand: parEvents },

  buyShare: {
    available: buyAvailable,
    validate: (ctx, a) => buyWarnings(ctx, a),
    expand: (ctx, a) => buyEvents(ctx, a, null),
  },

  sellShares: {
    available: sellAvailable,
    validate: sellWarnings,
    expand: (ctx, a) => sellEvents(ctx, a, null),
  },

  buyPrivate: {
    available: (ctx, a) => {
      if (!a) return AVAILABLE;
      const holder = ctx.state.assets[`private:${a.private}`];
      if (!holder) return unavailable(`Privada desconocida: ${a.private}`);
      if (holder === "removed") return unavailable("Esa privada está cerrada");
      if (holder === `player:${a.buyer}`) return unavailable("Ya es suya");
      if (holder !== "bank" && !privateResaleOpen(ctx.game, ctx.state)) {
        const owner = holderName(holder, ctx.game, ctx.players);
        return unavailable(
          ctx.game.privateTrading === "none"
            ? `La ${a.private} ya es de ${owner}; en ${ctx.game.name} las privadas no se traspasan`
            : `La ${a.private} ya es de ${owner}; solo se traspasa en una ronda de acciones a partir de la segunda`,
        );
      }
      return AVAILABLE;
    },
    validate: (ctx, a) => {
      const warnings = payWarnings(ctx, `player:${a.buyer}`, a.price);
      for (const hook of hooksOf(ctx.game, "privateBought")) {
        warnings.push(...(hook(ctx, a.private, `player:${a.buyer}`, a.par)?.warnings ?? []));
      }
      return warnings;
    },
    expand: (ctx, a) => {
      const asset = `private:${a.private}`;
      const holder = ctx.state.assets[asset] ?? "bank";
      const buyer: HolderRef = `player:${a.buyer}`;
      const events: PrimitiveEvent[] = [];
      if (a.price > 0) events.push({ t: "moneyTransfer", from: buyer, to: holder, amount: a.price });
      events.push({ t: "assetTransfer", asset, from: holder, to: buyer });
      for (const hook of hooksOf(ctx.game, "privateBought")) {
        const result = hook({ ...ctx, state: reduceAll(ctx.state, events) }, a.private, buyer, a.par);
        if (result) events.push(...result.events);
      }
      return events;
    },
  },

  stockBatch: {
    available: (ctx, a) => {
      if (!a) return AVAILABLE;
      const walked = walkBatch(ctx, a);
      return walked.unavailable ? unavailable(walked.unavailable) : AVAILABLE;
    },
    validate: (ctx, a) => walkBatch(ctx, a).warnings,
    expand: (ctx, a) => walkBatch(ctx, a).events,
  },
};

