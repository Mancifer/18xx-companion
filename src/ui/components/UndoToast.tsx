import { useEffect, type ReactNode } from "react";
import { useFeedback } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { holderName, summaryEs, undoneEs } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { moneyFlows } from "../../domain/ledger/flows";
import type { HolderRef } from "../../domain/types";
import { ChipStrip, flowLabel } from "./ChipStrip";
import { HolderName } from "./CompanyBadge";
import { RichText } from "./RichText";
import type { GroupEntry } from "../../domain/ledger/entries";

const VISIBLE_MS = 6000;

/**
 * After every applied group, whatever its source, a brief notice with Undo (FR-061,
 * constitution IV). `extra` renders below the summary (the chip breakdown, US6).
 */
export function UndoToast({ extra, undoOnly = false }: { extra?: (group: GroupEntry) => ReactNode; undoOnly?: boolean }) {
  const { feedback, clear } = useFeedback();
  const { meta } = useSession();
  const { undoLast } = useDispatch();

  useEffect(() => {
    if (!feedback) return;
    const long = feedback.kind === "applied" && feedback.group.warnings.length > 0;
    const timer = window.setTimeout(clear, long ? VISIBLE_MS * 2 : VISIBLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [feedback, clear]);

  // History shows its own entries: there only undos and errors need a notice.
  if (!feedback || (undoOnly && feedback.kind === "applied")) return null;
  const ctx = { game: meta.game, players: meta.players, marks: true as const };

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
        <span>
          <RichText text={undoneEs(feedback.groups, ctx)} />
        </span>
      </div>
    );
  }
  const { group } = feedback;
  // Takeovers and bankruptcies move money in many directions: list every flow (T093). With chips,
  // the chip strips below already show each flow.
  const chips = meta.chipSet.chips.length > 0;
  const multiStep = group.events.some(
    (e) =>
      (e.t === "companyStatus" && (e.status === "receivership" || e.status === "bankrupt")) ||
      (e.t === "counterChange" && e.key === "bankrupt"),
  );
  const name = (h: HolderRef) => holderName(h, meta.game, meta.players);
  return (
    <div className="toast" role="status">
      <span className="toast-summary">
        <RichText text={summaryEs(group.action, ctx, group.events)} />
      </span>
      {group.warnings.map((w) => (
        <span key={w.code} className="toast-warning">
          ⚠ {w.messageEs}
        </span>
      ))}
      {multiStep && !chips ? (
        <ul className="toast-flows">
          {group.events.flatMap((e, i) =>
            e.t === "moneyTransfer"
              ? [
                  <li key={i}>
                    <HolderName holder={e.from} game={meta.game} players={meta.players} /> →{" "}
                    <HolderName holder={e.to} game={meta.game} players={meta.players} />: {formatMoney(e.amount, meta.game)}
                  </li>,
                ]
              : [],
          )}
        </ul>
      ) : null}
      {chips
        ? moneyFlows(group.events).map((flow) => (
            <ChipStrip key={`${flow.from}|${flow.to}`} flow={flow} set={meta.chipSet} game={meta.game} label={flowLabel(flow, name)} />
          ))
        : null}
      {extra?.(group)}
      <div className="row">
        <span className="spacer" />
        {/* Undo only runs in order: this undoes the newest entry, which is this toast's group. */}
        <button onClick={() => void undoLast()}>Deshacer</button>
      </div>
    </div>
  );
}
