import { z } from "zod";
import type { Mechanic } from "./mechanic";

/** 21Moon §10: the corporate round. */
export const corporateRound: Mechanic<Record<string, never>> = {
  id: "corporateRound",
  configSchema: z.object({}).strict(),
};
