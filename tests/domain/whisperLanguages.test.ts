import { afterEach, describe, expect, it, vi } from "vitest";
import { whisperLanguages, whisperOffered } from "../../src/i18n/lang";

/**
 * Feature 015 T008 (FR-018, data-model §2): Whisper is offered in a language only after its audio
 * check passes (`VITE_WHISPER_LANGUAGES`). Unlike voice, no language is always on. Dev builds
 * offer every voice language, so the check can be recorded.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("whisperLanguages (production build)", () => {
  it("is empty by default: no language is always on", () => {
    vi.stubEnv("DEV", false);
    expect(whisperLanguages(undefined)).toEqual([]);
    expect(whisperLanguages("")).toEqual([]);
  });

  it("lists the languages named, dropping unknown ones and those without voice", () => {
    vi.stubEnv("DEV", false);
    // Voice is Spanish only unless VITE_VOICE_LANGUAGES adds English.
    expect(whisperLanguages("es,en")).toEqual(["es"]);
    expect(whisperLanguages("fr, ,es")).toEqual(["es"]);
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    expect(whisperLanguages("es,en")).toEqual(["es", "en"]);
    expect(whisperLanguages("en")).toEqual(["en"]);
  });

  it("reads VITE_WHISPER_LANGUAGES at each call", () => {
    vi.stubEnv("DEV", false);
    expect(whisperOffered("es")).toBe(false);
    vi.stubEnv("VITE_WHISPER_LANGUAGES", "es");
    expect(whisperOffered("es")).toBe(true);
    expect(whisperOffered("en")).toBe(false);
  });
});

describe("whisperLanguages (dev build)", () => {
  it("offers every voice language, whatever the setting says", () => {
    vi.stubEnv("DEV", true);
    expect(whisperLanguages("")).toEqual(["es"]);
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    expect(whisperLanguages(undefined)).toEqual(["es", "en"]);
    expect(whisperOffered("en")).toBe(true);
  });
});
