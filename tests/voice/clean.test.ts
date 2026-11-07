import { describe, expect, it } from "vitest";
import { cleanTranscript, normalizeForMatch } from "../../src/voice/transcription/clean";

/** Feature 015 T033 (research R6, contracts/groq-transcription.md §2 and §7): what Whisper returns. */

const seg = (text: string, no_speech_prob = 0.01, avg_logprob = -0.2) => ({ text, no_speech_prob, avg_logprob });

describe("normalizeForMatch", () => {
  it("lower-cases, drops accents and punctuation, collapses spaces", () => {
    expect(normalizeForMatch("  ¡Gracias por ver el vídeo!  ")).toBe("gracias por ver el video");
    expect(normalizeForMatch("Subtítulos realizados por la comunidad de Amara.org")).toBe("subtitulos realizados por la comunidad de amaraorg");
  });
});

describe("cleanTranscript", () => {
  it("joins the kept segments", () => {
    expect(cleanTranscript({ text: "x", segments: [seg(" Ana compra"), seg(" una del B&O.")] }, "es")).toEqual({
      kind: "text",
      text: "Ana compra una del B&O.",
    });
  });

  it("drops a segment only when it's both likely silence and low-confidence", () => {
    const body = { text: "x", segments: [seg(" Bruno paga 30."), seg(" Gracias.", 0.9, -1.4)] };
    expect(cleanTranscript(body, "es")).toEqual({ kind: "text", text: "Bruno paga 30." });
  });

  it("keeps a confident short “sí” even with a high no_speech_prob", () => {
    expect(cleanTranscript({ text: " Sí.", segments: [seg(" Sí.", 0.8, -0.3)] }, "es")).toEqual({ kind: "text", text: "Sí." });
  });

  it("nothing left → empty/noSpeech", () => {
    expect(cleanTranscript({ text: " ...", segments: [seg(" ...", 0.95, -2)] }, "es")).toEqual({ kind: "empty", reason: "noSpeech" });
    expect(cleanTranscript({ text: "   " }, "en")).toEqual({ kind: "empty", reason: "noSpeech" });
  });

  it.each([
    ["es", "¡Gracias por ver el video!"],
    ["es", "Subtítulos realizados por la comunidad de Amara.org"],
    ["es", "Gracias."],
    ["en", "Thank you for watching."],
    ["en", "you"],
  ] as const)("%s: the whole transcript “%s” is a known hallucination → empty", (lang, text) => {
    expect(cleanTranscript({ text, segments: [seg(text)] }, lang)).toEqual({ kind: "empty", reason: "hallucination" });
  });

  it("matches the whole transcript only, never a substring", () => {
    expect(cleanTranscript({ text: "Gracias, Ana paga 30." }, "es")).toEqual({ kind: "text", text: "Gracias, Ana paga 30." });
    expect(cleanTranscript({ text: "Thank you, Ana pays 30." }, "en")).toEqual({ kind: "text", text: "Thank you, Ana pays 30." });
  });

  it("uses each language's own list", () => {
    expect(cleanTranscript({ text: "Gracias." }, "en")).toEqual({ kind: "text", text: "Gracias." });
  });
});
