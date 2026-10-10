import { cashOf, counterOf, isPlayerBankrupt, presidentOf, unitsOf, type SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import type { CompanyId, Player, PlayerId } from "../types";
import { scoringOf } from "./endTriggers";
import { priceOf } from "./market";
import { operatingOrder } from "./operatingOrder";

/** One player's line in the final (or provisional) ranking (feature 007, data-model §6). */
export interface PlayerResult {
  readonly player: PlayerId;
  /** May be negative, never clamped. */
  readonly cash: number;
  /** Σ units × (price + bonus); 0 for companies with no price. */
  readonly sharesValue: number;
  /** null when eliminated. */
  readonly total: number | null;
  /** null when eliminated; equal ranks when the tie is shared. */
  readonly rank: number | null;
  /** bankrupt = a bankrupt player still scored (1830). */
  readonly status: "active" | "bankrupt" | "eliminated";
  /** rank === 1. */
  readonly winner: boolean;
  /** presidentEarliest only: the company whose presidency broke a tie in this player's favor. */
  readonly tieBreak?: CompanyId;
}

/** A share's final value: its price plus the game's bonus per unit of a company counter (21Moon §13). */
function shareValue(game: GameDefinition, state: SessionState, company: CompanyId): number {
  const price = priceOf(game, state, company);
  if (price === undefined) return 0;
  const bonus = scoringOf(game).shareBonus;
  return price + (bonus ? bonus.perUnit * counterOf(state, `company:${company}`, bonus.counter) : 0);
}

/**
 * The ranking (data-model §6): player cash plus player-held shares at their final value; company
 * treasuries, trains, privates and loans never count, and no debt is subtracted. Equal totals
 * share the rank (1, 1, 3), or with `presidentEarliest` go to the president of the company highest
 * in the operating order, then the next (RotLA B p.19). A player is bankrupt only when their
 * counter is above 0 in `state` (a bankruptcy after the end does not count): with
 * `bankruptPlayers: "scored"` they are ranked like anyone else (1830 C-2.5); with "eliminated" they
 * come last, latest elimination first, with no total or rank (FR-010).
 */
export function finalResults(
  game: GameDefinition,
  players: readonly Player[],
  state: SessionState,
  eliminationOrder: readonly PlayerId[],
): PlayerResult[] {
  const scoring = scoringOf(game);
  const order = operatingOrder(game, state);
  const firstPresided = (player: PlayerId) => {
    if (scoring.tieBreak !== "presidentEarliest") return 0;
    const i = order.findIndex((c) => presidentOf(state, c) === player);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const rows = players.map((p) => {
    const cash = cashOf(state, `player:${p.id}`);
    const sharesValue = game.companies.reduce((sum, c) => {
      const units = unitsOf(state, `player:${p.id}`, c.id);
      return units > 0 ? sum + units * shareValue(game, state, c.id) : sum;
    }, 0);
    const bankrupt = isPlayerBankrupt(state, p.id);
    return { player: p.id, seat: p.seat, cash, sharesValue, total: cash + sharesValue, bankrupt, eliminated: bankrupt && scoring.bankruptPlayers === "eliminated" };
  });

  const ranked = rows
    .filter((r) => !r.eliminated)
    .sort((a, b) => b.total - a.total || firstPresided(a.player) - firstPresided(b.player) || a.seat - b.seat);
  const results: PlayerResult[] = [];
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    const next = ranked[i + 1];
    // A tie the rule cannot break (shared, or neither presides above the other) shares the rank.
    const sameAsPrev = prev !== undefined && prev.total === r.total && firstPresided(prev.player) === firstPresided(r.player);
    const rank = sameAsPrev ? (results[i - 1]?.rank ?? i + 1) : i + 1;
    const wonTie = next !== undefined && next.total === r.total && firstPresided(r.player) < firstPresided(next.player);
    results.push({
      player: r.player,
      cash: r.cash,
      sharesValue: r.sharesValue,
      total: r.total,
      rank,
      status: r.bankrupt ? "bankrupt" : "active",
      winner: rank === 1,
      ...(wonTie ? { tieBreak: order[firstPresided(r.player)] } : {}),
    });
  });
  // Latest elimination first; a bankrupt player missing from the order (should not happen) goes last.
  const position = (p: PlayerId) => eliminationOrder.indexOf(p);
  const eliminated = rows.filter((x) => x.eliminated).sort((a, b) => position(b.player) - position(a.player));
  for (const r of eliminated) {
    results.push({ player: r.player, cash: r.cash, sharesValue: r.sharesValue, total: null, rank: null, status: "eliminated", winner: false });
  }
  return results;
}
