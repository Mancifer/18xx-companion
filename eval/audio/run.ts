import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Interpreter } from "../../src/voice/interpreter";
import { PROVIDERS } from "../../src/voice/providers";
import { dispose } from "../../src/voice/providers/gemini";
import type { ModelReply } from "../../src/voice/reply";
import { snapshotAndTranscript } from "../../src/voice/snapshot";
import { createGroqTranscriber, type TranscriptionResult } from "../../src/voice/transcription/groq";
import { buildHint } from "../../src/voice/transcription/hint";
import { createPacer, sleep, withBackoff } from "../voice/cli";
import { gradeResponse, percentile, type EvalCase } from "../voice/grade";
import { inLanguage, loadFixture, type LoadedFixture } from "../voice/load";
import {
  billedSeconds,
  cacheable,
  cacheKey,
  gateCheck,
  gradableExpect,
  ManifestLineSchema,
  parseAudioArgs,
  summarizeAudio,
  wordErrorRate,
  type AudioOptions,
  type AudioRecord,
  type ManifestLine,
} from "./lib";

/**
 * Feature 015 audio check (FR-018, contracts/audio-check.md):
 * `npm run eval:audio -- [--lang es|en|all] [--model <whisper id>] [--resolver <ai model id>]
 *   [--only id,id] [--groq-rpm N] [--rpm N] [--free] [--transcripts cached|fresh]`.
 * Transcribes each clip with Groq (the app's own client and hint), resolves both transcripts with
 * the same resolver and grader as eval:voice, and reports both engines per language. Spends Groq
 * and AI-provider quota; built to fit Groq's free tier (only its 20 requests/minute binds).
 * Needs GROQ_API_KEY and the resolver's key.
 */

const here = dirname(fileURLToPath(import.meta.url));

