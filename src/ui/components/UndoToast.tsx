import { useEffect, type ReactNode } from "react";
import { useFeedback } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { summaryEs } from "../../domain/i18n/es";
import type { GroupEntry } from "../../domain/ledger/entries";

const VISIBLE_MS = 6000;

/**
 * After every applied group, whatever its source, a brief notice with Undo (FR-061,
 * constitution IV). `extra` renders below the summary (the chip breakdown, US6).
 */
export function UndoToast({ extra }: { extra?: (group: GroupEntry) => ReactNode }) {
  const { feedback, clear } = useFeedback();
  const { meta } = useSession();
  const { revert } = useDispatch();

  useEffect(() => {
    if (!feedback) return;
    const long = feedback.kind === "applied" && feedback.group.warnings.length > 0;
    const timer = window.setTimeout(clear, long ? VISIBLE_MS * 2 : VISIBLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [feedback, clear]);

  if (!feedback) return null;
  const ctx = { game: meta.game, players: meta.players };

  if (feedback.kind === "error") {
    return (
      <div className="toast" role="alert">
        <span>{feedback.messageEs}</span>
      </div>
    );
  }
  if (feedback.kind === "reverted") {
    return (
      <div className="toast" role="status">
        <span>Deshecho: {summaryEs(feedback.group.action, ctx)}</span>
      </div>
    );
  }
  const { group } = feedback;
  return (
    <div className="toast" role="status">
      <span className="toast-summary">{summaryEs(group.action, ctx)}</span>
      {group.warnings.map((w) => (
        <span key={w.code} className="toast-warning">
          ⚠ {w.messageEs}
        </span>
      ))}
      {extra?.(group)}
      <div className="row">
        <span className="spacer" />
        <button onClick={() => void revert(group.id)}>Deshacer</button>
      </div>
    </div>
  );
}
