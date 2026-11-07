import { useSession } from "../../app/useSession";
import { useDomainText, useText } from "../../app/language";
import { companyTrains } from "../../i18n/shared";
import type { CompanyId } from "../../domain/types";
import { TrainCards } from "./TrainCards";

/**
 * A company's trains, count and limit (feature 011, US2): "Trenes 2/4" and one card per train
 * (feature 013). With `onCorrect`, a trailing "Corregir…" opens the train correction view (US3).
 */
export function TrainsLine({ company, onCorrect }: { company: CompanyId; onCorrect?: (() => void) | undefined }) {
  const { meta, state } = useSession();
  const t = useText().table.trains;
  const dt = useDomainText();
  const { cards, count, limit, over } = companyTrains(meta.game, state, company);
  const none = cards.length === 0;
  return (
    <div data-testid="trains-line" className={none || over ? "trains-line warn" : "trains-line"}>
      {none ? (
        <span>{t.none}</span>
      ) : (
        <>
          <span>{dt.trainsHead(count, limit)}</span>
          <TrainCards company={company} />
          {over ? <span>{t.overLimit}</span> : null}
        </>
      )}
      {onCorrect ? (
        <button className="ghost" onClick={onCorrect}>
          {t.correct}
        </button>
      ) : null}
    </div>
  );
}
