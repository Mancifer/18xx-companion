import { z } from "zod";
import type { Mechanic } from "./mechanic";

export const NationalBankConfig = z.object({
  company: z.string().min(1),
  dividendSource: z.literal("bank"),
  minDividendByPhase: z.record(z.string(), z.number().int().nonnegative()),
});
export type NationalBankConfig = z.infer<typeof NationalBankConfig>;

/** 1848 Bank of England: a director-less company with a loan-driven price track (FR-111). */
export const nationalBank: Mechanic<NationalBankConfig> = {
  id: "nationalBank",
  configSchema: NationalBankConfig,
};
