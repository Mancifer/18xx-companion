import { cashOf } from "../../events/state";
import type { PrimitiveEvent } from "../../events/types";
import { formatMoney } from "../../i18n/format";
import type { HolderRef } from "../../types";
import { warning, type ActionContext, type HandlerMap } from "../context";
import type { Warning } from "../schemas";

/** Warnings shared by any action that moves money out of a holder (never blocking). */
export function payWarnings(ctx: ActionContext, from: HolderRef, amount: number): Warning[] {
  const have = cashOf(ctx.state, from);
  if (from === "bank") {
    if (ctx.game.bank !== "unlimited" && have - amount < 0) {
      return [warning("bankBroken", "El banco se queda sin dinero (banca quebrada).")];
    }
    return [];
  }
  if (have < amount) {
    return [warning("insufficientCash", `Solo tiene ${formatMoney(have, ctx.game)}; quedará en negativo.`)];
  }
  return [];
}

/** Manual actions (FR-024). Every override is a recorded event. */
export const manualHandlers: HandlerMap = {
  transferMoney: {
    validate: (ctx, a) => payWarnings(ctx, a.from, a.amount),
    expand: (_ctx, a) => [{ t: "moneyTransfer", from: a.from, to: a.to, amount: a.amount }],
  },
  adjustMoney: {
    expand: (ctx, a) => {
      const holder = a.holder;
      const diff = a.setTo !== null ? a.setTo - cashOf(ctx.state, holder) : (a.delta ?? 0);
      const events: PrimitiveEvent[] = [];
      if (diff > 0) events.push({ t: "moneyTransfer", from: "bank", to: holder, amount: diff });
      if (diff < 0) events.push({ t: "moneyTransfer", from: holder, to: "bank", amount: -diff });
      return events;
    },
  },
  transferShares: {
    expand: (_ctx, a) => [
      {
        t: "shareTransfer",
        company: a.company,
        from: a.from,
        to: a.to,
        units: a.units,
        ...(a.presidency ? { presidency: true } : {}),
      },
    ],
  },
  note: {
    expand: (_ctx, a) => [{ t: "note", text: a.text }],
  },
};
