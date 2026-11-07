/// <reference types="vite/client" />
/**
 * Feature 014 (data-model §1, §3): the languages the app is offered in, and how the device's
 * preference picks one when the user has not chosen.
 */

export type Lang = "en" | "es";

/** Selector order; each language is listed by its own name (FR-011). */
export const LANGUAGES: readonly { readonly id: Lang; readonly nativeName: string }[] = [
  { id: "en", nativeName: "English" },
  { id: "es", nativeName: "Español" },
];

export const DEFAULT_LANG: Lang = "en";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "es";
}

/** The first entry's primary subtag "es" → Spanish; anything else, or nothing → English (FR-002). */
export function detectLanguage(preferred: readonly string[]): Lang {
  const primary = (preferred[0] ?? "").split("-")[0]?.toLowerCase();
  return primary === "es" ? "es" : DEFAULT_LANG;
}

/** The build setting, read at each call so tests can stub it; absent outside Vite (the eval runner). */
function envVoiceLanguages(): string | undefined {
  // Written as `import.meta.env` so Vite (and Vitest's stubEnv) see it; the eval runner (tsx) has no env.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return import.meta.env?.VITE_VOICE_LANGUAGES;
}

/**
 * The languages voice is offered in (FR-014e, contracts/voice.md): `VITE_VOICE_LANGUAGES` as a
 * comma-separated list, unknown entries dropped. Spanish is always on; English joins once its
 * eval gate passes (T073, T074).
 */
export function voiceLanguages(raw: string | undefined = envVoiceLanguages()): Lang[] {
  const listed = (raw ?? "").split(",").map((s) => s.trim().toLowerCase());
  return ["es", ...LANGUAGES.map((l) => l.id).filter((id) => id !== "es" && listed.includes(id))];
}

export function voiceEnabled(lang: Lang): boolean {
  return voiceLanguages().includes(lang);
}

/** The build setting, read at each call so tests can stub it; absent outside Vite (the eval runner). */
function envWhisperLanguages(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return import.meta.env?.VITE_WHISPER_LANGUAGES;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const devBuild = (): boolean => import.meta.env?.DEV ?? false;

/**
 * The voice languages Whisper is offered in (feature 015, FR-018): `VITE_WHISPER_LANGUAGES` as a
 * comma-separated list, kept only where voice itself is offered. Unlike voice, no language is
 * always on: a language joins once its audio check passes (T054). Dev builds offer every voice
 * language, so the check can be recorded (constitution, "Platform").
 */
export function whisperLanguages(raw: string | undefined = envWhisperLanguages()): Lang[] {
  const voice = voiceLanguages();
  if (devBuild()) return voice;
  const listed = (raw ?? "").split(",").map((s) => s.trim().toLowerCase());
  return voice.filter((id) => listed.includes(id));
}

export function whisperOffered(lang: Lang): boolean {
  return whisperLanguages().includes(lang);
}

/** The device's preferred languages, safe where there is no `navigator`. */
export function navigatorLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  // Some engines leave these out; the DOM types say they are always there.
  const list = navigator.languages as readonly string[] | undefined;
  if (list && list.length > 0) return list;
  const one = navigator.language as string | undefined;
  return one ? [one] : [];
}
