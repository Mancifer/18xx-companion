import { z } from "zod";
import type { Mechanic } from "./mechanic";

/**
 * A company in receivership cannot pay dividends (1830 Base §7.7, 21Moon §11.8.2): every run is
 * withheld (repaying any Bank debt through `bankDebt`) and moves the price left.
 */
export const forcedWithhold: Mechanic<Record<string, never>> = {
  id: "forcedWithhold",
  configSchema: z.object({}).strict(),
  hooks: {
    forceWithhold: (ctx, company) =>
      ctx.state.companies[company]?.status === "receivership"
        ? "En administración: retiene todos los ingresos."
        : undefined,
  },
};
