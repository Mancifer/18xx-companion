import { reduceAll } from "../../events/reduce";
import { cashOf, counterOf, hasOperated, unitsOf, type SessionState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition, NamedPayment, TrainDef } from "../../games/schema";
import { formatMoney } from "../../i18n/format";
import { hooksOf } from "../../mechanics/custom";
import { moveTarget, OPERATING_STATUSES, priceOf, runMoveEvent } from "../../mechanics/market";
import { effectiveTraits } from "../../mechanics/traits";
import { poolWarnings } from "../limits";
import { computePayout } from "../../mechanics/payout";
import {
  countedTrains,
  PERMANENT,
  phaseAfterBuying,
  phaseReached,
  phasesTriggeredBy,
  RUSTED,
  trainLimitFor,
  trainNumber,
  trainsHeldBy,
} from "../../mechanics/phases";
import { assetKind, trainTypeOf, type AssetId, type CompanyId, type HolderRef } from "../../types";
import { AVAILABLE, unavailable, warning, type ActionContext, type HandlerMap } from "../context";
import { companyDef, companyTarget, requireCompany, resolveCompany } from "../resolve";
import type { ActionOf, Warning } from "../schemas";
import { payWarnings } from "./manual";

/** Operating-round actions (US3, contracts/actions.md). */

const treasury = (company: CompanyId): HolderRef => `company:${company}`;

export function trainDef(game: GameDefinition, type: string): TrainDef | undefined {
  return game.trains.find((t) => t.type === type);
}

export function discardDestination(game: GameDefinition): HolderRef {
  return game.discardedTrainsTo ?? "removed";
}

type BuyTrain = ActionOf<"buyTrain">;

function trainSource(a: BuyTrain): HolderRef {
  if (a.from === "company") return `company:${a.seller ?? ""}`;
  return a.from;
}

/** The train a purchase takes: the cheapest-numbered one held by the source. */
function trainToBuy(ctx: ActionContext, a: BuyTrain): AssetId | undefined {
  const def = trainDef(ctx.game, a.trainType);
  if (!def) return undefined;
  if (a.from === "bank" && def.count === "unlimited") return nextTrainAsset(ctx.state, a.trainType);
  return trainsHeldBy(ctx.state, trainSource(a), a.trainType)[0];
}

/** Unlimited types have no pre-made assets: the next number comes into play. */
export function nextTrainAsset(state: SessionState, trainType: string): AssetId {
  const highest = Object.keys(state.assets)
    .filter((asset) => assetKind(asset) === "train" && trainTypeOf(asset) === trainType)
    .reduce((max, asset) => Math.max(max, trainNumber(asset)), 0);
  return `train:${trainType}:${highest + 1}`;
}

type PricedPurchase = Pick<BuyTrain, "trainType" | "variant" | "from" | "price" | "tradeIn">;

/** The train types the phases started by this purchase rust. */
function rustedBy(game: GameDefinition, state: SessionState, trainType: string): Set<string> {
  const passed = phasesTriggeredBy(game, state, trainType);
  return new Set(game.trains.filter((t) => passed.some((p) => p.id === t.rustsOnPhase)).map((t) => t.type));
}

/**
 * Why a listed trade-in type cannot be traded in for this purchase, or undefined: its price is
 * for another variant (RotLA ∞), or this purchase rusts it first (`rustsFirst`, research R11).
 * Without state, the rust is not checked.
 */
export function tradeInProblem(game: GameDefinition, state: SessionState | undefined, a: PricedPurchase): string | undefined {
  const rule = trainDef(game, a.trainType)?.tradeIn;
  if (a.tradeIn === null || !rule?.fromTypes.includes(a.tradeIn)) return undefined;
  const variant = a.variant ?? trainDef(game, a.trainType)?.variants[0]?.name;
  if (rule.variant !== undefined && variant !== rule.variant) return `El precio de entrega solo vale para el ${rule.variant}.`;
  if (rule.rustsFirst && state && rustedBy(game, state, a.trainType).has(a.tradeIn)) {
    return `El ${a.tradeIn} se oxida con esta compra: no se puede entregar.`;
  }
  return undefined;
}

