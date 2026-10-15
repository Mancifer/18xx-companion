import { cashOf, counterOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import { formatMoney } from "../../i18n/format";
import { parseHolder, trainTypeOf, type AssetId, type HolderRef } from "../../types";
import { cellAt } from "../../mechanics/market";
import { currentPhase, phaseReached, RUSTED, trainsHeldBy } from "../../mechanics/phases";
import { AVAILABLE, unavailable, warning, type ActionContext, type HandlerMap } from "../context";
import { companyTarget } from "../resolve";
import type { ActionOf, Warning } from "../schemas";
import { nextTrainAsset, trainDef, trainPrice } from "./operating";

/** Warnings shared by any action that moves money out of a holder (never blocking). */
export function payWarnings(ctx: ActionContext, from: HolderRef, amount: number): Warning[] {
  const have = cashOf(ctx.state, from);
  if (from === "bank") {
    if (ctx.game.bank !== "unlimited" && have - amount < 0) {
      return [warning("bankBroken", "El banco se queda sin dinero (banca quebrada).")];
    }
    return [];
  }
  if (have < amount) {
    return [warning("insufficientCash", `Solo tiene ${formatMoney(have, ctx.game)}; quedará en negativo.`)];
  }
  return [];
}

type CorrectTrain = ActionOf<"correctTrain">;

/**
 * The train a correction moves (data-model §1): remove takes the company's highest-numbered one
 * of the type (the latest purchase); add takes the bank's lowest-numbered one, or mints the next
 * number of an unlimited type.
 */
function correctedTrain(ctx: ActionContext, a: CorrectTrain): AssetId | undefined {
  const from: HolderRef = a.op === "remove" ? `company:${a.company}` : "bank";
  if (a.train.includes(":")) return ctx.state.assets[a.train] === from ? a.train : undefined;
  if (a.op === "remove") return trainsHeldBy(ctx.state, from, a.train).at(-1);
  if (trainDef(ctx.game, a.train)?.count === "unlimited") return nextTrainAsset(ctx.state, a.train);
  return trainsHeldBy(ctx.state, "bank", a.train)[0];
}

/** Money with the correction: the refund on a removal (list price to the bank), or the payment on an add. */
function correctionAmount(ctx: ActionContext, a: CorrectTrain, asset: AssetId): number {
  if (a.op === "add" || a.to !== "bank") return a.amount ?? 0;
  const trainType = trainTypeOf(asset);
  return a.amount ?? trainPrice(ctx.game, { trainType, variant: null, from: "bank", price: null, tradeIn: null });
}

function correctTrainWarnings(ctx: ActionContext, a: CorrectTrain): Warning[] {
  const asset = correctedTrain(ctx, a);
  if (!asset) return [];
  const company: HolderRef = `company:${a.company}`;
  const amount = correctionAmount(ctx, a, asset);
  if (a.op === "add") return amount > 0 ? payWarnings(ctx, company, amount) : [];
  const { game, state } = ctx;
  const type = trainTypeOf(asset);
  const warnings: Warning[] = [];
  const phase = currentPhase(game, state);
  const stillInPlay = Object.entries(state.assets).some(
    ([other, holder]) =>
      other !== asset && other.startsWith("train:") && trainTypeOf(other) === type && (holder === "pool" || parseHolder(holder).kind === "company"),
  );
  if (phase?.triggeredBy === type && !stillInPlay) {
    warnings.push(
      warning(
        "phaseStarter",
        `La fase ${phase.color ?? phase.id} empezó con un ${type}: la fase y los trenes oxidados no cambian solos. Si hace falta, corregilos en Fase (control de turno).`,
      ),
    );
  }
  const rustsOn = trainDef(game, type)?.rustsOnPhase;
  if (a.to === "bank" && rustsOn !== undefined && phaseReached(game, state, rustsOn)) {
    warnings.push(warning("notOnSale", `El ${type} ya no se vende en esta fase.`));
  }
  if (a.to !== "bank" && amount > 0) {
    warnings.push(warning("refundOffSupply", "La devolución se registra, aunque el tren no vuelve a la oferta."));
  }
  if (amount > 0) warnings.push(...payWarnings(ctx, "bank", amount));
  return warnings;
}

/** Manual actions (FR-024). Every override is a recorded event. */
export const manualHandlers: HandlerMap = {
  transferMoney: {
    validate: (ctx, a) => payWarnings(ctx, a.from, a.amount),
    expand: (_ctx, a) => [{ t: "moneyTransfer", from: a.from, to: a.to, amount: a.amount }],
  },
  adjustMoney: {
    expand: (ctx, a) => {
      const holder = a.holder;
      const diff = a.setTo !== null ? a.setTo - cashOf(ctx.state, holder) : (a.delta ?? 0);
      const events: PrimitiveEvent[] = [];
      if (diff > 0) events.push({ t: "moneyTransfer", from: "bank", to: holder, amount: diff });
      if (diff < 0) events.push({ t: "moneyTransfer", from: holder, to: "bank", amount: -diff });
      return events;
    },
  },
  transferShares: {
    expand: (_ctx, a) => [
      {
        t: "shareTransfer",
        company: a.company,
        from: a.from,
        to: a.to,
        units: a.units,
        ...(a.presidency ? { presidency: true } : {}),
      },
    ],
  },
  note: {
    expand: (_ctx, a) => [{ t: "note", text: a.text }],
  },
  /** Feature 011 (US3): a train recorded by mistake, or missing. Exempt from the phase and private triggers. */
  correctTrain: {
    available: (ctx, a) => {
      const target = companyTarget(ctx, a?.company);
      if (!target.ok || !a) return target;
      if (a.op === "remove") {
        if (!correctedTrain(ctx, a)) return unavailable("La compañía no tiene ese tren");
        if (a.to === null) return unavailable("Falta a dónde va el tren");
      } else {
        if (a.to !== null) return unavailable("Al dar un tren no hay destino");
        if (!a.train.includes(":") && !trainDef(ctx.game, a.train)) return unavailable(`No hay trenes ${a.train} en este juego`);
        if (!correctedTrain(ctx, a)) return unavailable(`No quedan trenes ${a.train} en la oferta`);
      }
      // The pool never holds trains in games that discard them out of the game (research R4).
      if (a.to === "pool" && ctx.game.discardedTrainsTo !== "pool") return unavailable("En este juego los trenes no van al pool");
      return AVAILABLE;
    },
    validate: correctTrainWarnings,
    expand: (ctx, a) => {
      const asset = correctedTrain(ctx, a);
      if (!asset) return [];
      const company: HolderRef = `company:${a.company}`;
      const amount = correctionAmount(ctx, a, asset);
      if (a.op === "add") {
        const events: PrimitiveEvent[] = [{ t: "assetTransfer", asset, from: "bank", to: company }];
        if (amount > 0) events.push({ t: "moneyTransfer", from: company, to: "bank", amount });
        return events;
      }
      const events: PrimitiveEvent[] = [{ t: "assetTransfer", asset, from: company, to: a.to ?? "removed" }];
      if (counterOf(ctx.state, company, `${RUSTED}${asset}`) > 0) {
        events.push({ t: "counterChange", subject: company, key: `${RUSTED}${asset}`, delta: -1 });
      }
      if (amount > 0) events.push({ t: "moneyTransfer", from: "bank", to: company, amount });
      return events;
    },
  },
  /** US7-3: a manual token move. Cell triggers (receivership, closed) still apply. */
  setMarket: {
    available: (ctx, a) => {
      if (!a) return AVAILABLE;
      const cell = a.cell;
      if ("index" in cell) {
        const track = ctx.game.market.tracks?.[a.company];
        return track && cell.index <= track.byLoansIssued.length ? AVAILABLE : unavailable("Esa casilla no existe");
      }
      return cellAt(ctx.game, cell) ? AVAILABLE : unavailable("Esa casilla no existe");
    },
    expand: (_ctx, a) => [{ t: "marketMove", company: a.company, to: a.cell, reason: "manual" }],
  },
};
