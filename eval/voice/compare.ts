import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, STOPS, type Summary } from "./grade";

/**
 * Side-by-side report of two eval result files (feature 005, SC-005): accuracy overall and per
 * category, latency, stop counts and paid cost per command, with the difference (b − a).
 * Read-only. `npm run eval:voice:compare -- <a.json> <b.json>`.
 * Older result files lack the 005 fields; those rows show "—".
 */

type Comparable = Partial<Omit<Summary, "stops">> & { readonly stops?: Partial<Summary["stops"]> };

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

export function formatComparison(a: Comparable, b: Comparable): string {
  const lines = [`A: ${title(a)}`, `B: ${title(b)}`, "", row("", "A", "B", "B − A")];
  lines.push(percentRow("overall", a.overall, b.overall));
  lines.push(percentRow("OR subset", a.orSubset, b.orSubset));
  lines.push(percentRow("held-out", a.heldout, b.heldout));
  for (const cat of CATEGORIES) lines.push(percentRow(`  ${cat}`, a.byCategory?.[cat], b.byCategory?.[cat]));
  lines.push(numberRow("latency p50 ms", a.latencyMs?.p50, b.latencyMs?.p50));
  lines.push(numberRow("latency p95 ms", a.latencyMs?.p95, b.latencyMs?.p95));
  lines.push("stops");
  for (const stop of STOPS) lines.push(numberRow(`  ${stop}`, a.stops?.[stop], b.stops?.[stop]));
  lines.push(numberRow("paid $ / command", a.paidPerCaseUsd, b.paidPerCaseUsd, 5));
  lines.push(numberRow("rate-limit retries", a.rateLimitRetries, b.rateLimitRetries));
  return lines.join("\n");
}

function load(path: string): Comparable {
  const file = JSON.parse(readFileSync(resolve(path), "utf8")) as { summary?: Comparable };
  if (!file.summary) throw new Error(`${path} has no summary`);
  return file.summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [first, second] = process.argv.slice(2);
  if (!first || !second) {
    console.error("Usage: npm run eval:voice:compare -- <result-a.json> <result-b.json>");
    process.exit(1);
  }
  console.log(formatComparison(load(first), load(second)));
}
