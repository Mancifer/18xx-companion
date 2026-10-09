import type { SessionState } from "../events/state";
import { certificateCount, presidencyHolder, unitsOf } from "../events/state";
import type { GameDefinition } from "../games/schema";
import { cellAt } from "../mechanics/market";
import { parseHolder, type CompanyId, type HolderRef } from "../types";
import { warning, type ActionContext } from "./context";
import type { Warning } from "./schemas";

/**
 * Holding limits as warnings (FR-025, T111): certificate limit by player count (1830 market zones
 * relax it), per-company percent, and the pool limit. Never blocking.
 */

const def = (game: GameDefinition, company: CompanyId) => game.companies.find((c) => c.id === company);

type Zone = "yellow" | "orange" | "brown" | undefined;
const zoneOf = (game: GameDefinition, state: SessionState, company: CompanyId): Zone =>
  cellAt(game, state.companies[company]?.position)?.zone;

/** Certificates toward the limit: 1830 yellow, orange and brown zones do not count (§5.4). */
function limitedCertificates(game: GameDefinition, state: SessionState, player: string): number {
  let count = certificateCount(game, state, player);
  for (const c of game.companies) {
    if (!zoneOf(game, state, c.id)) continue;
    const ref: HolderRef = `player:${player}`;
    const units = unitsOf(state, ref, c.id);
    if (units <= 0) continue;
    count -= presidencyHolder(state, c.id) === ref ? 1 + Math.max(0, units - c.presidencyUnits) : units;
  }
  return count;
}

export function holdingWarnings(ctx: ActionContext, after: SessionState, holder: HolderRef, company: CompanyId): Warning[] {
  const warnings: Warning[] = [];
  const h = parseHolder(holder);
  if (h.kind !== "player") return warnings;
  const n = String(ctx.players.length);
  const limit = ctx.game.limits.certificates[n];
  const certs = limitedCertificates(ctx.game, after, h.id);
  if (limit !== undefined && certs > limit) {
    warnings.push(warning("certificateLimit", `Tendría ${certs} certificados; el límite es ${limit}.`));
  }
  const zone = zoneOf(ctx.game, after, company);
  const percentLimit = ctx.game.limits.perCompanyPercentByPlayers?.[n] ?? ctx.game.limits.perCompanyPercent;
  const shareCount = after.companies[company]?.shareCount ?? 10;
  const percent = (unitsOf(after, holder, company) * 100) / shareCount;
  const national = def(ctx.game, company)?.kind === "national";
  if (!national && percent > percentLimit && zone !== "orange" && zone !== "brown") {
    warnings.push(warning("companyLimit", `Tendría el ${percent}% de la compañía; el límite es ${percentLimit}%.`));
  }
  return warnings;
}

export function poolWarnings(ctx: ActionContext, after: SessionState, company: CompanyId): Warning[] {
  const { maxCerts, maxPercent } = ctx.game.limits.pool;
  const units = unitsOf(after, "pool", company);
  const shareCount = after.companies[company]?.shareCount ?? 10;
  if (maxCerts !== undefined && units > maxCerts) {
    return [warning("poolLimit", `El pool tendría ${units} certificados; el máximo es ${maxCerts}.`)];
  }
  if (maxPercent !== undefined && (units * 100) / shareCount > maxPercent) {
    return [warning("poolLimit", `El pool tendría el ${(units * 100) / shareCount}%; el máximo es ${maxPercent}%.`)];
  }
  return [];
}
