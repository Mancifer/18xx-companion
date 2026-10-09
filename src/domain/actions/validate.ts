import { warning, type ActionContext } from "./context";
import { handlerFor } from "./expand";
import { CURRENT_COMPANY_ACTIONS } from "./resolve";
import type { Action, Warning } from "./schemas";

/** Operating actions that belong to one company's turn (FR-012). */
const TURN_ACTIONS: ReadonlySet<string> = new Set([...CURRENT_COMPANY_ACTIONS, "discardTrain"]);

/** Likely rule breaks for an action. Never throws and never blocks (FR-025). */
export function validateAction(ctx: ActionContext, action: Action): Warning[] {
  const handler = handlerFor(ctx, action.type);
  return [...handlerWarnings(ctx, action, handler?.validate), ...turnWarnings(ctx, action)];
}

function handlerWarnings(
  ctx: ActionContext,
  action: Action,
  validate: ((ctx: ActionContext, action: never) => Warning[]) | undefined,
): Warning[] {
  try {
    return validate ? validate(ctx, action as never) : [];
  } catch {
    return [];
  }
}

/** An operating action for a company whose turn it is not is applied, and marked (FR-012). */
function turnWarnings(ctx: ActionContext, action: Action): Warning[] {
  const { turn } = ctx.state;
  if (turn.round !== "OR" || turn.currentCompany === undefined || !TURN_ACTIONS.has(action.type)) return [];
  const company = "company" in action ? action.company : null;
  if (!company || company === turn.currentCompany) return [];
  const short = (id: string) => ctx.game.companies.find((c) => c.id === id)?.shortName ?? id;
  return [warning("outOfTurn", `${short(company)} opera fuera de turno (le toca a ${short(turn.currentCompany)}).`)];
}
