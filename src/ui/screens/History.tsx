import { useMemo, useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { Action } from "../../domain/actions/schemas";
import type { PrimitiveEvent } from "../../domain/events/types";
import { balanceLineEs, movementLineEs, summaryEs, UNDO_RANGE_ES, type SummaryContext } from "../../domain/i18n/es";
import { entryBreakdown } from "../../domain/ledger/breakdown";
import { groupHistory, type GroupHistory } from "../../domain/ledger/effectiveLog";
import type { EntrySource, LogEntry } from "../../domain/ledger/entries";
import { roundSections } from "../../domain/ledger/rounds";
import { isSetup, newestUndoable, type UndoRange } from "../../domain/ledger/undo";
import { RichText } from "../components/RichText";
import { UndoRangeSheet } from "../components/UndoRangeSheet";
import { UndoToast } from "../components/UndoToast";
import { useNav } from "../nav";
import { useExportSession } from "../useExport";

const SOURCE_ICON: Readonly<Record<EntrySource, { icon: string; label: string }>> = {
  touch: { icon: "👆", label: "Toque" },
  voice: { icon: "🎤", label: "Voz" },
  system: { icon: "⚙", label: "Sistema" },
};

function time(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Every entry, newest first, in round sections (FR-013, feature 011): undone entries struck through, legacy corrected ones with
 * the original and the latest version, and the first entry after which an invariant broke
 * highlighted (FR-015). Undo only runs in order (feature 010): the newest entry has "Deshacer"
 * on its row; any older active entry has "Deshacer hasta acá" in its panel, with a confirmation.
 * One tap on a row shows where the money went (US3); the breakdown is computed only then.
 */
export function History({ extraActions }: { extraActions?: ReactNode }) {
  const { meta, log, violations, autoEndGroups } = useSession();
  const { undoLast, undoTo } = useDispatch();
  const { go } = useNav();
  const exportSession = useExportSession();
  const [confirming, setConfirming] = useState<UndoRange | null>(null);
  const history = useMemo(() => groupHistory(log), [log]);
  const byId = useMemo(() => new Map(history.map((h) => [h.group.id, h])), [history]);
  // Round sections, newest first (feature 011, US4); each lists its entries newest first.
  const sections = useMemo(() => [...roundSections(meta.game, history)].reverse(), [meta.game, history]);
  const newestId = useMemo(() => newestUndoable(log)?.id, [log]);
  const badGroups = new Set(violations.map((v) => v.firstBadGroupId));
  // Feature 013: company names render as badges.
  const ctx: SummaryContext = { game: meta.game, players: meta.players, marks: true };

  const undoBackTo = async (groupId: string) => {
    const result = await undoTo(groupId);
    if (!result.ok && result.error === "confirmRange") setConfirming(result.range);
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label="Volver" onClick={() => go({ name: "table" })}>
          ←
        </button>
        <h1 className="topbar-center">Historial</h1>
        <button onClick={() => void exportSession()}>Exportar</button>
        {extraActions}
      </header>
      <div className="screen-body">
        {violations.length > 0 ? (
          <div className="toast-warning" role="alert">
            ⚠ El dinero o las acciones no cuadran: {violations.map((v) => v.detail).join("; ")}
          </div>
        ) : null}
        {history.length === 0 ? <p className="muted">Todavía no hay entradas.</p> : null}
        {sections.map((section) => (
          <section key={`${section.key}@${section.groupIds[0] ?? ""}`} className="round-section" aria-label={section.title}>
            <h2 className="round-header">
              {section.icon} {section.title} · {section.finished ? "terminada" : "en curso"}
            </h2>
            <ol className="history-list">
              {[...section.groupIds].reverse().map((id) => {
                const h = byId.get(id);
                if (!h) return null;
                const undoable = h.status !== "reverted" && !isSetup(h.group);
                return (
                  <HistoryItem
                    key={h.group.id}
                    item={h}
                    bad={badGroups.has(h.group.id)}
                    autoEnd={autoEndGroups.includes(h.group.id)}
                    summary={(a, events) => summaryEs(a, ctx, events)}
                    log={log}
                    ctx={ctx}
                    onUndo={h.group.id === newestId ? () => void undoLast() : undefined}
                    onUndoBackTo={undoable && h.group.id !== newestId ? () => void undoBackTo(h.group.id) : undefined}
                  />
                );
              })}
            </ol>
            <p className="round-start">Inicio · {section.title}</p>
          </section>
        ))}
      </div>
      {confirming ? (
        <UndoRangeSheet
          range={confirming}
          ctx={ctx}
          onConfirm={() => undoTo(confirming.targetId, { confirmed: true })}
          onClose={() => setConfirming(null)}
        />
      ) : null}
      <UndoToast undoOnly />
    </main>
  );
}

function HistoryItem({
  item,
  bad,
  autoEnd,
  summary,
  log,
  ctx,
  onUndo,
  onUndoBackTo,
}: {
  item: GroupHistory;
  bad: boolean;
  /** The group reached an automatic game end (feature 007), even if the game was reopened since. */
  autoEnd: boolean;
  summary: (a: Action, events: readonly PrimitiveEvent[]) => string;
  log: readonly LogEntry[];
  ctx: SummaryContext;
  /** Only for the newest effective non-setup entry. */
  onUndo?: (() => void) | undefined;
  /** For every other effective non-setup entry. */
  onUndoBackTo?: (() => void) | undefined;
}) {
  const { group, status, versions } = item;
  const source = SOURCE_ICON[group.source];
  const original = versions[0];
  const latest = versions[versions.length - 1];
  const [open, setOpen] = useState(false);
  return (
    <li className={`history-item status-${status}${bad ? " invariant-broken" : ""}`} data-group={group.id}>
      <details className="history-details" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <div className="history-head">
            <span className="history-source" title={source.label} aria-label={source.label}>
              {source.icon}
            </span>
            <span className="muted">{time(group.at)}</span>
            {status === "reverted" ? <span className="badge">deshecha</span> : null}
            {status === "amended" ? <span className="badge">corregida</span> : null}
            {bad ? <span className="badge danger">descuadre desde acá</span> : null}
            {autoEnd ? <span className="badge">Fin de la partida (automático)</span> : null}
          </div>
          {status === "amended" && original && latest ? (
            <div className="history-summary">
              <s className="muted">
                <RichText text={summary(original.action, original.events)} />
              </s>
              <span>
                <RichText text={summary(latest.action, latest.events)} />
              </span>
            </div>
          ) : (
            <div className="history-summary">
              {status === "reverted" ? (
                <s>
                  <RichText text={summary(group.action, group.events)} />
                </s>
              ) : (
                <span>
                  <RichText text={summary(group.action, group.events)} />
                </span>
              )}
            </div>
          )}
        </summary>
        <div className="history-panel">
          {open ? <Breakdown log={log} groupId={group.id} ctx={ctx} /> : null}
          {group.transcript ? <p className="muted transcript">«{group.transcript}»</p> : null}
          {group.warnings.map((w) => (
            <p key={w.code} className="toast-warning">
              ⚠ {w.messageEs}
            </p>
          ))}
          {onUndoBackTo ? (
            <div className="row">
              <button onClick={onUndoBackTo}>{UNDO_RANGE_ES.undoBackToHere}</button>
            </div>
          ) : null}
        </div>
      </details>
      {onUndo ? (
        <div className="row">
          <button onClick={onUndo}>Deshacer</button>
        </div>
      ) : null}
    </li>
  );
}

/** "Movimientos" and "Saldos" (feature 010, US3); an empty section is left out. */
function Breakdown({ log, groupId, ctx }: { log: readonly LogEntry[]; groupId: string; ctx: SummaryContext }) {
  const breakdown = useMemo(() => entryBreakdown(ctx.game, ctx.players, log, groupId), [ctx.game, ctx.players, log, groupId]);
  if (!breakdown) return null;
  const moves = breakdown.movements.flatMap((m, i) => {
    const line = movementLineEs(m, ctx);
    return line ? [<li key={i}><RichText text={line} /></li>] : [];
  });
  return (
    <>
      {moves.length > 0 ? (
        <section className="history-moves">
          <h3>Movimientos</h3>
          <ul>{moves}</ul>
        </section>
      ) : null}
      {breakdown.balances.length > 0 ? (
        <section className="history-balances">
          <h3>Saldos</h3>
          <ul>
            {breakdown.balances.map((b) => (
              <li key={b.holder}>
                <RichText text={balanceLineEs(b, ctx)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
