import { deepFreeze } from "./marketText";
import { g1830 } from "./g1830";
import { g1848 } from "./g1848";
import { g21moon } from "./g21moon";
import type { CustomRule, GameDefinition } from "./schema";

/** Built-in definitions, deeply frozen so no edit can reach them (US1-5). */
export const builtInGames: readonly GameDefinition[] = [g1830, g1848, g21moon].map((g) => deepFreeze(g));

export function getBuiltInGame(id: string): GameDefinition {
  const game = builtInGames.find((g) => g.id === id);
  if (!game) throw new Error(`Unknown built-in game ${id}`);
  return game;
}

export function hasUnverified(game: GameDefinition): boolean {
  return Object.values(game.verification).some((v) => v === "unverified");
}

/** The value each option takes: the given one, else the default, else a random choice. */
export function resolveOptions(
  game: GameDefinition,
  options: Readonly<Record<string, string>>,
  random: () => number = Math.random,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const option of game.options) {
    const given = options[option.id];
    if (given !== undefined && option.choices.some((c) => c.value === given)) {
      resolved[option.id] = given;
    } else if (option.default !== null) {
      resolved[option.id] = option.default;
    } else {
      const pick = option.choices[Math.floor(random() * option.choices.length)] ?? option.choices[0];
      if (pick) resolved[option.id] = pick.value;
    }
  }
  return resolved;
}

/**
 * The session's frozen copy (FR-005): each option's chosen value applied as a patch
 * (contracts/game-definition.md rule 2). Unknown or missing values fall back as in
 * resolveOptions; pass the resolved options to keep a random pick stable.
 */
export function applyOptions(game: GameDefinition, options: Readonly<Record<string, string>>): GameDefinition {
  const resolved = resolveOptions(game, options, () => 0);
  const def: GameDefinition = structuredClone(game);
  const addRules: CustomRule[] = [];
  for (const option of def.options) {
    const choice = option.choices.find((c) => c.value === resolved[option.id]);
    if (!choice) continue;
    if (choice.addCustomRules) addRules.push(...choice.addCustomRules);
    if (choice.companyAvailableFrom !== undefined) {
      const slot = choice.companyAvailableFrom;
      def.companies = def.companies.map((c) => (c.id === choice.value ? { ...c, availableFrom: slot } : c));
    }
  }
  def.customRules = [...def.customRules, ...addRules.filter((r) => !def.customRules.some((x) => x.id === r.id))];
  return deepFreeze(def);
}
