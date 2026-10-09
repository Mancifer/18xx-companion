import { z } from "zod";
import { AVAILABLE, unavailable } from "../../actions/context";
import type { SessionState } from "../../events/state";
import { holdersOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { parseHolder } from "../../types";
import { perShareAmount } from "../payout";
import { phaseIndex } from "../phases";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

export const NationalBankConfig = z.object({
  company: z.string().min(1),
  dividendSource: z.literal("bank"),
  minDividendByPhase: z.record(z.string(), z.number().int().nonnegative()),
});
export type NationalBankConfig = z.infer<typeof NationalBankConfig>;

export function nationalBankConfig(game: GameDefinition): NationalBankConfig | undefined {
  return mechanicConfigOf(game, "nationalBank", NationalBankConfig);
}

/** The minimum dividend for the current phase: the latest phase at or before it that sets one. */
export function nationalMinDividend(game: GameDefinition, state: SessionState): number {
  const cfg = nationalBankConfig(game);
  if (!cfg) return 0;
  const current = phaseIndex(game, state.turn.phase);
  let min = 0;
  game.phases.forEach((p, i) => {
    const amount = cfg.minDividendByPhase[p.id];
    if (i <= current && amount !== undefined) min = amount;
  });
  return min;
}

/**
 * 1848 Bank of England (§5.4, FR-111): director-less, priced on its loan track, operating first
 * (`orOrder.before`). It pays the phase minimum plus the city values of receivership stations
 * (entered as `extra`), 10% per share to players and companies, paid by the normal Bank. Unsold
 * and pool shares are not paid.
 */
export const nationalBank: Mechanic<NationalBankConfig> = {
  id: "nationalBank",
  configSchema: NationalBankConfig,
  handlers: {
    nationalPayout: {
      available: (ctx) => {
        const cfg = nationalBankConfig(ctx.game);
        return cfg && ctx.game.companies.some((c) => c.id === cfg.company) ? AVAILABLE : unavailable("No hay banco nacional");
      },
      expand: (ctx, a) => {
        const cfg = nationalBankConfig(ctx.game);
        if (!cfg) return [];
        const company = cfg.company;
        const total = nationalMinDividend(ctx.game, ctx.state) + a.extra;
        const shareCount = ctx.state.companies[company]?.shareCount ?? 10;
        const perShare = perShareAmount(ctx.game, total, shareCount);
        const events: PrimitiveEvent[] = [];
        if (perShare > 0) {
          for (const [holder, units] of holdersOf(ctx.state, company)) {
            const kind = parseHolder(holder).kind;
            if ((kind === "player" || kind === "company") && units > 0) {
              events.push({ t: "moneyTransfer", from: "bank", to: holder, amount: perShare * units });
            }
          }
        }
        events.push({ t: "counterChange", subject: `company:${company}`, key: "runs", delta: 1 });
        return events;
      },
    },
  },
};
