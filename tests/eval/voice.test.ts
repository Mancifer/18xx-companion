import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, createPacer, MAX_ATTEMPTS, parseEvalArgs, withBackoff } from "../../eval/voice/cli";
import { formatComparison } from "../../eval/voice/compare";
import { costOf, priceFor, PRICES, storageCostUsd } from "../../eval/voice/prices";
import { VoiceProviderError } from "../../src/voice/errors";
import { geminiReply } from "../../src/voice/providers/gemini";
import type { TokenUsage } from "../../src/voice/reply";
import { buildFixture, FIXTURE_SPECS } from "../../eval/voice/fixtureSpecs";
import { CaseSchema, CATEGORIES, gradeResponse, summarize, type CacheLifetime, type EvalCase, type RunRecord, type Summary } from "../../eval/voice/grade";
import type { CacheEvent } from "../../src/voice/interpreter";
import { loadFixture } from "../../eval/voice/load";
import { anthropicReply } from "../../src/voice/providers/anthropic";
import type { ModelReply } from "../../src/voice/reply";
import { parseImport } from "../../src/persistence/exportImport";
import { unitsOf } from "../../src/domain/events/state";
import { mergerRoundDue } from "../../src/domain/mechanics/schedule";

/** T134–T136: fixtures, seed cases and the deterministic grader, all without the network. */

