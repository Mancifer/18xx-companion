import type { Query, QueryKind } from "../domain/queries";
import type { QueryContext } from "../i18n/contract/voice";
import { LANGUAGES, type Lang } from "../i18n/lang";
import { voiceText } from "../i18n/voiceText";

/** A state question's answer (FR-073, US5-4), from the state when it was asked, in every language. */
export interface QueryAnswer {
  readonly kind: QueryKind;
  readonly text: Readonly<Record<Lang, string>>;
}

/** Answered from the app's state, never from the model's text; the card shows the display language. */
export function answerQuery(ctx: QueryContext, q: Query): QueryAnswer {
  const text = Object.fromEntries(LANGUAGES.map(({ id }) => [id, voiceText(id).queryAnswer(ctx, q)])) as Record<Lang, string>;
  return { kind: q.kind, text };
}
