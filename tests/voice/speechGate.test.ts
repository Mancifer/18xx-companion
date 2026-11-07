import { describe, expect, it } from "vitest";
import { hasSpeech, MIN_DURATION_MS, MIN_VOICED_MS, speechVerdict } from "../../src/voice/speechGate";

/** Feature 015 T016 (FR-009, research R5, data-model §3): don't upload taps and silence. */

const frames = (...runs: [level: number, count: number][]) => runs.flatMap(([level, count]) => Array<number>(count).fill(level));

describe("speech gate", () => {
  it("uses the documented defaults", () => {
    expect(MIN_DURATION_MS).toBe(400);
    expect(MIN_VOICED_MS).toBe(250);
  });

  it.each([
    ["a tap under 400 ms, even if loud", { durationMs: 300, levels: frames([0.4, 6]) }, "short"],
    ["silence", { durationMs: 1500, levels: frames([0.003, 30]) }, "silence"],
    ["a steady noise floor with no peaks (a fan, table chatter)", { durationMs: 2000, levels: frames([0.04, 40]) }, "silence"],
    ["a burst under 250 ms over the floor", { durationMs: 1500, levels: frames([0.01, 26], [0.3, 4]) }, "silence"],
    ["a short spoken command over a quiet floor", { durationMs: 1200, levels: frames([0.01, 12], [0.25, 8], [0.01, 4]) }, "speech"],
    ["a command over a noisy floor", { durationMs: 2000, levels: frames([0.05, 20], [0.35, 15], [0.05, 5]) }, "speech"],
    ["loud speech with almost no pauses (the threshold is capped)", { durationMs: 1500, levels: frames([0.12, 3], [0.3, 27]) }, "speech"],
  ] as const)("%s → %s", (_name, input, verdict) => {
    expect(speechVerdict({ ...input, frameMs: 50, levels: [...input.levels] })).toBe(verdict);
    expect(hasSpeech({ ...input, frameMs: 50, levels: [...input.levels] })).toBe(verdict === "speech");
  });

  it("with no level data (no AudioContext) it only checks the duration", () => {
    expect(speechVerdict({ durationMs: 900, frameMs: 50, levels: [] })).toBe("speech");
    expect(speechVerdict({ durationMs: 200, frameMs: 50, levels: [] })).toBe("short");
  });

  it("with sparse samples (throttled timers cover under half the recording) it only checks the duration", () => {
    // 1.2 s recorded, but only 4 frames (200 ms) were sampled: not enough to call it silence.
    expect(speechVerdict({ durationMs: 1200, frameMs: 50, levels: [0.003, 0.003, 0.003, 0.003] })).toBe("speech");
  });
});
