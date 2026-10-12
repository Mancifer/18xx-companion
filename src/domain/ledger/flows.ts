import type { PrimitiveEvent } from "../events/types";
import type { HolderRef } from "../types";

/** The net money one holder pays another in a group (FR-081: what changes hands in chips). */
export interface MoneyFlow {
  readonly from: HolderRef;
  readonly to: HolderRef;
  readonly amount: number;
}

/**
 * Every pair's net money in a group, in order of first appearance: A → B 100 and B → A 30 net to
 * A → B 70. Any payer may need chips or change, whether or not the bank is involved.
 */
export function moneyFlows(events: readonly PrimitiveEvent[]): MoneyFlow[] {
  const net = new Map<string, { a: HolderRef; b: HolderRef; amount: number }>();
  for (const e of events) {
    if (e.t !== "moneyTransfer" || e.from === e.to) continue;
    const pair = net.get(`${e.from}|${e.to}`) ?? net.get(`${e.to}|${e.from}`);
    if (!pair) net.set(`${e.from}|${e.to}`, { a: e.from, b: e.to, amount: e.amount });
    else pair.amount += pair.a === e.from ? e.amount : -e.amount;
  }
  return [...net.values()]
    .filter((p) => p.amount !== 0)
    .map((p) => (p.amount > 0 ? { from: p.a, to: p.b, amount: p.amount } : { from: p.b, to: p.a, amount: -p.amount }));
}
