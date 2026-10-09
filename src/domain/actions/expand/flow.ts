import { reduceAll } from "../../events/reduce";
import type { PrimitiveEvent } from "../../events/types";
import { pendingCapitalEvents } from "../../mechanics/capitalization";
import { nextToOperate, operatingOrder } from "../../mechanics/operatingOrder";
import { phaseIndex } from "../../mechanics/phases";
import { endOfRoundMoves } from "../../mechanics/roundEnd";
import { slotIndex, startOREvents } from "../../mechanics/schedule";
import { AVAILABLE, unavailable, warning, type ActionContext, type ActionHandler, type HandlerMap } from "../context";
import type { Warning } from "../schemas";
import { operatingHandlers, zeroRunAction } from "./operating";

const runAndPayout = operatingHandlers.runAndPayout as ActionHandler<"runAndPayout">;

/** Round flow and turn tracking (US4 T106, US7 T150). */

/** The current company when it has no run recorded in this OR, with the run it gets. */
function unrecordedRun(ctx: ActionContext) {
  const current = ctx.state.turn.currentCompany;
  if (!current || ctx.state.turn.operatedThisOR.includes(current)) return undefined;
  const national = ctx.game.companies.find((c) => c.id === current)?.kind === "national";
  return { company: current, run: national ? undefined : zeroRunAction(ctx.game, current) };
}

/** What nextCompany does: the run it records, and where the turn goes next. */
function nextCompanyEvents(ctx: ActionContext): { events: PrimitiveEvent[]; setComplete: boolean } {
  const { game, state } = ctx;
  const events: PrimitiveEvent[] = [];
  // A turn with no run counts as "did not run": the game's withhold move (data-model §5). A
  // national company has no run of its own and only counts as operated.
  const missing = unrecordedRun(ctx);
  if (missing?.run) events.push(...runAndPayout.expand(ctx, missing.run));
  else if (missing) events.push({ t: "counterChange", subject: `company:${missing.company}`, key: "runs", delta: 1 });
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
    validate: (ctx) => {
      const warnings: Warning[] = [];
      const missing = unrecordedRun(ctx);
      if (missing) {
        const name = ctx.game.companies.find((c) => c.id === missing.company)?.shortName ?? missing.company;
        warnings.push(
          missing.run
            ? warning("noRunRecorded", `No se registró la operación de ${name}: cuenta como que no corrió y su acción baja.`)
            : warning("noRunRecorded", `No se registró la operación de ${name}: cuenta como que operó.`, "info"),
        );
        if (missing.run) warnings.push(...(runAndPayout.validate?.(ctx, missing.run) ?? []));
      }
      if (nextCompanyEvents(ctx).setComplete) {
        warnings.push(warning("setComplete", "Fin de las rondas de operaciones: empieza la ronda de acciones.", "info"));
      }
      return warnings;
    },
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
