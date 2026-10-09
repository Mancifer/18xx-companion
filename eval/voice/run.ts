import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_MODEL } from "../../src/persistence/settingsRepo";
import { createInterpreter } from "../../src/voice/interpreter";
import { snapshotAndTranscript } from "../../src/voice/snapshot";
import { CaseSchema, CATEGORIES, describeCalls, gradeResponse, summarize, type EvalCase, type RunRecord, type Summary } from "./grade";
import { loadFixture, type LoadedFixture } from "./load";

/**
 * Voice eval (research R18, T134): `npm run eval:voice -- --model <id> [--runs 3] [--only id,id]`.
 * Sends each case exactly as the app would (same interpreter, tools, system prompt and snapshot),
 * grades it deterministically and writes eval/voice/results/<date>-<model>.json. Needs
 * ANTHROPIC_API_KEY; every run spends money on that key.
 */

const here = dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    model: { type: "string", default: DEFAULT_MODEL },
    runs: { type: "string", default: "1" },
    only: { type: "string" },
  },
});
const model = values.model;
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);

const apiKey = process.env["ANTHROPIC_API_KEY"];
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY (ideally a key from a workspace with a monthly spend limit).");
  process.exit(1);
}

const only = values.only ? new Set(values.only.split(",").map((s) => s.trim())) : undefined;
const cases: EvalCase[] = readFileSync(join(here, "cases.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l, i) => {
    const parsed = CaseSchema.safeParse(JSON.parse(l));
    if (!parsed.success) throw new Error(`cases.jsonl line ${i + 1}: ${parsed.error.message}`);
    return parsed.data;
  })
  .filter((c) => !only || only.has(c.id));
// Grouped by fixture, so each fixture's cached prefix stays warm across its cases.
cases.sort((a, b) => a.fixture.localeCompare(b.fixture));

const fixtures = new Map<string, LoadedFixture>();
const fixture = (id: string) => {
  let f = fixtures.get(id);
  if (!f) {
    f = loadFixture(join(here, "fixtures"), id);
    fixtures.set(id, f);
  }
  return f;
};

// One interpreter per fixture: it memoizes tools and system prompt for its session.
const interpreters = new Map<string, ReturnType<typeof createInterpreter>>();
const interpreterFor = (id: string) => {
  let i = interpreters.get(id);
  if (!i) {
    i = createInterpreter(apiKey, model);
    interpreters.set(id, i);
  }
  return i;
};

const records: RunRecord[] = [];
const seenPrefix = new Set<string>();
for (let run = 1; run <= runs; run++) {
  for (const c of cases) {
    const f = fixture(c.fixture);
    const base = { caseId: c.id, run, fixture: c.fixture, category: c.category, heldout: c.heldout };
    const prefixFirst = !seenPrefix.has(c.fixture);
    seenPrefix.add(c.fixture);
    const userMessage = snapshotAndTranscript({ ...f.ctx, transcript: c.transcript });
    const started = performance.now();
    try {
      const message = await interpreterFor(c.fixture)(f.session, userMessage);
      const latencyMs = Math.round(performance.now() - started);
      const grade = gradeResponse(message, c, f.ctx);
      records.push({ ...base, ...grade, latencyMs, usage: message.usage, ...(prefixFirst ? { prefixFirst } : {}) });
      const mark = grade.pass ? "ok  " : "FAIL";
      console.log(`${mark} ${c.id.padEnd(10)} ${String(latencyMs).padStart(5)} ms  «${c.transcript}»${grade.pass ? "" : `\n       ${grade.reason ?? ""}: ${describeCalls(message)}`}`);
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      records.push({ ...base, pass: false, got: "", reason: "error", error: text, latencyMs, ...(prefixFirst ? { prefixFirst } : {}) });
      console.log(`ERR  ${c.id.padEnd(10)} ${text}`);
    }
  }
}

const summary = summarize(records, model);
printSummary(summary);

const day = new Date().toISOString().slice(0, 10);
const out = join(here, "results", `${day}-${model}${only ? "-partial" : ""}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, records }, null, 2)}\n`, "utf8");
console.log(`\nResults: ${out}`);

function printSummary(s: Summary) {
  const pct = (v: number | null) => (v === null ? "  —  " : `${(v * 100).toFixed(1).padStart(5)}%`);
  console.log(`\n== ${s.model}: ${s.cases} cases × ${s.runs} runs`);
  console.log(`overall ${pct(s.overall)}   OR subset ${pct(s.orSubset)}   tuning ${pct(s.tuning)}   held-out ${pct(s.heldout)}`);
  for (const cat of CATEGORIES) console.log(`  ${cat.padEnd(14)} ${pct(s.byCategory[cat] ?? null)}`);
  console.log(`latency p50 ${s.latencyMs.p50} ms, p95 ${s.latencyMs.p95} ms   cache reads ${pct(s.cacheReadRate)}`);
  console.log(
    `tokens in ${s.tokens.input}, out ${s.tokens.output}, cache write ${s.tokens.cacheWrite}, cache read ${s.tokens.cacheRead}` +
      (s.costUsd === null ? "" : `   cost $${s.costUsd.toFixed(4)} ($${(s.costPerCaseUsd ?? 0).toFixed(5)}/call)`),
  );
  for (const [gate, ok] of Object.entries(s.gates)) console.log(`  ${ok ? "PASS" : "FAIL"} ${gate}`);
}
