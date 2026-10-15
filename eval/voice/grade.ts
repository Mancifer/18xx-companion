import { z } from "zod";
import type { Action } from "../../src/domain/actions/schemas";
import type { CacheEvent } from "../../src/voice/interpreter";
import type { ProviderId } from "../../src/voice/providers";
import { CACHE_TTL_S } from "../../src/voice/providers/gemini";
import type { ModelReply, ReplyStop, TokenUsage } from "../../src/voice/reply";
import { costOf, priceFor, storageCostUsd, type PricePeriod } from "./prices";
import { isSetup } from "../../src/domain/ledger/undo";
import { resolveResponse, type ResolveContext } from "../../src/voice/resolve";

/**
 * Deterministic grading for the voice eval (research R18): no LLM judge. Action calls go
 * through the app's own resolveResponse (same Zod schemas and pipeline as a real command), then
 * both sides are normalized (null defaults resolved) and compared. Fields an expected action
 * leaves out are not graded (free text such as a cost's reason).
 */

export const CATEGORIES = [
  "payout",
  "trains",
  "costs",
  "stock",
  "loans",
  "flow",
  "compound",
  "corrections",
  "queries",
  "clarification",
  "notUnderstood",
] as const;

const Rec = z.record(z.string(), z.unknown());

export const ExpectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("actions"), actions: z.array(Rec.and(z.object({ type: z.string() }))).min(1) }),
  z.object({ kind: z.literal("clarification"), candidates: z.array(z.string()) }),
  z.object({
    kind: z.literal("query"),
    query: z.string(),
    player: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
  }),
  /** groupId: null (or absent) = the newest entry; an id = undo back to that entry (feature 010). */
  z.object({ kind: z.literal("undo"), groupId: z.string().nullable().optional() }),
  z.object({ kind: z.literal("amend"), value: z.number().int(), part: z.string().nullable().optional() }),
  z.object({ kind: z.literal("notUnderstood") }),
]);
export type Expect = z.infer<typeof ExpectSchema>;

export const CaseSchema = z.object({
  id: z.string().min(1),
  fixture: z.string().min(1),
  transcript: z.string().min(1),
  category: z.enum(CATEGORIES),
  expect: ExpectSchema,
  tags: z.array(z.string()).default([]),
  heldout: z.boolean().default(false),
});
export type EvalCase = z.infer<typeof CaseSchema>;

export interface Grade {
  readonly pass: boolean;
  /** What the model produced, in short, for the report. */
  readonly got: string;
  readonly reason?: string;
}

type Json = Record<string, unknown>;

/** Null means "the default" in action payloads (contracts/actions.md); resolve the common ones. */
export function normalizeAction(action: Json, ctx: ResolveContext): Json {
  const out: Json = { ...action };
  const current = ctx.state.turn.currentCompany ?? null;
  if ("company" in out && out["company"] === null && CURRENT_COMPANY.has(String(out["type"]))) out["company"] = current;
  switch (out["type"]) {
    case "runAndPayout": {
      const choice = ctx.game.revenueParts.some((p) => p.to === "choice");
      if (out["mode"] === null || out["mode"] === undefined) out["mode"] = choice ? "full" : null;
      const parts = Array.isArray(out["parts"]) ? (out["parts"] as Json[]) : [];
      out["parts"] = [...parts].sort((a, b) => String(a["part"]).localeCompare(String(b["part"])));
      break;
    }
    case "buyShare":
      if (out["count"] === null) out["count"] = 1;
      break;
    case "takeLoan":
    case "redeemShare":
      if (out["count"] === null || out["count"] === undefined) out["count"] = 1;
      break;
    case "mergeCompanies":
      if (out["identity"] === null || out["identity"] === undefined) out["identity"] = "primary";
      break;
    case "buyTrain": {
      const type = ctx.game.trains.find((t) => t.type === out["trainType"]);
      if (out["variant"] === null) out["variant"] = type?.variants[0]?.name ?? null;
      if (out["from"] === "bank" && out["price"] === null && (out["tradeIn"] ?? null) === null) {
        out["price"] = type?.variants.find((v) => v.name === out["variant"])?.cost ?? null;
      }
      break;
    }
    case "forcedTrainPurchase": {
      // Same default as buyTrain: a null variant is the type's first one.
      const type = ctx.game.trains.find((t) => t.type === out["trainType"]);
      if (out["variant"] === null) out["variant"] = type?.variants[0]?.name ?? null;
      break;
    }
    case "correctTrain": {
      // A train asset id grades as its type; a null amount is the list price (remove → bank) or no money.
      const train = typeof out["train"] === "string" ? out["train"] : "";
      if (train.includes(":")) out["train"] = train.split(":")[1] ?? train;
      if (out["amount"] === null || out["amount"] === undefined) {
        const cost = ctx.game.trains.find((t) => t.type === out["train"])?.variants[0]?.cost ?? 0;
        out["amount"] = out["op"] === "remove" && out["to"] === "bank" ? cost : 0;
      }
      break;
    }
    case "stockBatch":
      if (Array.isArray(out["items"])) out["items"] = (out["items"] as Json[]).map((i) => normalizeAction(i, ctx));
      break;
  }
  return out;
}

