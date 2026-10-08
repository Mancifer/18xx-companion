import { z } from "zod";
import type { Mechanic } from "./mechanic";

export const NationalTakeoverConfig = z.object({
  compensation: z.literal("parPerNonDirectorShare"),
  directorLiable: z.boolean(),
  removeCheapestPermanentTrainAt: z.array(z.number().int().positive()),
  endGameAt: z.number().int().positive(),
});
export type NationalTakeoverConfig = z.infer<typeof NationalTakeoverConfig>;

/** 1848 receivership by the Bank of England (FR-111). */
export const nationalTakeover: Mechanic<NationalTakeoverConfig> = {
  id: "nationalTakeover",
  configSchema: NationalTakeoverConfig,
};
