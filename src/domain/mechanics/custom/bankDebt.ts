import { z } from "zod";
import { warning, type Trigger } from "../../actions/context";
import { cashOf, counterOf, presidentOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import type { GameDefinition } from "../../games/schema";
import { formatMoney } from "../../i18n/format";
import { parseHolder, type HolderRef } from "../../types";
import { mechanicConfigOf } from "./config";
import type { Mechanic } from "./mechanic";

export const BankDebtConfig = z.object({
  debtors: z.array(z.enum(["player", "company"])).min(1),
  interest: z.literal(0),
  autoRepayFromIncome: z.boolean(),
});
export type BankDebtConfig = z.infer<typeof BankDebtConfig>;

/**
 * Lending is a real payment out of the Bank plus an IOU on the debtor's `debt` counter (debt is
 * not money, data-model §11).
 */
export function lendEvents(debtor: HolderRef, amount: number): PrimitiveEvent[] {
  if (amount <= 0) return [];
  return [
    { t: "moneyTransfer", from: "bank", to: debtor, amount },
    { t: "counterChange", subject: debtor, key: "debt", delta: amount },
  ];
}

function config(game: GameDefinition): BankDebtConfig | undefined {
  return mechanicConfigOf(game, "bankDebt", BankDebtConfig);
}

/**
 * Repayment (1848 §5.5.3, 1830 §7.7): any later group that pays a debtor also repays
 * min(income, debt). A company whose debt reaches 0 leaves receivership in the same group.
 */
const repayTrigger: Trigger = (ctx) => {
  const cfg = config(ctx.game);
  if (!cfg?.autoRepayFromIncome) return [];
  const kinds = new Set<string>(cfg.debtors);
  const income = new Map<HolderRef, number>();
  for (const e of ctx.events) {
    if (e.t === "moneyTransfer") income.set(e.to, (income.get(e.to) ?? 0) + e.amount);
  }
  const events: PrimitiveEvent[] = [];
  for (const [debtor, received] of income) {
    if (!kinds.has(parseHolder(debtor).kind)) continue;
    const debt = counterOf(ctx.stateBefore, debtor, "debt");
    if (debt <= 0) continue;
    // A group that lends to the debtor, or already repays, adds nothing (idempotent).
    const touched = ctx.events.some((e) => e.t === "counterChange" && e.subject === debtor && e.key === "debt");
    if (touched) continue;
    const repay = Math.min(received, debt);
    if (repay <= 0) continue;
    events.push(
      { t: "moneyTransfer", from: debtor, to: "bank", amount: repay },
      { t: "counterChange", subject: debtor, key: "debt", delta: -repay },
    );
    const parsed = parseHolder(debtor);
    if (parsed.kind === "company" && repay === debt && ctx.state.companies[parsed.id]?.status === "receivership") {
      events.push({ t: "companyStatus", company: parsed.id, status: "floated" });
    }
  }
  return events;
};

/** Interest-free debt to the Bank, repaid from the next income (1848 §5.5.3, 1830 §7.7). */
export const bankDebt: Mechanic<BankDebtConfig> = {
  id: "bankDebt",
  configSchema: BankDebtConfig,
  triggers: [repayTrigger],
  hooks: {
    /**
     * 1830 Base forced train purchase: the president pays what they can, the Bank lends the
     * rest to the company, and the company enters receivership.
     */
    trainShortfall: (ctx, company, shortfall) => {
      if (!config(ctx.game)?.debtors.includes("company")) return undefined;
      const treasury: HolderRef = `company:${company}`;
      const president = presidentOf(ctx.state, company);
      const presidentCash = president ? Math.max(0, cashOf(ctx.state, `player:${president}`)) : 0;
      const fromPresident = Math.min(shortfall, presidentCash);
      const lent = shortfall - fromPresident;
      const events: PrimitiveEvent[] = [];
      if (president && fromPresident > 0) {
        events.push({ t: "moneyTransfer", from: `player:${president}`, to: treasury, amount: fromPresident });
      }
      events.push(...lendEvents(treasury, lent));
      if (lent > 0) events.push({ t: "companyStatus", company, status: "receivership" });
      const name = (amount: number) => formatMoney(amount, ctx.game);
      return {
        events,
        warnings: [
          warning(
            "forcedPurchase",
            lent > 0
              ? `Compra forzada: el presidente pone ${name(fromPresident)} y el banco presta ${name(lent)}; la compañía pasa a administración.`
              : `Compra forzada: el presidente pone ${name(fromPresident)}.`,
            "info",
          ),
        ],
      };
    },
  },
};
