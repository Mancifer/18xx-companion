import { z } from "zod";
import { AVAILABLE, unavailable, warning, type ActionContext, type Trigger } from "../../actions/context";
import { purchaseEvents, trainPrice } from "../../actions/expand/operating";
import { poolWarnings } from "../../actions/limits";
import { companyTarget, requireCompany } from "../../actions/resolve";
import type { ActionOf, Warning } from "../../actions/schemas";
import { reduceAll } from "../../events/reduce";
import { cashOf, holdersOf, presidencyHolder, presidentOf, type SessionState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { assetKind, parseHolder, type CompanyId, type HolderRef, type PlayerId } from "../../types";
import { cellTagsAt, moveTarget, priceOf } from "../market";
import { trainsHeldBy } from "../phases";
import { presidencyChange } from "../presidency";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

export const CorporateBankruptcyConfig = z.object({
  trigger: z.enum(["closedCell", "manual"]),
  endsGame: z.boolean().optional(),
  /** The president funds a train the company cannot pay (RotLA B p.17), with any trigger. */
  presidentPays: z.boolean().optional(),
  /** Where a failed company's trains go (default "removed"; RotLA B p.11: the pool). */
  companyTrainsTo: z.enum(["removed", "pool"]).optional(),
  /** Its final status (default "bankrupt"; RotLA "closed": a dissolution does not end the game). */
  companyStatus: z.enum(["bankrupt", "closed"]).optional(),
  /**
   * A player's bankruptcy (default "toPool": cash to the bank, shares to the pool). RotLA
   * "liquidatePresided" (B p.17) first closes every company the player presides, paying its other
   * players the current price.
   */
  playerMode: z.enum(["toPool", "liquidatePresided"]).optional(),
});
export type CorporateBankruptcyConfig = z.infer<typeof CorporateBankruptcyConfig>;

const configOf = (game: GameDefinition) => mechanicConfigOf(game, "corporateBankruptcy", CorporateBankruptcyConfig);

function moveAllShares(
  game: GameDefinition,
  state: SessionState,
  from: HolderRef,
  to: HolderRef,
  only?: CompanyId,
): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = [];
  for (const c of game.companies) {
    if (only !== undefined && c.id !== only) continue;
    const units = state.holdings[from]?.[c.id] ?? 0;
    if (units <= 0) continue;
    events.push({
      t: "shareTransfer",
      company: c.id,
      from,
      to,
      units,
      ...(presidencyHolder(state, c.id) === from ? { presidency: true } : {}),
    });
  }
  return events;
}

function moveAssets(state: SessionState, from: HolderRef, kinds: readonly string[], to: HolderRef = "removed"): PrimitiveEvent[] {
  return Object.entries(state.assets)
    .filter(([asset, holder]) => holder === from && kinds.includes(assetKind(asset)))
    .map(([asset]): PrimitiveEvent => ({ t: "assetTransfer", asset, from, to }));
}

/**
 * 21Moon §12 company bankruptcy: its shares leave the game, the treasury goes to the Bank, the
 * shares it holds go to the pool, and its assets are removed. RotLA dissolution (B p.11): the
 * same, with its trains to the pool (`companyTrainsTo`) and the status `closed`.
 */
export function companyBankruptcyEvents(game: GameDefinition, state: SessionState, company: CompanyId): PrimitiveEvent[] {
  const cfg = configOf(game);
  const treasury: HolderRef = `company:${company}`;
  const events: PrimitiveEvent[] = [];
  for (const holder of Object.keys(state.holdings) as HolderRef[]) {
    if (holder === "removed") continue;
    events.push(...moveAllShares(game, state, holder, "removed", company));
  }
  const cash = cashOf(state, treasury);
  if (cash > 0) events.push({ t: "moneyTransfer", from: treasury, to: "bank", amount: cash });
  for (const c of game.companies) {
    if (c.id === company) continue;
    events.push(...moveAllShares(game, state, treasury, "pool", c.id));
  }
  const trainsTo = cfg?.companyTrainsTo ?? "removed";
  if (trainsTo === "removed") events.push(...moveAssets(state, treasury, ["train", "private", "loan"]));
  else events.push(...moveAssets(state, treasury, ["train"], trainsTo), ...moveAssets(state, treasury, ["private", "loan"]));
  events.push({ t: "companyStatus", company, status: cfg?.companyStatus ?? "bankrupt" });
  return events;
}

