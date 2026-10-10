import { cashOf, isPlayerBankrupt, presidentOf, unitsOf, type SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import type { CompanyId, Player, PlayerId } from "../types";
import { priceOf } from "./market";
import { operatingOrder } from "./operatingOrder";

export interface Score {
  readonly player: PlayerId;
  readonly cash: number;
  /** Every share the player holds at its company's current price. */
  readonly sharesValue: number;
  /** null for an eliminated player (RotLA B p.17: removed from the game). */
  readonly total: number | null;
  readonly rank: number | null;
  readonly eliminated: boolean;
  /** The company whose presidency broke a tie in this player's favor. */
  readonly tieBreak?: CompanyId;
}

/**
 * Final scores (research R12, B p.19): cash plus shares at the current price; company treasuries
 * do not count. A tie goes to the president of the company highest in the current operating
 * order, then the next one. Eliminated players come last, with no total or rank.
 */
export function finalScores(game: GameDefinition, players: readonly Player[], state: SessionState): Score[] {
  const order = operatingOrder(game, state);
  const firstPresided = (player: PlayerId) => {
    const i = order.findIndex((c) => presidentOf(state, c) === player);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const rows = players.map((p) => {
    const cash = cashOf(state, `player:${p.id}`);
    const sharesValue = game.companies.reduce((sum, c) => {
      const units = unitsOf(state, `player:${p.id}`, c.id);
      return units > 0 ? sum + units * (priceOf(game, state, c.id) ?? 0) : sum;
    }, 0);
    return { player: p.id, seat: p.seat, cash, sharesValue, eliminated: isPlayerBankrupt(state, p.id) };
  });

  const active = rows
    .filter((r) => !r.eliminated)
    .sort((a, b) => b.cash + b.sharesValue - (a.cash + a.sharesValue) || firstPresided(a.player) - firstPresided(b.player) || a.seat - b.seat);
  const scores: Score[] = [];
  active.forEach((r, i) => {
    const total = r.cash + r.sharesValue;
    const prev = active[i - 1];
    const next = active[i + 1];
    const tiedWith = (o: typeof r | undefined) => o !== undefined && o.cash + o.sharesValue === total;
    // An unbroken tie (neither presides anything above the other) shares the rank.
    const sameAsPrev = tiedWith(prev) && prev !== undefined && firstPresided(prev.player) === firstPresided(r.player);
    const rank = sameAsPrev ? (scores[i - 1]?.rank ?? i + 1) : i + 1;
    const wonTie = tiedWith(next) && next !== undefined && firstPresided(r.player) < firstPresided(next.player);
    scores.push({
      player: r.player,
      cash: r.cash,
      sharesValue: r.sharesValue,
      total,
      rank,
      eliminated: false,
      ...(wonTie ? { tieBreak: order[firstPresided(r.player)] } : {}),
    });
  });
  for (const r of rows.filter((x) => x.eliminated)) {
    scores.push({ player: r.player, cash: r.cash, sharesValue: r.sharesValue, total: null, rank: null, eliminated: true });
  }
  return scores;
}
