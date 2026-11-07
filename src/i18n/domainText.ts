import type { DomainText } from "./contract/domain";
import { domain as en } from "./en/domain";
import { domain as es } from "./es/domain";
import type { Lang } from "./lang";

/** Feature 014: the domain text of every language. The domain imports this, never the UI text. */
export const DOMAIN_TEXT: Readonly<Record<Lang, DomainText>> = { en, es };

export function domainText(lang: Lang): DomainText {
  return DOMAIN_TEXT[lang];
}
