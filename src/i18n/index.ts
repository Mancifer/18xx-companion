import type { UiText } from "./contract/ui";
import { ui as enUi } from "./en/ui";
import { ui as esUi } from "./es/ui";
import type { Lang } from "./lang";

/** Feature 014: every language's text, keyed by language (research R2). */

export { DOMAIN_TEXT, domainText } from "./domainText";

export const UI_TEXT: Readonly<Record<Lang, UiText>> = { en: enUi, es: esUi };