/** The price: explicit, else the trade-in cost (when the trade-in is valid), else the variant's list cost. */
export function trainPrice(game: GameDefinition, a: PricedPurchase, state?: SessionState): number {
  if (a.price !== null) return a.price;
  const def = trainDef(game, a.trainType);
  if (!def) return 0;
  const listed = a.tradeIn !== null && def.tradeIn?.fromTypes.includes(a.tradeIn);
  if (listed && a.from === "bank" && def.tradeIn && !tradeInProblem(game, state, a)) return def.tradeIn.cost;
  const variant = def.variants.find((v) => v.name === a.variant) ?? def.variants[0];
  return variant?.cost ?? 0;
}

/** A train a company should not part with: a `special` type or a `permanent:` one (Canyon). */
function keptTrainWarning(game: GameDefinition, state: SessionState, holder: HolderRef, asset: AssetId | undefined): Warning[] {
  if (!asset) return [];
  const special = trainDef(game, trainTypeOf(asset))?.special === true;
  if (!special && counterOf(state, holder, `${PERMANENT}${asset}`) === 0) return [];
  return [warning("keptTrain", "Este tren no se vende ni se entrega.")];
}

function shortfallHook(ctx: ActionContext, company: CompanyId, a: BuyTrain) {
  if (a.from === "company") return undefined;
  const shortfall = trainPrice(ctx.game, a, ctx.state) - cashOf(ctx.state, treasury(company));
  if (shortfall <= 0) return undefined;
  for (const hook of hooksOf(ctx.game, "trainShortfall")) {
    const result = hook(ctx, company, shortfall);
    if (result) return result;
  }
  return undefined;
}

function buyTrainWarnings(ctx: ActionContext, a: BuyTrain): Warning[] {
  const { game, state } = ctx;
  const company = requireCompany(ctx, a.company);
  const def = trainDef(game, a.trainType);
  if (!def) return [];
  const warnings: Warning[] = [];
  const price = trainPrice(game, a, state);

  const hook = shortfallHook(ctx, company, a);
  if (hook) warnings.push(...hook.warnings);
  else warnings.push(...payWarnings(ctx, treasury(company), price));

  if (def.availableFromPhase !== undefined && !phaseReached(game, state, def.availableFromPhase)) {
    warnings.push(warning("trainNotAvailable", `Los trenes ${def.type} no están disponibles hasta la fase ${def.availableFromPhase}.`));
  }
  if (a.from === "bank") {
    const earlier = game.trains
      .slice(0, game.trains.indexOf(def))
      .find((t) => t.count !== "unlimited" && trainsHeldBy(state, "bank", t.type).length > 0);
    if (earlier && def.availableFromPhase === undefined) {
      warnings.push(warning("trainOrder", `Aún quedan trenes ${earlier.type} en el banco.`));
    }
  }

  // The limit after the purchase: in the phase it starts, without the trains that rust there.
  const rusting = rustedBy(game, state, a.trainType);
  const problem = tradeInProblem(game, state, a);
  let count = countedTrains(game, state, company).filter((asset) => !rusting.has(trainTypeOf(asset))).length;
  if (a.tradeIn !== null && !problem && (trainDef(game, a.tradeIn)?.countsForLimit ?? true)) count -= 1;
  if (def.countsForLimit) count += 1;
  const limit = trainLimitFor(game, state, company, phaseAfterBuying(game, state, a.trainType));
  if (count > limit) {
    warnings.push(warning("trainLimit", `Con este tren tendría ${count}; el límite es ${limit}.`));
  }

  if (a.tradeIn !== null) {
    if (!def.tradeIn?.fromTypes.includes(a.tradeIn)) {
      warnings.push(warning("tradeIn", `Un ${def.type} no se compra entregando un ${a.tradeIn}.`));
    } else if (problem) {
      warnings.push(warning("tradeIn", problem));
    } else if (trainsHeldBy(state, treasury(company), a.tradeIn).length === 0) {
      warnings.push(warning("tradeIn", `La compañía no tiene un ${a.tradeIn} para entregar.`));
    } else {
      warnings.push(...keptTrainWarning(game, state, treasury(company), tradedTrain(ctx, company, a)));
    }
  }
  if (a.from === "company") warnings.push(...keptTrainWarning(game, state, trainSource(a), trainToBuy(ctx, a)));
  // Manufacturing (L p.10): it starts with its own train and buys no leadoff train.
  if (effectiveTraits(game, state, company).noLeadoffTrain && !hasOperated(state, company)) {
    warnings.push(warning("leadoffTrain", "Esta compañía no compra el tren de salida: ya tiene el suyo."));
  }
  return warnings;
}

