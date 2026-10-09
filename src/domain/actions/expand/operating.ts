import { cashOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition, TrainDef } from "../../games/schema";
import { formatMoney } from "../../i18n/format";
import { hooksOf } from "../../mechanics/custom";
import { applyMoveRules, OPERATING_STATUSES } from "../../mechanics/market";
import { computePayout } from "../../mechanics/payout";
import {
  countedTrains,
  phaseAfterBuying,
  phaseReached,
  phasesTriggeredBy,
  trainLimit,
  trainNumber,
  trainsHeldBy,
} from "../../mechanics/phases";
import { assetKind, trainTypeOf, type AssetId, type CompanyId, type HolderRef } from "../../types";
import { AVAILABLE, unavailable, warning, type ActionContext, type HandlerMap } from "../context";
import { companyDef, companyTarget, requireCompany } from "../resolve";
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
  if (a.from === "bank" && def.count === "unlimited") {
    // Unlimited types have no pre-made assets: the next number comes into play.
    const highest = Object.keys(ctx.state.assets)
      .filter((asset) => assetKind(asset) === "train" && trainTypeOf(asset) === a.trainType)
      .reduce((max, asset) => Math.max(max, trainNumber(asset)), 0);
    return `train:${a.trainType}:${highest + 1}`;
  }
  return trainsHeldBy(ctx.state, trainSource(a), a.trainType)[0];
}

/** The price: explicit, else the trade-in cost, else the variant's list cost. */
export function trainPrice(game: GameDefinition, a: Pick<BuyTrain, "trainType" | "variant" | "from" | "price" | "tradeIn">): number {
  if (a.price !== null) return a.price;
  const def = trainDef(game, a.trainType);
  if (!def) return 0;
  if (a.tradeIn !== null && a.from === "bank" && def.tradeIn?.fromTypes.includes(a.tradeIn)) return def.tradeIn.cost;
  const variant = def.variants.find((v) => v.name === a.variant) ?? def.variants[0];
  return variant?.cost ?? 0;
}

function shortfallHook(ctx: ActionContext, company: CompanyId, a: BuyTrain) {
  if (a.from === "company") return undefined;
  const shortfall = trainPrice(ctx.game, a) - cashOf(ctx.state, treasury(company));
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
  const price = trainPrice(game, a);

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
  const passed = phasesTriggeredBy(game, state, a.trainType);
  const rusting = new Set(game.trains.filter((t) => passed.some((p) => p.id === t.rustsOnPhase)).map((t) => t.type));
  let count = countedTrains(game, state, company).filter((asset) => !rusting.has(trainTypeOf(asset))).length;
  if (a.tradeIn !== null && (trainDef(game, a.tradeIn)?.countsForLimit ?? true)) count -= 1;
  if (def.countsForLimit) count += 1;
  const limit = trainLimit(game, phaseAfterBuying(game, state, a.trainType));
  if (count > limit) {
    warnings.push(warning("trainLimit", `Con este tren tendría ${count}; el límite es ${limit}.`));
  }

  if (a.tradeIn !== null) {
    if (!def.tradeIn?.fromTypes.includes(a.tradeIn)) {
      warnings.push(warning("tradeIn", `Un ${def.type} no se compra entregando un ${a.tradeIn}.`));
    } else if (trainsHeldBy(state, treasury(company), a.tradeIn).length === 0) {
      warnings.push(warning("tradeIn", `La compañía no tiene un ${a.tradeIn} para entregar.`));
    }
  }
  return warnings;
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
      const target = applyMoveRules(ctx.game, ctx.state, company, result.moveKind, { dividend: result.dividend });
      if (target) events.push({ t: "marketMove", company, to: target, reason: result.moveKind });
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
      const price = trainPrice(ctx.game, a);
      const events: PrimitiveEvent[] = [...(shortfallHook(ctx, company, a)?.events ?? [])];
      const payee: HolderRef = a.from === "company" ? `company:${a.seller ?? ""}` : "bank";
      events.push({ t: "moneyTransfer", from: treasury(company), to: payee, amount: price });
      events.push({ t: "assetTransfer", asset, from: trainSource(a), to: treasury(company) });
      if (a.tradeIn !== null) {
        const traded = trainsHeldBy(ctx.state, treasury(company), a.tradeIn)[0];
        if (traded) events.push({ t: "assetTransfer", asset: traded, from: treasury(company), to: discardDestination(ctx.game) });
      }
      return events;
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
      return [{ t: "assetTransfer", asset, from: treasury(a.company), to: discardDestination(ctx.game) }];
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
