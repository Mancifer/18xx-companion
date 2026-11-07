import Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import { effectiveLog } from "../../src/domain/ledger/effectiveLog";
import { touchesOf, type LogEntry } from "../../src/domain/ledger/entries";
import { VoiceProviderError, type ProviderErrorKind } from "../../src/voice/errors";
import { anthropicReply } from "../../src/voice/providers/anthropic";
import { geminiReply } from "../../src/voice/providers/gemini";
import type { ModelReply } from "../../src/voice/reply";
import { domainText } from "../../src/i18n";
import { renderPlain } from "../../src/i18n/render";
import { resolveError, resolveResponse } from "../../src/voice/resolve";
import { snapshotAndTranscript } from "../../src/voice/snapshot";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

/** contracts/voice-tools.md "Response handling", from recorded responses (no network). */

const raw = (name: string): Anthropic.Message =>
  JSON.parse(readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8")) as Anthropic.Message;
const recorded = (name: string): ModelReply => anthropicReply(raw(name), "claude-sonnet-5");

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
  it("one action → one proposal with its Spanish summary and money flows", () => {
    const r = resolveResponse(recorded("payout"), context(), "240, paga");
    expect(r.kind).toBe("proposal");
    if (r.kind !== "proposal") return;
    expect(r.transcript).toBe("240, paga");
    expect(r.actions).toEqual([{ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 240 }], mode: "full" }]);
    expect(domainText("es").proposalSummary(r.action, context(), r.events)).toContain("PRR paga $240");
    expect(r.flows).toEqual([{ from: "bank", to: "player:p1", amount: 144 }]);
  });

  it("US5-2: two tool calls are one proposal with both actions in order, as one group", () => {
    const r = resolveResponse(recorded("compound"), context(), "compra un 4 y paga 290");
    expect(r.kind).toBe("proposal");
    if (r.kind !== "proposal") return;
    expect(r.actions.map((a) => a.type)).toEqual(["buyTrain", "runAndPayout"]);
    expect(r.action.type).toBe("compound");
    expect(domainText("es").proposalSummary(r.action, context(), r.events)).toMatch(/compra un 4.*; .*paga \$290/);
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
    expect(r).toMatchObject({ kind: "query", answer: { text: { es: "Ana tiene $600" } } });
  });

  it("undo and confirmProposal are ledger operations", () => {
    expect(resolveResponse(recorded("undo"), context(), "deshacer").kind).toBe("undo");
    expect(resolveResponse(recorded("confirm"), context(), "sí").kind).toBe("confirm");
  });

  it.each([
    ["no, eran 260", recorded("amend")],
    ["perdón, 300", undoReply("amendLast", { part: null, value: 300 })],
    ["corregí eso", undoReply("amendLast", {})],
  ])("amendLast (%s) explains how to correct and changes nothing (FR-008)", (transcript, reply) => {
    const r = resolveResponse(reply, { ...context(), effective: effectiveLog(history()) }, transcript);
    expect(r).toMatchObject({
      kind: "notUnderstood",
      transcript,
      reasonEs: "Para corregir, deshacé hasta esa entrada y volvé a anotarla.",
    });
  });
});

/** A setup group and three notes, g1 to g4. */
function history(): LogEntry[] {
  const group = (seq: number, action: Action): LogEntry => ({
    kind: "group", seq, id: `g${seq}`, at: "", source: "touch", action, events: [], touches: touchesOf([]), warnings: [],
  });
  return [
    group(1, { type: "createSession", players, walletMode: "appTruth" } as unknown as Action),
    group(2, { type: "note", text: "a" }),
    group(3, { type: "note", text: "b" }),
    group(4, { type: "note", text: "c" }),
  ];
}

function undoReply(name: string, input: unknown): ModelReply {
  return { provider: "gemini", model: "m", calls: [{ name, input }], stop: "done", rawStop: "" } as ModelReply;
}

describe("voice undo (feature 010, contracts/voice-undo.md)", () => {
  const ctx = () => ({ ...context(), effective: effectiveLog(history()) });

  it("undo with no target or the newest entry's id is a plain undo", () => {
    expect(resolveResponse(undoReply("undo", { groupId: null }), ctx(), "deshacer")).toEqual({ kind: "undo", transcript: "deshacer" });
    expect(resolveResponse(undoReply("undo", { groupId: "g4" }), ctx(), "deshacé eso")).toEqual({ kind: "undo", transcript: "deshacé eso" });
  });

  it("undo with an older entry's id is an undo back to it, with the range", () => {
    const r = resolveResponse(undoReply("undo", { groupId: "g2" }), ctx(), "deshacé hasta la nota a");
    expect(r).toMatchObject({ kind: "undoTo", transcript: "deshacé hasta la nota a", groupId: "g2" });
    if (r.kind !== "undoTo") return;
    expect(r.range.count).toBe(3);
    expect(r.range.oldest.id).toBe("g2");
    expect(r.range.newest.id).toBe("g4");
  });

  const undone: LogEntry = { kind: "undo", seq: 5, at: "", groupIds: ["g4"] };
  it.each([
    ["an unknown id", "g99", history()],
    ["the setup entry", "g1", history()],
    ["an undone entry", "g4", [...history(), undone]],
  ])("undo with %s is not understood, with the touch fallback", (_what, groupId, log) => {
    const r = resolveResponse(undoReply("undo", { groupId }), { ...context(), effective: effectiveLog(log) }, "deshacé hasta eso");
    expect(r).toMatchObject({ kind: "notUnderstood", transcript: "deshacé hasta eso", reasonEs: "No encontré esa entrada. Usá el historial." });
  });
});

