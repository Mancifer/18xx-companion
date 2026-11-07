import type { GameDefinition } from "../domain/games/schema";
import type { Lang } from "./lang";

const SEPARATOR: Readonly<Record<Lang, string>> = { en: ",", es: "." };

/** "$1.200" (es) / "$1,200" (en), "£630", "−₡40": the game's symbol, whole numbers (R8). */
export function formatMoney(amount: number, game: Pick<GameDefinition, "currency">, lang: Lang): string {
  const sign = amount < 0 ? "−" : "";
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATOR[lang]);
  return `${sign}${game.currency.symbol}${digits}`;
}
