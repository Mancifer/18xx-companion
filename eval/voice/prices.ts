import type { TokenUsage } from "../../src/voice/reply";

/**
 * Dated per-model prices in $ per million tokens (feature 005, research R10). Eval only: never
 * imported from src/. Gemini rows checked against Google's pricing page on 2026-10-10; Claude
 * rows are the pre-005 values. Re-check before trusting a cost: prices change often. Output
 * prices include thinking tokens; implicit caching has no write charge (null).
 */

export interface PricePeriod {
  /** ISO date the period starts; omitted = always. */
  readonly from?: string;
  readonly input: number;
  readonly output: number;
  /** null: not priced separately; cached reads are then charged at the input price. */
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

const GEMINI_FLASH: readonly PricePeriod[] = [
  { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: null },
  { from: "2027-01-01", input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: null },
];

export const PRICES: Readonly<Record<string, readonly PricePeriod[]>> = {
  "claude-sonnet-5": [{ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  "claude-haiku-4-5": [{ input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
  "claude-opus-5": [{ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  "gemini-3.8-flash": GEMINI_FLASH,
  "gemini-3.6-flash": GEMINI_FLASH,
  "gemini-3.5-flash-lite": [{ input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: null }],
  "gemini-3-flash-preview": [{ input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: null }],
};

/** The latest period that has started on `date` (YYYY-MM-DD); undefined for an unknown model. */
export function priceFor(model: string, date: string): PricePeriod | undefined {
  const periods = PRICES[model];
  if (!periods) return undefined;
  return periods.filter((p) => (p.from ?? "") <= date).at(-1);
}

export function costOf(usage: TokenUsage, price: PricePeriod): number {
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * (price.cacheRead ?? price.input) +
      usage.cacheWrite * (price.cacheWrite ?? price.input)) /
    1e6
  );
}