/** The train traded in, when the trade-in is valid (a train rusted by this purchase is not). */
function tradedTrain(ctx: ActionContext, company: CompanyId, a: BuyTrain): AssetId | undefined {
  if (a.tradeIn === null || tradeInProblem(ctx.game, ctx.state, a)) return undefined;
  return trainsHeldBy(ctx.state, treasury(company), a.tradeIn)[0];
}

/** The purchase itself: payment, the train, and the traded-in train (to `removed` or the discard). */
export function purchaseEvents(ctx: ActionContext, company: CompanyId, a: BuyTrain): PrimitiveEvent[] {
  const asset = trainToBuy(ctx, a);
  if (!asset) return [];
  const payee: HolderRef = a.from === "company" ? `company:${a.seller ?? ""}` : "bank";
  const events: PrimitiveEvent[] = [
    { t: "moneyTransfer", from: treasury(company), to: payee, amount: trainPrice(ctx.game, a, ctx.state) },
    { t: "assetTransfer", asset, from: trainSource(a), to: treasury(company) },
  ];
  const traded = tradedTrain(ctx, company, a);
  if (traded) {
    const to = trainDef(ctx.game, a.trainType)?.tradeIn?.to === "removed" ? "removed" : discardDestination(ctx.game);
    events.push({ t: "assetTransfer", asset: traded, from: treasury(company), to });
  }
  return events;
}

function priceRange(game: GameDefinition, privateId: string): [number, number] | undefined {
  const def = game.privates.find((p) => p.id === privateId);
  const range = def?.companyPriceRange;
  if (!def || !range) return undefined;
  if ("range" in range) return range.range;
  const [lo, hi] = range.multipleOfFace;
  return [Math.ceil(lo * def.cost), Math.floor(hi * def.cost)];
}

/** Whether a run must be withheld, with the reason (forcedWithhold, receivership). */
export function forcedWithholdReason(ctx: ActionContext, company: CompanyId): string | undefined {
  for (const hook of hooksOf(ctx.game, "forceWithhold")) {
    const reason = hook(ctx, company);
    if (reason) return reason;
  }
  return undefined;
}

/**
 * "No corrió": a run of 0 in every part. With a payout choice it is withheld (or, where the game
 * has no withhold, a full payout of 0, which counts as one); fixed parts take no mode.
 */
export function zeroRunAction(game: GameDefinition, company: CompanyId): ActionOf<"runAndPayout"> {
  const hasChoice = game.revenueParts.length === 1 && game.revenueParts[0]?.to === "choice";
  const mode = !hasChoice ? null : game.payoutModes.includes("withhold") ? "withhold" : "full";
  return { type: "runAndPayout", company, parts: game.revenueParts.map((p) => ({ part: p.id, amount: 0 })), mode };
}

