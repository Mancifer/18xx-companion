import { useEffect, type ReactNode } from "react";
import { useFeedback } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { holderName, summaryEs } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { bankFlows } from "../../domain/ledger/flows";
import type { HolderRef } from "../../domain/types";
import { ChipStrip } from "./ChipStrip";
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
  if (feedback.kind === "amended") {
    return (
      <div className="toast" role="status">
        <span>Corregido: {summaryEs(feedback.action, ctx)}</span>
      </div>
    );
  }
  const { group } = feedback;
  // Takeovers and bankruptcies move money in many directions: list every flow (T093).
  const multiStep = group.events.some(
    (e) =>
      (e.t === "companyStatus" && (e.status === "receivership" || e.status === "bankrupt")) ||
      (e.t === "counterChange" && e.key === "bankrupt"),
  );
  const name = (h: HolderRef) => holderName(h, meta.game, meta.players);
  return (
    <div className="toast" role="status">
      <span className="toast-summary">{summaryEs(group.action, ctx, group.events)}</span>
      {group.warnings.map((w) => (
        <span key={w.code} className="toast-warning">
          ⚠ {w.messageEs}
        </span>
      ))}
      {multiStep ? (
        <ul className="toast-flows">
          {group.events.flatMap((e, i) =>
            e.t === "moneyTransfer"
              ? [
                  <li key={i}>
                    {name(e.from)} → {name(e.to)}: {formatMoney(e.amount, meta.game)}
                  </li>,
                ]
              : [],
          )}
        </ul>
      ) : null}
      {meta.chipSet.chips.length > 0
        ? bankFlows(group.events).map((flow) => (
            <ChipStrip
              key={flow.counterparty}
              flow={flow}
              set={meta.chipSet}
              game={meta.game}
              label={flow.direction === "fromBank" ? `El banco paga a ${name(flow.counterparty)}` : `${name(flow.counterparty)} paga al banco`}
            />
          ))
        : null}
      {extra?.(group)}
      <div className="row">
        <span className="spacer" />
        <button onClick={() => void revert(group.id)}>Deshacer</button>
      </div>
    </div>
  );
}
