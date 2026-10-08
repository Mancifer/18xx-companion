import type { ActionHandler, ActionContext, HandlerMap } from "../context";
import type { ActionType } from "../schemas";
import { enabledMechanics, allMechanics } from "../../mechanics/custom";
import { manualHandlers } from "./manual";
import { setupHandlers } from "./setup";

/** Core handlers by action type. Stories add their modules here. */
export const coreHandlers: HandlerMap = {
  ...setupHandlers,
  ...manualHandlers,
};

/** The mechanic that owns an action type, if any (its actions are unavailable unless enabled). */
export function ownerOf(type: ActionType): string | undefined {
  for (const m of allMechanics()) if (m.handlers?.[type]) return m.id;
  return undefined;
}

export function handlerFor<T extends ActionType>(ctx: ActionContext, type: T): ActionHandler<T> | undefined {
  const core = coreHandlers[type];
  if (core) return core;
  for (const m of enabledMechanics(ctx.game)) {
    const h = m.handlers?.[type];
    if (h) return h;
  }
  return undefined;
}
