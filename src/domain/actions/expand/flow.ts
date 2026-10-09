import { reduceAll } from "../../events/reduce";
import type { PrimitiveEvent } from "../../events/types";
import { pendingCapitalEvents } from "../../mechanics/capitalization";
import { nextToOperate, operatingOrder } from "../../mechanics/operatingOrder";
import { phaseIndex } from "../../mechanics/phases";
import { endOfRoundMoves } from "../../mechanics/roundEnd";
import { slotIndex, startOREvents } from "../../mechanics/schedule";
import { AVAILABLE, unavailable, warning, type ActionContext, type HandlerMap } from "../context";

/** Round flow and turn tracking (US4 T106, US7 T150). */

/** What nextCompany does: the run it records, and where the turn goes next. */
function nextCompanyEvents(ctx: ActionContext): { events: PrimitiveEvent[]; setComplete: boolean } {
  const { game, state } = ctx;
  const events: PrimitiveEvent[] = [];
  const current = state.turn.currentCompany;
  // A turn with no run still counts as operating (data-model §5).
  if (current && !state.turn.operatedThisOR.includes(current)) {
    events.push({ t: "counterChange", subject: `company:${current}`, key: "runs", delta: 1 });
  }
  const interim = reduceAll(state, events);
  const next = nextToOperate(game, interim);
  if (next) {
    events.push({ t: "turnAdvance", operatingOrder: operatingOrder(game, interim), company: next });
    return { events, setComplete: false };
  }
  if (interim.turn.orIndex < interim.turn.orsInSet) {
    events.push(...startOREvents(game, interim));
    return { events, setComplete: false };
  }
  events.push({ t: "turnAdvance", company: null });
  return { events, setComplete: true };
}

export const flowHandlers: HandlerMap = {
  startSR: {
    expand: (ctx) => {
      const srNumber = ctx.state.turn.srNumber + 1;
      const scheduleIndex = slotIndex(ctx.game, `SR${srNumber}`);
      return [{ t: "turnAdvance", round: "SR", srNumber, ...(scheduleIndex !== undefined ? { scheduleIndex } : {}), company: null }];
    },
  },

  /** Capital of companies floated during the SR (1830 §6.3), then sold-out moves (§5.5). */
  endSR: {
    expand: (ctx) => [...pendingCapitalEvents(ctx.game, ctx.state), ...endOfRoundMoves(ctx.game, ctx.state, "endSR")],
  },

  /** The next OR in the set, or a new set: scheduled events, order and the first company. */
  startOR: {
    validate: (ctx) =>
      ctx.state.turn.round === "OR" && ctx.state.turn.orIndex >= ctx.state.turn.orsInSet
        ? [warning("newSet", "Las ORs de este set ya se jugaron: empieza un set nuevo sin ronda de acciones.", "info")]
        : [],
    expand: (ctx) => startOREvents(ctx.game, ctx.state),
  },

  nextCompany: {
    available: (ctx) => (ctx.state.turn.round === "OR" ? AVAILABLE : unavailable("Solo en la ronda de operaciones")),
    validate: (ctx) =>
      nextCompanyEvents(ctx).setComplete
        ? [warning("setComplete", "Fin de las rondas de operaciones: empieza la ronda de acciones.", "info")]
        : [],
    expand: (ctx) => nextCompanyEvents(ctx).events,
  },

  setPhase: {
    available: (ctx, a) => (a && phaseIndex(ctx.game, a.phase) < 0 ? unavailable(`Fase desconocida: ${a.phase}`) : AVAILABLE),
    expand: (_ctx, a) => [{ t: "turnAdvance", phase: a.phase }],
  },

  setTurn: {
    expand: (_ctx, a) => [
      {
        t: "turnAdvance",
        ...(a.round !== null ? { round: a.round } : {}),
        ...(a.srNumber !== null ? { srNumber: a.srNumber } : {}),
        ...(a.orSet !== null ? { orSet: a.orSet } : {}),
        ...(a.orIndex !== null ? { orIndex: a.orIndex } : {}),
        ...(a.orsInSet !== null ? { orsInSet: a.orsInSet } : {}),
        ...(a.company !== null ? { company: a.company } : {}),
      },
    ],
  },
};
