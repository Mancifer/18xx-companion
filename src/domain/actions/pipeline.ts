import type { PrimitiveEvent } from "../events/types";
import { touchesOf } from "../ledger/entries";
import { availabilityOf } from "./availability";
import type { ActionContext, ActionHandler } from "./context";
import { handlerFor } from "./expand";
import { referenceIssues } from "./references";
import { withCurrentCompany } from "./resolve";
import { runTriggers } from "./triggers";
import { ActionSchema, type Action, type ActionType, type Warning } from "./schemas";
import { validateAction } from "./validate";

export type PipelineResult =
  | {
      readonly kind: "ok";
      readonly action: Action;
      readonly events: readonly PrimitiveEvent[];
      readonly warnings: readonly Warning[];
      readonly touches: readonly string[];
    }
  | { readonly kind: "invalid"; readonly issues: readonly string[] }
  | { readonly kind: "unavailable"; readonly reasonEs: string };

/**
 * The one path for touch and voice (constitution V):
 * parse (Zod) → entity references → availability → validate (warnings) → expand → triggers.
 */
export function runPipeline(ctx: ActionContext, input: unknown): PipelineResult {
  const parsed = ActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "invalid",
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const action = withCurrentCompany(ctx, parsed.data);
  const unknown = referenceIssues(ctx, action);
  if (unknown.length > 0) return { kind: "invalid", issues: unknown };
  const availability = availabilityOf(ctx, action.type, action);
  if (!availability.ok) return { kind: "unavailable", reasonEs: availability.reasonEs };

  const warnings = validateAction(ctx, action);
  const events = expandAction(ctx, action);
  const all = runTriggers({ game: ctx.game, players: ctx.players, stateBefore: ctx.state, action }, events);
  return { kind: "ok", action, events: all, warnings, touches: touchesOf(all) };
}

/** Expansion only (no triggers), for compound actions and amends. */
export function expandAction(ctx: ActionContext, action: Action): PrimitiveEvent[] {
  const handler: ActionHandler<ActionType> | undefined = handlerFor<ActionType>(ctx, action.type);
  if (!handler) throw new Error(`No handler for ${action.type}`);
  return handler.expand(ctx, action);
}
