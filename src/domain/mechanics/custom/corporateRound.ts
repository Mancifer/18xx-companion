import { z } from "zod";
import { AVAILABLE, unavailable, warning } from "../../actions/context";
import type { Warning } from "../../actions/schemas";
import { unitsOf } from "../../events/state";
import { roundEndEvents } from "../roundEnd";
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
    /** The SR end step (feature 003), then the CR of the current set. */
    startCR: {
      expand: (ctx) => {
        const scheduleIndex = slotIndex(ctx.game, `CR${ctx.state.turn.srNumber}`);
        return [
          ...roundEndEvents(ctx.game, ctx.state),
          { t: "turnAdvance", round: "CR", ...(scheduleIndex !== undefined ? { scheduleIndex } : {}), company: null },
        ];
      },
    },
    /** Voice only: the CR end step (§10.3), at most once per CR (feature 003). */
    endCR: {
      available: (ctx) => {
        if (ctx.state.turn.round !== "CR") return unavailable("Solo en la ronda corporativa");
        if (ctx.state.turn.roundEnded) return unavailable("Ya se aplicó el fin de la ronda corporativa");
        return AVAILABLE;
      },
      expand: (ctx) => roundEndEvents(ctx.game, ctx.state),
    },
    // §10.1.2 issueShares is a core action (research R9), offered because the market defines `issue`.
  },
};
