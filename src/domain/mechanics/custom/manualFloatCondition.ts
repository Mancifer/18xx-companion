import { z } from "zod";
import { AVAILABLE, unavailable } from "../../actions/context";
import type { GameDefinition } from "../../games/schema";
import { phaseReached } from "../phases";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

export const ManualFloatConditionConfig = z.object({
  company: z.string().min(1),
  question: z.string().min(1),
  droppedAtPhase: z.string().min(1),
});
export type ManualFloatConditionConfig = z.infer<typeof ManualFloatConditionConfig>;

export function floatConditionConfig(game: GameDefinition): ManualFloatConditionConfig | undefined {
  return mechanicConfigOf(game, "manualFloatCondition", ManualFloatConditionConfig);
}

/**
 * Float needs the percentage and a confirmation the app cannot see (1848 COM: the
 * Sydney–Adelaide link). The condition is dropped at the configured phase.
 */
export const manualFloatCondition: Mechanic<ManualFloatConditionConfig> = {
  id: "manualFloatCondition",
  configSchema: ManualFloatConditionConfig,
  hooks: {
    floatBlocked: (ctx, company) => {
      const cfg = floatConditionConfig(ctx.game);
      if (cfg?.company !== company) return false;
      if (phaseReached(ctx.game, ctx.state, cfg.droppedAtPhase)) return false;
      return !(ctx.state.companies[company]?.floatConfirmed ?? false);
    },
  },
  handlers: {
    confirmFloatCondition: {
      available: (ctx, a) => {
        const cfg = floatConditionConfig(ctx.game);
        if (!cfg || (a && a.company !== cfg.company)) return unavailable("Esta compañía no tiene condición de flotación");
        if (a && ctx.state.companies[a.company]?.floatConfirmed) return unavailable("Ya está confirmada");
        return AVAILABLE;
      },
      expand: (ctx, a) => [
        { t: "companyStatus", company: a.company, status: ctx.state.companies[a.company]?.status ?? "unstarted", floatConfirmed: true },
      ],
    },
  },
};
