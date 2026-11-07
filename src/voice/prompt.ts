import { voiceText } from "../i18n/voiceText";
import type { VoiceSession } from "./tools";

/**
 * The stable system prompt (research R9): instructions, the game summary and the session's
 * names and aliases, in the session's language (feature 014; Spanish when it has none). It
 * depends only on the session, so it is cached with the tools.
 */
export function systemPrompt(session: VoiceSession): string {
  return voiceText(session.lang ?? "es").systemPrompt(session);
}
