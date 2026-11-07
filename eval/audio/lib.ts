import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { z } from "zod";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../src/voice/providers";
import { normalizeForMatch } from "../../src/voice/transcription/clean";
import { GROQ_TRANSCRIPTION_MODEL, type TranscriptionResult } from "../../src/voice/transcription/groq";
import { KEY_VARIABLES } from "../voice/cli";
import { CATEGORIES, ExpectSchema, percentile } from "../voice/grade";

/**
 * Feature 015 audio check (FR-018, contracts/audio-check.md, data-model §7): the pure parts of
 * `eval:audio` and `eval:audio:collect`, unit-tested in tests/eval/audioCheck.test.ts. The network
 * and file work is in run.ts and collect.ts.
 */

export type AudioLang = "es" | "en";

// ---------------------------------------------------------------------------------------------
// Options

export interface AudioOptions {
  readonly lang: AudioLang | "all";
  readonly groqModel: string;
  readonly provider: ProviderId;
  readonly resolverModel: string;
  readonly only?: readonly string[];
  /** Groq requests per minute (free tier: 20; default 18 stays under it). */
  readonly groqRpm: number;
  /** AI resolver requests per minute, as in eval:voice. */
  readonly rpm?: number;
  readonly free: boolean;
  /** cached: reuse transcripts from eval/audio/transcripts/ (no Groq quota); fresh: always call Groq. */
  readonly transcripts: "cached" | "fresh";
  readonly groqKey: string;
  readonly resolverKey: string;
}

export const DEFAULT_GROQ_RPM = 18;
/** As in eval:voice: Gemini's free tier, paced under its limits. */
const DEFAULT_RPM: Readonly<Partial<Record<ProviderId, number>>> = { gemini: 8 };

const providerOfModel = (model: string) => PROVIDER_IDS.find((id) => model.startsWith(PROVIDERS[id].modelPrefix));

/** Throws an Error naming the problem; run.ts prints it and exits 1 before any request. */
export function parseAudioArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): AudioOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      lang: { type: "string", default: "all" },
      model: { type: "string" },
      resolver: { type: "string" },
      only: { type: "string" },
      "groq-rpm": { type: "string" },
      rpm: { type: "string" },
      free: { type: "boolean", default: false },
      transcripts: { type: "string", default: "cached" },
    },
  });
  if (values.lang !== "es" && values.lang !== "en" && values.lang !== "all") throw new Error(`--lang must be es, en or all, got ${values.lang}`);
  if (values.transcripts !== "cached" && values.transcripts !== "fresh") {
    throw new Error(`--transcripts must be cached or fresh, got ${values.transcripts}`);
  }
  const resolverModel = values.resolver ?? PROVIDERS.anthropic.defaultModel;
  const provider = providerOfModel(resolverModel);
  if (!provider) throw new Error(`Cannot tell the provider of --resolver ${resolverModel}`);
  const groqRpm = values["groq-rpm"] === undefined ? DEFAULT_GROQ_RPM : Number(values["groq-rpm"]);
  if (!(groqRpm > 0)) throw new Error(`--groq-rpm must be a positive number, got ${values["groq-rpm"]}`);
  const rpm = values.rpm === undefined ? DEFAULT_RPM[provider] : Number(values.rpm);
  if (rpm !== undefined && !(rpm > 0)) throw new Error(`--rpm must be a positive number, got ${values.rpm}`);

  const groqKey = env["GROQ_API_KEY"];
  if (!groqKey) throw new Error("Set GROQ_API_KEY to run the audio check.");
  const variable = KEY_VARIABLES[provider];
  const resolverKey = env[variable];
  if (!resolverKey) throw new Error(`Set ${variable} to resolve the transcripts with ${PROVIDERS[provider].label}.`);

  const only = values.only?.split(",").map((s) => s.trim()).filter((s) => s !== "");
  return {
    lang: values.lang,
    groqModel: values.model ?? GROQ_TRANSCRIPTION_MODEL,
    provider,
    resolverModel,
    ...(only ? { only } : {}),
    groqRpm,
    ...(rpm !== undefined ? { rpm } : {}),
    free: values.free,
    transcripts: values.transcripts,
    groqKey,
    resolverKey,
  };
}

// ---------------------------------------------------------------------------------------------
// Manifest

export const ManifestLineSchema = z.object({
  id: z.string().min(1),
  lang: z.enum(["es", "en"]),
  /** File name under eval/audio/clips/. */
  audio: z.string().min(1),
  /** Fixture id under eval/audio/fixtures/ (a session export). */
  fixture: z.string().min(1),
  /** The browser's live transcript of the same speech; absent for clips recorded with Whisper on. */
  browserTranscript: z.string().optional(),
  category: z.enum(CATEGORIES),
  expect: ExpectSchema,
  /** The expected action names a player or a company (SC-002 subset). */
  mentionsName: z.boolean(),
  durationMs: z.number().optional(),
});
export type ManifestLine = z.infer<typeof ManifestLineSchema>;

