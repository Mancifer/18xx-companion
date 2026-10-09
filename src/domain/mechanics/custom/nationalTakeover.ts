import { z } from "zod";
import type { Trigger } from "../../actions/context";
import { cashOf, counterOf, holdersOf, presidentOf, type SessionState } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { parseHolder, type CompanyId, type HolderRef } from "../../types";
import { cellTagsAt, priceOf } from "../market";
import { trainNumber, trainsHeldBy } from "../phases";
import { lendEvents } from "./bankDebt";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

export const NationalTakeoverConfig = z.object({
  compensation: z.literal("parPerNonDirectorShare"),
  directorLiable: z.boolean(),
  removeCheapestPermanentTrainAt: z.array(z.number().int().positive()),
  endGameAt: z.number().int().positive(),
});
export type NationalTakeoverConfig = z.infer<typeof NationalTakeoverConfig>;

/**
 * 1848 receivership (§5.5, FR-111), as one group with the action that caused it:
 * 1. the company pays par × each non-director player share as compensation; a shortfall is paid
 *    by the director, who borrows from the Bank what they lack (`bankDebt`);
 * 2. the remaining treasury goes to the Bank; 3. its trains are removed;
 * 4. status `receivership`, and the Bank's takeover count goes up;
 * 5. at the configured counts (2nd, 5th), the cheapest permanent train in the Bank is removed,
 *    which counts as sold (§5.4.4) and can start a phase.
 */
export function takeoverEvents(game: GameDefinition, state: SessionState, company: CompanyId): PrimitiveEvent[] {
  const cfg = mechanicConfigOf(game, "nationalTakeover", NationalTakeoverConfig);
  if (!cfg) return [];
  const treasury: HolderRef = `company:${company}`;
  const record = state.companies[company];
  const par = record?.parPrice ?? priceOf(game, state, company) ?? 0;
  const director = presidentOf(state, company);
  const events: PrimitiveEvent[] = [];

  const compensation: [HolderRef, number][] = [];
  for (const [holder, units] of holdersOf(state, company)) {
    const h = parseHolder(holder);
    if (h.kind === "player" && h.id !== director && units > 0) compensation.push([holder, par * units]);
  }
  const total = compensation.reduce((sum, [, amount]) => sum + amount, 0);
  let cash = cashOf(state, treasury);

  const shortfall = total - cash;
  if (shortfall > 0 && director && cfg.directorLiable) {
    const directorRef: HolderRef = `player:${director}`;
    const lacking = shortfall - Math.max(0, cashOf(state, directorRef));
    if (mechanicConfigOf(game, "bankDebt", z.unknown()) !== undefined) events.push(...lendEvents(directorRef, lacking));
    events.push({ t: "moneyTransfer", from: directorRef, to: treasury, amount: shortfall });
    cash += shortfall;
  }
  for (const [holder, amount] of compensation) {
    events.push({ t: "moneyTransfer", from: treasury, to: holder, amount });
  }
  cash -= total;
  if (cash > 0) events.push({ t: "moneyTransfer", from: treasury, to: "bank", amount: cash });

  for (const train of trainsHeldBy(state, treasury)) {
    events.push({ t: "assetTransfer", asset: train, from: treasury, to: "removed" });
  }
  events.push({ t: "companyStatus", company, status: "receivership" });
  events.push({ t: "counterChange", subject: "bank", key: "nationalTakeovers", delta: 1 });

  const count = counterOf(state, "bank", "nationalTakeovers") + 1;
  if (cfg.removeCheapestPermanentTrainAt.includes(count)) {
    const cheapest = game.trains
      .filter((t) => t.permanent && t.count !== "unlimited" && trainsHeldBy(state, "bank", t.type).length > 0)
      .sort((a, b) => (a.variants[0]?.cost ?? 0) - (b.variants[0]?.cost ?? 0))[0];
    const train = cheapest
      ? trainsHeldBy(state, "bank", cheapest.type).sort((a, b) => trainNumber(b) - trainNumber(a))[0]
      : undefined;
    if (train) events.push({ t: "assetTransfer", asset: train, from: "bank", to: "removed" });
  }
  return events;
}

/** §5.5.1: a price entering the receivership column triggers the takeover. */
const cellTrigger: Trigger = (ctx) => {
  for (const e of ctx.events) {
    if (e.t !== "marketMove" || !cellTagsAt(ctx.game, e.to).includes("receivership")) continue;
    const status = ctx.state.companies[e.company]?.status;
    if (status === "receivership" || status === "bankrupt" || status === "closed") continue;
    return takeoverEvents(ctx.game, ctx.state, e.company);
  }
  return [];
};

/** 1848 receivership by the Bank of England (FR-111). */
export const nationalTakeover: Mechanic<NationalTakeoverConfig> = {
  id: "nationalTakeover",
  configSchema: NationalTakeoverConfig,
  triggers: [cellTrigger],
  hooks: {
    enterReceivership: (ctx, company) => takeoverEvents(ctx.game, ctx.state, company),
  },
};
