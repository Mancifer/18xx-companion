import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { VoiceController, type VoiceEffects, type VoicePhase } from "../../src/app/voiceController";
import { getBuiltInGame } from "../../src/domain/games";
import type { CaptureOutcome, CaptureUpdate, SpeechCaptureSession, SpeechEngine } from "../../src/voice/engine";
import { anthropicReply } from "../../src/voice/providers/anthropic";
import { MicError } from "../../src/voice/recorder";
import type { ModelReply } from "../../src/voice/reply";
import { TranscriptionError } from "../../src/voice/transcription/errors";
import { makePlayers, TestSession } from "../helpers/dispatch";

/** Feature 015 T019 (data-model §6, contracts/speech-engine.md "Controller rules"). */

const recorded = (name: string): ModelReply =>
  anthropicReply(JSON.parse(readFileSync(`tests/voice/recorded/${name}.json`, "utf8")) as Anthropic.Message, "claude-sonnet-5");

const OR_SETUP = [
  { type: "startSR" },
  { type: "parCompany", player: "p1", company: "PRR", price: 100 },
  { type: "buyShare", buyer: "player:p1", company: "PRR", source: "ipo", count: 4 },
  { type: "endSR" },
  { type: "startOR" },
];

/** A whisper-like engine the test drives: it reports updates and settles stop() on demand. */
class FakeEngine implements SpeechEngine {
  readonly id = "whisper" as const;
  sessions: FakeSession[] = [];
  supported() {
    return true;
  }
  open() {
    const s = new FakeSession();
    this.sessions.push(s);
    return s;
  }
  get last() {
    return this.sessions.at(-1)!;
  }
}

class FakeSession implements SpeechCaptureSession {
  onUpdate: ((u: CaptureUpdate) => void) | undefined;
  cancelled = false;
  private settle: ((o: CaptureOutcome) => void) | undefined;
  stopCalls = 0;
  start(onUpdate: (u: CaptureUpdate) => void) {
    this.onUpdate = onUpdate;
    return true;
  }
  emit(u: CaptureUpdate) {
    this.onUpdate?.(u);
  }
  stop() {
    this.stopCalls += 1;
    return new Promise<CaptureOutcome>((resolve) => (this.settle = resolve));
  }
  finish(o: CaptureOutcome) {
    this.settle?.(o);
  }
  cancel() {
    this.cancelled = true;
    this.settle?.({ kind: "empty", reason: "cancelled" });
  }
}

function setup(replies: Record<string, string> = { "240, paga": "payout" }) {
  const game = getBuiltInGame("1830");
  const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
  const s = TestSession.start(game, players);
  for (const a of OR_SETUP) s.do(a);
  const engine = new FakeEngine();
  const messages: string[] = [];
  let t = 0;
  const logs: string[] = [];
  const dispatch = vi.fn<VoiceEffects["dispatch"]>(() => Promise.resolve({ ok: true }));
  let current: SpeechEngine = engine;
  const controller = new VoiceController({
    get engine() {
      return current;
    },
    lang: "es-UY",
    interpreter: (_session, message) => {
      messages.push(message);
      const transcript = /Transcripción: «(.*)»/.exec(message)?.[1] ?? "";
      return Promise.resolve(recorded(replies[transcript] ?? "not-understood"));
    },
    context: () => ({ game, players, state: s.state, effective: s.groups, gameEnd: { end: null, laterEntries: 0 }, lang: "es" }),
    effects: { dispatch, undoLast: () => Promise.resolve({ ok: true }), undoTo: () => Promise.resolve({ ok: true }) },
    now: () => t,
    log: (m) => logs.push(m),
  });
  const phases: VoicePhase[] = [];
  controller.subscribe(() => phases.push(controller.getSnapshot()));
  return {
    controller,
    engine,
    messages,
    dispatch,
    logs,
    phases,
    phase: () => controller.getSnapshot(),
    advance: (ms: number) => (t += ms),
    swapEngine: (e: SpeechEngine) => (current = e),
  };
}

/** Press, report started, release; returns the pending release. */
function holdAndRelease(c: ReturnType<typeof setup>) {
  c.controller.press();
  c.engine.last.emit({ kind: "started" });
  return c.controller.release();
}

