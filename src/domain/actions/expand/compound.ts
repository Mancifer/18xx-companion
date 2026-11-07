import { reduceAll } from "../../events/reduce";
import type { PrimitiveEvent } from "../../events/types";
import { message, messageWith, type Message } from "../../../i18n/contract/domain";
import { AVAILABLE, type ActionContext, type HandlerMap } from "../context";
import { ActionSchema, type Action, type ActionOf, type Warning } from "../schemas";
import { withCurrentCompany } from "../resolve";
import { runTriggers } from "../triggers";
import { handlerFor } from "./index";

type Step = { readonly action: Action; readonly ctx: ActionContext };

/** Parses the items and walks them against the interim state, each with its own triggers. */
function walk(ctx: ActionContext, a: ActionOf<"compound">): { steps: Step[]; events: PrimitiveEvent[]; error?: Message } {
  let state = ctx.state;
  const steps: Step[] = [];
  const events: PrimitiveEvent[] = [];
  for (const [i, raw] of a.actions.entries()) {
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) return { steps, events, error: message("compound.invalidStep", { index: i + 1 }) };
    const step0 = { ...ctx, state };
    const action = withCurrentCompany(step0, parsed.data);
    if (action.type === "compound") return { steps, events, error: message("compound.nested", {}) };
    // The game-end fold reads a group's own action, so ending or reopening is an entry of its own.
    if (action.type === "endGame" || action.type === "reopenGame") {
      return { steps, events, error: message("compound.gameEndStep", { index: i + 1 }) };
    }
    const step = { ...ctx, state };
    const handler = handlerFor(step, action.type);
    if (!handler) return { steps, events, error: message("compound.notOffered", { index: i + 1 }) };
    const ok = handler.available ? handler.available(step, action) : AVAILABLE;
    if (!ok.ok) return { steps, events, error: messageWith("compound.stepUnavailable", { index: i + 1 }, ok.reason) };
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
      return error ? { ok: false, reason: error } : AVAILABLE;
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
