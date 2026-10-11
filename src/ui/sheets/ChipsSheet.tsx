import { useMemo, useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { builtInGames } from "../../domain/games";
import { validateChipSet } from "../../domain/mechanics/chips";
import { setupPlan } from "../../domain/mechanics/chipSetup";
import { ChipSetEditor, sortChips } from "../components/ChipSetEditor";
import { ChipSetupPlan } from "../components/ChipSetupPlan";
import { Sheet } from "../components/Sheet";

/**
 * Edit the table's chips and bank counts mid-game (FR-080, feature 008). Table configuration:
 * saved to the session, not logged. "Preparación" shows the plan for the draft, live.
 */
export function ChipsSheet({ onClose }: { onClose: () => void }) {
  const { meta } = useSession();
  const { updateChips } = useDispatch();
  const [draft, setDraft] = useState(meta.chipSet);
  const [pins, setPins] = useState<Record<string, number>>(() => ({ ...meta.bankPins }));
  const sorted = useMemo(() => sortChips(draft), [draft]);
  const valid = validateChipSet(sorted).length === 0;
  const plan = useMemo(
    () => (valid ? setupPlan(meta.game, meta.players.length, sorted, pins) : undefined),
    [valid, meta.game, meta.players.length, sorted, pins],
  );
  /** An older session froze the preset of its day; a built-in game restores today's (R10, FR-002). */
  const preset = builtInGames.find((g) => g.id === meta.game.id)?.chipPreset ?? meta.game.chipPreset;
  return (
    <Sheet title="Fichas" onClose={onClose}>
      {plan ? (
        <section className="stack">
          <h3>Preparación</h3>
          <ChipSetupPlan plan={plan} set={sorted} game={meta.game} pins={pins} onPinsChange={setPins} />
        </section>
      ) : null}
      <ChipSetEditor value={draft} onChange={setDraft} />
      <div className="row">
        <button
          onClick={() => {
            setDraft({ chips: preset });
            setPins({});
          }}
        >
          Volver al juego
        </button>
        <span className="spacer" />
        <button
          className="primary"
          disabled={!valid}
          onClick={() =>
            void updateChips(sorted, pins).then((ok) => {
              if (ok) onClose();
            })
          }
        >
          Guardar
        </button>
      </div>
    </Sheet>
  );
}
