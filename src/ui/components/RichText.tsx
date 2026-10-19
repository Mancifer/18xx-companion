import { useContext } from "react";
import { SessionContext } from "../../app/contexts";
import type { GameDefinition } from "../../domain/games/schema";
import { splitMentions } from "../../domain/i18n/mentions";
import { CompanyBadge } from "./CompanyBadge";

/**
 * A summary line whose company mentions render as badges (feature 013, contracts/ui.md
 * "RichText"). The badge shows the same words as the plain line, so the text read is unchanged;
 * a company the game doesn't know stays plain. `game` defaults to the open session's.
 */
export function RichText({ text, game }: { text: string; game?: GameDefinition }) {
  const store = useContext(SessionContext);
  const companies = (game ?? store?.getSnapshot().meta.game)?.companies ?? [];
  return (
    <>
      {splitMentions(text).map((part, i) => {
        if (typeof part === "string") return part;
        const company = companies.find((c) => c.id === part.company);
        return company ? <CompanyBadge key={i} company={company} size="inline" label={part.text} /> : part.text;
      })}
    </>
  );
}