let options: AudioOptions;
try {
  options = parseAudioArgs(process.argv.slice(2), process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const manifestPath = join(here, "manifest.jsonl");
const only = options.only ? new Set(options.only) : undefined;
const lines: ManifestLine[] = (existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l, i) => {
    const parsed = ManifestLineSchema.safeParse(JSON.parse(l));
    if (!parsed.success) throw new Error(`manifest.jsonl line ${i + 1}: ${parsed.error.message}`);
    return parsed.data;
  })
  .filter((l) => !only || only.has(l.id))
  .filter((l) => options.lang === "all" || l.lang === options.lang);
if (lines.length === 0) {
  console.error("No clips to check. Record some with \"Grabar clips de control\", then run npm run eval:audio:collect.");
  process.exit(1);
}

const MIME: Readonly<Record<string, string>> = { ".webm": "audio/webm", ".ogg": "audio/ogg", ".mp4": "audio/mp4", ".m4a": "audio/mp4" };
const transcribe = createGroqTranscriber();
const groqPace = createPacer(options.groqRpm);
const aiPace = createPacer(options.rpm);
const cacheDir = join(here, "transcripts");
mkdirSync(cacheDir, { recursive: true });

const interpreters = new Map<string, Interpreter>();
const interpreterFor = (key: string) => {
  let i = interpreters.get(key);
  if (!i) {
    i = PROVIDERS[options.provider].createInterpreter(options.resolverKey, options.resolverModel);
    interpreters.set(key, i);
  }
  return i;
};

class Stop extends Error {}

/** Groq, paced and with the voice eval's backoff on 429; a give-up stops the run (partial report). */
async function whisper(line: ManifestLine, f: LoadedFixture): Promise<{ result: TranscriptionResult; cached: boolean }> {
  const bytes = readFileSync(join(here, "clips", line.audio));
  const hint = buildHint(f.session, line.lang);
  const key = cacheKey(bytes, options.groqModel, line.lang, hint);
  const file = join(cacheDir, `${key}.json`);
  if (options.transcripts === "cached" && existsSync(file)) {
    return { result: (JSON.parse(readFileSync(file, "utf8")) as { result: TranscriptionResult }).result, cached: true };
  }
  const blob = new Blob([bytes], { type: MIME[extname(line.audio)] ?? "audio/webm" });
  const outcome = await withBackoff(
    async () => {
      await groqPace();
      const r = await transcribe(blob, {
        apiKey: options.groqKey,
        lang: line.lang,
        prompt: hint,
        fileName: `command${extname(line.audio)}`,
        model: options.groqModel,
      });
      // Let the backoff see rate limits; other errors are recorded as they are.
      if (r.kind === "error" && (r.error.kind === "rateLimit" || r.error.status === 429)) throw r.error;
      return r;
    },
    { sleep, onWait: (ms, retry) => console.log(`wait ${line.id.padEnd(9)} Groq rate limit, retry ${retry} in ${(ms / 1000).toFixed(0)} s`) },
  );
  if (outcome.kind !== "ok") throw new Stop(`${line.id}: Groq rate limit`);
  const result = outcome.value;
  if (cacheable(result)) writeFileSync(file, `${JSON.stringify({ result, at: new Date().toISOString() })}\n`, "utf8");
  return { result, cached: false };
}

const resolverLatencies: number[] = [];

/** The AI resolver on a transcript, graded like an eval:voice case. */
async function resolve(line: ManifestLine, f: LoadedFixture, transcript: string): Promise<{ pass: boolean; got: string; reason?: string }> {
  const c: EvalCase = {
    id: line.id,
    lang: line.lang,
    fixture: line.fixture,
    transcript,
    category: line.category,
    expect: gradableExpect(line.expect),
    tags: [],
    heldout: false,
  };
  let latency = 0;
  const outcome = await withBackoff<ModelReply>(
    async () => {
      await aiPace();
      const started = performance.now();
      try {
        return await interpreterFor(`${line.fixture}:${line.lang}`)(f.session, snapshotAndTranscript({ ...f.ctx, lang: line.lang, transcript }));
      } finally {
        latency = Math.round(performance.now() - started);
      }
    },
    { sleep, onWait: (ms, retry) => console.log(`wait ${line.id.padEnd(9)} resolver rate limit, retry ${retry} in ${(ms / 1000).toFixed(0)} s`) },
  );
  if (outcome.kind !== "ok") throw new Stop(`${line.id}: resolver ${outcome.kind}`);
  resolverLatencies.push(latency);
  const grade = gradeResponse(outcome.value, c, f.ctx);
  return { pass: grade.pass, got: grade.got, ...(grade.reason !== undefined ? { reason: grade.reason } : {}) };
}

const records: AudioRecord[] = [];
let stopped: string | undefined;

try {
  for (const line of lines) {
    const f = inLanguage(loadFixture(join(here, "fixtures"), line.fixture), line.lang);
    const base = { id: line.id, lang: line.lang, mentionsName: line.mentionsName };
    if (line.browserTranscript !== undefined) {
      const graded = await resolve(line, f, line.browserTranscript);
      records.push({ ...base, engine: "browser", transcript: line.browserTranscript, cached: false, ...graded });
    }
    const { result, cached } = await whisper(line, f);
    const fresh = cached ? {} : { billedSeconds: billedSeconds(line.durationMs), ...(result.kind === "text" ? { latencyMs: result.ms } : {}) };
    if (result.kind === "text") {
      const graded = await resolve(line, f, result.text);
      const wer = line.browserTranscript !== undefined ? { wer: wordErrorRate(line.browserTranscript, result.text) } : {};
      records.push({ ...base, engine: "whisper", transcript: result.text, cached, ...fresh, ...graded, ...wer });
    } else {
      // Nothing heard counts as right only where nothing was expected.
      const error = result.kind === "error" ? { error: `${result.error.kind}: ${result.error.message}` } : { reason: `empty: ${result.reason}` };
      records.push({ ...base, engine: "whisper", transcript: "", cached, ...fresh, pass: line.expect.kind === "notUnderstood", ...error });
    }
    const last = records.filter((r) => r.id === line.id);
    console.log(
      `${line.id.padEnd(9)} ${last.map((r) => `${r.engine} ${r.pass ? "ok  " : "FAIL"}`).join("  ")}  «${last.at(-1)?.transcript ?? ""}»${cached ? " (cached)" : ""}`,
    );
  }
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  stopped = error.message;
  console.log(`STOP ${stopped}; saving a partial report`);
} finally {
  await Promise.all([...interpreters.values()].map(dispose));
}

const summary = summarizeAudio(records, { groqModel: options.groqModel, free: options.free });
const resolverP90 = percentile(resolverLatencies, 90);
const pct = (c: number, t: number) => (t === 0 ? "—" : `${c}/${t}`);
const usd = (n: number) => `$${n.toFixed(4)}`;

console.log(`\n== Whisper ${options.groqModel} vs browser · resolver ${options.resolverModel}${options.free ? " (free tier)" : ""}`);
console.log("lang  engine    correct  names    p50 ms  p90 ms  groq s  cost");
const gates: Record<string, ReturnType<typeof gateCheck>> = {};
for (const [lang, s] of Object.entries(summary)) {
  const { browser, whisper: w } = s.both;
  console.log(`${lang.padEnd(5)} browser   ${pct(browser.correct, browser.total).padEnd(8)} ${pct(browser.namesCorrect, browser.namesTotal).padEnd(8)} —       —       —       —`);
  console.log(
    `${lang.padEnd(5)} whisper   ${pct(w.correct, w.total).padEnd(8)} ${pct(w.namesCorrect, w.namesTotal).padEnd(8)} ${String(s.latency.p50).padEnd(7)} ${String(s.latency.p90).padEnd(7)} ${String(s.billedSeconds).padEnd(7)} ${options.free ? `$0.00 (free tier) · paid ${usd(s.paidEquivalentUsd)}` : usd(s.costUsd)}`,
  );
  console.log(`      whisper (all clips) ${pct(s.whisperAll.correct, s.whisperAll.total)} · latency measured on ${s.latency.measured} request(s)`);
  gates[lang] = gateCheck(s.both, { whisperP90: s.latency.p90, resolverP90, measured: s.latency.measured });
  const g = gates[lang];
  console.log(`      gate: accuracy ${g.accuracy ? "ok" : "NO"} · names ${g.names ? "ok" : "NO"} · speed ${g.speed ? "ok" : s.latency.measured === 0 ? "not measured (use --transcripts fresh)" : "NO"} (resolver p90 ${resolverP90} ms) → ${g.pass ? "PASS" : "not yet"}`);
}
const failed = records.filter((r) => !r.pass);
if (failed.length) {
  console.log("\nFailed:");
  for (const r of failed) console.log(`  ${r.id} ${r.engine.padEnd(8)} «${r.transcript}» ${r.reason ?? r.error ?? ""}`);
}

const day = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const partial = stopped !== undefined || only !== undefined;
const out = join(here, "results", `${day}-${options.groqModel}${options.lang === "all" ? "" : `-${options.lang}`}${partial ? "-partial" : ""}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ options: { ...options, groqKey: undefined, resolverKey: undefined }, summary, gates, resolverP90, stopped, records }, null, 2)}\n`, "utf8");
console.log(`\nResults: ${out}`);
