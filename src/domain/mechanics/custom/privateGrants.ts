import { z } from "zod";
import type { Mechanic } from "./mechanic";

/** Privates that grant or exchange shares (1830 CA/BO/MH, 1848 P5/P6, 21Moon P6). */
export const privateGrants: Mechanic<Record<string, never>> = {
  id: "privateGrants",
  configSchema: z.object({}).strict(),
};