const CURRENT_COMPANY = new Set([
  "runAndPayout",
  "buyTrain",
  "payCost",
  "bankPays",
  "buyPrivateByCompany",
  "takeLoan",
  "redeemShare",
  "namedPayment",
  "forcedTrainPurchase",
  "rockFormation",
  "cliffSale",
  "canyonTrain",
]);

/** Every key of `expected` matches; arrays match element by element and in length. */
export function matches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matches(e, actual[i]));
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([k, v]) => matches(v, (actual as Json)[k]));
  }
  return expected === actual;
}

/** "runAndPayout{…} + buyTrain{…}" */
export function describeCalls(reply: ModelReply): string {
  if (reply.calls.length === 0) return `(sin herramientas, stop=${reply.stop} (${reply.rawStop}))`;
  return reply.calls.map((c) => `${c.name}${JSON.stringify(c.input)}`).join(" + ");
}

export function gradeResponse(reply: ModelReply, c: EvalCase, ctx: ResolveContext): Grade {
  const got = describeCalls(reply);
  const result = resolveResponse(reply, ctx, c.transcript);
  const fail = (reason: string): Grade => ({ pass: false, got, reason });
  const ok: Grade = { pass: true, got };
  const exp = c.expect;
  switch (exp.kind) {
    case "actions": {
      // notUnderstood here also covers a response the app could not use (bad input, unknown entity).
      if (result.kind === "notUnderstood") return fail(`la app no pudo usarla: ${result.reasonEs}`);
      if (result.kind !== "proposal") return fail(`se esperaban acciones, llegó ${result.kind}`);
      if (result.actions.length !== exp.actions.length) return fail(`${result.actions.length} acciones, se esperaban ${exp.actions.length}`);
      for (const [i, expected] of exp.actions.entries()) {
        const actual = normalizeAction(result.actions[i] as Action as unknown as Json, ctx);
        if (!matches(normalizeAction(expected, ctx), actual)) return fail(`la acción ${i + 1} no coincide`);
      }
      return ok;
    }
    case "clarification": {
      if (result.kind !== "clarification") return fail(`se esperaba aclaración, llegó ${result.kind}`);
      // A candidate may appear whole or as a word of a value or label ("NYC:1", "1 acción de NYC"):
      // tapping an option sends its label and value back to the model, so either names it.
      const words = (s: string) => [s, ...s.split(/[\s:_,;()/|.-]+/)].map((w) => w.toLowerCase());
      const offered = new Set(result.options.flatMap((o) => [...words(o.value), ...words(o.label)]));
      const missing = exp.candidates.filter((x) => !offered.has(x.toLowerCase()));
      return missing.length === 0 ? ok : fail(`faltan opciones: ${missing.join(", ")}`);
    }
    case "query": {
      if (result.kind !== "query") return fail(`se esperaba consulta, llegó ${result.kind}`);
      const input = reply.calls.find((t) => t.name === "query")?.input;
      if (!input) return fail("sin consulta");
      // A company's cash is its treasury: the app answers both the same way (src/domain/queries.ts).
      const companyCash = input["kind"] === "cash" && Boolean(input["company"]) && !input["player"];
      const kind = companyCash ? "treasury" : input["kind"];
      if (kind !== exp.query) return fail(`consulta ${String(input["kind"])}, se esperaba ${exp.query}`);
      if (exp.player !== undefined && input["player"] !== exp.player) return fail("jugador distinto");
      if (exp.company !== undefined && input["company"] !== exp.company) return fail("compañía distinta");
      return ok;
    }
    case "undo": {
      // The app treats a null target and the newest entry's id alike: both undo the newest entry.
      const newest = [...ctx.effective].reverse().find((g) => !isSetup(g))?.id;
      const target = exp.groupId ?? newest;
      if (target === newest) return result.kind === "undo" ? ok : fail(`se esperaba deshacer, llegó ${result.kind}`);
      if (result.kind !== "undoTo") return fail(`se esperaba deshacer hasta ${target}, llegó ${result.kind}`);
      return result.groupId === target ? ok : fail(`deshacer hasta ${result.groupId}, se esperaba ${target}`);
    }
    case "amend": {
      const input = reply.calls.find((t) => t.name === "amendLast")?.input;
      if (!input || result.kind === "clarification" || result.kind === "query") return fail(`se esperaba corrección, llegó ${result.kind}`);
      if (input["value"] !== exp.value) return fail(`valor ${String(input["value"])}, se esperaba ${exp.value}`);
      if (exp.part !== undefined && (input["part"] ?? null) !== exp.part) return fail("parte distinta");
      return ok;
    }
    case "notUnderstood":
      return result.kind === "notUnderstood" ? ok : fail(`se esperaba «No entendí», llegó ${result.kind}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Metrics (research R18; feature 005 contracts/eval-report.md)

export interface RunRecord {
  readonly caseId: string;
  readonly run: number;
  readonly fixture: string;
  readonly category: (typeof CATEGORIES)[number];
  readonly heldout: boolean;
  readonly pass: boolean;
  readonly got: string;
  readonly reason?: string;
  readonly latencyMs: number;
  readonly stop?: ReplyStop;
  /** The provider's own stop reason. */
  readonly rawStop?: string;
  readonly usage?: TokenUsage;
  /** "rateLimited" after the backoff gave up; otherwise the error's name and message. */
  readonly error?: string;
  /** The first call with this fixture's prefix: it writes the cache, so it cannot read it. */
  readonly prefixFirst?: boolean;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

const accuracy = (rs: readonly RunRecord[]) => (rs.length === 0 ? null : rs.filter((r) => r.pass).length / rs.length);

/** The OR subset is every case on an operating-round fixture (SC-003). */
export const isOrFixture = (fixture: string) => fixture.endsWith("-or");

export const STOPS: readonly ReplyStop[] = ["done", "truncated", "refused", "malformed", "other"];

export interface SummaryOptions {
  readonly provider: ProviderId;
  readonly model: string;
  /** Run with --free: costUsd is 0, paidEquivalentUsd still computed. */
  readonly freeTier: boolean;
  readonly rateLimitRetries: number;
  /** YYYY-MM-DD; picks the price period. */
  readonly date: string;
  /** Explicit caching (feature 009): whether it was on, each cache's lifetime and every event. */
  readonly cache?: { readonly on: boolean; readonly caches: readonly CacheLifetime[]; readonly events: readonly CacheEvent[] };
}

/** One explicit cache in a run: stored from its create until the TTL after its last use. */
export interface CacheLifetime {
  readonly tokens: number;
  /** Epoch ms, from the created event. */
  readonly createdAt: number;
  /** Epoch ms when the last call that could read it ended. */
  readonly lastUseAt: number;
}

/** Totals in paid-equivalent dollars: tokens (cache writes included) plus storage. */
export interface CacheTotals {
  readonly totalUsd: number;
  readonly totalPerCaseUsd: number;
}

/** The same keys for every provider; fields that don't apply hold 0 or null (SC-005). */
export interface Summary {
  readonly provider: ProviderId;
  readonly model: string;
  readonly freeTier: boolean;
  readonly cases: number;
  readonly runs: number;
  readonly overall: number | null;
  readonly orSubset: number | null;
  readonly tuning: number | null;
  readonly heldout: number | null;
  readonly byCategory: Readonly<Record<string, number | null>>;
  /** firstP95: over each fixture's first call, the one that runs while its cache is created. */
  readonly latencyMs: { readonly p50: number; readonly p95: number; readonly firstP95: number | null };
  /** Share of calls, past each fixture's first, that read the cached prefix. */
  readonly cacheReadRate: number | null;
  readonly tokens: TokenUsage;
  readonly costUsd: number | null;
  readonly costPerCaseUsd: number | null;
  readonly paidEquivalentUsd: number | null;
  readonly paidPerCaseUsd: number | null;
  readonly priceNotes: readonly string[];
  /** Feature 009: whether explicit caching was on. */
  readonly cache: "on" | "off";
  /** failures counts failed creates; failed PATCH/DELETE calls are harmless and only logged. */
  readonly cacheEvents: { readonly created: number; readonly extended: number; readonly deleted: number; readonly fallbacks: number; readonly failures: number };
  /** Explicit-cache storage; null without a price. */
  readonly storageUsd: number | null;
  /** paidEquivalentUsd + storageUsd. */
  readonly totalUsd: number | null;
  readonly totalPerCaseUsd: number | null;
  /** The same totals at the 2027-01-01 prices; null when the model has no such period. */
  readonly at2027: CacheTotals | null;
  readonly stops: Readonly<Record<ReplyStop, number>>;
  readonly rateLimitRetries: number;
  readonly gates: Readonly<Record<string, boolean>>;
}

export function summarize(records: readonly RunRecord[], options: SummaryOptions): Summary {
  const { provider, model, freeTier, rateLimitRetries, date } = options;
  const cacheOn = options.cache?.on ?? false;
  const events = options.cache?.events ?? [];
  const caches = options.cache?.caches ?? [];
  const count = (kind: CacheEvent["kind"]) => events.filter((e) => e.kind === kind).length;
  const written = events.reduce((n, e) => n + (e.kind === "created" ? e.tokens : 0), 0);
  const byCategory = Object.fromEntries(CATEGORIES.map((cat) => [cat, accuracy(records.filter((r) => r.category === cat))]));
  const latencies = records.filter((r) => r.error === undefined).map((r) => r.latencyMs);
  const firstLatencies = records.filter((r) => r.error === undefined && r.prefixFirst).map((r) => r.latencyMs);
  const later = records.filter((r) => r.usage && !r.prefixFirst);
  const cacheReadRate = later.length === 0 ? null : later.filter((r) => (r.usage?.cacheRead ?? 0) > 0).length / later.length;
  const sum = (f: (u: TokenUsage) => number) => records.reduce((n, r) => n + (r.usage ? f(r.usage) : 0), 0);
  const tokens: TokenUsage = {
    input: sum((u) => u.input),
    output: sum((u) => u.output),
    cacheRead: sum((u) => u.cacheRead),
    // Explicit-cache writes are not part of any reply: they come from the created events.
    cacheWrite: sum((u) => u.cacheWrite) + written,
    thinking: sum((u) => u.thinking),
  };

  const price = priceFor(model, date);
  const priceNotes: string[] = [];
  if (!price) priceNotes.push(`sin precio para ${model}: coste desconocido`);
  if (price && price.cacheRead === null && tokens.cacheRead > 0) priceNotes.push("lecturas de caché cobradas al precio de entrada");
  if (price && price.cacheWrite === null && tokens.cacheWrite > 0) priceNotes.push("escrituras de caché cobradas al precio de entrada");
  const tokenCost = (p: PricePeriod) =>
    records.reduce((n, r) => n + (r.usage ? costOf(r.usage, p) : 0), 0) + (written * (p.cacheWrite ?? p.input)) / 1e6;
  // Each cache is stored from its create until the TTL runs out after its last use.
  const storage = (p: PricePeriod) =>
    caches.reduce((n, c) => n + storageCostUsd(c.tokens, (c.lastUseAt - c.createdAt) / 3.6e6 + CACHE_TTL_S / 3600, p), 0);
  const paidEquivalentUsd = price ? tokenCost(price) : null;
  const costUsd = freeTier ? 0 : paidEquivalentUsd;
  const perCase = (v: number | null) => (v === null ? null : records.length === 0 ? 0 : v / records.length);
  const storageUsd = price ? storage(price) : null;
  const totalUsd = price ? tokenCost(price) + storage(price) : null;
  const price2027 = priceFor(model, "2027-01-01");
  const at2027Total = price2027?.from === "2027-01-01" ? tokenCost(price2027) + storage(price2027) : null;

  const stops = Object.fromEntries(STOPS.map((s) => [s, records.filter((r) => r.stop === s).length])) as Record<ReplyStop, number>;
  const orSubset = accuracy(records.filter((r) => isOrFixture(r.fixture)));
  const p95 = percentile(latencies, 95);
  const categoryValues = Object.values(byCategory).filter((v): v is number => v !== null);
  const gates: Record<string, boolean> = {
    "OR subset >= 90%": (orSubset ?? 0) >= 0.9,
    "no category < 80%": categoryValues.every((v) => v >= 0.8),
    "p95 API latency < 2.5 s": latencies.length > 0 && p95 < 2500,
  };
  // Google does not guarantee implicit cache hits, so for Gemini it is reported, not gated (R5).
  if (provider === "anthropic") gates["cache reads > 0"] = (cacheReadRate ?? 0) > 0;
  // Explicit caching must hit (feature 009 SC-001).
  if (provider === "gemini" && cacheOn) gates["cache reads ≥ 90%"] = (cacheReadRate ?? 0) >= 0.9;

  return {
    provider,
    model,
    freeTier,
    cases: new Set(records.map((r) => r.caseId)).size,
    runs: Math.max(0, ...records.map((r) => r.run)),
    overall: accuracy(records),
    orSubset,
    tuning: accuracy(records.filter((r) => !r.heldout)),
    heldout: accuracy(records.filter((r) => r.heldout)),
    byCategory,
    latencyMs: { p50: percentile(latencies, 50), p95, firstP95: firstLatencies.length === 0 ? null : percentile(firstLatencies, 95) },
    cacheReadRate,
    tokens,
    costUsd,
    costPerCaseUsd: perCase(costUsd),
    paidEquivalentUsd,
    paidPerCaseUsd: perCase(paidEquivalentUsd),
    priceNotes,
    cache: cacheOn ? "on" : "off",
    cacheEvents: { created: count("created"), extended: count("extended"), deleted: count("deleted"), fallbacks: count("fallback"), failures: events.filter((e) => e.kind === "failed" && e.op === "create").length },
    storageUsd,
    totalUsd,
    totalPerCaseUsd: perCase(totalUsd),
    at2027: at2027Total === null ? null : { totalUsd: at2027Total, totalPerCaseUsd: perCase(at2027Total) ?? 0 },
    stops,
    rateLimitRetries,
    gates,
  };
}
