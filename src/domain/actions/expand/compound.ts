import { reduceAll } from "../../events/reduce";
import type { PrimitiveEvent } from "../../events/types";
import { AVAILABLE, unavailable, type ActionContext, type HandlerMap } from "../context";
import { ActionSchema, type Action, type ActionOf, type Warning } from "../schemas";
import { withCurrentCompany } from "../resolve";
import { runTriggers } from "../triggers";
import { handlerFor } from "./index";

type Step = { readonly action: Action; readonly ctx: ActionContext };

/** Parses the items and walks them against the interim state, each with its own triggers. */
function walk(ctx: ActionContext, a: ActionOf<"compound">): { steps: Step[]; events: PrimitiveEvent[]; error?: string } {
  let state = ctx.state;
  const steps: Step[] = [];
  const events: PrimitiveEvent[] = [];
  for (const [i, raw] of a.actions.entries()) {
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) return { steps, events, error: `Acción ${i + 1} no válida` };
    const step0 = { ...ctx, state };
    const action = withCurrentCompany(step0, parsed.data);
    if (action.type === "compound") return { steps, events, error: "Una acción compuesta no puede anidar otra" };
    const step = { ...ctx, state };
    const handler = handlerFor(step, action.type);
    if (!handler) return { steps, events, error: `Acción ${i + 1}: no disponible en este juego` };
    const ok = handler.available ? handler.available(step, action) : AVAILABLE;
    if (!ok.ok) return { steps, events, error: `Acción ${i + 1}: ${ok.reasonEs}` };
    const own = runTriggers({ ...step, stateBefore: state, action }, handler.expand(step, action));
    steps.push({ action, ctx: step });
    events.push(...own);
    state = reduceAll(state, own);
  }
  return { steps, events };
}

/** FR-071: one compound command, one group (a voice proposal with several tool calls). */
export const compoundHandlers: HandlerMap = {
  compound: {
    available: (ctx, a) => {
      if (!a) return AVAILABLE;
      const { error } = walk(ctx, a);
      return error ? unavailable(error) : AVAILABLE;
    },
    validate: (ctx, a) => {
      const warnings: Warning[] = [];
      for (const { action, ctx: step } of walk(ctx, a).steps) {
        const handler = handlerFor(step, action.type);
        if (handler?.validate) warnings.push(...handler.validate(step, action));
      }
      return warnings;
    },
    expand: (ctx, a) => walk(ctx, a).events,
  },
};

/** The parsed items of a compound action (for summaries). */
export function compoundItems(a: ActionOf<"compound">): Action[] {
  return a.actions.flatMap((raw) => {
    const parsed = ActionSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}
