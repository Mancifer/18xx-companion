import { z } from "zod";
import type { Mechanic } from "./mechanic";

/** A company in receivership cannot pay dividends (1830 Base §7.7, 21Moon §11.8.2). */
export const forcedWithhold: Mechanic<Record<string, never>> = {
  id: "forcedWithhold",
  configSchema: z.object({}).strict(),
};
