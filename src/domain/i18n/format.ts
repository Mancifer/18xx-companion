import type { GameDefinition } from "../games/schema";

/** "$1.200", "£630", "−₡40": the game's symbol with "." thousands. */
export function formatMoney(amount: number, game: Pick<GameDefinition, "currency">): string {
  const sign = amount < 0 ? "−" : "";
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${game.currency.symbol}${digits}`;
}
