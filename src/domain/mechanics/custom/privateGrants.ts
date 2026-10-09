import { z } from "zod";
import { AVAILABLE, unavailable, warning, type ActionContext } from "../../actions/context";
import type { ActionOf, Warning } from "../../actions/schemas";
import { unitsOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GrantDef } from "../../games/schema";
import { parseHolder, type CompanyId, type HolderRef } from "../../types";
import { parCellFor } from "../market";
import type { Mechanic } from "./mechanic";

function grantSource(ctx: ActionContext, company: CompanyId, source: GrantDef["source"], units: number): HolderRef {
  if (source === "pool") return "pool";
  if (source === "ipoOrPool" && unitsOf(ctx.state, `ipo:${company}`, company) < units) return "pool";
  return `ipo:${company}`;
}

/**
 * Grants on purchase (1830 CA 10% PRR, BO the B&O presidency at the owner's par; 1848 P5 10% QR,
 * P6 the CAR directorship at par 100). A presidency grant also starts the company at its par.
 */
function grantsFor(ctx: ActionContext, privateId: string, owner: HolderRef, par: number | null) {
  const def = ctx.game.privates.find((p) => p.id === privateId);
  const events: PrimitiveEvent[] = [];
  const warnings: Warning[] = [];
  for (const g of def?.grants ?? []) {
    const price = g.par === "ownerChooses" ? par : (g.par ?? null);
    if (g.presidency && ctx.state.companies[g.company]?.status === "unstarted") {
      if (price !== null) {
        events.push({ t: "companyStatus", company: g.company, status: "parred", parPrice: price });
        const cell = parCellFor(ctx.game, price);
        if (cell) events.push({ t: "marketMove", company: g.company, to: cell, reason: "par" });
      } else if (g.par === "ownerChooses") {
        warnings.push(warning("grantPar", "Falta el precio de salida que elige el dueño; fíjalo después."));
      }
    }
    events.push({
      t: "shareTransfer",
      company: g.company,
      from: grantSource(ctx, g.company, g.source, g.units),
      to: owner,
      units: g.units,
      ...(g.presidency ? { presidency: true } : {}),
    });
  }
  return { events, warnings };
}

type Exchange = ActionOf<"exchangePrivate">;

function exchangeTarget(ctx: ActionContext, a: Exchange): { company: CompanyId; units: number } | string {
  const def = ctx.game.privates.find((p) => p.id === a.private);
  const exchange = def?.exchange;
  if (!exchange) return "Esta privada no se canjea";
  const company = exchange.company === "*" ? a.company : (a.company ?? exchange.company);
  if (!company) return "Elige la compañía";
  if (exchange.company !== "*" && company !== exchange.company) return `Solo se canjea por ${exchange.company}`;
  if (exchange.source !== "ipoOrPool" && exchange.source !== a.source) {
    return exchange.source === "ipo" ? "Solo de la IPO" : "Solo del pool";
  }
  const from: HolderRef = a.source === "ipo" ? `ipo:${company}` : "pool";
  if (unitsOf(ctx.state, from, company) < exchange.units) return a.source === "ipo" ? "No quedan en la IPO" : "No hay en el pool";
  return { company, units: exchange.units };
}

/** Privates that grant or exchange shares (1830 CA/BO/MH, 1848 P5/P6, 21Moon P6). */
export const privateGrants: Mechanic<Record<string, never>> = {
  id: "privateGrants",
  configSchema: z.object({}).strict(),
  hooks: {
    privateBought: (ctx, privateId, owner, par) => grantsFor(ctx, privateId, owner, par),
  },
  handlers: {
    exchangePrivate: {
      available: (ctx, a) => {
        if (!a) return AVAILABLE;
        const holder = ctx.state.assets[`private:${a.private}`];
        if (!holder || holder === "removed") return unavailable("Esa privada está cerrada");
        if (parseHolder(holder).kind !== "player") return unavailable("La privada no es de un jugador");
        const target = exchangeTarget(ctx, a);
        return typeof target === "string" ? unavailable(target) : AVAILABLE;
      },
      expand: (ctx, a) => {
        const target = exchangeTarget(ctx, a);
        const owner = ctx.state.assets[`private:${a.private}`];
        if (typeof target === "string" || !owner) return [];
        return [
          {
            t: "shareTransfer",
            company: target.company,
            from: a.source === "ipo" ? `ipo:${target.company}` : "pool",
            to: owner,
            units: target.units,
          },
          { t: "assetTransfer", asset: `private:${a.private}`, from: owner, to: "removed" },
        ];
      },
    },
  },
};