const DIR = "eval/voice/fixtures";
const cases: EvalCase[] = readFileSync("eval/voice/cases.jsonl", "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => CaseSchema.parse(JSON.parse(l)));
const fixtures = new Map(FIXTURE_SPECS.map((s) => [s.id, loadFixture(DIR, s.id)]));
const fixture = (id: string) => {
  const f = fixtures.get(id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};

function message(...calls: readonly (readonly [string, Readonly<Record<string, unknown>>])[]): ModelReply {
  return {
    provider: "anthropic",
    model: "claude-sonnet-5",
    calls: calls.map(([name, input]) => ({ name, input })),
    stop: "done",
    rawStop: "tool_use",
    usage: { input: 100, output: 20, cacheRead: 6000, cacheWrite: 0, thinking: 0 },
  };
}

/** Free-text fields the expectations leave out (they are not graded). */
const FILL: Readonly<Record<string, Record<string, unknown>>> = {
  payCost: { reason: null },
  bankPays: { reason: "puente" },
};

/** The response a perfect model would give for a case. */
function golden(c: EvalCase): ModelReply {
  const e = c.expect;
  switch (e.kind) {
    case "actions":
      return message(...e.actions.map(({ type, ...rest }): [string, Record<string, unknown>] => [type, { ...FILL[type], ...rest }]));
    case "clarification": {
      const values = e.candidates.length >= 2 ? e.candidates : ["a", "b"];
      return message(["askClarification", { question: "¿Cuál?", options: values.map((v) => ({ label: v, value: v })) }]);
    }
    case "query":
      return message(["query", { kind: e.query, player: e.player ?? null, company: e.company ?? null }]);
    case "undo":
      return message(["undo", { groupId: e.groupId ?? null }]);
    case "amend":
      return message(["amendLast", { part: e.part ?? null, value: e.value }]);
    case "notUnderstood":
      return message(["notUnderstood", { reason: "charla" }]);
  }
}

describe("eval fixtures (T135)", () => {
  it.each(FIXTURE_SPECS.map((s) => s.id))("%s on disk matches a fresh build and imports cleanly", async (id) => {
    const spec = FIXTURE_SPECS.find((s) => s.id === id)!;
    const onDisk: unknown = JSON.parse(readFileSync(`${DIR}/${id}.json`, "utf8"));
    expect(await buildFixture(spec)).toEqual(onDisk);
    const parsed = await parseImport(onDisk);
    expect(parsed.ok && parsed.hashMatches).toBe(true);
  });

  it("covers the six R18 fixtures and the three RotLA ones, with Ana/Anabel in at least two and a shared alias in 1830-or", () => {
    expect([...fixtures.keys()].sort()).toEqual([
      "1830-or",
      "1830-sr",
      "1848-or",
      "1848-sr",
      "21moon-cr",
      "21moon-or",
      "rotla-lm",
      "rotla-mr",
      "rotla-or",
      "rotla-sr",
    ]);
    const confusable = [...fixtures.values()].filter((f) => {
      const names = f.session.players.map((p) => p.name);
      return names.includes("Ana") && names.includes("Anabel");
    });
    expect(confusable.length).toBeGreaterThanOrEqual(2);
    const or1830 = fixture("1830-or");
    const companyAliases = new Set(or1830.session.game.companies.flatMap((c) => c.aliases));
    expect(or1830.session.players.some((p) => p.aliases.some((a) => companyAliases.has(a)))).toBe(true);
  });

  it("puts each OR fixture in an operating round with a current company", () => {
    for (const id of ["1830-or", "1848-or", "21moon-or", "rotla-or", "rotla-lm"]) {
      const { state } = fixture(id).ctx;
      expect(state.turn.round, id).toBe("OR");
      expect(state.turn.currentCompany, id).toBeTruthy();
    }
    expect(fixture("1848-or").ctx.state.turn.phase).toBe("3");
    expect(fixture("21moon-cr").ctx.state.turn.round).toBe("CR");
    expect(fixture("rotla-or").ctx.state.turn.currentCompany).toBe("TUN");
    expect(unitsOf(fixture("rotla-or").ctx.state, "pool", "EXP")).toBe(1);
    const mr = fixture("rotla-mr").ctx;
    expect(mr.state.turn.phase).toBe("green");
    expect(mergerRoundDue(mr.game, mr.state)).toBe(true);
  });
});

describe("seed cases (T136)", () => {
  it("has the R18 composition, unique ids and about 20% held out", () => {
    const count = (cat: string) => cases.filter((c) => c.category === cat).length;
    expect(Object.fromEntries(CATEGORIES.map((c) => [c, count(c)]))).toEqual({
      payout: 16,
      trains: 13,
      costs: 7,
      stock: 18,
      loans: 3,
      flow: 9, // + 3 endGame cases (feature 007)
      compound: 5,
      corrections: 9, // + 5 undo/correction cases (feature 010)
      queries: 4,
      clarification: 2,
      notUnderstood: 2,
    });
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    const heldout = cases.filter((c) => c.heldout).length / cases.length;
    expect(heldout).toBeGreaterThan(0.15);
    expect(heldout).toBeLessThan(0.25);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s: a perfect response passes (the expectation is valid in its fixture)", (_id, c) => {
    const grade = gradeResponse(golden(c), c, fixture(c.fixture).ctx);
    expect(grade.reason).toBeUndefined();
    expect(grade.pass).toBe(true);
  });
});

describe("grading (T134)", () => {
  const byId = (id: string) => cases.find((c) => c.id === id)!;
  const ctxOf = (c: EvalCase) => fixture(c.fixture).ctx;

  it("resolves null defaults: company null equals the operating company, mode null equals full", () => {
    const c = byId("or-pay-05"); // expects company PRR
    const m = message(["runAndPayout", { company: null, parts: [{ part: "revenue", amount: 300 }], mode: null }]);
    expect(gradeResponse(m, c, ctxOf(c)).pass).toBe(true);
  });

  it("fails a wrong amount, a wrong mode and a wrong kind", () => {
    const c = byId("or-pay-01");
    const run = (amount: number, mode: string) => message(["runAndPayout", { company: null, parts: [{ part: "revenue", amount }], mode }]);
    expect(gradeResponse(run(250, "full"), c, ctxOf(c)).pass).toBe(false);
    expect(gradeResponse(run(240, "withhold"), c, ctxOf(c)).pass).toBe(false);
    const undo = gradeResponse(message(["undo", { groupId: null }]), c, ctxOf(c));
    expect(undo.pass).toBe(false);
    expect(undo.reason).toMatch(/undo/);
  });

  it("undo is graded by its target: null and the newest id both mean the newest entry (feature 010)", () => {
    const undo = (groupId: string | null) => message(["undo", { groupId }]);
    const to = byId("cr-05"); // back to EXP's train purchase, g8
    expect(gradeResponse(undo("g8"), to, ctxOf(to)).pass).toBe(true);
    expect(gradeResponse(undo("g9"), to, ctxOf(to)).pass).toBe(false);
    expect(gradeResponse(undo(null), to, ctxOf(to)).pass).toBe(false);
    const bare = byId("cr-07"); // «deshacer»; g11 is the newest entry
    expect(gradeResponse(undo(null), bare, ctxOf(bare)).pass).toBe(true);
    expect(gradeResponse(undo("g11"), bare, ctxOf(bare)).pass).toBe(true);
    expect(gradeResponse(undo("g8"), bare, ctxOf(bare)).pass).toBe(false);
  });

  it("an explicit list price equals a null price for a bank train", () => {
    const c = byId("tr-01");
    const m = message(["buyTrain", { company: "PRR", trainType: "3", variant: "3", from: "bank", seller: null, price: 180, tradeIn: null }]);
    expect(gradeResponse(m, c, ctxOf(c)).pass).toBe(true);
  });

  it("a compound passes only with every action, in order", () => {
    const c = byId("cp-01");
    const t = ["buyTrain", { company: null, trainType: "3", variant: null, from: "bank", seller: null, price: null, tradeIn: null }] as const;
    const p = ["runAndPayout", { company: null, parts: [{ part: "revenue", amount: 290 }], mode: "full" }] as const;
    expect(gradeResponse(message(t, p), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(message(p, t), c, ctxOf(c)).pass).toBe(false);
    expect(gradeResponse(message(p), c, ctxOf(c)).pass).toBe(false);
  });

  it("a clarification passes only if its options include every candidate", () => {
    const c = byId("cl-02"); // PRR and NYC
    const ask = (values: string[]) =>
      message(["askClarification", { question: "¿Cuál?", options: values.map((v) => ({ label: v, value: v })) }]);
    expect(gradeResponse(ask(["PRR", "NYC", "B&O"]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(ask(["PRR", "B&O"]), c, ctxOf(c)).pass).toBe(false);
  });

  it("a candidate can be a word of an option's value or label (005 eval: the app re-sends both)", () => {
    const c = byId("cl-02");
    const options = (pairs: [string, string][]) =>
      message(["askClarification", { question: "¿Qué vende?", options: pairs.map(([label, value]) => ({ label, value })) }]);
    expect(gradeResponse(options([["1 acción de NYC", "NYC:1"], ["1 acción de PRR", "PRR:1"]]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(options([["Vender 10% de NYC", "sell_nyc_1"], ["Vender 20% de PRR", "sell_prr_2"]]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(options([["Vender una", "a"], ["Vender dos", "b"]]), c, ctxOf(c)).pass).toBe(false);
    // A word, not a substring: "PRRX" does not name PRR.
    expect(gradeResponse(options([["NYC", "NYC"], ["PRRX", "PRRX"]]), c, ctxOf(c)).pass).toBe(false);
  });

  it("a query passes on kind and entity", () => {
    const c = byId("q-01");
    expect(gradeResponse(message(["query", { kind: "cash", player: "p1", company: null }]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(message(["query", { kind: "cash", player: "p2", company: null }]), c, ctxOf(c)).pass).toBe(false);
  });

  it("a company's cash counts as its treasury (the app answers both the same)", () => {
    const c = byId("q-04"); // treasury of VH
    expect(gradeResponse(message(["query", { kind: "cash", player: null, company: "VH" }]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(message(["query", { kind: "treasury", player: null, company: "VH" }]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(message(["query", { kind: "cash", player: "p1", company: null }]), c, ctxOf(c)).pass).toBe(false);
  });

  it("a forced purchase's null variant equals the type's first variant", () => {
    const c = byId("rl-or-forced-01");
    const forced = (variant: string | null) =>
      message(["forcedTrainPurchase", { company: null, trainType: "4", variant, from: "bank", sales: [{ company: "EXP", count: 2 }] }]);
    expect(gradeResponse(forced("4"), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(forced(null), c, ctxOf(c)).pass).toBe(true);
  });

  it("an action the app rejects fails with the app's reason", () => {
    const c = byId("tr-01");
    const m = message(["buyTrain", { company: "PRR", trainType: "9", variant: null, from: "bank", seller: null, price: null, tradeIn: null }]);
    const grade = gradeResponse(m, c, ctxOf(c));
    expect(grade.pass).toBe(false);
    expect(grade.reason).toMatch(/la app no pudo usarla/);
  });

  it("a recorded response grades like a live one", () => {
    const recorded = anthropicReply(JSON.parse(readFileSync("tests/voice/recorded/payout.json", "utf8")) as Anthropic.Message, "claude-sonnet-5");
    const c = byId("or-pay-01");
    expect(gradeResponse(recorded, c, ctxOf(c)).pass).toBe(true);
  });
});

describe("summary metrics (T134)", () => {
  const rec = (over: Partial<RunRecord>): RunRecord => ({
    caseId: "x",
    run: 1,
    fixture: "1830-or",
    category: "payout",
    heldout: false,
    pass: true,
    got: "",
    latencyMs: 1000,
    usage: { input: 100, output: 20, cacheRead: 6000, cacheWrite: 0, thinking: 0 },
    ...over,
  });

  it("reports OR subset, categories, held-out, latency percentiles, cache reads and cost", () => {
    const records = [
      rec({ caseId: "a", prefixFirst: true, usage: { input: 6100, output: 20, cacheRead: 0, cacheWrite: 6000, thinking: 0 } }),
      rec({ caseId: "b", latencyMs: 2000 }),
      rec({ caseId: "c", fixture: "1830-sr", category: "stock", pass: false, latencyMs: 3000, heldout: true }),
      rec({ caseId: "d", fixture: "1830-sr", category: "stock", latencyMs: 1500 }),
    ];
    const s = summarize(records, { provider: "anthropic", model: "claude-sonnet-5", freeTier: false, rateLimitRetries: 0, date: "2026-10-10" });
    expect(s).toMatchObject({ cases: 4, runs: 1, overall: 0.75, orSubset: 1, tuning: 1, heldout: 0 });
    expect(s.byCategory).toMatchObject({ payout: 1, stock: 0.5, loans: null });
    expect(s.latencyMs).toEqual({ p50: 1500, p95: 3000, firstP95: 1000 });
    expect(s.cacheReadRate).toBe(1);
    expect(s.gates).toEqual({
      "OR subset >= 90%": true,
      "no category < 80%": false,
      "p95 API latency < 2.5 s": false,
      "cache reads > 0": true,
    });
    // 6,400 in + 6,000 written + 18,000 read + 80 out, at $2 / $10 per million.
    const expected = (6400 * 2 + 6000 * 2 * 1.25 + 18000 * 0.2 + 80 * 10) / 1e6;
    expect(s.costUsd).toBeCloseTo(expected, 10);
  });
});

const usage = (over: Partial<TokenUsage> = {}): TokenUsage => ({ input: 100, output: 20, cacheRead: 6000, cacheWrite: 0, thinking: 0, ...over });
const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  caseId: "x",
  run: 1,
  fixture: "1830-or",
  category: "payout",
  heldout: false,
  pass: true,
  got: "",
  latencyMs: 1000,
  stop: "done",
  rawStop: "STOP",
  usage: usage(),
  ...over,
});
type SummaryOptions = Parameters<typeof summarize>[1];
const opts = (over: Partial<SummaryOptions> = {}): SummaryOptions => ({
  provider: "gemini",
  model: "gemini-3.8-flash",
  freeTier: false,
  rateLimitRetries: 0,
  date: "2026-10-10",
  ...over,
});

describe("prices (005 T031)", () => {
  it("picks the latest period that has started", () => {
    expect(priceFor("gemini-3.8-flash", "2026-12-31")).toMatchObject({ input: 0.75, output: 3.75, cacheRead: 0.075 });
    expect(priceFor("gemini-3.8-flash", "2027-01-01")).toMatchObject({ input: 1.5, output: 7.5, cacheRead: 0.15 });
    expect(priceFor("gemini-3.6-flash", "2027-02-01")).toMatchObject({ input: 1.5 });
    expect(priceFor("claude-sonnet-5", "2026-10-10")).toMatchObject({ input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 });
    expect(priceFor("gpt-x", "2026-10-10")).toBeUndefined();
  });

  it("Claude costs equal the pre-005 formula", () => {
    const u = usage({ input: 6400, cacheWrite: 6000, cacheRead: 18000, output: 80 });
    expect(costOf(u, priceFor("claude-sonnet-5", "2026-10-10")!)).toBeCloseTo((6400 * 2 + 6000 * 2 * 1.25 + 18000 * 0.2 + 80 * 10) / 1e6, 12);
  });

  it("a null cache price charges cache reads at the input price", () => {
    expect(costOf(usage({ input: 0, output: 0, cacheRead: 1e6 }), { input: 0.3, output: 2.5, cacheRead: null, cacheWrite: null, cacheStorage: null })).toBeCloseTo(0.3, 12);
  });

  it("Gemini tokens are normalized from a recorded body", () => {
    const body: unknown = JSON.parse(readFileSync("tests/voice/recorded/gemini/compound.json", "utf8"));
    const u = geminiReply(body, "gemini-3.8-flash").usage!;
    expect(u).toEqual({ input: 228, output: 137, cacheRead: 6112, cacheWrite: 0, thinking: 52 });
    expect(costOf(u, priceFor("gemini-3.8-flash", "2026-10-10")!)).toBeCloseTo((228 * 0.75 + 137 * 3.75 + 6112 * 0.075) / 1e6, 12);
  });
});

describe("summary shape (005 T031)", () => {
  it("free tier: cost 0, with a paid equivalent", () => {
    const s = summarize([record(), record({ caseId: "y" })], opts({ freeTier: true }));
    expect(s).toMatchObject({ provider: "gemini", freeTier: true, costUsd: 0, costPerCaseUsd: 0 });
    expect(s.paidEquivalentUsd).toBeGreaterThan(0);
    expect(s.paidPerCaseUsd).toBeCloseTo(s.paidEquivalentUsd! / 2, 12);
  });

  it("unknown price and not free: costs are null", () => {
    const s = summarize([record()], opts({ model: "gemini-mystery" }));
    expect(s.costUsd).toBeNull();
    expect(s.paidEquivalentUsd).toBeNull();
    expect(s.costPerCaseUsd).toBeNull();
    expect(s.paidPerCaseUsd).toBeNull();
  });

  it("unknown price on the free tier: cost 0, paid equivalent null", () => {
    const s = summarize([record()], opts({ model: "gemini-mystery", freeTier: true }));
    expect(s.costUsd).toBe(0);
    expect(s.paidEquivalentUsd).toBeNull();
  });

  it("Anthropic: the paid equivalent is the cost", () => {
    const s = summarize([record()], opts({ provider: "anthropic", model: "claude-sonnet-5" }));
    expect(s.paidEquivalentUsd).toBe(s.costUsd);
    expect(s.costUsd).toBeGreaterThan(0);
  });

  it("cache reads priced at the input price are flagged", () => {
    expect(summarize([record()], opts()).priceNotes).toEqual([]);
    expect(summarize([record()], opts({ model: "gemini-3.5-flash-lite" })).priceNotes).toEqual([]);
    expect(summarize([record()], opts({ model: "gemini-mystery" })).priceNotes.join(" ")).toMatch(/gemini-mystery/);
  });

  it("both providers produce the same keys, every field present", () => {
    const a = summarize([record({ stop: "done" })], opts({ provider: "anthropic", model: "claude-sonnet-5" }));
    const g = summarize([record({ stop: "malformed" })], opts({ freeTier: true }));
    expect(Object.keys(a).sort()).toEqual(Object.keys(g).sort());
    for (const key of ["provider", "freeTier", "tokens", "costUsd", "costPerCaseUsd", "paidEquivalentUsd", "paidPerCaseUsd", "priceNotes", "stops", "rateLimitRetries", "cacheReadRate", "gates"]) {
      expect(a).toHaveProperty(key);
    }
    expect(Object.keys(a.tokens).sort()).toEqual(["cacheRead", "cacheWrite", "input", "output", "thinking"]);
  });

  it("counts stops and rate-limit retries; sums thinking", () => {
    const limited: RunRecord = { caseId: "z", run: 1, fixture: "1830-or", category: "payout", heldout: false, pass: false, got: "", latencyMs: 0, error: "rateLimited" };
    const s = summarize(
      [record({ stop: "done", usage: usage({ thinking: 5 }) }), record({ stop: "malformed", usage: usage({ thinking: 7 }) }), record({ stop: "refused" }), limited],
      opts({ rateLimitRetries: 3 }),
    );
    expect(s.stops).toEqual({ done: 1, truncated: 0, refused: 1, malformed: 1, other: 0 });
    expect(s.rateLimitRetries).toBe(3);
    expect(s.tokens.thinking).toBe(12);
  });

  it("gates: Anthropic keeps the four; Gemini has three, the cache check is info only", () => {
    expect(Object.keys(summarize([record()], opts({ provider: "anthropic", model: "claude-sonnet-5" })).gates)).toEqual([
      "OR subset >= 90%",
      "no category < 80%",
      "p95 API latency < 2.5 s",
      "cache reads > 0",
    ]);
    expect(Object.keys(summarize([record()], opts()).gates)).toEqual(["OR subset >= 90%", "no category < 80%", "p95 API latency < 2.5 s"]);
  });
});

describe("eval CLI helpers (005 T032)", () => {
  const env = { ANTHROPIC_API_KEY: "sk-ant-x", GEMINI_API_KEY: "AIza-x" };

  it("defaults: anthropic, its default model, 1 run, no pacing", () => {
    expect(parseEvalArgs([], env)).toEqual({ provider: "anthropic", model: "claude-sonnet-5", runs: 1, free: false, apiKey: "sk-ant-x" });
  });

  it("infers gemini from the model prefix and paces it at 8 rpm", () => {
    expect(parseEvalArgs(["--model", "gemini-3.6-flash", "--free"], env)).toEqual({
      provider: "gemini",
      model: "gemini-3.6-flash",
      runs: 1,
      rpm: 8,
      free: true,
      apiKey: "AIza-x",
    });
    expect(parseEvalArgs(["--provider", "gemini"], env)).toMatchObject({ model: "gemini-3.6-flash", rpm: 8 });
  });

  it("--runs, --only and --rpm", () => {
    expect(parseEvalArgs(["--runs", "3", "--only", "a, b", "--rpm", "4", "--model", "claude-haiku-4-5"], env)).toMatchObject({
      runs: 3,
      only: ["a", "b"],
      rpm: 4,
    });
  });

  it("errors name the problem", () => {
    expect(() => parseEvalArgs(["--provider", "anthropic", "--model", "gemini-3.8-flash"], env)).toThrow(/gemini-3\.8-flash.*anthropic/);
    expect(() => parseEvalArgs(["--model", "gemini-3.8-flash"], {})).toThrow(/GEMINI_API_KEY/);
    expect(() => parseEvalArgs([], {})).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => parseEvalArgs(["--runs", "0"], env)).toThrow(/--runs/);
    expect(() => parseEvalArgs(["--model", "llama-3"], env)).toThrow(/--provider/);
  });

  it("backoff: 2 s, 4 s, 8 s … capped at 60 s, or the server's delay when longer", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => backoffDelay(n))).toEqual([2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(backoffDelay(1, 34000)).toBe(34000);
    expect(backoffDelay(3, 1000)).toBe(8000);
    expect(MAX_ATTEMPTS).toBe(6);
  });

  it("withBackoff retries rate limits and 503s up to 6 attempts, then reports rateLimited", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withBackoff(
      () => {
        calls += 1;
        return Promise.reject(new VoiceProviderError("rateLimit", "x", { status: 429 }));
      },
      {
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
      },
    );
    expect(result).toEqual({ kind: "rateLimited", retries: 5 });
    expect(calls).toBe(6);
    expect(waits).toEqual([2000, 4000, 8000, 16000, 32000]);

    let n = 0;
    const ok = await withBackoff(() => (++n < 3 ? Promise.reject(Object.assign(new Error("overloaded"), { status: 503 })) : Promise.resolve("done")), {
      sleep: () => Promise.resolve(),
    });
    expect(ok).toEqual({ kind: "ok", value: "done", retries: 2 });
  });

  it("a daily-quota 429 stops the run; other errors pass through", async () => {
    const day = await withBackoff(() => Promise.reject(new VoiceProviderError("rateLimit", "x", { status: 429, quota: "day" })), {
      sleep: () => Promise.resolve(),
    });
    expect(day).toEqual({ kind: "dailyQuota", retries: 0 });
    await expect(withBackoff(() => Promise.reject(new VoiceProviderError("auth", "x")), { sleep: () => Promise.resolve() })).rejects.toThrow(
      VoiceProviderError,
    );
  });

  describe("pacer", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("spaces requests at 60000 / rpm ms", async () => {
      vi.useFakeTimers();
      const pace = createPacer(6);
      const started: number[] = [];
      const t0 = Date.now();
      const all = Promise.all(
        [0, 1, 2].map(async () => {
          await pace();
          started.push(Date.now() - t0);
        }),
      );
      await vi.runAllTimersAsync();
      await all;
      expect(started).toEqual([0, 10000, 20000]);
    });

    it("no rpm: no waiting", async () => {
      const pace = createPacer(undefined);
      await pace();
      await pace();
    });
  });
});

describe("compare (005 T033)", () => {
  const claude = summarize(
    [record({ latencyMs: 900 }), record({ caseId: "y", pass: false, latencyMs: 1500 })],
    opts({ provider: "anthropic", model: "claude-sonnet-5" }),
  );
  const gem = summarize([record({ latencyMs: 1200 }), record({ caseId: "y", stop: "malformed", latencyMs: 2200 })], opts({ freeTier: true }));

  it("lists accuracy, categories, latency, stops and paid cost per command, with a difference column", () => {
    const text = formatComparison(claude, gem);
    expect(text).toContain("anthropic / claude-sonnet-5");
    expect(text).toContain("gemini / gemini-3.8-flash (free tier)");
    expect(text).toMatch(/overall\s+50\.0%\s+100\.0%\s+\+50\.0/);
    expect(text).toMatch(/payout/);
    expect(text).toMatch(/p95/);
    expect(text).toMatch(/malformed\s+0\s+1\s+\+1/);
    expect(text).toMatch(/paid \$ \/ command/);
  });

  it("an older result file without the new fields still compares overall and categories", () => {
    const old = { model: "claude-sonnet-5", overall: 0.9, byCategory: { payout: 1 }, latencyMs: { p50: 1000, p95: 2000 } };
    const text = formatComparison(old, gem);
    expect(text).toMatch(/overall\s+90\.0%\s+100\.0%\s+\+10\.0/);
    expect(text).toMatch(/malformed\s+—\s+1/);
  });
});

describe("eval --cache (009 T025)", () => {
  const env = { ANTHROPIC_API_KEY: "sk-ant-x", GEMINI_API_KEY: "AIza-x" };

  it("--cache on|off sets cache; omitted leaves it to EXPLICIT_CACHE_MODELS", () => {
    expect(parseEvalArgs(["--provider", "gemini", "--cache", "on"], env).cache).toBe(true);
    expect(parseEvalArgs(["--provider", "gemini", "--cache", "off"], env).cache).toBe(false);
    expect(parseEvalArgs(["--provider", "gemini"], env).cache).toBeUndefined();
    expect(parseEvalArgs(["--provider", "anthropic", "--cache", "off"], env).cache).toBe(false);
  });

  it("other values, and on with Anthropic, are errors naming the flags", () => {
    expect(() => parseEvalArgs(["--provider", "gemini", "--cache", "maybe"], env)).toThrow(/--cache/);
    expect(() => parseEvalArgs(["--cache", "on", "--provider", "anthropic"], env)).toThrow(/--cache on.*--provider anthropic/);
  });
});

describe("cache prices (009 T026)", () => {
  it("Gemini Flash storage: $0.50 per 1M tokens per hour, $1.00 from 2027", () => {
    for (const model of ["gemini-3.6-flash", "gemini-3.8-flash"]) {
      expect(priceFor(model, "2026-10-11")?.cacheStorage).toBe(0.5);
      expect(priceFor(model, "2027-01-01")?.cacheStorage).toBe(1.0);
    }
    expect(priceFor("gemini-3.5-flash-lite", "2026-10-11")?.cacheStorage).toBe(1.0);
    expect(priceFor("gemini-3-flash-preview", "2026-10-11")?.cacheStorage).toBe(1.0);
  });

  it("Claude has no storage price; Gemini writes stay at the input price (cacheWrite null)", () => {
    for (const [model, periods] of Object.entries(PRICES)) {
      for (const p of periods) {
        if (model.startsWith("claude-")) expect(p.cacheStorage).toBeNull();
        else expect(p.cacheWrite).toBeNull();
      }
    }
  });

  it("storageCostUsd = tokens × hours × cacheStorage / 1e6, 0 without a storage price", () => {
    expect(storageCostUsd(5000, 1.25, priceFor("gemini-3.6-flash", "2026-10-11")!)).toBeCloseTo((5000 * 1.25 * 0.5) / 1e6, 12);
    expect(storageCostUsd(5000, 2, priceFor("gemini-3.6-flash", "2027-01-01")!)).toBeCloseTo((5000 * 2 * 1.0) / 1e6, 12);
    expect(storageCostUsd(5000, 2, priceFor("claude-sonnet-5", "2026-10-11")!)).toBe(0);
  });
});

describe("cache summary (009 T027)", () => {
  const cachedUsage = usage({ input: 312, output: 35, cacheRead: 4909 });
  const firstUsage = usage({ input: 5221, output: 35, cacheRead: 0 });
  /** One fixture: an uncached first call, then `hits` cached calls out of `later`. */
  const runOf = (later: number, hits: number): RunRecord[] => [
    record({ caseId: "c0", prefixFirst: true, latencyMs: 3000, usage: firstUsage }),
    ...Array.from({ length: later }, (_, i) => record({ caseId: `c${i + 1}`, latencyMs: 1000 + i, usage: i < hits ? cachedUsage : firstUsage })),
  ];
  const created = (tokens: number, at: number): CacheEvent => ({ kind: "created", tokens, expireTime: "2026-10-11T12:15:00Z", at });
  const events: CacheEvent[] = [
    created(5000, 0),
    created(4000, 10),
    { kind: "fallback", status: 403, at: 11 },
    { kind: "failed", op: "create", status: 500, reason: "Gemini HTTP 500", at: 12 },
    { kind: "failed", op: "extend", reason: "Gemini: TypeError", at: 13 },
    { kind: "extended", expireTime: "2026-10-11T12:30:00Z", at: 14 },
    { kind: "deleted", at: 15 },
  ];
  const caches: CacheLifetime[] = [
    { tokens: 5000, createdAt: 0, lastUseAt: 3.6e6 },
    { tokens: 4000, createdAt: 10, lastUseAt: 10 },
  ];
  const on = (over: Partial<SummaryOptions> = {}) => opts({ model: "gemini-3.6-flash", date: "2026-10-11", cache: { on: true, caches, events }, ...over });

  it("reports cache on/off, event counts and the real cache write", () => {
    const s = summarize(runOf(9, 9), on());
    expect(s.cache).toBe("on");
    expect(s.cacheEvents).toEqual({ created: 2, extended: 1, deleted: 1, fallbacks: 1, failures: 1 });
    expect(s.tokens.cacheWrite).toBe(9000);
    expect(summarize(runOf(9, 9), opts()).cache).toBe("off");
  });

  it("storage, totals and 2027 totals", () => {
    const records = runOf(9, 9);
    const s = summarize(records, on());
    const price = priceFor("gemini-3.6-flash", "2026-10-11")!;
    const later = priceFor("gemini-3.6-flash", "2027-01-01")!;
    const storage = (p: typeof price) => ((5000 * (1 + 0.25) + 4000 * 0.25) * p.cacheStorage!) / 1e6;
    const tokensCost = (p: typeof price) => records.reduce((n, r) => n + costOf(r.usage!, p), 0) + (9000 * p.input) / 1e6;
    expect(s.storageUsd).toBeCloseTo(storage(price), 12);
    expect(s.paidEquivalentUsd).toBeCloseTo(tokensCost(price), 12);
    expect(s.totalUsd).toBeCloseTo(tokensCost(price) + storage(price), 12);
    expect(s.totalPerCaseUsd).toBeCloseTo((tokensCost(price) + storage(price)) / 10, 12);
    expect(s.at2027?.totalUsd).toBeCloseTo(tokensCost(later) + storage(later), 12);
    expect(s.at2027?.totalPerCaseUsd).toBeCloseTo((tokensCost(later) + storage(later)) / 10, 12);
  });

  it("at2027 is null for a model without a 2027 period; --free keeps the paid-equivalent figures", () => {
    expect(summarize(runOf(2, 2), on({ model: "gemini-3.5-flash-lite" })).at2027).toBeNull();
    const free = summarize(runOf(9, 9), on({ freeTier: true }));
    expect(free.costUsd).toBe(0);
    expect(free.totalUsd).toBeGreaterThan(0);
    expect(free.totalUsd).toBeCloseTo(summarize(runOf(9, 9), on()).totalUsd!, 12);
  });

  it("Gemini with cache on gates cache reads ≥ 90% (SC-001); cache off has no such gate", () => {
    expect(summarize(runOf(9, 9), on()).gates["cache reads ≥ 90%"]).toBe(true);
    expect(summarize(runOf(10, 9), on()).gates["cache reads ≥ 90%"]).toBe(true);
    expect(summarize(runOf(9, 8), on()).gates["cache reads ≥ 90%"]).toBe(false);
    expect(summarize(runOf(9, 9), opts({ model: "gemini-3.6-flash" })).gates).not.toHaveProperty("cache reads ≥ 90%");
    expect(summarize(runOf(9, 9), on({ cache: { on: false, caches: [], events: [] } })).gates).not.toHaveProperty("cache reads ≥ 90%");
  });

  it("latencyMs.firstP95 is the p95 of each fixture's first call, null without any", () => {
    const records = [...runOf(3, 3), record({ caseId: "d0", fixture: "1848-or", prefixFirst: true, latencyMs: 4000 })];
    expect(summarize(records, on()).latencyMs.firstP95).toBe(4000);
    expect(summarize([record()], opts()).latencyMs.firstP95).toBeNull();
  });

  it("without the cache option the existing fields keep their values", () => {
    const records = runOf(9, 9);
    const s = summarize(records, opts({ model: "gemini-3.6-flash", date: "2026-10-11" }));
    expect(s.tokens.cacheWrite).toBe(0);
    expect(s.paidEquivalentUsd).toBeCloseTo(records.reduce((n, r) => n + costOf(r.usage!, priceFor("gemini-3.6-flash", "2026-10-11")!), 0), 12);
    expect(s.storageUsd).toBe(0);
    expect(s.totalUsd).toBe(s.paidEquivalentUsd);
    expect(s.cacheEvents).toEqual({ created: 0, extended: 0, deleted: 0, fallbacks: 0, failures: 0 });
  });
});

describe("compare with caching (009 T028)", () => {
  const base = (over: Partial<Summary> = {}): Summary => ({ ...summarize([record()], opts()), ...over });

  it("cache reads, total per command at both prices, falling back to paid for old files", () => {
    const a = { model: "gemini-3.6-flash", paidPerCaseUsd: 0.0044, cacheReadRate: 0.05 };
    const b = base({ cacheReadRate: 0.963, totalPerCaseUsd: 0.00088, at2027: { totalUsd: 0.1466, totalPerCaseUsd: 0.00177 } });
    const text = formatComparison(a, b);
    expect(text).toMatch(/cache reads\s+5\.0%\s+96\.3%\s+\+91\.3/);
    expect(text).toMatch(/total \$ \/ command\s+0\.00440\s+0\.00088\s+-0\.00352/);
    expect(text).toMatch(/total \$ 2027\s+—\s+0\.00177/);
    expect(formatComparison({ model: "x" }, { model: "y" })).toMatch(/total \$ \/ command\s+—\s+—/);
  });

  it("an old file with records gets its 2027 total and first-call p95 from them", () => {
    const records = [
      record({ caseId: "a", prefixFirst: true, latencyMs: 2800, usage: usage({ input: 1e6, output: 0, cacheRead: 0 }) }),
      record({ caseId: "b", latencyMs: 900, usage: usage({ input: 1e6, output: 0, cacheRead: 0 }) }),
    ];
    const old = { model: "gemini-3.6-flash", records };
    const text = formatComparison(old, base({ latencyMs: { p50: 1, p95: 2, firstP95: 2500 } }));
    expect(text).toMatch(/total \$ 2027\s+1\.50000/);
    expect(text).toMatch(/first-call p95 ms\s+2800\s+2500\s+-300/);
    expect(formatComparison({ model: "x" }, { model: "y" })).toMatch(/first-call p95 ms\s+—\s+—/);
  });

  it("flags a category that dropped by more than one case (SC-003) and p95 more than 10% worse (SC-004)", () => {
    const pass = (caseId: string, category: RunRecord["category"], ok: boolean) => record({ caseId, category, pass: ok, latencyMs: 1000 });
    const aRecords = [pass("p1", "payout", true), pass("p2", "payout", true), pass("p3", "payout", true), pass("t1", "trains", true), pass("t2", "trains", true)];
    const bRecords = [pass("p1", "payout", false), pass("p2", "payout", false), pass("p3", "payout", true), pass("t1", "trains", false), pass("t2", "trains", true)];
    const a = { ...summarize(aRecords, opts()), latencyMs: { p50: 900, p95: 2000, firstP95: null }, records: aRecords };
    const b = { ...summarize(bRecords, opts()), latencyMs: { p50: 900, p95: 2300, firstP95: null }, records: bRecords };
    const text = formatComparison(a, b);
    expect(text).toContain("SC-003 ✗: payout dropped by 2 cases");
    expect(text).not.toContain("trains dropped");
    expect(text).toContain("SC-004 ✗: p95 +15.0%");
    expect(text).toMatch(/p1\s+✓ → ✗/);
    expect(text).toMatch(/t1\s+✓ → ✗/);
    expect(text).not.toMatch(/p3\s+✓ → /);

    const fine = formatComparison(a, { ...a, latencyMs: { p50: 900, p95: 2100, firstP95: null } });
    expect(fine).toContain("SC-003 ✓");
    expect(fine).toContain("SC-004 ✓: p95 +5.0%");
  });

  it("without records, category drops come from rate × cases", () => {
    const a = { model: "a", cases: 10, byCategory: { payout: 1 } };
    const b = { model: "b", cases: 10, byCategory: { payout: 0.8 } };
    expect(formatComparison(a, b)).toContain("SC-003 ✗: payout dropped by 2 cases");
  });
});
