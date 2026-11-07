import { useCallback } from "react";
import { useLang } from "../app/language";
import { useSession } from "../app/useSession";
import type { Message } from "../i18n/contract/domain";
import { renderMessage, renderPlain } from "../i18n/render";

/** Feature 014: a domain message as text in the display language, with the open session's names. */
export function useMessageText(): (m: Message) => string {
  const { lang } = useLang();
  const { meta, state } = useSession();
  return useCallback((m: Message) => renderMessage(m, { game: meta.game, players: meta.players, state }, lang), [lang, meta, state]);
}

/** Feature 014: a message that names nothing from a session (import errors), in the display language. */
export function usePlainMessageText(): (m: Message) => string {
  const { lang } = useLang();
  return useCallback((m: Message) => renderPlain(m, lang), [lang]);
}
