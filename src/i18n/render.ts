import type { Warning } from "../domain/actions/schemas";
import { getBuiltInGame } from "../domain/games";
import type { Message, MessageContext, MessageParamsRecord, MessageText } from "./contract/domain";
import { messages as enMessages } from "./en/messages";
import { messages as esMessages } from "./es/messages";
import type { Lang } from "./lang";

/**
 * Feature 014 (data-model §4, §5): turning domain messages, stored warnings and notes into text
 * in the display language.
 */

const MESSAGES: Readonly<Record<Lang, MessageText>> = { en: enMessages, es: esMessages };

type MessageFn = (params: MessageParamsRecord, ctx: MessageContext) => string;
const lookup = (lang: Lang, code: string): MessageFn | undefined =>
  (MESSAGES[lang] as unknown as Readonly<Record<string, MessageFn | undefined>>)[code];

/**
 * A message that is already text, for call sites not yet converted to codes (removed once every
 * area is converted, T032). Never stored.
 */
export const TEXT_CODE = "_text";
export const textMessage = (text: string): Message => ({ code: TEXT_CODE, params: { text } });

/** Whether this language, or English as the fallback, has text for the code. */
export const hasMessage = (code: string): boolean => code === TEXT_CODE || lookup("en", code) !== undefined || lookup("es", code) !== undefined;

/** The message in `lang`, falling back to English (FR-012). Never shows an id for a known code. */
export function renderMessage(m: Message, ctx: MessageContext, lang: Lang): string {
  if (m.code === TEXT_CODE) return String(m.params?.["text"] ?? "");
  const fn = lookup(lang, m.code) ?? lookup("en", m.code);
  if (!fn) return m.code;
  const params = m.inner ? { ...m.params, reason: renderMessage(m.inner, ctx, lang) } : (m.params ?? {});
  return fn(params, ctx);
}

/** Spanish text written into a stored warning, so older app versions can still read it (R3). */
export function spanishText(m: Message, ctx: MessageContext): string {
  return renderMessage(m, ctx, "es");
}

const needsParamsCache = new Map<string, boolean>();

/** Whether a code's text reads any param: found once by rendering it with params that throw when read. */
function needsParams(code: string, ctx: MessageContext): boolean {
  const known = needsParamsCache.get(code);
  if (known !== undefined) return known;
  const fn = lookup("es", code) ?? lookup("en", code);
  let reads = false;
  const readsParam = () => {
    throw new Error("reads a param");
  };
  const probe = new Proxy({}, { get: readsParam, has: readsParam }) as MessageParamsRecord;
  try {
    fn?.(probe, ctx);
  } catch {
    // Reading a param, or failing without one: the text can't be built from the code alone.
    reads = true;
  }
  needsParamsCache.set(code, reads);
  return reads;
}

/**
 * A stored warning in `lang` (data-model §4): the catalog text when this version knows the code
 * and either the warning has its params or the text needs none; otherwise (a pre-0.2.0 warning
 * whose text needs params, or a code from a newer version) the stored Spanish text.
 */
export function renderWarning(w: Warning, ctx: MessageContext, lang: Lang): string {
  if (w.code === TEXT_CODE || !hasMessage(w.code)) return w.messageEs;
  if (w.params !== undefined || !needsParams(w.code, ctx)) return renderMessage({ code: w.code, params: w.params ?? {} }, ctx, lang);
  return w.messageEs;
}

export { SYSTEM_NOTE_TEXT } from "./systemNotes";

/**
 * A message that names nothing from a session (import errors, voice availability), rendered
 * without one. Only for codes whose text reads no game, player or state.
 */
export function renderPlain(m: Message, lang: Lang): string {
  return renderMessage(m, { game: getBuiltInGame("1830"), players: [] }, lang);
}

export const plainSpanish = (m: Message): string => renderPlain(m, "es");