/**
 * RotLA B p.17 (research R15): every company the player presides closes; its other players are
 * paid units × current price by the bank first. Then the usual player bankruptcy runs on what is
 * left (cash to the bank, other shares to the pool with no price move, `bankrupt` +1).
 */
export function liquidatePresidedEvents(game: GameDefinition, state: SessionState, player: PlayerId): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = [];
  for (const c of game.companies) {
    if (presidentOf(state, c.id) !== player) continue;
    const interim = reduceAll(state, events);
    const price = priceOf(game, interim, c.id) ?? 0;
    for (const [holder, units] of holdersOf(interim, c.id)) {
      const h = parseHolder(holder);
      if (h.kind !== "player" || h.id === player || units <= 0 || price * units <= 0) continue;
      events.push({ t: "moneyTransfer", from: "bank", to: holder, amount: price * units });
    }
    events.push(...companyBankruptcyEvents(game, reduceAll(state, events), c.id));
  }
  return [...events, ...playerBankruptcyEvents(game, reduceAll(state, events), player)];
}

/** A player's bankruptcy as the game's config says (`playerMode`). */
export function playerBankruptcyFor(game: GameDefinition, state: SessionState, player: PlayerId): PrimitiveEvent[] {
  return configOf(game)?.playerMode === "liquidatePresided"
    ? liquidatePresidedEvents(game, state, player)
    : playerBankruptcyEvents(game, state, player);
}

/**
 * Player bankruptcy (21Moon §11.8.1, 1830 Classic C-2.5): money to the Bank, shares to the pool,
 * privates removed, and the player marked bankrupt.
 */
export function playerBankruptcyEvents(game: GameDefinition, state: SessionState, player: PlayerId): PrimitiveEvent[] {
  const ref: HolderRef = `player:${player}`;
  const events: PrimitiveEvent[] = [];
  const cash = cashOf(state, ref);
  if (cash > 0) events.push({ t: "moneyTransfer", from: ref, to: "bank", amount: cash });
  events.push(...moveAllShares(game, state, ref, "pool"));
  events.push(...moveAssets(state, ref, ["private"]));
  events.push({ t: "counterChange", subject: ref, key: "bankrupt", delta: 1 });
  return events;
}

/** §12: a price entering the Closed cell bankrupts the company. */
const cellTrigger: Trigger = (ctx) => {
  const cfg = mechanicConfigOf(ctx.game, "corporateBankruptcy", CorporateBankruptcyConfig);
  if (cfg?.trigger !== "closedCell") return [];
  for (const e of ctx.events) {
    if (e.t !== "marketMove" || !cellTagsAt(ctx.game, e.to).includes("closed")) continue;
    const status = ctx.state.companies[e.company]?.status;
    if (status === "bankrupt" || status === "closed") continue;
    return companyBankruptcyEvents(ctx.game, ctx.state, e.company);
  }
  return [];
};

type ForcedPurchase = ActionOf<"forcedTrainPurchase">;

const presidentPays = (game: GameDefinition) =>
  mechanicConfigOf(game, "corporateBankruptcy", CorporateBankruptcyConfig)?.presidentPays === true;

function asBuyTrain(company: CompanyId, a: ForcedPurchase): ActionOf<"buyTrain"> {
  return { type: "buyTrain", company, trainType: a.trainType, variant: a.variant, from: a.from, seller: null, price: null, tradeIn: null };
}

/**
 * Research R16: every sale at its pre-sale price, the president's transfer of what the company
 * still lacks (as much as they have), the purchase, then one drop per company sold (B p.17).
 */
