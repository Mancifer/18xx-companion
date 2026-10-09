import { holdersOf, type SessionState } from "../events/state";
import type { EventOf } from "../events/types";
import type { GameDefinition, PayoutMode } from "../games/schema";
import { parseHolder, type CompanyId, type HolderRef } from "../types";

/** How the run moves the share price (the market's payout / withhold / half rules). */
export type MoveKind = "payout" | "withhold" | "half";

export interface RevenuePart {
  readonly part: string;
  readonly amount: number;
}

export interface PayoutResult {
  /** Bank → recipient transfers, one per recipient. */
  readonly transfers: EventOf<"moneyTransfer">[];
  readonly moveKind: MoveKind;
  /** The amount paid out as dividends: what payout move thresholds compare (21Moon §11.5). */
  readonly dividend: number;
}

/**
 * contracts/actions.md "Payout" (FR-030, FR-031, FR-032). Each revenue part goes to the treasury,
 * to the shareholders, or (a "choice" part) by the payout mode. Dividends are paid per share,
 * rounded by the game; unowned shares follow `unownedDividends`, and a destination of "none"
 * emits no transfer, so that money never leaves the Bank. With `forceWithhold` (a company in
 * receivership) every part goes to the treasury.
 */
export function computePayout(
  game: GameDefinition,
  state: SessionState,
  company: CompanyId,
  parts: readonly RevenuePart[],
  mode: PayoutMode | null,
  options: { readonly forceWithhold?: boolean } = {},
): PayoutResult {
  const amounts = new Map<HolderRef, number>();
  const add = (to: HolderRef, amount: number) => {
    if (amount > 0) amounts.set(to, (amounts.get(to) ?? 0) + amount);
  };
  const treasury: HolderRef = `company:${company}`;
  const choiceMode = mode ?? "full";
  let dividend = 0;
  let hasChoice = false;
  let choiceTotal = 0;

  for (const def of game.revenueParts) {
    const amount = parts.filter((p) => p.part === def.id).reduce((sum, p) => sum + p.amount, 0);
    if (options.forceWithhold) {
      add(treasury, amount);
      continue;
    }
    if (def.to === "treasury") {
      add(treasury, amount);
    } else if (def.to === "dividend") {
      distribute(game, state, company, amount, add);
      dividend += amount;
    } else {
      hasChoice = true;
      choiceTotal += amount;
      if (choiceMode === "withhold") {
        add(treasury, amount);
      } else if (choiceMode === "half") {
        const kept = retainedHalf(game, amount);
        add(treasury, kept);
        distribute(game, state, company, amount - kept, add);
        dividend += amount - kept;
      } else {
        distribute(game, state, company, amount, add);
        dividend += amount;
      }
    }
  }

  let moveKind: MoveKind = "payout";
  if (options.forceWithhold) moveKind = "withhold";
  else if (hasChoice) {
    // Paying out nothing is a withhold: there is no dividend to move the price up.
    moveKind = choiceMode === "full" && choiceTotal === 0 ? "withhold" : choiceMode === "full" ? "payout" : choiceMode;
  }

  const transfers = [...amounts].map(([to, amount]): EventOf<"moneyTransfer"> => ({
    t: "moneyTransfer",
    from: "bank",
    to,
    amount,
  }));
  return { transfers, moveKind, dividend: options.forceWithhold ? 0 : dividend };
}

/** Per-share amount, rounded by the game (FR-032). */
export function perShareAmount(game: GameDefinition, amount: number, shareCount: number): number {
  const exact = amount / shareCount;
  switch (game.rounding.perShare) {
    case "floor":
      return Math.floor(exact);
    case "ceil":
      return Math.ceil(exact);
    case "round":
      return Math.round(exact);
  }
}

/** The half the company keeps on a half payout, rounded to the game's unit. */
export function retainedHalf(game: GameDefinition, amount: number): number {
  const { unit, halfRetain } = game.rounding;
  const halves = amount / 2 / unit;
  return (halfRetain === "floorToCompany" ? Math.floor(halves) : Math.ceil(halves)) * unit;
}

/** Where the dividend of one holder's shares goes, or null when it stays in the Bank. */
export function dividendRecipient(game: GameDefinition, company: CompanyId, holder: HolderRef): HolderRef | null {
  const h = parseHolder(holder);
  switch (h.kind) {
    case "player":
      return holder;
    case "company":
      if (h.id !== company) return holder;
      return game.unownedDividends.treasury === "company" ? holder : null;
    case "ipo":
      return game.unownedDividends.ipo === "company" ? `company:${company}` : null;
    case "pool":
      return game.unownedDividends.pool === "company" ? `company:${company}` : null;
    case "bank":
    case "removed":
      return null;
  }
}

function distribute(
  game: GameDefinition,
  state: SessionState,
  company: CompanyId,
  amount: number,
  add: (to: HolderRef, amount: number) => void,
): void {
  if (amount <= 0) return;
  const shareCount = state.companies[company]?.shareCount ?? 10;
  const perShare = perShareAmount(game, amount, shareCount);
  for (const [holder, units] of holdersOf(state, company)) {
    if (units <= 0) continue;
    const to = dividendRecipient(game, company, holder);
    if (to) add(to, perShare * units);
  }
}
