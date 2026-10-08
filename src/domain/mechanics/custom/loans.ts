import { z } from "zod";
import type { Mechanic } from "./mechanic";

/** 1848 loans (FR-112). Terms live in `game.loans`; this mechanic adds the loan actions. */
export const loans: Mechanic<Record<string, never>> = {
  id: "loans",
  configSchema: z.object({}).strict(),
};
