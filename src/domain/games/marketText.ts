import type { Cell, CellTag } from "./schema";

/**
 * Builds a market grid from the text transcriptions in research.md R13–R15, so the data can be
 * checked against the source by eye. One string per row, cells separated by spaces:
 *
 *   `-`       no cell (staggered rows)
 *   `RCV`     receivership cell (1848; entering it triggers a takeover)
 *   `CLOSED`  closed cell (21Moon; entering it bankrupts the company)
 *   `<price>` followed by any of these markers:
 *     `*` par/start cell   `!` top cell (end-game trigger)   `#` no upward move
 *     `y` `o` `b` 1830 yellow/orange/brown zone
 *     `↓` left-edge arrow: moving left from here goes down
 *     `↑` right-edge arrow: moving right from here goes up
 *
 * Columns are positional: leading `-` tokens pad staggered rows.
 */
export function parseMarket(rows: readonly string[]): (Cell | null)[][] {
  return rows.map((row) => row.trim().split(/\s+/).map(parseCell));
}

function parseCell(token: string): Cell | null {
  if (token === "-") return null;
  if (token === "RCV") return { price: 0, tags: ["receivership"] };
  if (token === "CLOSED") return { price: 0, tags: ["closed"] };
  const match = /^(\d+)([*!#yob↓↑]*)$/u.exec(token);
  if (!match) throw new Error(`Bad market token "${token}"`);
  const price = Number(match[1]);
  const marks = match[2] ?? "";
  const tags: CellTag[] = [];
  if (marks.includes("*")) tags.push("par");
  if (marks.includes("!")) tags.push("top");
  if (marks.includes("#")) tags.push("noUp");
  const cell: { -readonly [K in keyof Cell]: Cell[K] } = { price };
  if (tags.length > 0) cell.tags = tags;
  if (marks.includes("y")) cell.zone = "yellow";
  if (marks.includes("o")) cell.zone = "orange";
  if (marks.includes("b")) cell.zone = "brown";
  if (marks.includes("↓")) cell.leftEdge = "down";
  if (marks.includes("↑")) cell.rightEdge = "up";
  return cell;
}

/** Recursively freezes a definition so built-ins can never be mutated (US1-5). */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
