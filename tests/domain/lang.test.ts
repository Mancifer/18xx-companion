import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LANG, detectLanguage, isLang, LANGUAGES, voiceEnabled, voiceLanguages } from "../../src/i18n/lang";

/** Feature 014 data-model §1, §3: the language module. */

describe("languages", () => {
  it("lists English then Español, each by its own name, with English as the default", () => {
    expect(LANGUAGES).toEqual([
      { id: "en", nativeName: "English" },
      { id: "es", nativeName: "Español" },
    ]);
    expect(DEFAULT_LANG).toBe("en");
  });

  it("isLang accepts only en and es", () => {
    expect(isLang("en")).toBe(true);
    expect(isLang("es")).toBe(true);
    for (const v of ["EN", "es-UY", "fr", "", null, undefined, 1]) expect(isLang(v)).toBe(false);
  });
});

describe("detectLanguage (FR-002)", () => {
  it("picks Spanish when the device's first language is any Spanish variant", () => {
    expect(detectLanguage(["es"])).toBe("es");
    expect(detectLanguage(["es-UY"])).toBe("es");
    expect(detectLanguage(["es-419", "en"])).toBe("es");
  });

  it("picks English for anything else, or for no list", () => {
    expect(detectLanguage(["en-US", "es"])).toBe("en");
    expect(detectLanguage(["pt-BR"])).toBe("en");
    expect(detectLanguage(["fr"])).toBe("en");
    expect(detectLanguage([])).toBe("en");
  });

  it("reads only the first entry, case-insensitively", () => {
    expect(detectLanguage(["ES-uy"])).toBe("es");
    expect(detectLanguage(["de", "es"])).toBe("en");
    expect(detectLanguage(["estonian-fake"])).toBe("en");
  });
});

describe("voiceLanguages (FR-014e)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is Spanish only by default, and Spanish is always on", () => {
    expect(voiceLanguages(undefined)).toEqual(["es"]);
    expect(voiceLanguages("")).toEqual(["es"]);
    expect(voiceLanguages("es,en")).toEqual(["es", "en"]);
    expect(voiceLanguages("en")).toEqual(["es", "en"]);
    expect(voiceLanguages("fr, ,en")).toEqual(["es", "en"]);
  });

  it("reads VITE_VOICE_LANGUAGES at each call", () => {
    expect(voiceEnabled("en")).toBe(false);
    expect(voiceEnabled("es")).toBe(true);
    vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en");
    expect(voiceEnabled("en")).toBe(true);
  });
});
