import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, percentile, STOPS, type RunRecord, type Summary } from "./grade";
import { costOf, priceFor } from "./prices";

/**
 * Side-by-side report of two eval result files (feature 005, SC-005): accuracy overall and per
 * category, latency, stop counts and paid cost per command, with the difference (b − a).
 * Read-only. `npm run eval:voice:compare -- <a.json> <b.json>`.
 * Older result files lack the 005 fields; those rows show "—".
 * Feature 009 adds cache reads, total cost per command at today's and 2027 prices, first-call
 * p95, the SC-003 (category drop) and SC-004 (p95) flags, and per-case changes. Fields an older
 * file lacks are computed from its records when it has them.
 */

type Comparable = Partial<Omit<Summary, "stops" | "latencyMs">> & {
  readonly stops?: Partial<Summary["stops"]>;
  readonly latencyMs?: Partial<Summary["latencyMs"]>;
  readonly records?: readonly RunRecord[];
};

const DASH = "—";
const pct = (v: number | null | undefined) => (v === null || v === undefined ? DASH : `${(v * 100).toFixed(1)}%`);
const signed = (v: number, digits: number) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

function row(name: string, a: string, b: string, diff: string): string {
  return `${name.padEnd(18)}${a.padStart(12)}${b.padStart(12)}${diff.padStart(10)}`;
}

function percentRow(name: string, a: number | null | undefined, b: number | null | undefined): string {
  const diff = a === null || a === undefined || b === null || b === undefined ? DASH : signed((b - a) * 100, 1);
  return row(name, pct(a), pct(b), diff);
}

function numberRow(name: string, a: number | null | undefined, b: number | null | undefined, digits = 0, unit = ""): string {
  const show = (v: number | null | undefined) => (v === null || v === undefined ? DASH : `${v.toFixed(digits)}${unit}`);
  const diff = a === null || a === undefined || b === null || b === undefined ? DASH : signed(b - a, digits);
  return row(name, show(a), show(b), diff);
}

const title = (s: Comparable) => `${s.provider ?? "?"} / ${s.model ?? "?"}${s.freeTier ? " (free tier)" : ""}`;

function firstP95(s: Comparable): number | undefined {
  if (typeof s.latencyMs?.firstP95 === "number") return s.latencyMs.firstP95;
  const first = (s.records ?? []).filter((r) => r.prefixFirst && r.error === undefined).map((r) => r.latencyMs);
  return first.length === 0 ? undefined : percentile(first, 95);
}

function total2027(s: Comparable): number | undefined {
  if (s.at2027) return s.at2027.totalPerCaseUsd;
  const price = s.model ? priceFor(s.model, "2027-01-01") : undefined;
  if (!s.records?.length || price?.from !== "2027-01-01") return undefined;
  return s.records.reduce((n, r) => n + (r.usage ? costOf(r.usage, price) : 0), 0) / s.records.length;
}

/** Passing cases in a category: counted from records, or rate × cases. */
function passes(s: Comparable, category: string, size: number | undefined): number | undefined {
  if (s.records) return s.records.filter((r) => r.category === category && r.pass).length;
  const rate = s.byCategory?.[category];
  return rate === null || rate === undefined ? undefined : Math.round(rate * (size ?? s.cases ?? 0));
}

function flags(a: Comparable, b: Comparable): string[] {
  const lines: string[] = [];
  const sized = a.records ?? b.records;
  let compared = false;
  for (const cat of CATEGORIES) {
    const size = sized ? sized.filter((r) => r.category === cat).length : undefined;
    const before = passes(a, cat, size);
    const after = passes(b, cat, size);
    if (before === undefined || after === undefined) continue;
    compared = true;
    if (before - after > 1) lines.push(`SC-003 ✗: ${cat} dropped by ${before - after} cases`);
  }
  if (compared && lines.length === 0) lines.push("SC-003 ✓: no category dropped by more than one case");
  const pa = a.latencyMs?.p95;
  const pb = b.latencyMs?.p95;
  if (pa && pb) lines.push(`SC-004 ${pb > 1.1 * pa ? "✗" : "✓"}: p95 ${signed(((pb - pa) / pa) * 100, 1)}%`);
  return lines;
}

/** Cases whose outcome differs; a case passes when all of its runs pass. */
function caseChanges(a: readonly RunRecord[], b: readonly RunRecord[]): string[] {
  const outcome = (rs: readonly RunRecord[]) => {
    const m = new Map<string, boolean>();
    for (const r of rs) m.set(r.caseId, (m.get(r.caseId) ?? true) && r.pass);
    return m;
  };
  const before = outcome(a);
  const after = outcome(b);
  const mark = (v: boolean | undefined) => (v === undefined ? DASH : v ? "✓" : "✗");
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changed = ids.filter((id) => before.get(id) !== after.get(id)).map((id) => `  ${id.padEnd(12)} ${mark(before.get(id))} → ${mark(after.get(id))}`);
  return ["per-case changes (A → B):", ...(changed.length ? changed : ["  none"])];
}

export function formatComparison(a: Comparable, b: Comparable): string {
  const lines = [`A: ${title(a)}`, `B: ${title(b)}`, "", row("", "A", "B", "B − A")];
  lines.push(percentRow("overall", a.overall, b.overall));
  lines.push(percentRow("OR subset", a.orSubset, b.orSubset));
  lines.push(percentRow("held-out", a.heldout, b.heldout));
  for (const cat of CATEGORIES) lines.push(percentRow(`  ${cat}`, a.byCategory?.[cat], b.byCategory?.[cat]));
  lines.push(numberRow("latency p50 ms", a.latencyMs?.p50, b.latencyMs?.p50));
  lines.push(numberRow("latency p95 ms", a.latencyMs?.p95, b.latencyMs?.p95));
  lines.push(numberRow("first-call p95 ms", firstP95(a), firstP95(b)));
  lines.push("stops");
  for (const stop of STOPS) lines.push(numberRow(`  ${stop}`, a.stops?.[stop], b.stops?.[stop]));
  lines.push(percentRow("cache reads", a.cacheReadRate, b.cacheReadRate));
  lines.push(numberRow("paid $ / command", a.paidPerCaseUsd, b.paidPerCaseUsd, 5));
  lines.push(numberRow("total $ / command", a.totalPerCaseUsd ?? a.paidPerCaseUsd, b.totalPerCaseUsd ?? b.paidPerCaseUsd, 5));
  lines.push(numberRow("total $ 2027", total2027(a), total2027(b), 5));
  lines.push(numberRow("rate-limit retries", a.rateLimitRetries, b.rateLimitRetries));
  lines.push("", ...flags(a, b));
  if (a.records && b.records) lines.push("", ...caseChanges(a.records, b.records));
  return lines.join("\n");
}

function load(path: string): Comparable {
  const file = JSON.parse(readFileSync(resolve(path), "utf8")) as { summary?: Comparable; records?: RunRecord[] };
  if (!file.summary) throw new Error(`${path} has no summary`);
  return { ...file.summary, ...(file.records ? { records: file.records } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [first, second] = process.argv.slice(2);
  if (!first || !second) {
    console.error("Usage: npm run eval:voice:compare -- <result-a.json> <result-b.json>");
    process.exit(1);
  }
  console.log(formatComparison(load(first), load(second)));
}
