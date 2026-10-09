import type { PrimitiveEvent } from "../events/types";
import type { HolderRef } from "../types";

/** One counterparty's net money with the bank in a group (FR-081: what changes hands in chips). */
export interface MoneyFlow {
  readonly counterparty: HolderRef;
  readonly direction: "fromBank" | "toBank";
  readonly amount: number;
}

/**
 * The bank's flows in a group, netted per counterparty, in order of first appearance. Transfers
 * that do not involve the bank (player ↔ company) need no chips from the bank and are left out.
 */
export function bankFlows(events: readonly PrimitiveEvent[]): MoneyFlow[] {
  const net = new Map<HolderRef, number>();
  for (const e of events) {
    if (e.t !== "moneyTransfer" || e.from === e.to) continue;
    if (e.from === "bank") net.set(e.to, (net.get(e.to) ?? 0) + e.amount);
    else if (e.to === "bank") net.set(e.from, (net.get(e.from) ?? 0) - e.amount);
  }
  return [...net]
    .filter(([, amount]) => amount !== 0)
    .map(([counterparty, amount]) => ({
      counterparty,
      direction: amount > 0 ? ("fromBank" as const) : ("toBank" as const),
      amount: Math.abs(amount),
    }));
}
