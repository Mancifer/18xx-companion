import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioRecorder, LEVEL_GAIN, MAX_RECORDING_MS, MicError, pickMimeType } from "../../src/voice/recorder";
import { FakeAudioContext, FakeMediaRecorder, fakeMediaDeps } from "../helpers/fakeMedia";

/** Feature 015 T015 (research R3–R5, data-model §3): push-to-talk recording with the media fakes. */

const handlers = () => {
  const calls = { started: 0, levels: [] as number[], limit: 0 };
  return {
    calls,
    h: {
      onStarted: () => (calls.started += 1),
      onLevel: (l: number) => calls.levels.push(l),
      onLimit: () => (calls.limit += 1),
    },
  };
};

describe("pickMimeType (research R3)", () => {
  it("prefers webm/opus, then ogg/opus, then mp4, with matching extensions", () => {
    fakeMediaDeps({ supported: ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"] });
    expect(pickMimeType(FakeMediaRecorder)).toEqual({ mimeType: "audio/webm;codecs=opus", extension: "webm" });
    fakeMediaDeps({ supported: ["audio/ogg;codecs=opus", "audio/mp4"] });
    expect(pickMimeType(FakeMediaRecorder)).toEqual({ mimeType: "audio/ogg;codecs=opus", extension: "ogg" });
    fakeMediaDeps({ supported: ["audio/mp4"] });
    expect(pickMimeType(FakeMediaRecorder)).toEqual({ mimeType: "audio/mp4", extension: "mp4" });
  });

  it("is undefined when no type is supported", () => {
    fakeMediaDeps({ supported: [] });
    expect(pickMimeType(FakeMediaRecorder)).toBeUndefined();
  });
});

describe("AudioRecorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for a mono stream with the browser's voice processing on", async () => {
    const media = fakeMediaDeps();
    await new AudioRecorder(media.deps).start(handlers().h);
    expect(media.calls).toEqual([{ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }]);
  });

  it("reports `started` only once the recorder's start event fires", async () => {
    const media = fakeMediaDeps();
    const { calls, h } = handlers();
    const started = new AudioRecorder(media.deps).start(h);
    expect(calls.started).toBe(0);
    await started;
    expect(calls.started).toBe(1);
    expect(FakeMediaRecorder.instances[0]?.mimeType).toBe("audio/webm;codecs=opus");
  });

  it("stop() resolves a blob of the chosen type, then every track is stopped and the context closed", async () => {
    const media = fakeMediaDeps({ supported: ["audio/mp4"] });
    const rec = new AudioRecorder(media.deps);
    await rec.start(handlers().h);
    await vi.advanceTimersByTimeAsync(1000);
    const recording = await rec.stop();
    expect(recording.blob.type).toBe("audio/mp4");
    expect(recording.extension).toBe("mp4");
    expect(recording.durationMs).toBe(1000);
    expect(recording.cut).toBe(false);
    expect(media.allStopped()).toBe(true);
    expect(FakeAudioContext.instances.every((c) => c.closed)).toBe(true);
  });

  it("FR-013: cancel() while acquiring stops the stream as soon as it arrives", async () => {
    const media = fakeMediaDeps({ manualGrant: true });
    const { calls, h } = handlers();
    const rec = new AudioRecorder(media.deps);
    const started = rec.start(h);
    expect(rec.state).toBe("acquiring");
    rec.cancel();
    media.grant();
    await started;
    expect(calls.started).toBe(0);
    expect(media.allStopped()).toBe(true);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("FR-013: cancel() while recording stops every track", async () => {
    const media = fakeMediaDeps();
    const rec = new AudioRecorder(media.deps);
    await rec.start(handlers().h);
    rec.cancel();
    expect(media.allStopped()).toBe(true);
    expect(rec.state).toBe("stopped");
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "noDevice"],
    ["OverconstrainedError", "noDevice"],
    ["AbortError", "other"],
  ] as const)("a %s from getUserMedia is a MicError(%s)", async (fail, kind) => {
    const media = fakeMediaDeps({ fail });
    const error = await new AudioRecorder(media.deps).start(handlers().h).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicError);
    expect((error as MicError).kind).toBe(kind);
  });

  it("samples the level about every 50 ms and reports it scaled to 0–1", async () => {
    const media = fakeMediaDeps({ levels: [0.02, 0.1, 0.3] });
    const { calls, h } = handlers();
    const rec = new AudioRecorder(media.deps);
    await rec.start(h);
    await vi.advanceTimersByTimeAsync(150);
    expect(calls.levels).toEqual([0.02 * LEVEL_GAIN, 0.1 * LEVEL_GAIN, 1].map((l): unknown => expect.closeTo(Math.min(1, l), 5)));
    const recording = await rec.stop();
    expect(recording.levels.map((l) => Math.round(l * 100) / 100)).toEqual([0.02, 0.1, 0.3]);
    expect(recording.frameMs).toBe(50);
  });

  it("without an AudioContext it records with no levels", async () => {
    const media = fakeMediaDeps({ noAudioContext: true });
    const { calls, h } = handlers();
    const rec = new AudioRecorder(media.deps);
    await rec.start(h);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls.levels).toEqual([]);
    expect((await rec.stop()).levels).toEqual([]);
  });

  it("FR-008: at the 30 s limit it reports `limit` and stops on its own, marked as cut", async () => {
    const media = fakeMediaDeps();
    const { calls, h } = handlers();
    const rec = new AudioRecorder(media.deps);
    await rec.start(h);
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS);
    expect(calls.limit).toBe(1);
    expect(media.allStopped()).toBe(true);
    // The controller's own release then gets the same recording.
    const recording = await rec.stop();
    expect(recording.cut).toBe(true);
    expect(recording.durationMs).toBe(MAX_RECORDING_MS);
  });
});
