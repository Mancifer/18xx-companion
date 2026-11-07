import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DOMAIN_TEXT, UI_TEXT } from "../i18n";
import type { DomainText } from "../i18n/contract/domain";
import type { UiText } from "../i18n/contract/ui";
import { detectLanguage, navigatorLanguages, type Lang } from "../i18n/lang";
import { SETTINGS_CHANGED } from "./settingsEvents";

/**
 * The language in use (feature 014, data-model §3). The provider is given the language to start
 * with (the saved one, or the device's) and how to save a new choice.
 */

export interface LanguageValue {
  readonly lang: Lang;
  /** Applies at once, then saves; a failed save keeps the language for this page load. */
  readonly setLang: (next: Lang) => Promise<void>;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function setDocumentLanguage(lang: Lang): void {
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export function LanguageProvider({
  initial,
  save,
  onSaveError,
  children,
}: {
  readonly initial: Lang;
  readonly save: (patch: { readonly language: Lang }) => Promise<unknown>;
  readonly onSaveError?: (error: unknown) => void;
  readonly children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback(
    async (next: Lang) => {
      setLangState(next);
      setDocumentLanguage(next);
      try {
        await save({ language: next });
        window.dispatchEvent(new Event(SETTINGS_CHANGED));
      } catch (error) {
        onSaveError?.(error);
      }
    },
    [save, onSaveError],
  );
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * The language in use. Outside a provider (a component rendered on its own) it is the device's,
 * and can't be changed.
 */
export function useLang(): LanguageValue {
  const value = useContext(LanguageContext);
  return value ?? { lang: detectLanguage(navigatorLanguages()), setLang: () => Promise.resolve() };
}

/** The UI text in the display language (feature 014). */
export function useText(): UiText {
  return UI_TEXT[useLang().lang];
}

/** The domain text (summaries, labels) in the display language. */
export function useDomainText(): DomainText {
  return DOMAIN_TEXT[useLang().lang];
}
