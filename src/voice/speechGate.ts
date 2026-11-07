/**
 * Don't upload taps and silence (feature 015, FR-009, research R5, data-model §3). Each one would
 * cost a billed request (Groq bills at least 10 s) and a round trip before "didn't hear anything".
 */

export const MIN_DURATION_MS = 400;
export const MIN_VOICED_MS = 250;
/** Speech must be this many times louder than the recording's own quiet floor... */
export const FLOOR_FACTOR = 2.5;
/** ...and at least this loud (RMS), so near-silence never counts... */
export const MIN_SPEECH_LEVEL = 0.02;
/** ...but the bar never rises above this, so loud speech with few pauses still counts. */
export const MAX_SPEECH_THRESHOLD = 0.08;

export interface GateInput {
  readonly durationMs: number;
  readonly frameMs: number;
  /** RMS per frame, in recording order. */
  readonly levels: readonly number[];
}

export type SpeechVerdict = "speech" | "short" | "silence";

export function speechVerdict({ durationMs, frameMs, levels }: GateInput): SpeechVerdict {
  if (durationMs < MIN_DURATION_MS) return "short";
  // No analyser, or throttled timers sampled under half the recording: judge by duration only.
  if (levels.length * frameMs < durationMs / 2) return "speech";
  const sorted = [...levels].sort((a, b) => a - b);
  const quiet = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 10)));
  const floor = quiet.reduce((sum, l) => sum + l, 0) / quiet.length;
  const threshold = Math.max(MIN_SPEECH_LEVEL, Math.min(floor * FLOOR_FACTOR, MAX_SPEECH_THRESHOLD));
  const voicedMs = levels.filter((l) => l > threshold).length * frameMs;
  return voicedMs >= MIN_VOICED_MS ? "speech" : "silence";
}

export function hasSpeech(input: GateInput): boolean {
  return speechVerdict(input) === "speech";
}