export const operatingHandlers: HandlerMap = {
  runAndPayout: {
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      const def = companyDef(ctx, requireCompany(ctx, a.company));
      if (def?.kind === "national") return unavailable("El banco nacional usa su propio pago");
      if (a.mode !== null && !ctx.game.payoutModes.includes(a.mode)) {
        return unavailable(
          ctx.game.payoutModes.length === 0
            ? "En este juego no se elige cómo pagar"
            : a.mode === "half"
              ? "Esta partida no permite pagar la mitad"
              : "Modo de pago no permitido",
        );
      }
      const unknown = a.parts.find((p) => !ctx.game.revenueParts.some((r) => r.id === p.part));
      if (unknown) return unavailable(`Parte de ingresos desconocida: ${unknown.part}`);
      return AVAILABLE;
    },
    validate: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const warnings: Warning[] = [];
      const status = ctx.state.companies[company]?.status;
      if (status && !OPERATING_STATUSES.has(status)) {
        warnings.push(warning("notFloated", "La compañía no está flotada."));
      }
      const forced = forcedWithholdReason(ctx, company);
      if (forced) warnings.push(warning("forcedWithhold", forced, "info"));
      return warnings;
    },
    expand: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const forced = forcedWithholdReason(ctx, company) !== undefined;
      const result = computePayout(ctx.game, ctx.state, company, a.parts, a.mode, { forceWithhold: forced });
      const events: PrimitiveEvent[] = [...result.transfers];
      const move = runMoveEvent(ctx.game, ctx.state, company, result.moveKind, { dividend: result.dividend });
      if (move) events.push(move);
      events.push({ t: "counterChange", subject: treasury(company), key: "runs", delta: 1 });
      return events;
    },
  },

  buyTrain: {
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      if (!trainDef(ctx.game, a.trainType)) return unavailable(`No hay trenes ${a.trainType} en este juego`);
      if (a.from === "company") {
        if (a.seller === null) return unavailable("Falta la compañía que vende");
        if (a.seller === requireCompany(ctx, a.company)) return unavailable("Una compañía no se compra un tren a sí misma");
      }
      if (!trainToBuy(ctx, a)) {
        const where = a.from === "bank" ? "el banco" : a.from === "pool" ? "el pool" : (a.seller ?? "");
        return unavailable(`No hay un tren ${a.trainType} en ${where}`);
      }
      return AVAILABLE;
    },
    validate: buyTrainWarnings,
    expand: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const asset = trainToBuy(ctx, a);
      if (!asset) return [];
      return [...(shortfallHook(ctx, company, a)?.events ?? []), ...purchaseEvents(ctx, company, a)];
    },
  },

  payCost: {
    available: (ctx, a) => companyTarget(ctx, a?.company),
    validate: (ctx, a) => payWarnings(ctx, treasury(requireCompany(ctx, a.company)), a.amount),
    expand: (ctx, a) => [{ t: "moneyTransfer", from: treasury(requireCompany(ctx, a.company)), to: "bank", amount: a.amount }],
  },

  bankPays: {
    available: (ctx, a) => companyTarget(ctx, a?.company),
    validate: (ctx, a) => payWarnings(ctx, "bank", a.amount),
    expand: (ctx, a) => [{ t: "moneyTransfer", from: "bank", to: treasury(requireCompany(ctx, a.company)), amount: a.amount }],
  },

  privateIncome: {
    expand: (ctx) => {
      const events: PrimitiveEvent[] = [];
      for (const p of ctx.game.privates) {
        if (p.income <= 0) continue;
        const holder = ctx.state.assets[`private:${p.id}`];
        if (holder?.startsWith("player:") || holder?.startsWith("company:")) {
          events.push({ t: "moneyTransfer", from: "bank", to: holder, amount: p.income });
        }
      }
      return events;
    },
  },

  buyPrivateByCompany: {
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      const holder = ctx.state.assets[`private:${a.private}`];
      if (!holder) return unavailable(`Privada desconocida: ${a.private}`);
      if (holder === "removed") return unavailable("Esa privada está cerrada");
      if (holder === treasury(requireCompany(ctx, a.company))) return unavailable("La compañía ya es dueña de esa privada");
      return AVAILABLE;
    },
    validate: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const warnings = payWarnings(ctx, treasury(company), a.price);
      const range = priceRange(ctx.game, a.private);
      if (range && (a.price < range[0] || a.price > range[1])) {
        warnings.push(
          warning("privatePrice", `El precio debe estar entre ${formatMoney(range[0], ctx.game)} y ${formatMoney(range[1], ctx.game)}.`),
        );
      }
      return warnings;
    },
    expand: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const asset = `private:${a.private}`;
      const holder = ctx.state.assets[asset] ?? "bank";
      return [
        { t: "moneyTransfer", from: treasury(company), to: holder, amount: a.price },
        { t: "assetTransfer", asset, from: holder, to: treasury(company) },
      ];
    },
  },

  discardTrain: {
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      return discardedTrain(ctx, a) ? AVAILABLE : unavailable("La compañía no tiene ese tren");
    },
    expand: (ctx, a) => {
      const asset = discardedTrain(ctx, a);
      if (!asset) return [];
      const holder = treasury(a.company);
      // A rusted train kept for one last run (Resourceful) leaves the game (research R10).
      if (counterOf(ctx.state, holder, `${RUSTED}${asset}`) > 0) {
        return [
          { t: "assetTransfer", asset, from: holder, to: "removed" },
          { t: "counterChange", subject: holder, key: `${RUSTED}${asset}`, delta: -1 },
        ];
      }
      return [{ t: "assetTransfer", asset, from: holder, to: discardDestination(ctx.game) }];
    },
  },

  changeTrainSupply: {
    available: (ctx, a) => {
      if (!ctx.game.trains.some((t) => (t.reserve ?? 0) > 0)) return unavailable("Este juego no tiene trenes de reserva");
      if (!a) return AVAILABLE;
      return supplyTrain(ctx, a) ? AVAILABLE : unavailable(`No se puede ${a.op === "add" ? "añadir" : "quitar"} un ${a.trainType}`);
    },
    expand: (ctx, a) => {
      const asset = supplyTrain(ctx, a);
      if (!asset) return [];
      return a.op === "add"
        ? [{ t: "assetTransfer", asset, from: "removed", to: "bank" }]
        : [{ t: "assetTransfer", asset, from: "bank", to: "removed" }];
    },
  },
};

