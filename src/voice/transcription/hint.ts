import type { Lang } from "../../i18n/lang";
import { voiceText } from "../../i18n/voiceText";
import type { VoiceSession } from "../tools";

/**
 * Whisper's vocabulary hint (feature 015, FR-010, research R8, data-model §4): the session's names
 * and the game's words, so Whisper spells them the way the app knows them. Built for each
 * recording from the session; never stored.
 *
 * Company aliases are left out on purpose: they are phonetic forms for the AI resolver
 * ("pe erre erre"), and Whisper copies the prompt's spelling. Player aliases are real nicknames.
 */

export const HINT_MAX_CHARS = 400;
/** A conservative estimate, safely under Groq's 224-token prompt limit. */
export const HINT_MAX_TOKENS = 180;

/** Each word counts ceil(length / 3), each digit 1, each other symbol 1 (data-model §4). */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const [piece] of text.matchAll(/\p{L}+|\p{N}|[^\s\p{L}\p{N}]/gu)) {
    tokens += /^\p{L}/u.test(piece) ? Math.ceil(piece.length / 3) : 1;
  }
  return tokens;
}

type Section = "players" | "companies" | "trains" | "words";
interface Term {
  readonly section: Section;
  readonly text: string;
}

const SECTIONS: readonly Section[] = ["players", "companies", "trains", "words"];

/** The terms in priority order: what to keep when the budget is tight. */
function termsOf(session: VoiceSession, lang: Lang): Term[] {
  const { game } = session;
  const seated = [...session.players].sort((a, b) => a.seat - b.seat);
  const term = (section: Section) => (text: string) => ({ section, text });
  const trains = game.trains.flatMap((t) => t.variants.map((v) => v.name));
  return [
    ...seated.map((p) => term("players")(p.name)),
    ...game.companies.map((c) => term("companies")(c.shortName)),
    ...trains.map(term("trains")),
    ...seated.flatMap((p) => p.aliases.map(term("players"))),
    ...game.companies.flatMap((c) => [c.name, ...(c.altName ? [c.altName] : [])].map(term("companies"))),
    ...voiceText(lang).whisperHint.words.map(term("words")),
  ];
}

function render(lead: string, chosen: readonly Term[], lang: Lang): string {
  const labels = voiceText(lang).whisperHint;
  const parts = [lead];
  for (const section of SECTIONS) {
    const items = chosen.filter((t) => t.section === section).map((t) => t.text);
    if (items.length === 0) continue;
    if (section === "words") {
      const list = items.join(", ");
      parts.push(`${list.charAt(0).toLocaleUpperCase(lang)}${list.slice(1)}.`);
    } else {
      parts.push(`${labels[section]}: ${items.join(", ")}.`);
    }
  }
  return parts.join(" ");
}

const fits = (text: string) => text.length <= HINT_MAX_CHARS && estimateTokens(text) <= HINT_MAX_TOKENS;

export function buildHint(session: VoiceSession, lang: Lang): string {
  const lead = voiceText(lang).whisperHint.lead(session.game.name);
  const seen = new Set<string>();
  const chosen: Term[] = [];
  for (const term of termsOf(session, lang)) {
    const key = term.text.trim().toLocaleLowerCase(lang);
    if (!key || seen.has(key)) continue;
    // Whole terms only: once one doesn't fit, everything after it is dropped too.
    if (!fits(render(lead, [...chosen, term], lang))) break;
    seen.add(key);
    chosen.push(term);
  }
  return render(lead, chosen, lang);
}
