import { summaryEs, UNDO_RANGE_ES, type SummaryContext } from "../../domain/i18n/es";
import type { UndoRange } from "../../domain/ledger/undo";
import { RichText } from "./RichText";
import { Sheet } from "./Sheet";

/**
 * Confirms an undo back to an older entry (feature 010, FR-003, contracts/history-ui.md): the
 * count, the oldest and the newest entry. Shared by History and voice; from voice the transcript
 * shows above the title. Nothing changes until "Deshacer N".
 */
export function UndoRangeSheet({
  range,
  ctx,
  transcript,
  onConfirm,
  onClose,
}: {
  range: UndoRange;
  ctx: SummaryContext;
  transcript?: string;
  onConfirm: () => unknown;
  onClose: () => void;
}) {
  const line = (g: UndoRange["oldest"]) => summaryEs(g.action, { ...ctx, marks: true }, g.events);
  return (
    <Sheet title={UNDO_RANGE_ES.title(range.count)} onClose={onClose}>
      {transcript ? <p className="muted transcript">«{transcript}»</p> : null}
      <p>
        <RichText text={UNDO_RANGE_ES.from(line(range.oldest))} />
      </p>
      <p>
        <RichText text={UNDO_RANGE_ES.to(line(range.newest))} />
      </p>
      <p className="muted">{UNDO_RANGE_ES.note}</p>
      <div className="row">
        <button onClick={onClose}>{UNDO_RANGE_ES.cancel}</button>
        <span className="spacer" />
        <button
          className="primary big"
          onClick={() => {
            void Promise.resolve(onConfirm()).finally(onClose);
          }}
        >
          {UNDO_RANGE_ES.confirm(range.count)}
        </button>
      </div>
    </Sheet>
  );
}
