import type { ActionContext, Trigger } from "../actions/context";
import { unitsOutOfIpo, type SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import type { CompanyId } from "../types";
import { hooksOf } from "./custom";
import { priceOf } from "./market";

/**
 * Float and capitalization (FR-023, contracts/actions.md "Full capitalization"):
 * - full `onFloat` (1848): 10 × par the moment the shares that left the IPO reach floatPercent;
 * - full `endOfSR` (1830): floated now with `capitalPending`, paid at endSR;
 * - incremental (21Moon): each IPO buy already paid the company; floating adds no money.
 * `floatCounts: "soldFromIpo"` counts shares that left the IPO by any route.
 */

export function capitalOf(game: GameDefinition, state: SessionState, company: CompanyId): number {
  const record = state.companies[company];
  if (!record) return 0;
  return (record.parPrice ?? priceOf(game, state, company) ?? 0) * record.shareCount;
}

/** Shares that must have left the IPO to float. */
export function floatThreshold(game: GameDefinition, state: SessionState, company: CompanyId): number {
  return Math.ceil(((state.companies[company]?.shareCount ?? 10) * game.floatPercent) / 100);
}

/** Why a parred company has not floated yet, or undefined when it is ready to. */
export function floatPending(ctx: Pick<ActionContext, "game" | "state">, company: CompanyId): "percent" | "condition" | undefined {
  if (unitsOutOfIpo(ctx.state, company) < floatThreshold(ctx.game, ctx.state, company)) return "percent";
  if (hooksOf(ctx.game, "floatBlocked").some((blocked) => blocked(ctx, company))) return "condition";
  return undefined;
}

export function floatEvents(game: GameDefinition, state: SessionState, company: CompanyId): PrimitiveEvent[] {
  const cap = game.capitalization;
  if (cap.type === "incremental") return [{ t: "companyStatus", company, status: "floated" }];
  if (cap.timing === "endOfSR") return [{ t: "companyStatus", company, status: "floated", capitalPending: true }];
  return [
    { t: "companyStatus", company, status: "floated" },
    { t: "moneyTransfer", from: "bank", to: `company:${company}`, amount: capitalOf(game, state, company) },
  ];
}

/** Floats every parred company that is ready, in the same group as the action that did it. */
export const floatTrigger: Trigger = (ctx) => {
  const events: PrimitiveEvent[] = [];
  for (const [company, record] of Object.entries(ctx.state.companies)) {
    if (record.status !== "parred") continue;
    // Auction and merger companies become floated explicitly (feature 004).
    const start = ctx.game.companies.find((c) => c.id === company)?.start;
    if (start === "auction" || start === "merger") continue;
    if (floatPending(ctx, company) === undefined) events.push(...floatEvents(ctx.game, ctx.state, company));
  }
  return events;
};

/** endSR: the capital of companies that floated during the SR (1830 §6.3). */
export function pendingCapitalEvents(game: GameDefinition, state: SessionState): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = [];
  for (const [company, record] of Object.entries(state.companies)) {
    if (!record.capitalPending) continue;
    events.push({ t: "moneyTransfer", from: "bank", to: `company:${company}`, amount: capitalOf(game, state, company) });
    events.push({ t: "companyStatus", company, status: record.status, capitalPending: false });
  }
  return events;
}