/** Where issued shares come from (research R9): the IPO (21Moon) or the company's treasury (RotLA). */
function issueSource(game: GameDefinition, company: CompanyId): HolderRef {
  return game.market.moves.issue?.from === "treasury" ? treasury(company) : `ipo:${company}`;
}

/** RotLA: more than one issue or redemption by a company in one OR (read from this OR's events). */
function treasuryTradeWarnings(ctx: ActionContext, company: CompanyId): Warning[] {
  if (!ctx.game.market.moves.redeem) return [];
  if ((ctx.state.turn.treasuryTradesThisOR?.[company] ?? 0) === 0) return [];
  return [warning("treasuryTradeTwice", "Esta compañía ya emitió o recompró una acción en esta ronda de operaciones.")];
}

/** Issue and redeem (research R9): core actions, offered when the market defines their move. */
export const treasuryHandlers: HandlerMap = {
  issueShares: {
    offered: (game) => game.market.moves.issue !== undefined,
    available: (ctx, a) => {
      if (!a) return AVAILABLE;
      if (priceOf(ctx.game, ctx.state, a.company) === undefined) return unavailable("La compañía no está abierta");
      const source = issueSource(ctx.game, a.company);
      const left = unitsOf(ctx.state, source, a.company);
      const where = source.startsWith("ipo:") ? "la IPO" : "la tesorería";
      if (left < a.count) return unavailable(left === 0 ? `No quedan acciones en ${where}` : `Solo quedan ${left} en ${where}`);
      return AVAILABLE;
    },
    validate: (ctx, a) => {
      const source = issueSource(ctx.game, a.company);
      const after = reduceAll(ctx.state, [{ t: "shareTransfer", company: a.company, from: source, to: "pool", units: a.count }]);
      return [...poolWarnings(ctx, after, a.company), ...treasuryTradeWarnings(ctx, a.company)];
    },
    /** 21Moon §10.1.2, RotLA B p.13: source → pool, the bank pays the price, down n once (if floated, when required). */
    expand: (ctx, a) => {
      const price = priceOf(ctx.game, ctx.state, a.company) ?? 0;
      const events: PrimitiveEvent[] = [
        { t: "shareTransfer", company: a.company, from: issueSource(ctx.game, a.company), to: "pool", units: a.count },
        { t: "moneyTransfer", from: "bank", to: treasury(a.company), amount: price * a.count },
      ];
      const rule = ctx.game.market.moves.issue;
      const floated = ctx.state.companies[a.company]?.status === "floated";
      if (rule && (!rule.onlyIfFloated || floated)) {
        const target = moveTarget(ctx.game, ctx.state.companies[a.company]?.position, "down", rule.n);
        if (target) events.push({ t: "marketMove", company: a.company, to: target, reason: "issue" });
      }
      return events;
    },
  },

  /** RotLA B p.13: pool → treasury at the current price, paid to the bank; up n only when n > 0. */
  redeemShare: {
    offered: (game) => game.market.moves.redeem !== undefined,
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      const company = requireCompany(ctx, a.company);
      if (priceOf(ctx.game, ctx.state, company) === undefined) return unavailable("La compañía no está abierta");
      const left = unitsOf(ctx.state, "pool", company);
      const count = a.count ?? 1;
      if (left < count) return unavailable(left === 0 ? "No hay acciones de la compañía en el pool" : `Solo hay ${left} en el pool`);
      return AVAILABLE;
    },
    validate: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const cost = (priceOf(ctx.game, ctx.state, company) ?? 0) * (a.count ?? 1);
      return [...payWarnings(ctx, treasury(company), cost), ...treasuryTradeWarnings(ctx, company)];
    },
    expand: (ctx, a) => {
      const company = requireCompany(ctx, a.company);
      const count = a.count ?? 1;
      const price = priceOf(ctx.game, ctx.state, company) ?? 0;
      const events: PrimitiveEvent[] = [
        { t: "shareTransfer", company, from: "pool", to: treasury(company), units: count },
        { t: "moneyTransfer", from: treasury(company), to: "bank", amount: price * count },
      ];
      const n = ctx.game.market.moves.redeem?.n ?? 0;
      if (n > 0) {
        const target = moveTarget(ctx.game, ctx.state.companies[company]?.position, "up", n);
        if (target) events.push({ t: "marketMove", company, to: target, reason: "manual" });
      }
      return events;
    },
  },

  /** A company ability's money (research R3): the trait's cost first, then its payment, one group. */
  namedPayment: {
    offered: (game) => game.companies.some((c) => (c.traits?.payments?.length ?? 0) > 0),
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      if (!namedPaymentOf(ctx, a)) return unavailable("La compañía no tiene esa habilidad");
      return AVAILABLE;
    },
    validate: (ctx, a) => {
      const payment = namedPaymentOf(ctx, a);
      const company = requireCompany(ctx, a.company);
      if (!payment) return [];
      const amount = a.amount ?? payment.amount;
      const warnings: Warning[] = [];
      if (amount <= 0) warnings.push(warning("paymentAmount", `Falta el importe de ${payment.labelEs}.`));
      const out = (payment.cost ?? 0) + (payment.direction === "companyPays" ? amount : 0);
      if (out > 0) warnings.push(...payWarnings(ctx, treasury(company), out));
      return warnings;
    },
    expand: (ctx, a) => {
      const payment = namedPaymentOf(ctx, a);
      const company = requireCompany(ctx, a.company);
      if (!payment) return [];
      const amount = a.amount ?? payment.amount;
      const events: PrimitiveEvent[] = [];
      if (payment.cost) events.push({ t: "moneyTransfer", from: treasury(company), to: "bank", amount: payment.cost });
      if (amount > 0) {
        events.push(
          payment.direction === "bankPays"
            ? { t: "moneyTransfer", from: "bank", to: treasury(company), amount }
            : { t: "moneyTransfer", from: treasury(company), to: "bank", amount },
        );
      }
      return events;
    },
  },
};

export function namedPaymentOf(ctx: ActionContext, a: Pick<ActionOf<"namedPayment">, "company" | "payment">): NamedPayment | undefined {
  const company = resolveCompany(ctx, a.company);
  if (!company) return undefined;
  return effectiveTraits(ctx.game, ctx.state, company).payments?.find((p) => p.id === a.payment);
}

function discardedTrain(ctx: ActionContext, a: ActionOf<"discardTrain">): AssetId | undefined {
  const holder = treasury(a.company);
  if (a.train.includes(":")) return ctx.state.assets[a.train] === holder ? a.train : undefined;
  return trainsHeldBy(ctx.state, holder, a.train)[0];
}

function supplyTrain(ctx: ActionContext, a: ActionOf<"changeTrainSupply">): AssetId | undefined {
  const def = trainDef(ctx.game, a.trainType);
  if (!def || def.count === "unlimited") return undefined;
  if (a.op === "add") {
    const count = def.count;
    return trainsHeldBy(ctx.state, "removed", a.trainType).find((asset) => trainNumber(asset) > count);
  }
  return trainsHeldBy(ctx.state, "bank", a.trainType).at(-1);
}
