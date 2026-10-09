import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildFixture, FIXTURE_SPECS } from "../../eval/voice/fixtureSpecs";
import { CaseSchema, CATEGORIES, gradeResponse, summarize, type EvalCase, type RunRecord } from "../../eval/voice/grade";
import { loadFixture } from "../../eval/voice/load";
import { parseImport } from "../../src/persistence/exportImport";

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

function message(...calls: readonly (readonly [string, Readonly<Record<string, unknown>>])[]): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: calls.map(([name, input], i) => ({ type: "tool_use", id: `toolu_${i}`, name, input })),
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 6000 },
  } as unknown as Anthropic.Message;
}

/** Free-text fields the expectations leave out (they are not graded). */
const FILL: Readonly<Record<string, Record<string, unknown>>> = {
  payCost: { reason: null },
  bankPays: { reason: "puente" },
};

/** The response a perfect model would give for a case. */
function golden(c: EvalCase): Anthropic.Message {
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

  it("covers the six R18 fixtures, with Ana/Anabel in at least two and a shared alias in 1830-or", () => {
    expect([...fixtures.keys()].sort()).toEqual(["1830-or", "1830-sr", "1848-or", "1848-sr", "21moon-cr", "21moon-or"]);
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
    for (const id of ["1830-or", "1848-or", "21moon-or"]) {
      const { state } = fixture(id).ctx;
      expect(state.turn.round, id).toBe("OR");
      expect(state.turn.currentCompany, id).toBeTruthy();
    }
    expect(fixture("1848-or").ctx.state.turn.phase).toBe("3");
    expect(fixture("21moon-cr").ctx.state.turn.round).toBe("CR");
  });
});

describe("seed cases (T136)", () => {
  it("has the R18 composition, unique ids and about 20% held out", () => {
    const count = (cat: string) => cases.filter((c) => c.category === cat).length;
    expect(Object.fromEntries(CATEGORIES.map((c) => [c, count(c)]))).toEqual({
      payout: 14,
      trains: 8,
      costs: 4,
      stock: 10,
      loans: 3,
      flow: 3,
      compound: 5,
      corrections: 4,
      queries: 4,
      clarification: 3,
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
    const c = byId("cl-03");
    const ask = (values: string[]) =>
      message(["askClarification", { question: "¿Quién?", options: values.map((v) => ({ label: v, value: v })) }]);
    expect(gradeResponse(ask(["p1", "p2", "p3"]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(ask(["p2", "p3"]), c, ctxOf(c)).pass).toBe(false);
  });

  it("a query passes on kind and entity", () => {
    const c = byId("q-01");
    expect(gradeResponse(message(["query", { kind: "cash", player: "p1", company: null }]), c, ctxOf(c)).pass).toBe(true);
    expect(gradeResponse(message(["query", { kind: "cash", player: "p2", company: null }]), c, ctxOf(c)).pass).toBe(false);
  });

  it("an action the app rejects fails with the app's reason", () => {
    const c = byId("tr-01");
    const m = message(["buyTrain", { company: "PRR", trainType: "9", variant: null, from: "bank", seller: null, price: null, tradeIn: null }]);
    const grade = gradeResponse(m, c, ctxOf(c));
    expect(grade.pass).toBe(false);
    expect(grade.reason).toMatch(/la app no pudo usarla/);
  });

  it("a recorded response grades like a live one", () => {
    const recorded = JSON.parse(readFileSync("tests/voice/recorded/payout.json", "utf8")) as Anthropic.Message;
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
    usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 6000 } as Anthropic.Usage,
    ...over,
  });

  it("reports OR subset, categories, held-out, latency percentiles, cache reads and cost", () => {
    const records = [
      rec({ caseId: "a", prefixFirst: true, usage: { input_tokens: 6100, output_tokens: 20, cache_creation_input_tokens: 6000, cache_read_input_tokens: 0 } as Anthropic.Usage }),
      rec({ caseId: "b", latencyMs: 2000 }),
      rec({ caseId: "c", fixture: "1830-sr", category: "stock", pass: false, latencyMs: 3000, heldout: true }),
      rec({ caseId: "d", fixture: "1830-sr", category: "stock", latencyMs: 1500 }),
    ];
    const s = summarize(records, "claude-sonnet-5");
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
