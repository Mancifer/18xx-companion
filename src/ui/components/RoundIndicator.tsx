import { useSession } from "../../app/useSession";
import { roundLabel } from "../../domain/i18n/es";
import { CompanyBadge } from "./CompanyBadge";

/** "OR 2.1 · fase 3 · PRR" in the top bar (FR-050). Tapping it opens the manual turn control. */
export function RoundIndicator({ onOpen }: { onOpen?: () => void }) {
  const { meta, state } = useSession();
  const current = meta.game.companies.find((c) => c.id === state.turn.currentCompany);
  const content = (
    <>
      <span className="round-label" data-testid="round">
        {roundLabel(state.turn)}
      </span>
      <span className="muted"> · fase {state.turn.phase}</span>
      {current ? (
        <>
          {" · "}
          <CompanyBadge company={current} size="sm" />
        </>
      ) : null}
    </>
  );
  return onOpen ? (
    <button className="ghost round-indicator" onClick={onOpen} aria-label={`Turno: ${roundLabel(state.turn)}`}>
      {content}
    </button>
  ) : (
    <span className="round-indicator">{content}</span>
  );
}
