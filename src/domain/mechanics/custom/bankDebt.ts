import { z } from "zod";
import type { Mechanic } from "./mechanic";

export const BankDebtConfig = z.object({
  debtors: z.array(z.enum(["player", "company"])).min(1),
  interest: z.literal(0),
  autoRepayFromIncome: z.boolean(),
});
export type BankDebtConfig = z.infer<typeof BankDebtConfig>;

/** Interest-free debt to the Bank, repaid from the next income (1848 §5.5.3, 1830 §7.7). */
export const bankDebt: Mechanic<BankDebtConfig> = {
  id: "bankDebt",
  configSchema: BankDebtConfig,
};
