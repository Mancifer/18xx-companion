import { useSession } from "../../app/useSession";
import { companyTrains, trainsHeadEs } from "../../domain/i18n/es";
import type { CompanyId } from "../../domain/types";
import { TrainCards } from "./TrainCards";

/**
 * A company's trains, count and limit (feature 011, US2): "Trenes 2/4" and one card per train
 * (feature 013). With `onCorrect`, a trailing "Corregir…" opens the train correction view (US3).
 */
export function TrainsLine({ company, onCorrect }: { company: CompanyId; onCorrect?: (() => void) | undefined }) {
  const { meta, state } = useSession();
  const { cards, count, limit, over } = companyTrains(meta.game, state, company);
  const none = cards.length === 0;
  return (
    <div data-testid="trains-line" className={none || over ? "trains-line warn" : "trains-line"}>
      {none ? (
        <span>Sin trenes</span>
      ) : (
        <>
          <span>{trainsHeadEs(count, limit)}</span>
          <TrainCards company={company} />
          {over ? <span>sobre el límite</span> : null}
        </>
      )}
      {onCorrect ? (
        <button className="ghost" onClick={onCorrect}>
          Corregir…
        </button>
      ) : null}
    </div>
  );
}
