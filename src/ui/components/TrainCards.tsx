import { useSession } from "../../app/useSession";
import { companyTrains } from "../../domain/i18n/es";
import type { CompanyId } from "../../domain/types";

/**
 * A company's trains as small cards, like the physical train cards (feature 013, US2). A rusted
 * train kept for a last run says "oxidado" on its card, so color is never the only cue. Spans,
 * because the company card is a button.
 */
export function TrainCards({ company, size = "md" }: { company: CompanyId; size?: "sm" | "md" }) {
  const { meta, state } = useSession();
  const { cards } = companyTrains(meta.game, state, company);
  return (
    <span role="list" aria-label="Trenes" className={`train-cards train-cards-${size}`}>
      {cards.map((c) => (
        <span key={c.asset} role="listitem" className={c.rusted ? "train-card rusted" : "train-card"}>
          <span className="train-card-label">{c.label}</span>
          {c.rusted ? <span className="train-card-note">oxidado</span> : null}
        </span>
      ))}
    </span>
  );
}
