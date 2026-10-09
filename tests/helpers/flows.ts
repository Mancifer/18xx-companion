import type { PrimitiveEvent } from "../../src/domain/events/types";

/** Net money change per holder for a list of events (only holders that changed). */
export function netMoney(events: readonly PrimitiveEvent[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const e of events) {
    if (e.t !== "moneyTransfer") continue;
    net[e.from] = (net[e.from] ?? 0) - e.amount;
    net[e.to] = (net[e.to] ?? 0) + e.amount;
  }
  return Object.fromEntries(Object.entries(net).filter(([, v]) => v !== 0));
}

export function eventsOf<T extends PrimitiveEvent["t"]>(
  events: readonly PrimitiveEvent[],
  t: T,
): Extract<PrimitiveEvent, { t: T }>[] {
  return events.filter((e): e is Extract<PrimitiveEvent, { t: T }> => e.t === t);
}
