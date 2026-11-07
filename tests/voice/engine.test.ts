import { afterEach, describe, expect, it, vi } from "vitest";
import { browserEngine, canRecordAlongsideRecognizer, type CaptureUpdate } from "../../src/voice/engine";
import { fakeMediaDeps } from "../helpers/fakeMedia";
import type { RecognizerLike } from "../../src/voice/speech";

/** Feature 015 T006 (contracts/speech-engine.md): the browser recognizer behind the engine seam. */

class FakeRecognizer implements RecognizerLike {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: RecognizerLike["onresult"] = null;
  onerror: RecognizerLike["onerror"] = null;
  onend: RecognizerLike["onend"] = null;
  started = false;
  aborted = false;
  start() {
    this.started = true;
  }
  stop() {
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    this.aborted = true;
    this.onend?.();
  }
  say(...texts: string[]) {
    const results: Record<number, { length: number; 0: { transcript: string } }> = {};
    texts.forEach((t, i) => (results[i] = { length: 1, 0: { transcript: t } }));
    this.onresult?.({ results: { length: texts.length, ...results } });
  }
}

function setup() {
  let recognizer: FakeRecognizer | undefined;
  const engine = browserEngine(() => (recognizer = new FakeRecognizer()));
  const updates: CaptureUpdate[] = [];
  const session = engine.open({ lang: "es-UY", displayLang: "es", hint: () => "" });
  return { engine, session, updates, onUpdate: (u: CaptureUpdate) => updates.push(u), recognizer: () => recognizer! };
}

describe("browserEngine (feature 015 T006)", () => {
  it("is supported when the factory is the test's own (speechAvailable semantics)", () => {
    expect(setup().engine.supported()).toBe(true);
    expect(setup().engine.id).toBe("browser");
  });

  it("is unsupported with the real factory and no SpeechRecognition in this environment", async () => {
    const { browserRecognizer } = await import("../../src/voice/speech");
    expect(browserEngine(browserRecognizer).supported()).toBe(false);
  });

  it("starts the recognizer with the region and reports `started` right away", () => {
    const s = setup();
    expect(s.session.start(s.onUpdate)).toBe(true);
    expect(s.recognizer().started).toBe(true);
    expect(s.recognizer().lang).toBe("es-UY");
    expect(s.updates).toEqual([{ kind: "started" }]);
  });

  it("sends one interim update per result, assembled like today", () => {
    const s = setup();
    s.session.start(s.onUpdate);
    s.recognizer().say("Manuel abre Erie");
    s.recognizer().say("Manuel abre Erie", " por 60");
    expect(s.updates.slice(1)).toEqual([
      { kind: "interim", text: "Manuel abre Erie" },
      { kind: "interim", text: "Manuel abre Erie por 60" },
    ]);
  });

  it("stop() resolves the final transcript", async () => {
    const s = setup();
    s.session.start(s.onUpdate);
    s.recognizer().say("Ana compra una del B&O");
    await expect(s.session.stop()).resolves.toEqual({ kind: "text", text: "Ana compra una del B&O" });
  });

  it("stop() with nothing heard resolves empty/silence", async () => {
    const s = setup();
    s.session.start(s.onUpdate);
    await expect(s.session.stop()).resolves.toEqual({ kind: "empty", reason: "silence" });
  });

  it("cancel() aborts and the pending stop() resolves empty/cancelled", async () => {
    const s = setup();
    s.session.start(s.onUpdate);
    s.recognizer().say("Ana");
    const stopped = s.session.stop();
    s.session.cancel();
    expect(s.recognizer().aborted).toBe(true);
    await expect(stopped).resolves.toEqual({ kind: "empty", reason: "cancelled" });
  });

  it("start() is false when the factory gives no recognizer", () => {
    const engine = browserEngine(() => undefined);
    expect(engine.open({ lang: "es-ES", displayLang: "es", hint: () => "" }).start(() => undefined)).toBe(false);
  });
});

describe("dev check clips next to the browser recognizer (bug browser-speech-regression)", () => {
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
  const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

  afterEach(() => vi.restoreAllMocks());

  it("Chrome Android can't share the microphone with its recognizer; desktop can", () => {
    expect(canRecordAlongsideRecognizer(ANDROID)).toBe(false);
    expect(canRecordAlongsideRecognizer(DESKTOP)).toBe(true);
    expect(canRecordAlongsideRecognizer("")).toBe(true);
  });

  const hold = (userAgent: string) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    const media = fakeMediaDeps();
    let recognizer: FakeRecognizer | undefined;
    const engine = browserEngine(() => (recognizer = new FakeRecognizer()), { clipRecorder: () => media.deps });
    const session = engine.open({ lang: "es-UY", displayLang: "es", hint: () => "" });
    const updates: CaptureUpdate[] = [];
    expect(session.start((u) => updates.push(u))).toBe(true);
    return { media, updates, recognizer: () => recognizer! };
  };

  it("on Android the hold records no clip: the microphone is never requested, the recognizer runs", () => {
    const h = hold(ANDROID);
    expect(h.media.calls).toHaveLength(0);
    expect(h.recognizer().started).toBe(true);
    expect(h.updates).toEqual([{ kind: "started" }]);
  });

  it("on desktop the same hold is still recorded", () => {
    const h = hold(DESKTOP);
    expect(h.media.calls).toHaveLength(1);
    expect(h.recognizer().started).toBe(true);
  });
});
