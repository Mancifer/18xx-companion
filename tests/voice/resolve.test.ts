import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import { effectiveLog } from "../../src/domain/ledger/effectiveLog";
import { touchesOf, type LogEntry } from "../../src/domain/ledger/entries";
import { resolveError, resolveResponse } from "../../src/voice/resolve";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

/** contracts/voice-tools.md "Response handling", from recorded responses (no network). */

const recorded = (name: string): Anthropic.Message =>
  JSON.parse(readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8")) as Anthropic.Message;

const players = makePlayers(["Ana", "Anabel", "Carla", "Dani"]);
const game = getBuiltInGame("1830");

function context(log: LogEntry[] = []) {
  const s = TestSession.start(game, players);
  seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, cash: 500, holders: { "player:p1": 6 } });
  s.apply({ t: "turnAdvance", phase: "3" });
  s.do({ type: "startOR" });
  return { game, players, state: s.state, effective: effectiveLog(log) };
}

describe("resolveResponse", () => {
  it("one action → one proposal with its Spanish summary and bank flows", () => {
    const r = resolveResponse(recorded("payout"), context(), "240, paga");
    expect(r.kind).toBe("proposal");
    if (r.kind !== "proposal") return;
    expect(r.transcript).toBe("240, paga");
    expect(r.actions).toEqual([{ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 240 }], mode: "full" }]);
    expect(r.summaryEs).toContain("PRR paga $240");
    expect(r.flows).toEqual([{ counterparty: "player:p1", direction: "fromBank", amount: 144 }]);
  });

  it("US5-2: two tool calls are one proposal with both actions in order, as one group", () => {
    const r = resolveResponse(recorded("compound"), context(), "compra un 4 y paga 290");
    expect(r.kind).toBe("proposal");
    if (r.kind !== "proposal") return;
    expect(r.actions.map((a) => a.type)).toEqual(["buyTrain", "runAndPayout"]);
    expect(r.action.type).toBe("compound");
    expect(r.summaryEs).toMatch(/compra un 4.*; .*paga \$290/);
  });

  it("US5-3: askClarification → options to tap", () => {
    const r = resolveResponse(recorded("clarification"), context(), "Ana compra una");
    expect(r).toMatchObject({
      kind: "clarification",
      question: "¿Quién compra?",
      options: [
        { label: "Ana", value: "p1" },
        { label: "Anabel", value: "p2" },
      ],
    });
  });

  it("US5-4: a query is answered from state; the model's text is ignored", () => {
    const r = resolveResponse(recorded("query"), context(), "¿cuánto tiene Ana?");
    expect(r).toMatchObject({ kind: "query", answer: { textEs: "Ana tiene $600" } });
  });

  it("undo, amendLast and confirmProposal are ledger operations", () => {
    expect(resolveResponse(recorded("undo"), context(), "deshacer").kind).toBe("undo");
    expect(resolveResponse(recorded("confirm"), context(), "sí").kind).toBe("confirm");

    const ctx = context();
    const action: Action = { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 240 }], mode: "full" };
    const log: LogEntry[] = [
      { kind: "group", seq: 9, id: "g9", at: "", source: "voice", action, events: [], touches: touchesOf([]), warnings: [] },
    ];
    const r = resolveResponse(recorded("amend"), { ...ctx, effective: effectiveLog(log) }, "no, eran 260");
    expect(r).toMatchObject({ kind: "amend", groupId: "g9", action: { parts: [{ part: "revenue", amount: 260 }] } });
  });

  it("amendLast with nothing to amend is not understood", () => {
    expect(resolveResponse(recorded("amend"), context(), "no, eran 260").kind).toBe("notUnderstood");
  });

  it.each(["not-understood", "no-tool", "bad-input", "unknown-entity", "refusal", "max-tokens"])(
    "US5-6: %s → No entendí, with the transcript",
    (name) => {
      const r = resolveResponse(recorded(name), context(), "algo");
      expect(r).toMatchObject({ kind: "notUnderstood", transcript: "algo" });
    },
  );
});

describe("resolveError (US5-6)", () => {
  const make = <T extends object>(cls: { prototype: T }): T => Object.create(cls.prototype) as T;

  it.each([
    [make(Anthropic.AuthenticationError), /clave/],
    [make(Anthropic.RateLimitError), /límite/],
    [make(Anthropic.APIConnectionTimeoutError), /tard/],
    [make(Anthropic.APIConnectionError), /conexión/],
    [new Error("boom"), /No entendí|error/i],
  ])("%# → No entendí with a reason", (error, reason) => {
    const r = resolveError(error, "240, paga");
    expect(r.kind).toBe("notUnderstood");
    if (r.kind === "notUnderstood") {
      expect(r.transcript).toBe("240, paga");
      expect(r.reasonEs).toMatch(reason);
    }
  });
});
