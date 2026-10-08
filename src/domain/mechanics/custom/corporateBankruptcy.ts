import { z } from "zod";
import type { Mechanic } from "./mechanic";

export const CorporateBankruptcyConfig = z.object({
  trigger: z.enum(["closedCell", "manual"]),
  endsGame: z.boolean().optional(),
});
export type CorporateBankruptcyConfig = z.infer<typeof CorporateBankruptcyConfig>;

/** 21Moon §12 and the 1830 Classic game end. */
export const corporateBankruptcy: Mechanic<CorporateBankruptcyConfig> = {
  id: "corporateBankruptcy",
  configSchema: CorporateBankruptcyConfig,
};
