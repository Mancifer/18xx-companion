/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Feature 014 (FR-014e): the languages voice is offered in, comma-separated ("es,en"); Spanish is always on. */
  readonly VITE_VOICE_LANGUAGES?: string;
  /** Feature 015 (FR-018): the voice languages Whisper is offered in, comma-separated; none by default. */
  readonly VITE_WHISPER_LANGUAGES?: string;
}
