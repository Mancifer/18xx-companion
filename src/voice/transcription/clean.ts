import type { Lang } from "../../i18n/lang";
import { voiceText } from "../../i18n/voiceText";
import type { GroqResponse } from "./groq";

/**
 * Whisper's transcript, cleaned (feature 015, research R6, contracts/groq-transcription.md §2/§7):
 * drop segments that are both likely silence and low-confidence, then treat a whole transcript
 * that is a known near-silence invention ("gracias por ver el video") as nothing heard. Anything
 * subtler is left to the AI provider and the confirmation card.
 */

export const NO_SPEECH_PROB = 0.6;
export const MIN_AVG_LOGPROB = -1.0;

/** Lower case, no accents, no punctuation, single spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type CleanResult = { readonly kind: "text"; readonly text: string } | { readonly kind: "empty"; readonly reason: "noSpeech" | "hallucination" };

export function cleanTranscript(body: GroqResponse, lang: Lang): CleanResult {
  const kept = body.segments
    ? body.segments
        .filter((s) => !((s.no_speech_prob ?? 0) > NO_SPEECH_PROB && (s.avg_logprob ?? 0) < MIN_AVG_LOGPROB))
        .map((s) => s.text)
        .join(" ")
    : body.text;
  const text = kept.replace(/\s+/g, " ").trim();
  const normalized = normalizeForMatch(text);
  if (!normalized) return { kind: "empty", reason: "noSpeech" };
  if (voiceText(lang).hallucinations.includes(normalized)) return { kind: "empty", reason: "hallucination" };
  return { kind: "text", text };
}
