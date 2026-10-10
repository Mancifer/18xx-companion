import { deepFreeze } from "./marketText";
import { g1830 } from "./g1830";
import { g1848 } from "./g1848";
import { g21moon } from "./g21moon";
import { grotla } from "./grotla";
import type { Warning } from "../actions/schemas";
import type { CustomRule, GameDefinition, OptionDef } from "./schema";
import { validateDefinition } from "./validateDefinition";

/** Built-in definitions, deeply frozen so no edit can reach them (US1-5). */
export const builtInGames: readonly GameDefinition[] = [g1830, g1848, g21moon, grotla].map((g) => deepFreeze(g));

export function getBuiltInGame(id: string): GameDefinition {
  const game = builtInGames.find((g) => g.id === id);
  if (!game) throw new Error(`Unknown built-in game ${id}`);
  return game;
}

/**
 * The built-in game a definition comes from (`basedOn ?? id`), or undefined for a hand-written one.
 * Sessions keep their own copy of the definition, so blocks added later (`scoring`) are read from
 * here for sessions and custom games saved before them (research R16). Never throws.
 */
export function builtInBase(game: GameDefinition): GameDefinition | undefined {
  const id = game.basedOn ?? game.id;
  return builtInGames.find((g) => g.id === id);
}

/** A definition with no `scoring` block and no built-in to inherit it from counts as unverified (FR-011). */
export function hasUnverified(game: GameDefinition): boolean {
  if (!game.scoring && !builtInBase(game)?.scoring) return true;
  return Object.values(game.verification).some((v) => v === "unverified");
}

/** A companySubset option keeps every eligible company with this value. */
export const ALL_COMPANIES = "all";

/** The company ids a companySubset value lists ("all" = every eligible one). */
export function subsetIds(option: OptionDef, value: string | undefined): string[] {
  if (value === undefined || value === ALL_COMPANIES) return [...(option.from ?? [])];
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
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
    if (given !== undefined && (option.kind === "companySubset" || option.choices.some((c) => c.value === given))) {
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

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** RFC 7386 JSON merge patch: objects merge, arrays and scalars replace, null deletes a key. */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isObject(patch)) return structuredClone(patch);
  const base: Record<string, unknown> = isObject(target) ? target : {};
  const deleted = new Set(Object.keys(patch).filter((key) => patch[key] === null));
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(base).filter(([key]) => !deleted.has(key)));
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null) result[key] = mergePatch(base[key], value);
  }
  return result;
}

/**
 * The session's frozen copy (FR-005): each option's chosen value applied in definition order
 * (data-model §1 "Applying options"): removeCompanies, addCompanies, the merge patch, then
 * addCustomRules; a companySubset drops the eligible companies it does not list. Unknown or
 * missing values fall back as in resolveOptions; pass the resolved options to keep a random pick
 * stable. Throws, listing the errors, when the result is not a valid definition.
 */
export function applyOptions(game: GameDefinition, options: Readonly<Record<string, string>>): GameDefinition {
  const resolved = resolveOptions(game, options, () => 0);
  let def: GameDefinition = structuredClone(game);
  for (const option of game.options) {
    if (option.kind === "companySubset") {
      const keep = new Set(subsetIds(option, resolved[option.id]));
      const eligible = new Set(option.from ?? []);
      def.companies = def.companies.filter((c) => !eligible.has(c.id) || keep.has(c.id));
      continue;
    }
    const choice = option.choices.find((c) => c.value === resolved[option.id]);
    if (!choice) continue;
    if (choice.companyAvailableFrom !== undefined) {
      const slot = choice.companyAvailableFrom;
      def.companies = def.companies.map((c) => (c.id === choice.value ? { ...c, availableFrom: slot } : c));
    }
    if (choice.removeCompanies) {
      const removed = new Set(choice.removeCompanies);
      def.companies = def.companies.filter((c) => !removed.has(c.id));
    }
    if (choice.addCompanies) def.companies = [...def.companies, ...structuredClone(choice.addCompanies)];
    if (choice.addTrains) def.trains = [...def.trains, ...structuredClone(choice.addTrains)];
    for (const { tier, patch } of choice.patchCompanies ?? []) {
      def.companies = def.companies.map((c) => (tier === undefined || c.tier === tier ? (mergePatch(c, patch) as typeof c) : c));
    }
    if (choice.patch) def = mergePatch(def, choice.patch) as GameDefinition;
    const rules: CustomRule[] = choice.addCustomRules ?? [];
    def.customRules = [...def.customRules, ...rules.filter((r) => !def.customRules.some((x) => x.id === r.id))];
  }
  if (game.options.length > 0) {
    const result = validateDefinition(def, { patched: true });
    if (!result.ok) throw new Error(`Opciones no válidas:\n${result.errors.join("\n")}`);
  }
  return deepFreeze(def);
}

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/**
 * New Session warnings for the chosen options (US1-2, US1-4). They never block: a mode played
 * outside its recommended player count, or a minors-in-play count other than the mode's.
 */
export function optionWarnings(game: GameDefinition, options: Readonly<Record<string, string>>, playerCount: number): Warning[] {
  const resolved = resolveOptions(game, options, () => 0);
  const warnings: Warning[] = [];
  for (const option of game.options) {
    if (option.kind === "companySubset") continue;
    const choice = option.choices.find((c) => c.value === resolved[option.id]);
    const rec = choice?.recommendedPlayers;
    if (choice && rec && (playerCount < rec.min || playerCount > rec.max)) {
      warnings.push({
        code: "recommendedPlayers",
        messageEs: `El juego ${choice.label.toLocaleLowerCase("es")} es para ${range(rec.min, rec.max)} jugadores.`,
        severity: "warn",
      });
    }
  }
  let patched: GameDefinition | undefined;
  try {
    patched = applyOptions(game, resolved);
  } catch {
    return warnings;
  }
  for (const option of game.options) {
    if (option.kind !== "companySubset" || !option.size) continue;
    const expected = Object.entries(option.size).find(([value]) => Object.values(resolved).includes(value))?.[1];
    const eligible = new Set(option.from ?? []);
    const count = patched.companies.filter((c) => eligible.has(c.id)).length;
    if (expected !== undefined && count !== expected) {
      warnings.push({
        code: option.id,
        messageEs: `${option.label}: hay ${count}; este modo usa ${expected}.`,
        severity: "warn",
      });
    }
  }
  return warnings;
}
