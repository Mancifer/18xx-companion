import type { SessionState } from "../events/state";
import type { Cell, CellTag, Direction, GameDefinition, MoveRule } from "../games/schema";
import { cellEquals, type CellRef, type CompanyId } from "../types";
import type { MoveKind } from "./payout";

/** The cell at a 2-D position, or undefined off the grid / on a padding gap. */
export function cellAt(game: GameDefinition, ref: CellRef | undefined): Cell | undefined {
  if (!ref || "index" in ref) return undefined;
  return game.market.cells[ref.row]?.[ref.col] ?? undefined;
}

export function cellTagsAt(game: GameDefinition, ref: CellRef | undefined): readonly CellTag[] {
  return cellAt(game, ref)?.tags ?? [];
}

/** Price at a position: a grid cell, or a 1-D track index (index n = after n loans). */
export function priceAt(game: GameDefinition, company: CompanyId, ref: CellRef | undefined): number | undefined {
  if (!ref) return undefined;
  if ("index" in ref) {
    const track = game.market.tracks?.[company];
    if (!track) return undefined;
    return ref.index === 0 ? track.startPrice : track.byLoansIssued[ref.index - 1];
  }
  return cellAt(game, ref)?.price;
}

export function priceOf(game: GameDefinition, state: SessionState, company: CompanyId): number | undefined {
  return priceAt(game, company, state.companies[company]?.position);
}

/** The par/start cell for a par price (the first par-tagged cell with that price). */
export function parCellFor(game: GameDefinition, price: number): CellRef | undefined {
  for (const [row, cells] of game.market.cells.entries()) {
    for (const [col, cell] of cells.entries()) {
      if (cell?.price === price && cell.tags?.includes("par")) return { row, col };
    }
  }
  return undefined;
}

/** All par prices offered for a company, highest first. */
export function parPricesFor(game: GameDefinition, company: CompanyId): number[] {
  const def = game.companies.find((c) => c.id === company);
  if (!def) return [];
  if (def.fixedPar !== undefined) return [def.fixedPar];
  if (def.parOptions !== "parCells") return [...def.parOptions].sort((a, b) => b - a);
  const prices = new Set<number>();
  for (const row of game.market.cells) for (const cell of row) if (cell?.tags?.includes("par")) prices.add(cell.price);
  return [...prices].sort((a, b) => b - a);
}

const exists = (game: GameDefinition, row: number, col: number): CellRef | undefined =>
  game.market.cells[row]?.[col] ? { row, col } : undefined;

/**
 * One step in a direction (data-model §4 MarketDef). Off the end of a row the token goes up
 * (right) or down (left) "if possible": the cell's printed arrow when it has one, else the
 * market's default edge. Up and down never leave the column. A `noUp` cell blocks upward moves.
 * Undefined means the token stays put.
 */
export function neighbor(game: GameDefinition, ref: CellRef, dir: Direction): CellRef | undefined {
  if ("index" in ref) return undefined;
  const cell = cellAt(game, ref);
  if (!cell) return undefined;
  const { row, col } = ref;
  const noUp = cell.tags?.includes("noUp") ?? false;
  switch (dir) {
    case "up":
      return noUp ? undefined : exists(game, row - 1, col);
    case "down":
      return exists(game, row + 1, col);
    case "right": {
      const next = exists(game, row, col + 1);
      if (next) return next;
      const edge = cell.rightEdge ?? game.market.edges.right;
      return edge === "up" && !noUp ? exists(game, row - 1, col) : undefined;
    }
    case "left": {
      const next = exists(game, row, col - 1);
      if (next) return next;
      const edge = cell.leftEdge ?? game.market.edges.left;
      return edge === "down" ? exists(game, row + 1, col) : undefined;
    }
  }
}

/** Up to n steps; stops where the next step is blocked. */
export function moveSteps(game: GameDefinition, ref: CellRef, dir: Direction, n: number): CellRef {
  let current = ref;
  for (let i = 0; i < n; i++) {
    const next = neighbor(game, current, dir);
    if (!next) break;
    current = next;
  }
  return current;
}

/** The target after n steps, or undefined when the token cannot move at all. */
export function moveTarget(game: GameDefinition, ref: CellRef | undefined, dir: Direction, n: number): CellRef | undefined {
  if (!ref || "index" in ref) return undefined;
  const target = moveSteps(game, ref, dir, n);
  return cellEquals(target, ref) ? undefined : target;
}

function matches(rule: MoveRule, dividend: number, price: number): boolean {
  if (!rule.when) return true;
  const { dividendAtLeast, dividendEquals } = rule.when;
  if (dividendEquals !== undefined && dividend !== dividendEquals) return false;
  if (dividendAtLeast && dividend < dividendAtLeast.priceTimes * price) return false;
  return true;
}

/** Statuses whose price moves in operating rounds (1830 §5.5: unfloated companies never move). */
export const OPERATING_STATUSES: ReadonlySet<string> = new Set(["floated", "receivership"]);

/**
 * The price move after a run (FR-033): the first rule for the kind whose condition matches, with
 * thresholds compared against the pre-move price. Undefined means no move.
 */
export function applyMoveRules(
  game: GameDefinition,
  state: SessionState,
  company: CompanyId,
  kind: MoveKind,
  context: { readonly dividend: number },
): CellRef | undefined {
  const record = state.companies[company];
  if (!record || !OPERATING_STATUSES.has(record.status)) return undefined;
  const price = priceOf(game, state, company) ?? 0;
  const rules = game.market.moves[kind] ?? [];
  const rule = rules.find((r) => matches(r, context.dividend, price));
  if (!rule) return undefined;
  return moveTarget(game, record.position, rule.dir, rule.n);
}
