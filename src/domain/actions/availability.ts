import { AVAILABLE, unavailable, type ActionContext, type AvailabilityResult } from "./context";
import { handlerFor, ownerOf } from "./expand";
import type { ActionOf, ActionType } from "./schemas";

/**
 * Whether an action is offered at all in this game and state (contracts/actions.md). Actions of
 * a mechanic the game does not enable are never offered; voice tools for them are not sent.
 */
export function availabilityOf<T extends ActionType>(
  ctx: ActionContext,
  type: T,
  action?: ActionOf<T>,
): AvailabilityResult {
  const handler = handlerFor(ctx, type);
  if (!handler) {
    return ownerOf(type) ? unavailable("action.notInGame", {}) : unavailable("action.unknown", {});
  }
  if (handler.offered && !handler.offered(ctx.game)) return unavailable("action.notInGame", {});
  return handler.available ? handler.available(ctx, action) : AVAILABLE;
}

export function isAvailable(ctx: ActionContext, type: ActionType): boolean {
  return availabilityOf(ctx, type).ok;
}
