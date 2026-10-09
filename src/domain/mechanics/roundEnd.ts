import { hasOperated, holdersOf, type SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { parseHolder, type CompanyId } from "../types";
import { pendingCapitalEvents } from "./capitalization";
import { moveTarget, priceOf } from "./market";

const MOVING = new Set(["parred", "floated", "receivership"]);

/** Companies on the grid, highest price first (end-of-round moves go in this order). */
export function byPriceDesc(game: GameDefinition, state: SessionState): CompanyId[] {
  return game.companies
    .map((c) => c.id)
    .filter((id) => {
      const r = state.companies[id];
      return r?.position !== undefined && !("index" in r.position) && MOVING.has(r.status);
    })
    .map((id, order) => ({ id, order, price: priceOf(game, state, id) ?? 0 }))
    .sort((a, b) => b.price - a.price || a.order - b.order)
    .map((c) => c.id);
}

/**
 * Sold-out moves (1830 §5.5, 1848 §12.6.1, 21Moon §10.3: up 1 when every share is held by
 * players, or by players and companies) and the 21Moon pool penalty (down 1 with shares in the
 * pool, once the company has operated), at the end of the given round, in descending price order.
 * 1-D tracks (the BoE) never move here.
 */
export function endOfRoundMoves(game: GameDefinition, state: SessionState, at: "endSR" | "endCR"): PrimitiveEvent[] {
  const soldOut = game.market.moves.soldOut;
  const penalty = game.market.moves.poolPenalty;
  const events: PrimitiveEvent[] = [];
  for (const company of byPriceDesc(game, state)) {
    const record = state.companies[company];
    if (!record) continue;
    let held = 0;
    let pool = 0;
    for (const [holder, units] of holdersOf(state, company)) {
      const kind = parseHolder(holder).kind;
      if (kind === "player" || (kind === "company" && soldOut?.heldBy === "playersAndCompanies")) held += units;
      if (kind === "pool") pool += units;
    }
    let target;
    if (soldOut?.at === at && held === record.shareCount) {
      target = moveTarget(game, record.position, "up", 1);
      if (target) events.push({ t: "marketMove", company, to: target, reason: "soldOut" });
    } else if (penalty?.at === at && pool > 0 && (!penalty.onlyIfOperated || hasOperated(state, company))) {
      target = moveTarget(game, record.position, "down", 1);
      if (target) events.push({ t: "marketMove", company, to: target, reason: "poolPenalty" });
    }
  }
  return events;
}

/**
 * The end step of the current round (feature 003, data-model §3), applied at most once per round:
 * - SR: the capital of companies floated during the SR (1830 §6.3), then the sold-out moves
 *   (1830 §5.5, 1848 §12.6.1), then the `roundEnd: "SR"` marker.
 * - CR: the sold-out moves and pool penalty (21Moon §10.3), then the `roundEnd: "CR"` marker.
 * - OR, PRIVATES, or a round whose end step was already applied: nothing.
 */
export function roundEndEvents(game: GameDefinition, state: SessionState): PrimitiveEvent[] {
  if (state.turn.roundEnded) return [];
  switch (state.turn.round) {
    case "SR":
      return [
        ...pendingCapitalEvents(game, state),
        ...endOfRoundMoves(game, state, "endSR"),
        { t: "turnAdvance", roundEnd: "SR" },
      ];
    case "CR":
      return [...endOfRoundMoves(game, state, "endCR"), { t: "turnAdvance", roundEnd: "CR" }];
    default:
      return [];
  }
}
