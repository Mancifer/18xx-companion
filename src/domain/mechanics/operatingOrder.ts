import type { SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import { cellEquals, type CompanyId } from "../types";
import { OPERATING_STATUSES, priceOf } from "./market";

/**
 * Operating order (FR-051, data-model §9): companies that are floated or in receivership, the
 * `before` companies first (the 1848 BoE), then by price descending with the game's tie-breakers:
 * `stackTop` (same cell: the token on top, i.e. the earlier arrival), `columnRight`, `rowTop`.
 */
export function operatingOrder(game: GameDefinition, state: SessionState): CompanyId[] {
  const before = game.orOrder.before ?? [];
  const operating = game.companies
    .map((c) => c.id)
    .filter((id) => OPERATING_STATUSES.has(state.companies[id]?.status ?? ""));
  const first = before.filter((id) => operating.includes(id));
  const rest = operating.filter((id) => !before.includes(id));

  const compare = (a: CompanyId, b: CompanyId): number => {
    const price = (priceOf(game, state, b) ?? 0) - (priceOf(game, state, a) ?? 0);
    if (price !== 0) return price;
    const ra = state.companies[a];
    const rb = state.companies[b];
    const pa = ra?.position;
    const pb = rb?.position;
    for (const tie of game.orOrder.ties) {
      if (tie === "stackTop") {
        if (cellEquals(pa, pb) && ra && rb && ra.stackOrder !== rb.stackOrder) return ra.stackOrder - rb.stackOrder;
        continue;
      }
      if (!pa || !pb || "index" in pa || "index" in pb) continue;
      if (tie === "columnRight" && pa.col !== pb.col) return pb.col - pa.col;
      if (tie === "rowTop" && pa.row !== pb.row) return pa.row - pb.row;
    }
    return 0;
  };
  return [...first, ...[...rest].sort(compare)];
}

/** The next company to operate: the highest-ranked one without a run in this OR (dynamic). */
export function nextToOperate(game: GameDefinition, state: SessionState): CompanyId | undefined {
  return operatingOrder(game, state).find((id) => !state.turn.operatedThisOR.includes(id));
}