describe("correctTrain by voice (feature 011, US3)", () => {
  const reply = (input: Record<string, unknown>): ModelReply => ({
    provider: "anthropic",
    model: "test",
    calls: [{ name: "correctTrain", input }],
    stop: "done",
    rawStop: "end_turn",
  });

  it("resolves through the same validation as touch, with its summary", () => {
    const ctx = context();
    const withTrain = { ...ctx, state: { ...ctx.state, assets: { ...ctx.state.assets, "train:2:1": "company:PRR" as const } } };
    const r = resolveResponse(reply({ company: "PRR", train: "2", op: "remove", to: "bank", amount: null }), withTrain, "la PRR no tenía ese dos");
    expect(r.kind).toBe("proposal");
    if (r.kind !== "proposal") return;
    expect(domainText("es").proposalSummary(r.action, withTrain, r.events)).toMatch(/^Corrección: la PRR devuelve un 2 a la oferta y recibe \$80/);
  });

  it("an unavailable correction is not a proposal", () => {
    const r = resolveResponse(reply({ company: "PRR", train: "3", op: "remove", to: "bank", amount: null }), context(), "sacale el tres");
    expect(r.kind).not.toBe("proposal");
  });
});

describe("resolveResponse: not understood", () => {
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

describe("neutral replies (005 T011)", () => {
  const reply = (over: Partial<ModelReply>): ModelReply => ({
    provider: "anthropic",
    model: "m",
    calls: [],
    stop: "done",
    rawStop: "",
    ...over,
  });

  it("a malformed reply is not understood: the order arrived incomplete", () => {
    expect(resolveResponse(reply({ stop: "malformed", rawStop: "MALFORMED_FUNCTION_CALL" }), context(), "algo")).toMatchObject({
      kind: "notUnderstood",
      transcript: "algo",
      reasonEs: "La orden llegó incompleta.",
    });
  });

  it("another stop with no calls is not understood: no order recognized", () => {
    expect(resolveResponse(reply({ stop: "other", rawStop: "OTHER" }), context(), "algo")).toMatchObject({
      kind: "notUnderstood",
      reasonEs: "No reconocí ninguna orden.",
    });
  });
});

describe("resolveError with provider errors (005 T011)", () => {
  it.each<[ProviderErrorKind, string]>([
    ["auth", "La clave de la API no es válida."],
    ["permission", "La clave no tiene permiso para este modelo."],
    ["model", "Este modelo no está disponible para esta clave."],
    ["rateLimit", "Se alcanzó el límite de uso; prueba en un momento."],
    ["timeout", "La respuesta tardó demasiado."],
    ["connection", "Sin conexión con el servicio de voz."],
    ["service", "Error del servicio de voz."],
  ])("%s → %s", (kind, message) => {
    expect(resolveError(new VoiceProviderError(kind, "x"), "t")).toMatchObject({ kind: "notUnderstood", transcript: "t", reasonEs: message });
  });

  it("the Anthropic SDK's NotFoundError is an unavailable model; other SDK mappings are unchanged", () => {
    const make = <T extends object>(cls: { prototype: T }): T => Object.create(cls.prototype) as T;
    const reason = (e: unknown) => (resolveError(e, "t") as { reasonEs: string }).reasonEs;
    expect(reason(make(Anthropic.NotFoundError))).toBe("Este modelo no está disponible para esta clave.");
    expect(reason(make(Anthropic.PermissionDeniedError))).toBe("La clave no tiene permiso para este modelo.");
    expect(reason(make(Anthropic.InternalServerError))).toBe("Error del servicio de voz.");
  });
});

const RECORDED = readdirSync(new URL("./recorded/", import.meta.url))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

/** 005 T022: Gemini twins resolve exactly like Claude's recorded responses (FR-007, FR-016). */
const geminiRaw = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./recorded/gemini/${name}.json`, import.meta.url), "utf8"));
const gemini = (name: string): ModelReply => geminiReply(geminiRaw(name), "gemini-3.8-flash");
const GEMINI = readdirSync(new URL("./recorded/gemini/", import.meta.url))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

describe("Gemini parity (005 T022)", () => {
  /** A log with one entry, so amendLast has something to correct. */
  function amendable() {
    const ctx = context();
    const action: Action = { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 240 }], mode: "full" };
    const log: LogEntry[] = [
      { kind: "group", seq: 9, id: "g9", at: "", source: "voice", action, events: [], touches: touchesOf([]), warnings: [] },
    ];
    return { ...ctx, effective: effectiveLog(log) };
  }

  it("every Claude scenario has a Gemini twin", () => {
    for (const name of RECORDED) expect(GEMINI).toContain(name);
  });

  it.each(RECORDED)("%s resolves to the same VoiceResult for both providers", (name) => {
    const ctx = name === "amend" ? amendable() : context();
    expect(resolveResponse(gemini(name), ctx, "orden")).toEqual(resolveResponse(recorded(name), ctx, "orden"));
  });

  it("a blocked prompt and a safety stop are rejected orders", () => {
    for (const name of ["blocked-prompt", "refusal"]) {
      expect(resolveResponse(gemini(name), context(), "algo")).toMatchObject({ kind: "notUnderstood", transcript: "algo", reasonEs: "La orden fue rechazada." });
    }
  });

  it("a malformed call arrived incomplete", () => {
    expect(resolveResponse(gemini("malformed-call"), context(), "algo")).toMatchObject({ reasonEs: "La orden llegó incompleta." });
  });

  it("text plus a call resolves only the call; a call without args resolves like {}", () => {
    const r = resolveResponse(gemini("text-and-call"), context(), "240, paga");
    expect(r).toMatchObject({ kind: "proposal", actions: [{ type: "runAndPayout", parts: [{ part: "revenue", amount: 240 }] }] });
    expect(resolveResponse(gemini("no-args"), context(), "deshacer")).toEqual({ kind: "undo", transcript: "deshacer" });
  });

  it.each(GEMINI)("SC-004: %s leaves the session state unchanged", (name) => {
    const ctx = name === "amend" ? amendable() : context();
    const before = JSON.stringify(ctx.state);
    resolveResponse(gemini(name), ctx, "orden");
    expect(JSON.stringify(ctx.state)).toBe(before);
  });
});

/**
 * T002: the offline Claude baseline (feature 005, SC-006). Every recorded Claude response,
 * resolved on the pre-005 code; never regenerate this snapshot during the feature.
 */

describe("recorded Claude responses baseline (T002)", () => {
  it.each(RECORDED)("%s", (name) => {
    expect(resolveResponse(recorded(name), context(), "orden")).toMatchSnapshot();
  });
});

/** Feature 014 T062: an English session resolves the same calls to the same results; only the text is English. */
describe("English twins (feature 014)", () => {
  const en = () => ({ ...context(), lang: "en" as const });

  it.each(RECORDED)("%s: the same model calls give the same result in an English session", (name) => {
    expect(resolveResponse(recorded(name), en(), "order")).toEqual(resolveResponse(recorded(name), context(), "order"));
  });

  it("the proposal summary, query answer and reasons read in English", () => {
    const payout = resolveResponse(recorded("payout"), en(), "240, pays");
    if (payout.kind !== "proposal") throw new Error(payout.kind);
    expect(domainText("en").proposalSummary(payout.action, en(), payout.events)).toMatch(/^PRR pays \$240/);
    expect(resolveResponse(recorded("query"), en(), "how much does Ana have?")).toMatchObject({ answer: { text: { en: "Ana has $600" } } });
    const amend = resolveResponse(recorded("amend"), { ...en(), effective: effectiveLog(history()) }, "no, it was 260");
    if (amend.kind !== "notUnderstood") throw new Error(amend.kind);
    expect(renderPlain(amend.reason, "en")).toBe("To correct it, undo back to that entry and record it again.");
    expect(amend.reasonEs).toBe("Para corregir, deshacé hasta esa entrada y volvé a anotarla.");
  });

  it("provider errors read in English", () => {
    const r = resolveError(new VoiceProviderError("rateLimit", "x"), "t");
    if (r.kind !== "notUnderstood") throw new Error(r.kind);
    expect(renderPlain(r.reason, "en")).toBe("The usage limit was reached; try again in a moment.");
  });

  it("the English snapshot has the same lines with English labels", () => {
    const ctx = { ...context(history()), lang: "en" as const };
    const text = snapshotAndTranscript({ ...ctx, transcript: "240, pays" });
    expect(text).toContain("Round: OR 1.1. Phase 3. Operating: PRR.");
    expect(text).toMatch(/^Bank: \$[\d,]+\.$/m);
    expect(text).toContain("Players:");
    expect(text).toContain("Latest entries (id in brackets, newest last):");
    expect(text).toContain("- [g2] Note: a");
    expect(text).toContain('Transcript: "240, pays"');
    expect(text).not.toMatch(/Ronda|Banco|Jugadores|Transcripción/);
  });
});
