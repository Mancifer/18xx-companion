import { z } from "zod";
import { AVAILABLE, unavailable, warning, type ActionContext } from "../../actions/context";
import { payWarnings } from "../../actions/expand/manual";
import { eliminatedWarnings } from "../../actions/limits";
import type { ActionOf, Warning } from "../../actions/schemas";
import type { PrimitiveEvent } from "../../events/types";
import { formatMoney } from "../../i18n/format";
import { cellAt, launchPrice } from "../market";
import type { Mechanic } from "./mechanic";

/**
 * RotLA B p.10: the winner of a company's auction launches it (research R4). The whole bid goes to
 * the treasury, the president's certificate to the player and the other shares to the treasury,
 * and the starting price is half the bid, floored to the track and capped by the phase.
 */

type LaunchCompany = ActionOf<"launchCompany">;

/** The launch's events, in research R4 order (steps 1–6). */
export function launchEvents(ctx: ActionContext, a: LaunchCompany): PrimitiveEvent[] {
  const def = ctx.game.companies.find((c) => c.id === a.company);
  if (!def) return [];
  const { price, cell } = launchPrice(ctx.game, ctx.state, a.bid, a.price);
  const treasury = `company:${a.company}` as const;
  const ipo = `ipo:${a.company}` as const;
  const events: PrimitiveEvent[] = [
    { t: "companyStatus", company: a.company, status: "floated", parPrice: price },
    // The reducer puts an arriving token at the bottom of its cell's stack (FR-011).
    { t: "marketMove", company: a.company, to: cell, reason: "par" },
    { t: "shareTransfer", company: a.company, from: ipo, to: `player:${a.player}`, units: def.presidencyUnits, presidency: true },
  ];
  const rest = def.shareCount - def.presidencyUnits;
  if (rest > 0) events.push({ t: "shareTransfer", company: a.company, from: ipo, to: treasury, units: rest });
  events.push({ t: "moneyTransfer", from: `player:${a.player}`, to: treasury, amount: a.bid });
  // Step 6 (Landmarks, L p.10): a launch fee to the bank, and assets that come with the company.
  const traits = def.traits;
  if (traits?.launchFee) events.push({ t: "moneyTransfer", from: treasury, to: "bank", amount: traits.launchFee });
  for (const asset of traits?.launchAssets ?? []) {
    events.push({ t: "assetTransfer", asset, from: ctx.state.assets[asset] ?? "removed", to: treasury });
  }
  return events;
}

function launchWarnings(ctx: ActionContext, a: LaunchCompany): Warning[] {
  const { game } = ctx;
  const money = (n: number) => formatMoney(n, game);
  const warnings: Warning[] = [...eliminatedWarnings(ctx, `player:${a.player}`), ...payWarnings(ctx, `player:${a.player}`, a.bid)];
  const auction = game.auction;
  if (auction && a.bid < auction.minBid) {
    warnings.push(warning("minBid", `La puja mínima es ${money(auction.minBid)}.`));
  }
  if (auction && a.bid % auction.step !== 0) {
    warnings.push(warning("bidStep", `Las pujas van de ${money(auction.step)} en ${money(auction.step)}.`));
  }
  const result = launchPrice(game, ctx.state, a.bid, a.price);
  if (result.clamped) {
    warnings.push(
      warning("launchPriceClamped", `La mitad de la puja (${money(Math.floor(a.bid / 2))}) queda fuera del rango de la fase: se usa ${money(result.price)}.`, "info"),
    );
  }
  if (a.price !== null && cellAt(game, result.cell)?.price !== a.price) {
    warnings.push(warning("notTrackPrice", `${money(a.price)} no es un precio del mercado.`));
  }
  if (game.companies.find((c) => c.id === a.company)?.traits?.noLeadoffTrain) {
    warnings.push(warning("noLeadoffTrain", "Esta compañía no compra el tren de salida.", "info"));
  }
  return warnings;
}

export const auctionLaunch: Mechanic<Record<string, never>> = {
  id: "auctionLaunch",
  configSchema: z.object({}).strict(),
  handlers: {
    launchCompany: {
      available: (ctx, a) => {
        if (!a) return AVAILABLE;
        const def = ctx.game.companies.find((c) => c.id === a.company);
        if (def?.start !== "auction") return unavailable("Esta compañía no se abre por subasta");
        if (ctx.state.companies[a.company]?.status !== "unstarted") return unavailable("La compañía ya está abierta");
        return AVAILABLE;
      },
      validate: launchWarnings,
      expand: launchEvents,
    },
  },
};
