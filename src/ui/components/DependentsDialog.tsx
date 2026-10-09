import { useSession } from "../../app/useSession";
import { summaryEs } from "../../domain/i18n/es";
import type { EffectiveGroup } from "../../domain/ledger/effectiveLog";
import { Sheet } from "./Sheet";

/**
 * FR-014: before undoing or amending an entry that later entries depend on, list them and ask.
 * Nothing is re-computed for the later entries; they keep what happened at the table.
 */
export function DependentsDialog({
  dependents,
  onCancel,
  onConfirm,
}: {
  dependents: readonly EffectiveGroup[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { meta } = useSession();
  const ctx = { game: meta.game, players: meta.players };
  const n = dependents.length;
  return (
    <Sheet
      title={
        n === 1 ? "Hay 1 entrada posterior que depende de esta" : `Hay ${n} entradas posteriores que dependen de esta`
      }
      onClose={onCancel}
    >
      <p className="muted">Las entradas posteriores no se recalculan: quedan como se anotaron.</p>
      <ul className="dependents">
        {dependents.map((g) => (
          <li key={g.id}>{summaryEs(g.action, ctx)}</li>
        ))}
      </ul>
      <div className="row">
        <button onClick={onCancel}>Cancelar</button>
        <span className="spacer" />
        <button className="primary" onClick={onConfirm}>
          Aplicar igualmente
        </button>
      </div>
    </Sheet>
  );
}
