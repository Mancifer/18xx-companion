import { z } from "zod";
import type { Mechanic } from "./mechanic";

export const ManualFloatConditionConfig = z.object({
  company: z.string().min(1),
  question: z.string().min(1),
  droppedAtPhase: z.string().min(1),
});
export type ManualFloatConditionConfig = z.infer<typeof ManualFloatConditionConfig>;

/** Float needs the percentage and a confirmation the app cannot see (1848 COM). */
export const manualFloatCondition: Mechanic<ManualFloatConditionConfig> = {
  id: "manualFloatCondition",
  configSchema: ManualFloatConditionConfig,
};
