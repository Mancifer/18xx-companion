import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Interpreter } from "../../src/voice/interpreter";
import { PROVIDERS } from "../../src/voice/providers";
import { snapshotAndTranscript } from "../../src/voice/snapshot";
import { createPacer, parseEvalArgs, sleep, withBackoff, type EvalOptions } from "./cli";
import { CaseSchema, CATEGORIES, describeCalls, gradeResponse, STOPS, summarize, type EvalCase, type RunRecord, type Summary } from "./grade";
import { loadFixture, type LoadedFixture } from "./load";

/**
 * Voice eval (research R18, T134; feature 005 contracts/eval-report.md):
 * `npm run eval:voice -- [--model <id>] [--provider anthropic|gemini] [--runs N] [--only id,id] [--rpm N] [--free]`.
 * Sends each case exactly as the app would (same adapter, tools, system prompt and snapshot),
 * grades it deterministically and writes eval/voice/results/<date>-<model>[-partial].json.
 * Needs ANTHROPIC_API_KEY or GEMINI_API_KEY for the chosen provider; every run spends money or
 * free quota on that key.
 */

const here = dirname(fileURLToPath(import.meta.url));

let options: EvalOptions;
try {
  options = parseEvalArgs(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const { provider, model, runs, rpm, free, apiKey } = options;

const only = options.only ? new Set(options.only) : undefined;
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
const interpreters = new Map<string, Interpreter>();
const interpreterFor = (id: string) => {
  let i = interpreters.get(id);
  if (!i) {
    i = PROVIDERS[provider].createInterpreter(apiKey, model);
    interpreters.set(id, i);
  }
  return i;
};

const pace = createPacer(rpm);
const records: RunRecord[] = [];
const seenPrefix = new Set<string>();
let rateLimitRetries = 0;
let stoppedByDailyQuota = false;

run: for (let run = 1; run <= runs; run++) {
  for (const c of cases) {
    const f = fixture(c.fixture);
    const base = { caseId: c.id, run, fixture: c.fixture, category: c.category, heldout: c.heldout };
    const prefixFirst = !seenPrefix.has(c.fixture);
    seenPrefix.add(c.fixture);
    const first = prefixFirst ? { prefixFirst } : {};
    const userMessage = snapshotAndTranscript({ ...f.ctx, transcript: c.transcript });
    let latencyMs = 0;
    try {
      // Latency is the last adapter call (its own retry included), not the backoff waits.
      const result = await withBackoff(
        async () => {
          await pace();
          const started = performance.now();
          try {
            return await interpreterFor(c.fixture)(f.session, userMessage);
          } finally {
            latencyMs = Math.round(performance.now() - started);
          }
        },
        {
          sleep,
          onWait: (ms, retry) => console.log(`wait ${c.id.padEnd(10)} límite de uso, reintento ${retry} en ${(ms / 1000).toFixed(0)} s`),
        },
      );
      rateLimitRetries += result.retries;
      if (result.kind === "dailyQuota") {
        console.log(`STOP ${c.id.padEnd(10)} se alcanzó el límite diario; se guarda un resultado parcial`);
        stoppedByDailyQuota = true;
        break run;
      }
      if (result.kind === "rateLimited") {
        records.push({ ...base, pass: false, got: "", reason: "error", error: "rateLimited", latencyMs, ...first });
        console.log(`ERR  ${c.id.padEnd(10)} rateLimited`);
        continue;
      }
      const reply = result.value;
      const grade = gradeResponse(reply, c, f.ctx);
      records.push({
        ...base,
        ...grade,
        latencyMs,
        stop: reply.stop,
        rawStop: reply.rawStop,
        ...(reply.usage ? { usage: reply.usage } : {}),
        ...first,
      });
      const mark = grade.pass ? "ok  " : "FAIL";
      console.log(`${mark} ${c.id.padEnd(10)} ${String(latencyMs).padStart(5)} ms  «${c.transcript}»${grade.pass ? "" : `\n       ${grade.reason ?? ""}: ${describeCalls(reply)}`}`);
    } catch (error) {
      const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      records.push({ ...base, pass: false, got: "", reason: "error", error: text, latencyMs, ...first });
      console.log(`ERR  ${c.id.padEnd(10)} ${text}`);
    }
  }
}

const day = new Date().toISOString().slice(0, 10);
const summary = summarize(records, { provider, model, freeTier: free, rateLimitRetries, date: day });
printSummary(summary);

const partial = only !== undefined || stoppedByDailyQuota;
const out = join(here, "results", `${day}-${model}${partial ? "-partial" : ""}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ summary, records }, null, 2)}\n`, "utf8");
console.log(`\nResults: ${out}`);

function printSummary(s: Summary) {
  const pct = (v: number | null) => (v === null ? "  —  " : `${(v * 100).toFixed(1).padStart(5)}%`);
  const usd = (v: number | null, digits: number) => (v === null ? "—" : `$${v.toFixed(digits)}`);
  console.log(`\n== ${s.provider} / ${s.model}${s.freeTier ? " (free tier)" : ""}: ${s.cases} cases × ${s.runs} runs`);
  console.log(`overall ${pct(s.overall)}   OR subset ${pct(s.orSubset)}   tuning ${pct(s.tuning)}   held-out ${pct(s.heldout)}`);
  for (const cat of CATEGORIES) console.log(`  ${cat.padEnd(14)} ${pct(s.byCategory[cat] ?? null)}`);
  console.log(
    `latency p50 ${s.latencyMs.p50} ms, p95 ${s.latencyMs.p95} ms     stops: ${STOPS.map((stop) => `${stop} ${s.stops[stop]}`).join(", ")}`,
  );
  console.log(
    `tokens in ${s.tokens.input}, out ${s.tokens.output} (thinking ${s.tokens.thinking}), cache read ${s.tokens.cacheRead}, cache write ${s.tokens.cacheWrite}   (cache reads ${pct(s.cacheReadRate)} of calls)`,
  );
  const cost = s.freeTier ? `cost $0.00 (free tier)` : `cost ${usd(s.costUsd, 4)}`;
  console.log(`${cost} · paid equivalent ${usd(s.paidEquivalentUsd, 4)} (${usd(s.paidPerCaseUsd, 5)} per command)`);
  for (const note of s.priceNotes) console.log(`  nota: ${note}`);
  console.log(`rate-limit retries: ${s.rateLimitRetries}`);
  const gates = Object.entries(s.gates).map(([gate, ok]) => `${gate} ${ok ? "✓" : "✗"}`);
  if (!("cache reads > 0" in s.gates)) gates.push(`cache reads > 0 (info) ${(s.cacheReadRate ?? 0) > 0 ? "✓" : "✗"}`);
  console.log(`gates: ${gates.join(" · ")}`);
}
