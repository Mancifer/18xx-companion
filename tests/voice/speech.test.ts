import { describe, expect, it } from "vitest";
import { assembleTranscript, SpeechCapture, type RecognizerLike, type SpeechEventLike } from "../../src/voice/speech";

/** Transcript assembly across browser result models (bug: speech-transcript-duplication). */

const event = (transcripts: string[]): SpeechEventLike => {
  const results: Record<number, { length: number; 0: { transcript: string } }> = {};
  transcripts.forEach((transcript, i) => (results[i] = { length: 1, 0: { transcript } }));
  return { results: { length: transcripts.length, ...results } };
};

class FakeRecognizer implements RecognizerLike {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: RecognizerLike["onresult"] = null;
  onerror: RecognizerLike["onerror"] = null;
  onend: RecognizerLike["onend"] = null;
  start() {}
  stop() {
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    this.onend?.();
  }
}

describe("assembleTranscript", () => {
  it("collapses Android-style cumulative revisions to the latest", () => {
    expect(assembleTranscript(["Manuel", "Manuel Abre", "Manuel Abre", "Manuel Abre por 60"])).toBe("Manuel Abre por 60");
  });

  it("ignores case changes between revisions", () => {
    expect(assembleTranscript(["Manuel abre", "Manuel Abre Erie"])).toBe("Manuel Abre Erie");
  });

  it("joins desktop-style segments with a single space", () => {
    expect(assembleTranscript(["Manuel abre Erie", " por 60"])).toBe("Manuel abre Erie por 60");
  });

  it("handles a final segment followed by cumulative interims of the next one", () => {
    expect(assembleTranscript(["Manuel abre Erie", "por", "por 60"])).toBe("Manuel abre Erie por 60");
  });

  it("treats a result that restates all segments so far as a revision", () => {
    expect(assembleTranscript(["Manuel abre", "Erie", "Manuel abre Erie por 60"])).toBe("Manuel abre Erie por 60");
  });

  it("skips empty results and trims", () => {
    expect(assembleTranscript(["", "  Manuel  abre ", ""])).toBe("Manuel abre");
  });
});

describe("SpeechCapture", () => {
  it("stop() resolves with the deduplicated transcript after several onresult events", async () => {
    const r = new FakeRecognizer();
    const interims: string[] = [];
    const capture = new SpeechCapture(() => r, "es-ES");
    expect(capture.start((t) => interims.push(t))).toBe(true);
    expect(r.continuous && r.interimResults).toBe(true);
    r.onresult?.(event(["Manuel"]));
    r.onresult?.(event(["Manuel", "Manuel Abre"]));
    r.onresult?.(event(["Manuel", "Manuel Abre", "Manuel Abre", "Manuel Abre por 60"]));
    expect(interims).toEqual(["Manuel", "Manuel Abre", "Manuel Abre por 60"]);
    await expect(capture.stop()).resolves.toBe("Manuel Abre por 60");
  });
});
