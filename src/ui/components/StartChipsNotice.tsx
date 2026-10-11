import { useId, useMemo } from "react";
import { useFeedback } from "../../app/AppProvider";
import { useSession } from "../../app/useSession";
import { setupPlan } from "../../domain/mechanics/chipSetup";
import { ChipSetupPlan } from "./ChipSetupPlan";

/**
 * "Fichas iniciales" (feature 008, contracts/ui.md §6, R9): the chips each player takes and, for a
 * fixed bank, the bank's chips, shown when a session starts. It does not auto-hide (handing out
 * chips takes a while) and has no Undo: there is nothing to undo. Dismissing it writes nothing.
 * It steps aside while the undo toast shows, so the two never overlap.
 */
export function StartChipsNotice({ onDismiss }: { onDismiss: () => void }) {
  const { meta } = useSession();
  const { feedback } = useFeedback();
  const titleId = useId();
  const plan = useMemo(
    () => setupPlan(meta.game, meta.players.length, meta.chipSet, meta.bankPins),
    [meta.game, meta.players.length, meta.chipSet, meta.bankPins],
  );
  if (feedback) return null;
  return (
    <div className="toast start-chips" role="status" aria-labelledby={titleId}>
      <span id={titleId} className="toast-summary">
        Fichas iniciales
      </span>
      <ChipSetupPlan plan={plan} set={meta.chipSet} game={meta.game} variant="notice" />
      <div className="row">
        <span className="spacer" />
        <button onClick={onDismiss}>Entendido</button>
      </div>
    </div>
  );
}
