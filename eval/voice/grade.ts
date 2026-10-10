import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Action } from "../../src/domain/actions/schemas";
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
  z.object({ kind: z.literal("undo") }),
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

const toolCalls = (m: Anthropic.Message) => m.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

/** "runAndPayout{…} + buyTrain{…}" */
export function describeCalls(m: Anthropic.Message): string {
  const calls = toolCalls(m);
  if (calls.length === 0) return `(sin herramientas, stop_reason=${m.stop_reason})`;
  return calls.map((c) => `${c.name}${JSON.stringify(c.input)}`).join(" + ");
}

export function gradeResponse(message: Anthropic.Message, c: EvalCase, ctx: ResolveContext): Grade {
  const got = describeCalls(message);
  const result = resolveResponse(message, ctx, c.transcript);
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
      const offered = new Set(result.options.flatMap((o) => [o.value.toLowerCase(), o.label.toLowerCase()]));
      const missing = exp.candidates.filter((x) => !offered.has(x.toLowerCase()));
      return missing.length === 0 ? ok : fail(`faltan opciones: ${missing.join(", ")}`);
    }
    case "query": {
      if (result.kind !== "query") return fail(`se esperaba consulta, llegó ${result.kind}`);
      const input = toolCalls(message).find((t) => t.name === "query")?.input as Json | undefined;
      if (input?.["kind"] !== exp.query) return fail(`consulta ${String(input?.["kind"])}, se esperaba ${exp.query}`);
      if (exp.player !== undefined && input["player"] !== exp.player) return fail("jugador distinto");
      if (exp.company !== undefined && input["company"] !== exp.company) return fail("compañía distinta");
      return ok;
    }
    case "undo":
      return result.kind === "undo" ? ok : fail(`se esperaba deshacer, llegó ${result.kind}`);
    case "amend": {
      const input = toolCalls(message).find((t) => t.name === "amendLast")?.input as Json | undefined;
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
// Metrics (research R18)

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
  readonly usage?: Anthropic.Usage;
  readonly error?: string;
  /** The first call with this fixture's prefix: it writes the cache, so it cannot read it. */
  readonly prefixFirst?: boolean;
}

/** $ per million tokens: input, output; cache writes ×1.25 and reads ×0.1 of input. */
export const PRICES: Readonly<Record<string, { readonly input: number; readonly output: number }>> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-opus-5": { input: 5, output: 25 },
};

export function costOf(usage: Anthropic.Usage | undefined, model: string): number | undefined {
  const p = PRICES[model];
  if (!usage || !p) return undefined;
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  return (usage.input_tokens * p.input + write * p.input * 1.25 + read * p.input * 0.1 + usage.output_tokens * p.output) / 1e6;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

const accuracy = (rs: readonly RunRecord[]) => (rs.length === 0 ? null : rs.filter((r) => r.pass).length / rs.length);

/** The OR subset is every case on an operating-round fixture (SC-003). */
export const isOrFixture = (fixture: string) => fixture.endsWith("-or");

export interface Summary {
  readonly model: string;
  readonly cases: number;
  readonly runs: number;
  readonly overall: number | null;
  readonly orSubset: number | null;
  readonly tuning: number | null;
  readonly heldout: number | null;
  readonly byCategory: Readonly<Record<string, number | null>>;
  readonly latencyMs: { readonly p50: number; readonly p95: number };
  /** Share of calls, past each fixture's first, that read the cached prefix (> 0, or the prefix is broken). */
  readonly cacheReadRate: number | null;
  readonly tokens: { readonly input: number; readonly output: number; readonly cacheWrite: number; readonly cacheRead: number };
  readonly costUsd: number | null;
  readonly costPerCaseUsd: number | null;
  readonly gates: Readonly<Record<string, boolean>>;
}

export function summarize(records: readonly RunRecord[], model: string): Summary {
  const byCategory = Object.fromEntries(CATEGORIES.map((cat) => [cat, accuracy(records.filter((r) => r.category === cat))]));
  const latencies = records.filter((r) => r.error === undefined).map((r) => r.latencyMs);
  const later = records.filter((r) => r.usage && !r.prefixFirst);
  const cacheReadRate = later.length === 0 ? null : later.filter((r) => (r.usage?.cache_read_input_tokens ?? 0) > 0).length / later.length;
  const sum = (f: (u: Anthropic.Usage) => number) => records.reduce((n, r) => n + (r.usage ? f(r.usage) : 0), 0);
  const costUsd = PRICES[model] ? records.reduce((n, r) => n + (costOf(r.usage, model) ?? 0), 0) : null;
  const orSubset = accuracy(records.filter((r) => isOrFixture(r.fixture)));
  const p95 = percentile(latencies, 95);
  const categoryValues = Object.values(byCategory).filter((v): v is number => v !== null);
  return {
    model,
    cases: new Set(records.map((r) => r.caseId)).size,
    runs: Math.max(0, ...records.map((r) => r.run)),
    overall: accuracy(records),
    orSubset,
    tuning: accuracy(records.filter((r) => !r.heldout)),
    heldout: accuracy(records.filter((r) => r.heldout)),
    byCategory,
    latencyMs: { p50: percentile(latencies, 50), p95 },
    cacheReadRate,
    tokens: {
      input: sum((u) => u.input_tokens),
      output: sum((u) => u.output_tokens),
      cacheWrite: sum((u) => u.cache_creation_input_tokens ?? 0),
      cacheRead: sum((u) => u.cache_read_input_tokens ?? 0),
    },
    costUsd,
    costPerCaseUsd: costUsd === null || records.length === 0 ? null : costUsd / records.length,
    gates: {
      "OR subset >= 90%": (orSubset ?? 0) >= 0.9,
      "no category < 80%": categoryValues.every((v) => v >= 0.8),
      "p95 API latency < 2.5 s": latencies.length > 0 && p95 < 2500,
      "cache reads > 0": (cacheReadRate ?? 0) > 0,
    },
  };
}