/**
 * The expectation the audio check grades against. A manifest's actions are the card's whole action
 * (collect copies it), so they carry free text that hand-written eval:voice cases leave out: a
 * cost's `reason` is a display label with no effect on the game, and two right transcripts can
 * word it differently. The manifest keeps it; grading skips it.
 */
export function gradableExpect(expect: ManifestLine["expect"]): ManifestLine["expect"] {
  if (expect.kind !== "actions") return expect;
  return { ...expect, actions: expect.actions.map(({ reason: _reason, ...rest }) => rest) };
}

/** `es-a001`, `es-a002`… per language. */
export function nextId(existing: readonly string[], lang: AudioLang): string {
  const prefix = `${lang}-a`;
  const max = Math.max(0, ...existing.filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)) || 0));
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/** What "Guardar para eval" downloads (VoicePanel SaveForEval, feature 015 fields included). */
export interface Candidate {
  readonly transcript: string;
  readonly expect: Record<string, unknown> | null;
  readonly fixture: unknown;
  readonly audio?: string;
  readonly engine?: "browser" | "whisper";
  readonly lang?: AudioLang;
  readonly durationMs?: number;
}

type Category = (typeof CATEGORIES)[number];

function categoryOf(action: Record<string, unknown> | null): Category {
  if (!action) return "notUnderstood";
  const type = String(action["type"]);
  if (type === "compound") return "compound";
  if (type === "runAndPayout") return "payout";
  if (/train/i.test(type)) return "trains";
  if (/share|par|ipo|president/i.test(type)) return "stock";
  if (/loan/i.test(type)) return "loans";
  return "flow";
}

/** Every string inside a value, at any depth. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function candidateToManifest(candidate: Candidate, files: { id: string; audio: string; fixture: string }): ManifestLine {
  const session = (candidate.fixture as { session?: { players?: { id: string }[]; game?: { companies?: { id: string }[] } } }).session;
  const ids = new Set<string>();
  for (const p of session?.players ?? []) ids.add(p.id).add(`player:${p.id}`);
  for (const c of session?.game?.companies ?? []) ids.add(c.id).add(`company:${c.id}`);
  const action = candidate.expect;
  const actions = !action ? [] : action["type"] === "compound" && Array.isArray(action["actions"]) ? (action["actions"] as Record<string, unknown>[]) : [action];
  const expect = actions.length === 0 ? ({ kind: "notUnderstood" } as const) : ExpectSchema.parse({ kind: "actions", actions });
  return {
    id: files.id,
    lang: candidate.lang ?? "es",
    audio: files.audio,
    fixture: files.fixture,
    ...(candidate.engine !== "whisper" ? { browserTranscript: candidate.transcript } : {}),
    category: categoryOf(action),
    expect,
    mentionsName: strings(actions).some((s) => ids.has(s)),
    ...(candidate.durationMs !== undefined ? { durationMs: candidate.durationMs } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Transcript cache and billing

export function cacheKey(bytes: Uint8Array, model: string, lang: string, hint: string): string {
  return createHash("sha256").update(bytes).update(`\0${model}\0${lang}\0${hint}`).digest("hex");
}

/** Text and real empties are worth keeping; errors and cancels are not. */
export function cacheable(result: TranscriptionResult): boolean {
  return result.kind === "text" || (result.kind === "empty" && result.reason !== "cancelled");
}

/** Groq bills at least 10 s per request. */
export function billedSeconds(durationMs: number | undefined): number {
  return Math.max(10, (durationMs ?? 0) / 1000);
}

/** $ per hour of audio, from Groq's model page (checked 2026-11-07). */
export const GROQ_PRICE_PER_HOUR: Readonly<Record<string, number>> = {
  "whisper-large-v3-turbo": 0.04,
  "whisper-large-v3": 0.111,
};

// ---------------------------------------------------------------------------------------------
// Records, summary, gate

export interface AudioRecord {
  readonly id: string;
  readonly lang: AudioLang;
  readonly engine: "browser" | "whisper";
  readonly pass: boolean;
  readonly transcript: string;
  readonly mentionsName: boolean;
  /** Whisper: the transcript came from the cache (no request, no latency, no billing). */
  readonly cached: boolean;
  /** Whisper: the Groq request's own time, without pacing or backoff waits. */
  readonly latencyMs?: number;
  readonly billedSeconds?: number;
  readonly got?: string;
  readonly reason?: string;
  readonly error?: string;
  /** Whisper: word error rate against the browser transcript (secondary). */
  readonly wer?: number;
}

