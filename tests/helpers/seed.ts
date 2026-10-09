import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { AssetId, CellRef, HolderRef } from "../../src/domain/types";
import type { TestSession } from "./dispatch";

export interface CompanySeed {
  readonly cell: CellRef;
  readonly par?: number;
  readonly status?: "parred" | "floated" | "receivership";
  readonly cash?: number;
  /** Units per holder, taken from the IPO. The first player listed holds the presidency. */
  readonly holders?: Readonly<Record<string, number>>;
  readonly trains?: readonly AssetId[];
}

/** Puts a company in a given position without going through the stock round actions. */
export function seedCompany(s: TestSession, company: string, seed: CompanySeed): TestSession {
  return s.apply(...seedEvents(company, seed));
}

export function seedEvents(company: string, seed: CompanySeed): PrimitiveEvent[] {
  const events: PrimitiveEvent[] = [
    { t: "companyStatus", company, status: seed.status ?? "floated", ...(seed.par ? { parPrice: seed.par } : {}) },
    { t: "marketMove", company, to: seed.cell, reason: "par" },
  ];
  if (seed.cash) events.push({ t: "moneyTransfer", from: "bank", to: `company:${company}`, amount: seed.cash });
  let presidentDone = false;
  for (const [holder, units] of Object.entries(seed.holders ?? {})) {
    const president = !presidentDone && holder.startsWith("player:");
    if (president) presidentDone = true;
    events.push({
      t: "shareTransfer",
      company,
      from: `ipo:${company}`,
      to: holder as HolderRef,
      units,
      ...(president ? { presidency: true } : {}),
    });
  }
  for (const asset of seed.trains ?? []) {
    events.push({ t: "assetTransfer", asset, from: "bank", to: `company:${company}` });
  }
  return events;
}
