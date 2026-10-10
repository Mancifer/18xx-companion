import { useSession } from "../../app/useSession";
import { cycleRoundLabel, phaseName, roundLabel } from "../../domain/i18n/es";
import { CompanyBadge } from "./CompanyBadge";

/**
 * "OR 2.1 · fase 3 · PRR" in the top bar (FR-050), or "Ciclo 2 de 6 · RO 1/2 · fase Verde" in
 * games played in cycles (RotLA). Tapping it opens the manual turn control.
 */
export function RoundIndicator({ onOpen }: { onOpen?: () => void }) {
  const { meta, state } = useSession();
  const current = meta.game.companies.find((c) => c.id === state.turn.currentCompany);
  const label = cycleRoundLabel(meta.game, state.turn) ?? roundLabel(state.turn);
  const content = (
    <>
      <span className="round-label" data-testid="round">
        {label}
      </span>
      <span className="muted"> · fase {phaseName(meta.game, state.turn.phase)}</span>
      {current ? (
        <>
          {" · "}
          <CompanyBadge company={current} size="sm" />
        </>
      ) : null}
    </>
  );
  return onOpen ? (
    <button className="ghost round-indicator" onClick={onOpen} aria-label={`Turno: ${label}`}>
      {content}
    </button>
  ) : (
    <span className="round-indicator">{content}</span>
  );
}
