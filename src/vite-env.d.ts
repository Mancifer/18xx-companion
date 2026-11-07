/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Feature 014 (FR-014e): the languages voice is offered in, comma-separated ("es,en"); Spanish is always on. */
  readonly VITE_VOICE_LANGUAGES?: string;
}
