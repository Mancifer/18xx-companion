import { hooksOf } from "../../mechanics/custom";
import { companyBankruptcyEvents, playerBankruptcyFor } from "../../mechanics/custom/corporateBankruptcy";
import { AVAILABLE, unavailable, type HandlerMap } from "../context";

/**
 * Status and counter overrides (US3, T090). Every status can be set by hand (FR-024,
 * constitution III); the matching mechanic does the bookkeeping when the game enables one.
 */
export const statusHandlers: HandlerMap = {
  enterReceivership: {
    available: (ctx, a) => {
      if (!a) return AVAILABLE;
      return ctx.state.companies[a.company]?.status === "receivership" ? unavailable("Ya está en administración") : AVAILABLE;
    },
    expand: (ctx, a) => {
      for (const hook of hooksOf(ctx.game, "enterReceivership")) {
        const events = hook(ctx, a.company);
        if (events) return events;
      }
      return [{ t: "companyStatus", company: a.company, status: "receivership" }];
    },
  },

  declareBankruptcy: {
    available: (ctx, a) => {
      if (a?.player && !ctx.players.some((p) => p.id === a.player)) return unavailable("Jugador desconocido");
      if (a?.company && ctx.state.companies[a.company]?.status === "bankrupt") return unavailable("Ya está en quiebra");
      return AVAILABLE;
    },
    expand: (ctx, a) =>
      a.player !== null
        ? playerBankruptcyFor(ctx.game, ctx.state, a.player)
        : companyBankruptcyEvents(ctx.game, ctx.state, a.company ?? ""),
  },

  closeCompany: {
    expand: (_ctx, a) => [{ t: "companyStatus", company: a.company, status: "closed" }],
  },

  adjustCounter: {
    expand: (_ctx, a) => [{ t: "counterChange", subject: a.subject, key: a.key, delta: a.delta }],
  },
};
