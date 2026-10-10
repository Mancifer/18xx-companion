import { z } from "zod";
import { AVAILABLE, unavailable, warning, type ActionContext } from "../../actions/context";
import { companyTarget, requireCompany } from "../../actions/resolve";
import type { ActionOf, Warning } from "../../actions/schemas";
import { counterOf, type TurnState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { TrainDef } from "../../games/schema";
import { trainTypeOf, type AssetId, type CompanyId, type HolderRef } from "../../types";
import { moveTarget, priceOf } from "../market";
import { PERMANENT, phaseReached, trainNumber, trainsHeldBy } from "../phases";
import type { Mechanic } from "./mechanic";

/**
 * RotLA Landmarks (L p.10–11, research R13): the postcards' money effects, each one intent and one
 * group. Repeats are warnings, never blocks. Route effects stay with the table.
 */

export const ROCK = "landmark:rockFormation";
export const CANYON = "landmark:canyon";
/** Cliff once per OR: a counter keyed by the OR it was used in. */
export const cliffKeyFor = (turn: Pick<TurnState, "orSet" | "orIndex">) => `landmark:cliff@${turn.orSet}.${turn.orIndex}`;
const cliffKey = (ctx: ActionContext) => cliffKeyFor(ctx.state.turn);

const treasury = (company: CompanyId): HolderRef => `company:${company}`;
const used = (ctx: ActionContext, company: CompanyId, key: string) => counterOf(ctx.state, treasury(company), key) > 0;

/** The train a Cliff sale names: an asset id the company holds, or its cheapest of a type. */
function cliffTrain(ctx: ActionContext, company: CompanyId, train: string): AssetId | undefined {
  if (train.includes(":")) return ctx.state.assets[train] === treasury(company) ? train : undefined;
  return trainsHeldBy(ctx.state, treasury(company), train)[0];
}

const typeOf = (train: string) => (train.includes(":") ? trainTypeOf(train) : train);

/** The Canyon gives back a rusted train of the first type that rusts (the 2, L p.11). */
function canyonType(ctx: ActionContext): TrainDef | undefined {
  return ctx.game.trains.find((t) => t.rustsOnPhase !== undefined && !t.special);
}

function canyonAsset(ctx: ActionContext): AssetId | undefined {
  const type = canyonType(ctx);
  return type ? trainsHeldBy(ctx.state, "removed", type.type).sort((a, b) => trainNumber(b) - trainNumber(a))[0] : undefined;
}

export const landmarks: Mechanic<Record<string, never>> = {
  id: "landmarks",
  configSchema: z.object({}).strict(),
  handlers: {
    /** Rock Formation: up two spaces, before the payout (its own group, so the payout sees the new price). */
    rockFormation: {
      available: (ctx, a) => {
        const target = companyTarget(ctx, a?.company);
        if (!target.ok || !a) return target;
        return priceOf(ctx.game, ctx.state, requireCompany(ctx, a.company)) === undefined ? unavailable("La compañía no está en el mercado") : AVAILABLE;
      },
      validate: (ctx, a) =>
        used(ctx, requireCompany(ctx, a.company), ROCK) ? [warning("landmarkUsed", "Esta compañía ya usó la formación rocosa.")] : [],
      expand: (ctx, a) => {
        const company = requireCompany(ctx, a.company);
        const events: PrimitiveEvent[] = [];
        const to = moveTarget(ctx.game, ctx.state.companies[company]?.position, "up", 2);
        if (to) events.push({ t: "marketMove", company, to, reason: "bonus" });
        events.push({ t: "counterChange", subject: treasury(company), key: ROCK, delta: 1 });
        return events;
      },
    },

    /** Cliff: the bank pays half the train's printed cost, and the train goes to the pool. */
    cliffSale: {
      available: (ctx, a) => {
        const target = companyTarget(ctx, a?.company);
        if (!target.ok || !a) return target;
        return ctx.game.trains.some((t) => t.type === typeOf(a.train)) ? AVAILABLE : unavailable(`No hay trenes ${typeOf(a.train)} en este juego`);
      },
      validate: (ctx, a: ActionOf<"cliffSale">) => {
        const company = requireCompany(ctx, a.company);
        const warnings: Warning[] = [];
        if (used(ctx, company, cliffKey(ctx))) warnings.push(warning("cliffTwice", "Esta compañía ya usó el acantilado en esta ronda de operaciones."));
        if (!cliffTrain(ctx, company, a.train)) warnings.push(warning("trainNotOwned", "La compañía no tiene ese tren."));
        return warnings;
      },
      expand: (ctx, a) => {
        const company = requireCompany(ctx, a.company);
        const asset = cliffTrain(ctx, company, a.train);
        const cost = ctx.game.trains.find((t) => t.type === typeOf(a.train))?.variants[0]?.cost ?? 0;
        const events: PrimitiveEvent[] = [];
        if (Math.floor(cost / 2) > 0) events.push({ t: "moneyTransfer", from: "bank", to: treasury(company), amount: Math.floor(cost / 2) });
        if (asset) events.push({ t: "assetTransfer", asset, from: treasury(company), to: "pool" });
        events.push({ t: "counterChange", subject: treasury(company), key: cliffKey(ctx), delta: 1 });
        return events;
      },
    },

    /** Canyon: a rusted 2 comes back from the game for good (it never rusts and is not sold). */
    canyonTrain: {
      available: (ctx, a) => {
        const target = companyTarget(ctx, a?.company);
        if (!target.ok || !a) return target;
        return canyonAsset(ctx) ? AVAILABLE : unavailable("No hay un tren oxidado fuera del juego");
      },
      validate: (ctx, a) => {
        const company = requireCompany(ctx, a.company);
        const warnings: Warning[] = [];
        if (used(ctx, company, CANYON)) warnings.push(warning("landmarkUsed", "Esta compañía ya tiene el tren del cañón."));
        const type = canyonType(ctx);
        if (type?.rustsOnPhase && !phaseReached(ctx.game, ctx.state, type.rustsOnPhase)) {
          warnings.push(warning("canyonEarly", `Los ${type.type} aún no se oxidaron: el cañón da un ${type.type} oxidado.`));
        }
        return warnings;
      },
      expand: (ctx, a) => {
        const company = requireCompany(ctx, a.company);
        const asset = canyonAsset(ctx);
        if (!asset) return [];
        return [
          { t: "assetTransfer", asset, from: "removed", to: treasury(company) },
          { t: "counterChange", subject: treasury(company), key: `${PERMANENT}${asset}`, delta: 1 },
          { t: "counterChange", subject: treasury(company), key: CANYON, delta: 1 },
        ];
      },
    },
  },
};
