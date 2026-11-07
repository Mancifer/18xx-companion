import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureUpdate } from "../../src/voice/engine";
import { MicError } from "../../src/voice/recorder";
import { TranscriptionError } from "../../src/voice/transcription/errors";
import type { TranscribeOptions, Transcriber, TranscriptionResult } from "../../src/voice/transcription/groq";
import { whisperEngine } from "../../src/voice/whisperEngine";
import { fakeMediaDeps, type FakeMediaOptions } from "../helpers/fakeMedia";

/** Feature 015 T018 (contracts/speech-engine.md): recorder + speech gate + transcriber behind the seam. */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(options: FakeMediaOptions & { result?: TranscriptionResult | ((o: TranscribeOptions) => Promise<TranscriptionResult>) } = {}) {
  const media = fakeMediaDeps(options);
  const seen: { blob: Blob; options: TranscribeOptions; tracksStopped: boolean }[] = [];
  const transcribe: Transcriber = (blob, o) => {
    seen.push({ blob, options: o, tracksStopped: media.allStopped() });
    const r = options.result ?? { kind: "text", text: "Ana compra una del B&O", ms: 500 };
    return typeof r === "function" ? r(o) : Promise.resolve(r);
  };
  const engine = whisperEngine({ media: () => media.deps, transcribe, apiKey: () => "gsk_test" });
  const updates: CaptureUpdate[] = [];
  const session = engine.open({ lang: "es-UY", displayLang: "es", hint: () => "Jugadores: Ana." });
  return { media, engine, session, seen, updates, onUpdate: (u: CaptureUpdate) => updates.push(u) };
}

/** Starts, waits for the recorder, holds for `ms`, and releases. */
async function hold(s: ReturnType<typeof setup>, ms: number) {
  expect(s.session.start(s.onUpdate)).toBe(true);
  await vi.advanceTimersByTimeAsync(ms);
  return s.session.stop();
}

describe("whisperEngine (feature 015 T018)", () => {
  it("reports `started` once the recorder is live, then levels", async () => {
    const s = setup();
    s.session.start(s.onUpdate);
    expect(s.updates).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(s.updates[0]).toEqual({ kind: "started" });
    expect(s.updates.some((u) => u.kind === "level")).toBe(true);
  });

  it("transcribes a held command and returns its text", async () => {
    const s = setup();
    await expect(hold(s, 1200)).resolves.toEqual({ kind: "text", text: "Ana compra una del B&O" });
  });

  it("passes the blob, the display language, the hint, the key, the file name and a signal", async () => {
    const s = setup();
    await hold(s, 1200);
    const call = s.seen[0]!;
    expect(call.blob.type).toBe("audio/webm;codecs=opus");
    expect(call.options).toMatchObject({ apiKey: "gsk_test", lang: "es", prompt: "Jugadores: Ana.", fileName: "command.webm" });
    expect(call.options.signal).toBeInstanceOf(AbortSignal);
  });

  it("FR-013: the tracks are stopped before the upload starts", async () => {
    const s = setup();
    await hold(s, 1200);
    expect(s.seen[0]?.tracksStopped).toBe(true);
  });

  it("FR-009: a tap is empty/short and nothing is uploaded", async () => {
    const s = setup();
    await expect(hold(s, 150)).resolves.toEqual({ kind: "empty", reason: "short" });
    expect(s.seen).toHaveLength(0);
    expect(s.media.allStopped()).toBe(true);
  });

  it("FR-009: silence is empty/silence and nothing is uploaded", async () => {
    const s = setup({ levels: [0.003] });
    await expect(hold(s, 1500)).resolves.toEqual({ kind: "empty", reason: "silence" });
    expect(s.seen).toHaveLength(0);
  });

  it("a release before the recorder started (permission prompt open) is empty/short", async () => {
    const s = setup({ manualGrant: true });
    s.session.start(s.onUpdate);
    const outcome = s.session.stop();
    s.media.grant();
    await expect(outcome).resolves.toEqual({ kind: "empty", reason: "short" });
    expect(s.media.allStopped()).toBe(true);
    expect(s.seen).toHaveLength(0);
  });

  it("cancel() while transcribing aborts the request and resolves empty/cancelled", async () => {
    let signal: AbortSignal | undefined;
    const s = setup({
      result: (o) =>
        new Promise((resolve) => {
          signal = o.signal;
          o.signal?.addEventListener("abort", () => resolve({ kind: "empty", reason: "cancelled" }));
        }),
    });
    s.session.start(s.onUpdate);
    await vi.advanceTimersByTimeAsync(1200);
    const outcome = s.session.stop();
    await vi.advanceTimersByTimeAsync(0);
    s.session.cancel();
    await expect(outcome).resolves.toEqual({ kind: "empty", reason: "cancelled" });
    expect(signal?.aborted).toBe(true);
  });

  it("transcription empties and errors pass through", async () => {
    await expect(hold(setup({ result: { kind: "empty", reason: "hallucination" } }), 1200)).resolves.toEqual({
      kind: "empty",
      reason: "hallucination",
    });
    const error = new TranscriptionError("auth", "Groq: 401");
    await expect(hold(setup({ result: { kind: "error", error } }), 1200)).resolves.toEqual({ kind: "error", error });
  });

  it("a mic error comes back as an error outcome, with the MicError", async () => {
    const s = setup({ fail: "NotAllowedError" });
    s.session.start(s.onUpdate);
    const outcome = await s.session.stop();
    expect(outcome.kind).toBe("error");
    expect(outcome.kind === "error" && outcome.error).toBeInstanceOf(MicError);
    expect(s.updates).toEqual([{ kind: "failed" }]);
  });

  it("supported() needs MediaRecorder, getUserMedia and a supported type", () => {
    expect(setup().engine.supported()).toBe(true);
    const noMedia = whisperEngine({ media: () => undefined, transcribe: () => Promise.reject(new Error("x")), apiKey: () => "k" });
    expect(noMedia.supported()).toBe(false);
    const media = fakeMediaDeps({ supported: [] });
    expect(whisperEngine({ media: () => media.deps, transcribe: () => Promise.reject(new Error("x")), apiKey: () => "k" }).supported()).toBe(false);
  });

  it("start() is false when the browser can't record", () => {
    const engine = whisperEngine({ media: () => undefined, transcribe: () => Promise.reject(new Error("x")), apiKey: () => "k" });
    expect(engine.open({ lang: "es-ES", displayLang: "es", hint: () => "" }).start(() => undefined)).toBe(false);
  });
});
