import type { VoiceText } from "./contract/voice";
import { voice as en } from "./en/voice";
import { voice as es } from "./es/voice";
import type { Lang } from "./lang";

/** Feature 014: the voice text of every language. Only the voice layer and the UI read it, never the domain. */
export const VOICE_TEXT: Readonly<Record<Lang, VoiceText>> = { en, es };

export function voiceText(lang: Lang): VoiceText {
  return VOICE_TEXT[lang];
}
