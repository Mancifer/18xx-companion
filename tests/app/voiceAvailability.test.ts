import { afterEach, describe, expect, it, vi } from "vitest";
import { voiceAvailability, type VoiceDeps } from "../../src/app/useVoice";
import { DEFAULT_SETTINGS, type Settings } from "../../src/persistence/settingsRepo";
import { browserRecognizer, type RecognizerLike } from "../../src/voice/speech";
import { fakeMediaDeps } from "../helpers/fakeMedia";

/**
 * Feature 015 T020 (data-model §2): which reason the mic shows, in order. "Whisper on" means the
 * toggle is on and Whisper is offered in the display language (FR-018). The first check, voice
 * offered in the display language at all, stays in the Table (feature 014, voiceGate tests).
 */

const recognizer = () => ({}) as RecognizerLike;

function deps({ speech = true, recorder = true, online = true } = {}): VoiceDeps {
  return {
    recognizer: speech ? recognizer : browserRecognizer,
    online: () => online,
    createInterpreter: () => () => Promise.reject(new Error("unused")),
    ...(recorder ? { media: () => fakeMediaDeps().deps } : { media: () => undefined }),
    transcriber: () => Promise.reject(new Error("unused")),
  };
}

/** `undefined` in the patch removes the field (exactOptionalPropertyTypes). */
const settings = (patch: { [K in keyof Settings]?: Settings[K] | undefined } = {}): Settings => {
  const merged = Object.entries({ ...DEFAULT_SETTINGS, apiKeys: { anthropic: "sk-ant-x" }, ...patch }).filter(([, v]) => v !== undefined);
  return Object.fromEntries(merged) as unknown as Settings;
};

const reason = (d: VoiceDeps, s: Settings) => {
  const a = voiceAvailability(d, s, "es");
  return a.ok ? "ok" : a.reason.code;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("voiceAvailability with the browser engine (toggle off)", () => {
  it("is ok with a recognizer, a connection and the AI key", () => {
    expect(reason(deps(), settings())).toBe("ok");
  });

  it("without a recognizer: noSpeech, or a nudge to Whisper when it's offered and can record", () => {
    expect(reason(deps({ speech: false }), settings())).toBe("voice.noSpeechTryWhisper");
    expect(reason(deps({ speech: false, recorder: false }), settings())).toBe("voice.noSpeech");
    vi.stubEnv("DEV", false);
    expect(reason(deps({ speech: false }), settings())).toBe("voice.noSpeech");
  });

  it("then offline, then the AI key (unchanged order)", () => {
    expect(reason(deps({ online: false }), settings())).toBe("voice.offline");
    expect(reason(deps(), settings({ apiKeys: {} }))).toBe("voice.noKey");
  });

  it("a saved Groq key changes nothing while the toggle is off", () => {
    expect(reason(deps({ speech: false }), settings({ groqKey: "gsk_x" }))).toBe("voice.noSpeechTryWhisper");
  });
});

describe("voiceAvailability with Whisper on", () => {
  const on = (patch: { [K in keyof Settings]?: Settings[K] | undefined } = {}) => settings({ whisper: true, groqKey: "gsk_x", ...patch });

  it("is ok with a recorder, a connection and both keys, with or without a recognizer", () => {
    expect(reason(deps(), on())).toBe("ok");
    expect(reason(deps({ speech: false }), on())).toBe("ok");
  });

  it("no recorder → noRecorder (no silent fallback to the browser engine)", () => {
    expect(reason(deps({ recorder: false }), on())).toBe("voice.noRecorder");
  });

  it("then offline", () => {
    expect(reason(deps({ online: false }), on())).toBe("voice.offline");
  });

  it("FR-004: no Groq key → noGroqKey, even when the browser recognizer exists", () => {
    expect(reason(deps(), on({ groqKey: undefined }))).toBe("voice.noGroqKey");
  });

  it("then the AI key", () => {
    expect(reason(deps(), on({ apiKeys: {} }))).toBe("voice.noKey");
  });
});

describe("voiceAvailability where Whisper isn't offered (FR-018)", () => {
  it("a stored toggle has no effect: the browser engine is checked and no Groq reason is given", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_WHISPER_LANGUAGES", "");
    const s = settings({ whisper: true, groqKey: undefined });
    expect(reason(deps(), s)).toBe("ok");
    expect(reason(deps({ speech: false }), s)).toBe("voice.noSpeech");
    expect(reason(deps({ recorder: false }), s)).toBe("ok");
  });

  it("once the language passes its gate, the toggle applies", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_WHISPER_LANGUAGES", "es");
    expect(reason(deps(), settings({ whisper: true }))).toBe("voice.noGroqKey");
  });
});
