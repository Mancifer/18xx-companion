import { useDomainText } from "../../app/language";
import type { SummaryContext } from "../../i18n/contract/domain";
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
  const dt = useDomainText();
  const u = dt.undoRange;
  const line = (g: UndoRange["oldest"]) => dt.summary(g.action, { ...ctx, marks: true }, g.events);
  return (
    <Sheet title={u.title(range.count)} onClose={onClose}>
      {transcript ? <p className="muted transcript">«{transcript}»</p> : null}
      <p>
        <RichText text={u.from(line(range.oldest))} />
      </p>
      <p>
        <RichText text={u.to(line(range.newest))} />
      </p>
      <p className="muted">{u.note}</p>
      <div className="row">
        <button onClick={onClose}>{u.cancel}</button>
        <span className="spacer" />
        <button
          className="primary big"
          onClick={() => {
            void Promise.resolve(onConfirm()).finally(onClose);
          }}
        >
          {u.confirm(range.count)}
        </button>
      </div>
    </Sheet>
  );
}
