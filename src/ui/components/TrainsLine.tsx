import { useSession } from "../../app/useSession";
import { trainsLineEs } from "../../domain/i18n/es";
import type { CompanyId } from "../../domain/types";

/**
 * A company's trains, count and limit (feature 011, US2): "Trenes 2/4 · 2, 3". With `onCorrect`,
 * a trailing "Corregir…" opens the train correction view (US3).
 */
export function TrainsLine({ company, onCorrect }: { company: CompanyId; onCorrect?: (() => void) | undefined }) {
  const { meta, state } = useSession();
  const { text, warn } = trainsLineEs(meta.game, state, company);
  return (
    <p data-testid="trains-line" className={warn ? "trains-line warn" : "trains-line"}>
      <span>{text}</span>
      {onCorrect ? (
        <button className="ghost" onClick={onCorrect}>
          Corregir…
        </button>
      ) : null}
    </p>
  );
}
