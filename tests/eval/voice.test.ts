import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, createPacer, MAX_ATTEMPTS, parseEvalArgs, withBackoff } from "../../eval/voice/cli";
import { formatComparison } from "../../eval/voice/compare";
import { costOf, priceFor } from "../../eval/voice/prices";
import { VoiceProviderError } from "../../src/voice/errors";
import { geminiReply } from "../../src/voice/providers/gemini";
import type { TokenUsage } from "../../src/voice/reply";
import { buildFixture, FIXTURE_SPECS } from "../../eval/voice/fixtureSpecs";
import { CaseSchema, CATEGORIES, gradeResponse, summarize, type EvalCase, type RunRecord } from "../../eval/voice/grade";
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
      return message(["undo", { groupId: null }]);
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
      flow: 6,
      compound: 5,
      corrections: 4,
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
    expect(s.latencyMs).toEqual({ p50: 1500, p95: 3000 });
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
    expect(costOf(usage({ input: 0, output: 0, cacheRead: 1e6 }), { input: 0.3, output: 2.5, cacheRead: null, cacheWrite: null })).toBeCloseTo(0.3, 12);
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