describe("VoiceController with a Whisper engine (015 T019)", () => {
  it("press waits for `started`, then listening; release → transcribing → interpreting → result", async () => {
    const c = setup();
    c.controller.press();
    expect(c.phase().phase).toBe("idle");
    c.engine.last.emit({ kind: "started" });
    expect(c.phase()).toEqual({ phase: "listening", interim: "" });
    const released = c.controller.release();
    expect(c.phase()).toEqual({ phase: "transcribing" });
    c.engine.last.finish({ kind: "text", text: "240, paga" });
    await released;
    expect(c.phases.map((p) => p.phase)).toEqual(["listening", "transcribing", "interpreting", "result"]);
    const result = c.phase();
    expect(result.phase === "result" && result.result.kind).toBe("proposal");
  });

  it("FR-011: the interpreter gets the same snapshot-and-transcript message as a browser transcript", async () => {
    const c = setup();
    const released = holdAndRelease(c);
    c.engine.last.finish({ kind: "text", text: "240, paga" });
    await released;
    expect(c.messages).toHaveLength(1);
    expect(c.messages[0]).toContain("Transcripción: «240, paga»");
  });

  it("level updates set listening.level", () => {
    const c = setup();
    c.controller.press();
    c.engine.last.emit({ kind: "started" });
    c.engine.last.emit({ kind: "level", level: 0.4 });
    expect(c.phase()).toEqual({ phase: "listening", interim: "", level: 0.4 });
  });

  it("“sí” through Whisper confirms the open card", async () => {
    const c = setup();
    let released = holdAndRelease(c);
    c.engine.last.finish({ kind: "text", text: "240, paga" });
    await released;
    released = holdAndRelease(c);
    c.engine.last.finish({ kind: "text", text: "Sí." });
    await released;
    expect(c.dispatch).toHaveBeenCalledTimes(1);
    expect(c.phase().phase).toBe("idle");
  });

  it("an empty outcome goes back to idle with the “didn't hear” hint, or to the open card", async () => {
    const c = setup();
    let released = holdAndRelease(c);
    c.engine.last.finish({ kind: "empty", reason: "silence" });
    await released;
    expect(c.phase()).toEqual({ phase: "idle", hint: "empty" });
    expect(c.messages).toHaveLength(0);

    released = holdAndRelease(c);
    c.engine.last.finish({ kind: "text", text: "240, paga" });
    await released;
    released = holdAndRelease(c);
    c.engine.last.finish({ kind: "empty", reason: "short" });
    await released;
    const p = c.phase();
    expect(p.phase === "result" && p.result.kind).toBe("proposal");
    expect(p.phase === "result" && p.hint).toBe("empty");
  });

  it("a cancelled outcome gives no hint", async () => {
    const c = setup();
    const released = holdAndRelease(c);
    c.engine.last.finish({ kind: "empty", reason: "cancelled" });
    await released;
    expect(c.phase()).toEqual({ phase: "idle" });
  });

  it("FR-008: the limit releases on its own and the card says it was cut", async () => {
    const c = setup();
    c.controller.press();
    c.engine.last.emit({ kind: "started" });
    c.engine.last.emit({ kind: "limit" });
    expect(c.phase()).toEqual({ phase: "transcribing" });
    c.engine.last.finish({ kind: "text", text: "240, paga" });
    await vi.waitFor(() => expect(c.phase().phase).toBe("result"));
    const p = c.phase();
    expect(p.phase === "result" && p.hint).toBe("cut");
  });

  it("cancel() while transcribing goes idle; a late outcome from that press is ignored", async () => {
    const c = setup();
    const released = holdAndRelease(c);
    const session = c.engine.last;
    c.controller.cancel();
    expect(session.cancelled).toBe(true);
    expect(c.phase()).toEqual({ phase: "idle" });
    session.finish({ kind: "text", text: "240, paga" });
    await released;
    expect(c.phase()).toEqual({ phase: "idle" });
    expect(c.messages).toHaveLength(0);
  });

  it("a release before `started` (still acquiring) cancels quietly", async () => {
    const c = setup();
    c.controller.press();
    await c.controller.release();
    expect(c.engine.last.cancelled).toBe(true);
    expect(c.phase()).toEqual({ phase: "idle" });
  });

  it("FR-017: a mic error (no `started`, a `failed` update) → not understood with voice.micDenied, no transcript", async () => {
    const c = setup();
    c.controller.press();
    const session = c.engine.last;
    session.emit({ kind: "failed" });
    // The controller collects the error right away, even while the button is still held.
    expect(session.stopCalls).toBe(1);
    session.finish({ kind: "error", error: new MicError("denied", "NotAllowedError") });
    await vi.waitFor(() => expect(c.phase().phase).toBe("result"));
    // The later release has nothing to do.
    await c.controller.release();
    const p = c.phase();
    expect(p.phase === "result" && p.result.kind).toBe("notUnderstood");
    if (p.phase === "result" && p.result.kind === "notUnderstood") {
      expect(p.result.reason).toEqual({ code: "voice.micDenied" });
      expect(p.result.transcript).toBe("");
    }
  });

  it("a transcription error → not understood with voice.transcription and its kind", async () => {
    const c = setup();
    const released = holdAndRelease(c);
    c.engine.last.finish({ kind: "error", error: new TranscriptionError("auth", "Groq: 401") });
    await released;
    const p = c.phase();
    expect(p.phase === "result" && p.result.kind === "notUnderstood" && p.result.reason).toEqual({
      code: "voice.transcription",
      params: { kind: "auth" },
    });
  });

  it("the engine is read at press time: swapping it mid-command doesn't touch the command in flight", async () => {
    const c = setup();
    c.controller.press();
    const first = c.engine.last;
    first.emit({ kind: "started" });
    const other = new FakeEngine();
    c.swapEngine(other);
    const released = c.controller.release();
    first.finish({ kind: "text", text: "240, paga" });
    await released;
    expect(first.stopCalls).toBe(1);
    expect(other.sessions).toHaveLength(0);
    c.controller.press();
    expect(other.sessions).toHaveLength(1);
  });

  it("A2: the dev log's release-to-card time includes the transcription", async () => {
    const c = setup();
    c.controller.press();
    c.engine.last.emit({ kind: "started" });
    const released = c.controller.release();
    c.advance(700);
    c.engine.last.finish({ kind: "text", text: "240, paga" });
    await released;
    expect(c.logs.at(-1)).toBe("voz: 700 ms hasta la tarjeta");
  });
});
