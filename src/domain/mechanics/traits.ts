import { counterOf, type SessionState } from "../events/state";
import type { CompanyTraits, GameDefinition } from "../games/schema";
import type { CompanyId } from "../types";

/** The counter a merger sets on the major for each minor that formed it (research R8). */
export const MERGED_FROM = "mergedFrom:";

/** The minors that formed a company (its `mergedFrom:<id>` counters), in definition order. */
export function mergedFrom(game: GameDefinition, state: SessionState, company: CompanyId): CompanyId[] {
  return game.companies.map((c) => c.id).filter((id) => counterOf(state, `company:${company}`, `${MERGED_FROM}${id}`) > 0);
}

/**
 * A company's traits plus those of every company that merged into it (B p.18: a major keeps the
 * abilities of its minors). Bonuses add up, booleans are OR-ed, lists are concatenated.
 */
export function effectiveTraits(game: GameDefinition, state: SessionState, company: CompanyId): CompanyTraits {
  const sources = [company, ...mergedFrom(game, state, company)];
  const result: { -readonly [K in keyof CompanyTraits]: CompanyTraits[K] } = {};
  for (const id of sources) {
    const traits = game.companies.find((c) => c.id === id)?.traits;
    if (!traits) continue;
    if (traits.trainLimitBonus !== undefined) result.trainLimitBonus = (result.trainLimitBonus ?? 0) + traits.trainLimitBonus;
    if (traits.keepsRustedTrains) result.keepsRustedTrains = true;
    if (traits.noLeadoffTrain) result.noLeadoffTrain = true;
    if (traits.launchFee !== undefined) result.launchFee = (result.launchFee ?? 0) + traits.launchFee;
    if (traits.launchAssets) result.launchAssets = [...(result.launchAssets ?? []), ...traits.launchAssets];
    if (traits.payments) result.payments = [...(result.payments ?? []), ...traits.payments];
  }
  return result;
}

/** The company's name, or its second identity's when a merger chose it (the `identity` counter). */
export function displayName(game: GameDefinition, state: SessionState, company: CompanyId): string {
  const def = game.companies.find((c) => c.id === company);
  if (!def) return company;
  return def.altName !== undefined && counterOf(state, `company:${company}`, "identity") > 0 ? def.altName : def.name;
}
