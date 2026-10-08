import type { ActionContext } from "./context";
import { handlerFor } from "./expand";
import type { Action, Warning } from "./schemas";

/** Likely rule breaks for an action. Never throws and never blocks (FR-025). */
export function validateAction(ctx: ActionContext, action: Action): Warning[] {
  const handler = handlerFor(ctx, action.type);
  if (!handler?.validate) return [];
  try {
    return handler.validate(ctx, action);
  } catch {
    return [];
  }
}
