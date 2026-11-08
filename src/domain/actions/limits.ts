import type { SessionState } from "../events/state";
import { hasOperated, isPlayerBankrupt, presidencyHolder, unitsOf } from "../events/state";
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

/** Feature 016 (data-model): what a player holds in one company, as cards on the table. */
export interface HoldingRow {
  readonly company: CompanyId;
  readonly units: number;
  readonly percent: number;
  /** Cards: the president's certificate is one, whatever its units. */
  readonly certificates: number;
  readonly president: boolean;
  /** False where the market zone exempts the company from the limit (1830 yellow/orange/brown, §5.4). */
  readonly counts: boolean;
}

export interface CertificateStatus {
  readonly rows: readonly HoldingRow[];
  readonly total: number;
  readonly counted: number;
  /** The game's limit for this player count; absent when the game defines none. */
  readonly limit?: number;
  readonly level: "under" | "at" | "over";
}

/**
 * A player's certificates per company and toward the limit (FR-025; feature 016, US2). The one
 * place this rule lives: the player sheet shows it and the limit warning reads it.
 */
export function certificateStatus(game: GameDefinition, state: SessionState, player: string, playerCount: number): CertificateStatus {
  const ref: HolderRef = `player:${player}`;
  const rows: HoldingRow[] = [];
  for (const c of game.companies) {
    const units = unitsOf(state, ref, c.id);
    if (units <= 0) continue;
    const president = presidencyHolder(state, c.id) === ref;
    const shareCount = state.companies[c.id]?.shareCount ?? c.shareCount;
    rows.push({
      company: c.id,
      units,
      percent: (units * 100) / shareCount,
      certificates: president ? 1 + Math.max(0, units - c.presidencyUnits) : units,
      president,
      counts: !zoneOf(game, state, c.id),
    });
  }
  const total = rows.reduce((n, r) => n + r.certificates, 0);
  const counted = rows.reduce((n, r) => n + (r.counts ? r.certificates : 0), 0);
  const limit = game.limits.certificates[String(playerCount)];
  const level = limit === undefined || counted < limit ? "under" : counted === limit ? "at" : "over";
  return { rows, total, counted, ...(limit !== undefined ? { limit } : {}), level };
}

export function holdingWarnings(ctx: ActionContext, after: SessionState, holder: HolderRef, company: CompanyId): Warning[] {
  const warnings: Warning[] = [];
  const h = parseHolder(holder);
  if (h.kind !== "player") return warnings;
  const n = String(ctx.players.length);
  const status = certificateStatus(ctx.game, after, h.id, ctx.players.length);
  if (status.limit !== undefined && status.level === "over") {
    warnings.push(warning(ctx, "certificateLimit", { certs: status.counted, limit: status.limit }));
  }
  const zone = zoneOf(ctx.game, after, company);
  const percentLimit = ctx.game.limits.perCompanyPercentByPlayers?.[n] ?? ctx.game.limits.perCompanyPercent;
  const shareCount = after.companies[company]?.shareCount ?? 10;
  const percent = (unitsOf(after, holder, company) * 100) / shareCount;
  const national = def(ctx.game, company)?.kind === "national";
  if (!national && percent > percentLimit && zone !== "orange" && zone !== "brown") {
    warnings.push(warning(ctx, "companyLimit", { percent, limit: percentLimit }));
  }
  return warnings;
}

export function poolWarnings(ctx: ActionContext, after: SessionState, company: CompanyId): Warning[] {
  const { maxCerts, maxPercent } = ctx.game.limits.pool;
  const units = unitsOf(after, "pool", company);
  const shareCount = after.companies[company]?.shareCount ?? 10;
  if (maxCerts !== undefined && units > maxCerts) {
    return [warning(ctx, "poolLimit", { units, maxCerts })];
  }
  if (maxPercent !== undefined && (units * 100) / shareCount > maxPercent) {
    return [warning(ctx, "poolLimit", { percent: (units * 100) / shareCount, maxPercent })];
  }
  return [];
}

/** RotLA B p.11: one share per purchase (limits.maxSharesPerBuy). */
export function sharesPerBuyWarnings(ctx: ActionContext, count: number): Warning[] {
  const max = ctx.game.limits.maxSharesPerBuy;
  if (max === undefined || count <= max) return [];
  return [warning(ctx, "maxSharesPerBuy", { max })];
}

/** RotLA B p.10: a player sells a company only after it has operated (sell.warnUnlessOperated). */
export function unoperatedSaleWarnings(ctx: ActionContext, seller: HolderRef, company: CompanyId): Warning[] {
  if (!ctx.game.market.moves.sell.warnUnlessOperated || parseHolder(seller).kind !== "player") return [];
  if (hasOperated(ctx.state, company)) return [];
  return [warning(ctx, "notOperated", {})];
}

/** A player out of the game after a bankruptcy (RotLA B p.17) is named in an action: warn only. */
export function eliminatedWarnings(ctx: ActionContext, holder: HolderRef): Warning[] {
  const h = parseHolder(holder);
  if (h.kind !== "player" || !isPlayerBankrupt(ctx.state, h.id)) return [];
  return [warning(ctx, "eliminatedPlayer", { player: h.id })];
}
