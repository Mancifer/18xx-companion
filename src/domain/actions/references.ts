import type { ActionContext } from "./context";
import type { Action } from "./schemas";

const ENTITY_REF = /^(player|company|ipo):(.+)$/;
/** Payload keys that name a company or a player directly. */
const COMPANY_KEYS = new Set(["company", "seller"]);
const PLAYER_KEYS = new Set(["player"]);
const PRIVATE_KEYS = new Set(["private"]);
const TRAIN_KEYS = new Set(["trainType", "tradeIn"]);

/**
 * Every entity an action names must exist in this session (the voice tools use enums for the
 * same reason). Returns issues in the same "path: message" form as Zod.
 */
export function referenceIssues(ctx: ActionContext, action: Action): string[] {
  if (action.type === "createSession") return [];
  const companies = new Set(ctx.game.companies.map((c) => c.id));
  const players = new Set(ctx.players.map((p) => p.id));
  const privates = new Set(ctx.game.privates.map((p) => p.id));
  const trains = new Set(ctx.game.trains.map((t) => t.type));
  const issues: string[] = [];

  const visit = (value: unknown, path: string[]): void => {
    if (typeof value === "string") {
      const key = path[path.length - 1] ?? "";
      const match = ENTITY_REF.exec(value);
      if (match) {
        const [, kind, id = ""] = match;
        const known = kind === "player" ? players.has(id) : companies.has(id);
        if (!known) issues.push(`${path.join(".")}: unknown ${kind} "${id}"`);
      } else if (COMPANY_KEYS.has(key) && !companies.has(value)) {
        issues.push(`${path.join(".")}: unknown company "${value}"`);
      } else if (PLAYER_KEYS.has(key) && !players.has(value)) {
        issues.push(`${path.join(".")}: unknown player "${value}"`);
      } else if (PRIVATE_KEYS.has(key) && !privates.has(value)) {
        issues.push(`${path.join(".")}: unknown private "${value}"`);
      } else if (TRAIN_KEYS.has(key) && !trains.has(value)) {
        issues.push(`${path.join(".")}: unknown train "${value}"`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        visit(v, [...path, String(i)]);
      });
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) visit(v, [...path, k]);
    }
  };

  visit(action, []);
  return issues;
}
