import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { validateChipSet } from "../../domain/mechanics/chips";
import { ChipSetEditor, sortChips } from "../components/ChipSetEditor";
import { Sheet } from "../components/Sheet";

/** Edit the table's chips mid-game (FR-080). Table configuration: saved to the session, not logged. */
export function ChipsSheet({ onClose }: { onClose: () => void }) {
  const { meta } = useSession();
  const { updateChipSet } = useDispatch();
  const [draft, setDraft] = useState(meta.chipSet);
  const sorted = sortChips(draft);
  return (
    <Sheet title="Fichas" onClose={onClose}>
      <ChipSetEditor value={draft} onChange={setDraft} />
      <div className="row">
        <button onClick={() => setDraft({ chips: meta.game.chipPreset })}>Volver al juego</button>
        <span className="spacer" />
        <button
          className="primary"
          disabled={validateChipSet(sorted).length > 0}
          onClick={() =>
            void updateChipSet(sorted).then((ok) => {
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
