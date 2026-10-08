import type { SessionState } from "../events/state";
import type { Cell, GameDefinition } from "../games/schema";
import type { CellRef, CompanyId } from "../types";

/** The cell at a 2-D position, or undefined off the grid / on a padding gap. */
export function cellAt(game: GameDefinition, ref: CellRef | undefined): Cell | undefined {
  if (!ref || "index" in ref) return undefined;
  return game.market.cells[ref.row]?.[ref.col] ?? undefined;
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
