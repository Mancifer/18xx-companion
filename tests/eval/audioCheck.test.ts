import { describe, expect, it } from "vitest";
import {
  billedSeconds,
  cacheable,
  cacheKey,
  candidateToManifest,
  gateCheck,
  gradableExpect,
  nextId,
  parseAudioArgs,
  summarizeAudio,
  wordErrorRate,
  type AudioRecord,
} from "../../eval/audio/lib";
import { GROQ_TRANSCRIPTION_MODEL } from "../../src/voice/transcription/groq";

/** Feature 015 T035 (contracts/audio-check.md, data-model §7): the audio check's pure parts, no network. */

const ENV = { GROQ_API_KEY: "gsk_x", ANTHROPIC_API_KEY: "sk-ant-x", GEMINI_API_KEY: "AIza-x" };

describe("parseAudioArgs", () => {
  it("defaults: all languages, the app's Whisper model, Claude, 18 Groq requests a minute, cached transcripts", () => {
    const o = parseAudioArgs([], ENV);
    expect(o).toMatchObject({
      lang: "all",
      groqModel: GROQ_TRANSCRIPTION_MODEL,
      provider: "anthropic",
      groqRpm: 18,
      free: false,
      transcripts: "cached",
      groqKey: "gsk_x",
      resolverKey: "sk-ant-x",
    });
  });

  it("reads every flag", () => {
    const o = parseAudioArgs(
      ["--lang", "es", "--model", "whisper-large-v3", "--resolver", "gemini-3.6-flash", "--only", "es-a001,es-a002", "--groq-rpm", "10", "--rpm", "5", "--free", "--transcripts", "fresh"],
      ENV,
    );
    expect(o).toMatchObject({
      lang: "es",
      groqModel: "whisper-large-v3",
      provider: "gemini",
      resolverModel: "gemini-3.6-flash",
      only: ["es-a001", "es-a002"],
      groqRpm: 10,
      rpm: 5,
      free: true,
      transcripts: "fresh",
      resolverKey: "AIza-x",
    });
  });

  it("Gemini keeps its free-tier pacing default", () => {
    expect(parseAudioArgs(["--resolver", "gemini-3.6-flash"], ENV).rpm).toBe(8);
  });

  it.each([
    [["--groq-rpm", "0"], /--groq-rpm/],
    [["--groq-rpm", "abc"], /--groq-rpm/],
    [["--transcripts", "maybe"], /--transcripts/],
    [["--lang", "fr"], /--lang/],
  ])("rejects %j", (argv, error) => {
    expect(() => parseAudioArgs(argv, ENV)).toThrow(error);
  });

  it("stops before any request when a key is missing", () => {
    expect(() => parseAudioArgs([], { ANTHROPIC_API_KEY: "x" })).toThrow(/GROQ_API_KEY/);
    expect(() => parseAudioArgs([], { GROQ_API_KEY: "x" })).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("transcript cache", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  it("the key is a hash of the clip, model, language and hint; any change changes it", () => {
    const base = cacheKey(bytes, "m", "es", "hint");
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(cacheKey(bytes, "m", "es", "hint")).toBe(base);
    expect(cacheKey(new Uint8Array([1, 2, 4]), "m", "es", "hint")).not.toBe(base);
    expect(cacheKey(bytes, "m2", "es", "hint")).not.toBe(base);
    expect(cacheKey(bytes, "m", "en", "hint")).not.toBe(base);
    expect(cacheKey(bytes, "m", "es", "hint 2")).not.toBe(base);
  });

  it("caches text and empty results, never errors", () => {
    expect(cacheable({ kind: "text", text: "x", ms: 1 })).toBe(true);
    expect(cacheable({ kind: "empty", reason: "noSpeech" })).toBe(true);
    expect(cacheable({ kind: "empty", reason: "cancelled" })).toBe(false);
    expect(cacheable({ kind: "error", error: new Error("x") as never })).toBe(false);
  });
});

describe("billing", () => {
  it("Groq bills at least 10 s per request", () => {
    expect(billedSeconds(undefined)).toBe(10);
    expect(billedSeconds(3200)).toBe(10);
    expect(billedSeconds(14_500)).toBe(14.5);
  });
});

const rec = (r: Partial<AudioRecord> & Pick<AudioRecord, "id" | "engine" | "pass">): AudioRecord => ({
  lang: "es",
  transcript: "x",
  mentionsName: false,
  cached: false,
  ...r,
});

describe("summarizeAudio", () => {
  const records: AudioRecord[] = [
    rec({ id: "es-a001", engine: "browser", pass: true, mentionsName: true }),
    rec({ id: "es-a001", engine: "whisper", pass: true, mentionsName: true, latencyMs: 500, billedSeconds: 10 }),
    rec({ id: "es-a002", engine: "browser", pass: false, mentionsName: true }),
    rec({ id: "es-a002", engine: "whisper", pass: true, mentionsName: true, latencyMs: 700, billedSeconds: 10 }),
    rec({ id: "es-a003", engine: "browser", pass: true }),
    rec({ id: "es-a003", engine: "whisper", pass: true, cached: true }),
    // Whisper only (recorded with Whisper on): counts for Whisper, not in the comparison.
    rec({ id: "es-a004", engine: "whisper", pass: false, latencyMs: 900, billedSeconds: 10 }),
  ];

  it("compares both engines on the clips that have both, with the names subset", () => {
    const s = summarizeAudio(records, { groqModel: "whisper-large-v3-turbo", free: false })["es"]!;
    expect(s.both.browser).toEqual({ correct: 2, total: 3, namesCorrect: 1, namesTotal: 2 });
    expect(s.both.whisper).toEqual({ correct: 3, total: 3, namesCorrect: 2, namesTotal: 2 });
    expect(s.whisperAll).toEqual({ correct: 3, total: 4, namesCorrect: 2, namesTotal: 2 });
  });

  it("latency counts only requests made this run, and says how many", () => {
    const s = summarizeAudio(records, { groqModel: "whisper-large-v3-turbo", free: false })["es"]!;
    expect(s.latency).toEqual({ measured: 3, p50: 700, p90: 900 });
  });

  it("cost: billed seconds × the model's hourly price; free tier shows $0 and the paid equivalent", () => {
    const paid = summarizeAudio(records, { groqModel: "whisper-large-v3-turbo", free: false })["es"]!;
    expect(paid.billedSeconds).toBe(30);
    expect(paid.costUsd).toBeCloseTo((30 / 3600) * 0.04, 8);
    const free = summarizeAudio(records, { groqModel: "whisper-large-v3-turbo", free: true })["es"]!;
    expect(free.costUsd).toBe(0);
    expect(free.paidEquivalentUsd).toBeCloseTo((30 / 3600) * 0.04, 8);
  });
});

describe("gateCheck (contracts/audio-check.md)", () => {
  const counts = (correct: number, total: number, namesCorrect: number, namesTotal: number) => ({ correct, total, namesCorrect, namesTotal });
  const fast = { whisperP90: 900, resolverP90: 2500, measured: 23 };

  it("passes when Whisper is close to the browser (accuracy −10 points, names −15) and fast enough", () => {
    // The 2026-11-07 English run: −8.7 points overall, −10.5 on names.
    const g = gateCheck({ browser: counts(21, 23, 17, 19), whisper: counts(19, 23, 15, 19) }, fast);
    expect(g).toEqual({ accuracy: true, names: true, speed: true, pass: true });
  });

  it("fails each condition on its own", () => {
    // 25 clips: 4 fewer is −16 points; names 14 clips: 3 fewer is −21 points.
    expect(gateCheck({ browser: counts(22, 25, 9, 14), whisper: counts(18, 25, 9, 14) }, fast).accuracy).toBe(false);
    expect(gateCheck({ browser: counts(22, 25, 12, 14), whisper: counts(22, 25, 9, 14) }, fast).names).toBe(false);
    expect(gateCheck({ browser: counts(22, 25, 9, 14), whisper: counts(22, 25, 9, 14) }, { ...fast, whisperP90: 1600 }).speed).toBe(false);
  });

  it("speed fails when no Groq latency was measured (an all-cached run): it was never checked", () => {
    const g = gateCheck({ browser: counts(22, 25, 9, 14), whisper: counts(22, 25, 9, 14) }, { whisperP90: 0, resolverP90: 2200, measured: 0 });
    expect(g).toMatchObject({ accuracy: true, names: true, speed: false, pass: false });
  });

  it("names fail with no name clips at all", () => {
    expect(gateCheck({ browser: counts(22, 25, 0, 0), whisper: counts(22, 25, 0, 0) }, fast).names).toBe(false);
  });
});

describe("wordErrorRate", () => {
  it("is edits over reference words, ignoring case and punctuation", () => {
    expect(wordErrorRate("Ana compra una del B&O", "ana compra una del B&O.")).toBe(0);
    expect(wordErrorRate("Ana compra una", "Ana compro una")).toBeCloseTo(1 / 3, 6);
    expect(wordErrorRate("Ana paga", "")).toBe(1);
  });
});

describe("collect: candidate → manifest line", () => {
  const players = [
    { id: "p1", name: "Ana", aliases: [], color: "#f00", seat: 1 },
    { id: "p2", name: "Bruno", aliases: [], color: "#0f0", seat: 2 },
  ];
  const fixture = { session: { players, game: { companies: [{ id: "PRR" }, { id: "B&O" }] } } };

  it("numbers ids per language", () => {
    expect(nextId(["es-a001", "es-a002", "en-a001"], "es")).toBe("es-a003");
    expect(nextId([], "en")).toBe("en-a001");
  });

  it("turns the confirmed action into an expectation and derives the names subset", () => {
    const line = candidateToManifest(
      { transcript: "Ana compra una del PRR", expect: { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 1 }, fixture, audio: "candidate-1.webm", engine: "browser", lang: "es" },
      { id: "es-a001", audio: "es-a001.webm", fixture: "es-a001" },
    );
    expect(line).toEqual({
      id: "es-a001",
      lang: "es",
      audio: "es-a001.webm",
      fixture: "es-a001",
      browserTranscript: "Ana compra una del PRR",
      category: "stock",
      expect: { kind: "actions", actions: [{ type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 1 }] },
      mentionsName: true,
    });
  });

  it("a Whisper clip has no browser transcript; no action means not understood; a compound lists its actions", () => {
    const whisper = candidateToManifest(
      { transcript: "eh", expect: null, fixture, audio: "c.mp4", engine: "whisper", lang: "en" },
      { id: "en-a001", audio: "en-a001.mp4", fixture: "en-a001" },
    );
    expect(whisper).toMatchObject({ expect: { kind: "notUnderstood" }, category: "notUnderstood", mentionsName: false });
    expect(whisper).not.toHaveProperty("browserTranscript");
    const compound = candidateToManifest(
      {
        transcript: "x",
        expect: { type: "compound", actions: [{ type: "buyTrain", trainType: "4" }, { type: "runAndPayout", parts: [] }] },
        fixture,
        audio: "c.webm",
        engine: "browser",
        lang: "es",
      },
      { id: "es-a002", audio: "es-a002.webm", fixture: "es-a002" },
    );
    expect(compound).toMatchObject({ category: "compound", expect: { kind: "actions", actions: [{ type: "buyTrain" }, { type: "runAndPayout" }] } });
  });
});

describe("gradableExpect", () => {
  it("drops a cost's free-text reason, as hand-written eval:voice cases leave it out", () => {
    const pay = { type: "bankPays", company: "ADP", amount: 30, reason: "cobro del banco" };
    expect(gradableExpect({ kind: "actions", actions: [pay, { type: "payCost", company: "AGR", amount: 40, reason: "Terrain" }] })).toEqual({
      kind: "actions",
      actions: [
        { type: "bankPays", company: "ADP", amount: 30 },
        { type: "payCost", company: "AGR", amount: 40 },
      ],
    });
    expect(pay.reason).toBe("cobro del banco");
  });

  it("leaves every other field and other expectations as they are", () => {
    const train = { kind: "actions" as const, actions: [{ type: "buyTrain", company: "EXV", trainType: "2", price: 1 }] };
    expect(gradableExpect(train)).toEqual(train);
    expect(gradableExpect({ kind: "notUnderstood" })).toEqual({ kind: "notUnderstood" });
  });
});