export interface Counts {
  readonly correct: number;
  readonly total: number;
  readonly namesCorrect: number;
  readonly namesTotal: number;
}

export interface LangAudioSummary {
  /** Both engines, on the clips that have both. */
  readonly both: { readonly browser: Counts; readonly whisper: Counts };
  /** Whisper on every clip, Whisper-only clips included. */
  readonly whisperAll: Counts;
  readonly latency: { readonly measured: number; readonly p50: number; readonly p90: number };
  readonly billedSeconds: number;
  readonly costUsd: number;
  readonly paidEquivalentUsd: number;
}

function countsOf(rs: readonly AudioRecord[]): Counts {
  const names = rs.filter((r) => r.mentionsName);
  return {
    correct: rs.filter((r) => r.pass).length,
    total: rs.length,
    namesCorrect: names.filter((r) => r.pass).length,
    namesTotal: names.length,
  };
}

export function summarizeAudio(records: readonly AudioRecord[], options: { groqModel: string; free: boolean }): Partial<Record<AudioLang, LangAudioSummary>> {
  const out: Partial<Record<AudioLang, LangAudioSummary>> = {};
  for (const lang of ["es", "en"] as const) {
    const rs = records.filter((r) => r.lang === lang);
    if (rs.length === 0) continue;
    const browserIds = new Set(rs.filter((r) => r.engine === "browser").map((r) => r.id));
    const whisper = rs.filter((r) => r.engine === "whisper");
    const fresh = whisper.filter((r) => !r.cached);
    const latencies = fresh.flatMap((r) => (r.latencyMs === undefined ? [] : [r.latencyMs]));
    const billed = fresh.reduce((sum, r) => sum + (r.billedSeconds ?? 0), 0);
    const paid = (billed / 3600) * (GROQ_PRICE_PER_HOUR[options.groqModel] ?? 0);
    out[lang] = {
      both: {
        browser: countsOf(rs.filter((r) => r.engine === "browser")),
        whisper: countsOf(whisper.filter((r) => browserIds.has(r.id))),
      },
      whisperAll: countsOf(whisper),
      latency: { measured: latencies.length, p50: percentile(latencies, 50), p90: percentile(latencies, 90) },
      billedSeconds: billed,
      costUsd: options.free ? 0 : paid,
      paidEquivalentUsd: paid,
    };
  }
  return out;
}

const rate = (correct: number, total: number) => (total === 0 ? 0 : correct / total);

/** How far below the browser Whisper may be, in points of correct rate (gate relaxed 2026-11-07). */
export const GATE_ACCURACY_MARGIN = 0.1;
/** Wider for the names subset: it is small (one clip is about 5–6 points). */
export const GATE_NAMES_MARGIN = 0.15;

/**
 * contracts/audio-check.md "Gate": Whisper close to the browser on accuracy (−10 points) and on
 * names (−15 points), and fast enough (p90 sum ≤ 4 s). Speed needs measured Groq latencies: a run
 * whose transcripts all came from the cache never checked it.
 */
export function gateCheck(
  both: { readonly browser: Counts; readonly whisper: Counts },
  speed: { readonly whisperP90: number; readonly resolverP90: number; readonly measured: number },
): { accuracy: boolean; names: boolean; speed: boolean; pass: boolean } {
  const eps = 1e-9;
  const accuracy =
    both.whisper.total > 0 &&
    rate(both.whisper.correct, both.whisper.total) >= rate(both.browser.correct, both.browser.total) - GATE_ACCURACY_MARGIN - eps;
  const names =
    both.whisper.namesTotal > 0 &&
    rate(both.whisper.namesCorrect, both.whisper.namesTotal) >= rate(both.browser.namesCorrect, both.browser.namesTotal) - GATE_NAMES_MARGIN - eps;
  const fast = speed.measured > 0 && speed.whisperP90 + speed.resolverP90 <= 4000;
  return { accuracy, names, speed: fast, pass: accuracy && names && fast };
}

/** Word edits (insert, delete, substitute) over the reference's word count. */
export function wordErrorRate(reference: string, hypothesis: string): number {
  const ref = normalizeForMatch(reference).split(" ").filter(Boolean);
  const hyp = normalizeForMatch(hypothesis).split(" ").filter(Boolean);
  if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const row = [i];
    for (let j = 1; j <= hyp.length; j++) {
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return Math.min(1, (prev[hyp.length] ?? 0) / ref.length);
}
