import { describe, expect, it } from "vitest";
import type { CertificateStatus, HoldingRow } from "../../src/domain/actions/limits";
import { donutArcs } from "../../src/ui/components/CertDonut";

/** Feature 016 (US7, contracts/ui.md §6): the arcs of the certificate donut. */

const row = (company: string, certificates: number, counts = true): HoldingRow => ({
  company,
  units: certificates,
  percent: certificates * 10,
  certificates,
  president: false,
  counts,
});

const status = (rows: HoldingRow[], limit?: number): CertificateStatus => {
  const total = rows.reduce((n, r) => n + r.certificates, 0);
  const counted = rows.reduce((n, r) => n + (r.counts ? r.certificates : 0), 0);
  const level = limit === undefined || counted < limit ? "under" : counted === limit ? "at" : "over";
  return { rows, total, counted, ...(limit !== undefined ? { limit } : {}), level };
};

describe("donutArcs (016 US7, FR-029/FR-030)", () => {
  it("the ring is the limit; one arc per company, sized by certificates, in row order", () => {
    const d = donutArcs(status([row("PRR", 3), row("B&O", 2), row("C&O", 1)], 16));
    expect(d.scale).toBe(16);
    expect(d.arcs).toEqual([
      { company: "PRR", length: 3, exempt: false },
      { company: "B&O", length: 2, exempt: false },
      { company: "C&O", length: 1, exempt: false },
    ]);
  });

  it("exempt certificates come after the counted ones", () => {
    const d = donutArcs(status([row("PRR", 3), row("NYC", 1, false), row("B&O", 2)], 16));
    expect(d.arcs.map((a) => [a.company, a.exempt])).toEqual([
      ["PRR", false],
      ["B&O", false],
      ["NYC", true],
    ]);
  });

  it("no holdings: no arcs, the ring is still the limit", () => {
    expect(donutArcs(status([], 16))).toEqual({ scale: 16, arcs: [] });
  });

  it("over the limit, the ring grows to the total so the arcs fill it", () => {
    const d = donutArcs(status([row("PRR", 9), row("B&O", 8)], 16));
    expect(d.scale).toBe(17);
    expect(d.arcs.reduce((n, a) => n + a.length, 0)).toBe(17);
  });

  it("exempt cards that don't fit the limit grow the ring too", () => {
    expect(donutArcs(status([row("PRR", 15), row("NYC", 3, false)], 16)).scale).toBe(18);
  });

  it("without a limit, the ring is the total", () => {
    expect(donutArcs(status([row("PRR", 3), row("B&O", 2)])).scale).toBe(5);
    expect(donutArcs(status([])).scale).toBe(0);
  });
});