function forcedPurchasePlan(ctx: ActionContext, a: ForcedPurchase) {
  const company = requireCompany(ctx, a.company);
  const president = ctx.state.presidency[company] ?? null;
  const events: PrimitiveEvent[] = [];
  if (president && parseHolder(president).kind === "player") {
    for (const sale of a.sales) {
      const price = priceOf(ctx.game, ctx.state, sale.company) ?? 0;
      events.push({ t: "shareTransfer", company: sale.company, from: president, to: "pool", units: sale.count });
      if (price * sale.count > 0) events.push({ t: "moneyTransfer", from: "bank", to: president, amount: price * sale.count });
    }
  }
  const afterSales = reduceAll(ctx.state, events);
  const buy = asBuyTrain(company, a);
  const shortfall = trainPrice(ctx.game, buy, ctx.state) - cashOf(afterSales, `company:${company}`);
  const available = president ? Math.max(0, cashOf(afterSales, president)) : 0;
  const paid = Math.min(Math.max(0, shortfall), available);
  if (president && paid > 0) events.push({ t: "moneyTransfer", from: president, to: `company:${company}`, amount: paid });
  events.push(...purchaseEvents({ ...ctx, state: reduceAll(ctx.state, events) }, company, buy));
  const rule = ctx.game.market.moves.sell;
  for (const sold of [...new Set(a.sales.map((s) => s.company))]) {
    const target = moveTarget(ctx.game, ctx.state.companies[sold]?.position, "down", rule.n);
    if (target) events.push({ t: "marketMove", company: sold, to: target, reason: "sell" });
  }
  return { company, president, events, afterSales, short: shortfall - paid };
}

function forcedPurchaseWarnings(ctx: ActionContext, a: ForcedPurchase): Warning[] {
  const { company, afterSales, short } = forcedPurchasePlan(ctx, a);
  const warnings: Warning[] = [];
  if (trainsHeldBy(ctx.state, `company:${company}`).length > 0) {
    warnings.push(warning("hasTrain", "La compañía ya tiene un tren: la compra no es forzada."));
  }
  for (const sold of [...new Set(a.sales.map((s) => s.company))]) {
    if (sold === company && presidencyChange(ctx.game, ctx.players, afterSales, company).length > 0) {
      warnings.push(warning("presidencyChange", "Esa venta cambiaría la presidencia de la compañía que compra el tren."));
    }
    warnings.push(...poolWarnings(ctx, afterSales, sold));
  }
  if (short > 0) {
    warnings.push(warning("presidentShort", "Ni vendiendo le alcanza al presidente: puede declararse en quiebra."));
  }
  return warnings;
}

/** 21Moon §12 and the 1830 Classic game end; RotLA's forced train purchase. */
export const corporateBankruptcy: Mechanic<CorporateBankruptcyConfig> = {
  id: "corporateBankruptcy",
  configSchema: CorporateBankruptcyConfig,
  triggers: [cellTrigger],
  handlers: {
    forcedTrainPurchase: {
      offered: presidentPays,
      available: (ctx, a) => {
        const target = companyTarget(ctx, a?.company);
        if (!target.ok || !a) return target;
        if (!ctx.game.trains.some((t) => t.type === a.trainType)) return unavailable(`No hay trenes ${a.trainType} en este juego`);
        const president = ctx.state.presidency[requireCompany(ctx, a.company)];
        if (!president || parseHolder(president).kind !== "player") return unavailable("La compañía no tiene presidente");
        return AVAILABLE;
      },
      validate: forcedPurchaseWarnings,
      expand: (ctx, a) => forcedPurchasePlan(ctx, a).events,
    },
  },
  hooks: {
    /**
     * 1830 Classic forced purchase: the president makes up the difference from their own cash;
     * if that is not enough, they must sell shares or go bankrupt (C-2.3–2.5). The app records
     * what they pay and warns; the table decides on the bankruptcy.
     */
    trainShortfall: (ctx, company, shortfall) => {
      const cfg = mechanicConfigOf(ctx.game, "corporateBankruptcy", CorporateBankruptcyConfig);
      if (cfg?.trigger !== "manual" && !cfg?.presidentPays) return undefined;
      const president = ctx.state.presidency[company];
      if (!president?.startsWith("player:")) return undefined;
      const paid = Math.min(shortfall, Math.max(0, cashOf(ctx.state, president)));
      const events: PrimitiveEvent[] =
        paid > 0 ? [{ t: "moneyTransfer", from: president, to: `company:${company}`, amount: paid }] : [];
      const warnings =
        paid < shortfall
          ? [
              {
                code: "presidentShort",
                messageEs: "Al presidente no le alcanza: debe vender acciones o declararse en quiebra.",
                severity: "warn" as const,
              },
            ]
          : [{ code: "forcedPurchase", messageEs: "Compra forzada: el presidente pone la diferencia.", severity: "info" as const }];
      return { events, warnings };
    },
  },
};
