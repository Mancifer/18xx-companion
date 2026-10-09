import { z } from "zod";
import { AVAILABLE, unavailable, warning } from "../../actions/context";
import type { Warning } from "../../actions/schemas";
import { poolWarnings } from "../../actions/limits";
import { reduceAll } from "../../events/reduce";
import { unitsOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import { moveTarget, priceOf } from "../market";
import { endOfRoundMoves } from "../roundEnd";
import { slotIndex } from "../schedule";
import type { Mechanic } from "./mechanic";

/**
 * 21Moon §10: the corporate round. Companies sell treasury stock, issue stock and buy one
 * certificate (as `buyShare` / `sellShares` with a company buyer or seller, which this mechanic
 * makes available). At the end: up 1 when sold out to players and companies, down 1 with shares
 * in the pool once the company has operated, in descending price order.
 */
export const corporateRound: Mechanic<Record<string, never>> = {
  id: "corporateRound",
  configSchema: z.object({}).strict(),
  handlers: {
    /** §9.2.2: the president swaps certificates 1-for-1 with the company treasury, no money. */
  swapCertificates: {
    validate: (ctx, a) => {
      const warnings: Warning[] = [];
      if (unitsOf(ctx.state, `player:${a.player}`, a.give.company) < a.give.units) {
        warnings.push(warning("notEnoughShares", "El jugador no tiene esos certificados."));
      }
      if (unitsOf(ctx.state, `company:${a.company}`, a.take.company) < a.take.units) {
        warnings.push(warning("notEnoughShares", "La tesorería no tiene esos certificados."));
      }
      return warnings;
    },
    expand: (_ctx, a) => [
      { t: "shareTransfer", company: a.give.company, from: `player:${a.player}`, to: `company:${a.company}`, units: a.give.units },
      { t: "shareTransfer", company: a.take.company, from: `company:${a.company}`, to: `player:${a.player}`, units: a.take.units },
    ],
  },
    startCR: {
      expand: (ctx) => {
        const scheduleIndex = slotIndex(ctx.game, `CR${ctx.state.turn.srNumber}`);
        return [{ t: "turnAdvance", round: "CR", ...(scheduleIndex !== undefined ? { scheduleIndex } : {}), company: null }];
      },
    },
    endCR: {
      expand: (ctx) => endOfRoundMoves(ctx.game, ctx.state, "endCR"),
    },
    /** §10.1.2: IPO → pool, the Bank pays the company at the market price, down 1 once if floated. */
    issueShares: {
      available: (ctx, a) => {
        if (!a) return AVAILABLE;
        if (priceOf(ctx.game, ctx.state, a.company) === undefined) return unavailable("La compañía no está abierta");
        const left = unitsOf(ctx.state, `ipo:${a.company}`, a.company);
        if (left < a.count) return unavailable(left === 0 ? "No quedan acciones en la IPO" : `Solo quedan ${left} en la IPO`);
        return AVAILABLE;
      },
      validate: (ctx, a) => {
        const after = reduceAll(ctx.state, [{ t: "shareTransfer", company: a.company, from: `ipo:${a.company}`, to: "pool", units: a.count }]);
        return poolWarnings(ctx, after, a.company);
      },
      expand: (ctx, a) => {
        const price = priceOf(ctx.game, ctx.state, a.company) ?? 0;
        const events: PrimitiveEvent[] = [
          { t: "shareTransfer", company: a.company, from: `ipo:${a.company}`, to: "pool", units: a.count },
          { t: "moneyTransfer", from: "bank", to: `company:${a.company}`, amount: price * a.count },
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
  },
};
