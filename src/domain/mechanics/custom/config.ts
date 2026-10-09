import type { z } from "zod";
import type { GameDefinition } from "../../games/schema";

/**
 * A mechanic's parsed config, or undefined when the game does not enable it. Lives apart from
 * the registry so mechanics can read their own config without importing it (no cycle).
 */
export function mechanicConfigOf<C>(game: GameDefinition, id: string, schema: z.ZodType<C>): C | undefined {
  const rule = game.customRules.find((r) => r.id === id);
  if (!rule) return undefined;
  return schema.parse(rule.config);
}
