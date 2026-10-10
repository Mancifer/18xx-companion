import { useMemo, useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { Action } from "../../domain/actions/schemas";
import type { PrimitiveEvent } from "../../domain/events/types";
import { eventLineEs, summaryEs } from "../../domain/i18n/es";
import type { EffectiveGroup } from "../../domain/ledger/effectiveLog";
import { groupHistory, type GroupHistory } from "../../domain/ledger/effectiveLog";
import type { EntrySource } from "../../domain/ledger/entries";
import { DependentsDialog } from "../components/DependentsDialog";
import { useNav } from "../nav";
import { useExportSession } from "../useExport";
import { AmendSheet } from "../sheets/AmendSheet";

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
 * Every entry, newest first (FR-013): reverted entries struck through, amended ones with the
 * original and the correction (US2-2), and the first entry after which an invariant broke
 * highlighted (FR-015). Each active entry can be undone or corrected.
 */
export function History({ extraActions }: { extraActions?: ReactNode }) {
  const { meta, log, violations } = useSession();
  const { revert } = useDispatch();
  const { go } = useNav();
  const exportSession = useExportSession();
  const [amending, setAmending] = useState<{ groupId: string; action: Action } | null>(null);
  const [pending, setPending] = useState<{ groupId: string; dependents: readonly EffectiveGroup[] } | null>(null);
  const history = useMemo(() => [...groupHistory(log)].sort((a, b) => b.group.seq - a.group.seq), [log]);
  const badGroups = new Set(violations.map((v) => v.firstBadGroupId));
  const ctx = { game: meta.game, players: meta.players };

  const undo = async (groupId: string, confirmed: boolean) => {
    const result = await revert(groupId, { confirmed });
    if (!result.ok && result.error === "dependents") setPending({ groupId, dependents: result.dependents });
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
        <ol className="history-list">
          {history.map((h) => (
            <HistoryItem
              key={h.group.id}
              item={h}
              bad={badGroups.has(h.group.id)}
              summary={(a, events) => summaryEs(a, ctx, events)}
              lines={(e) => eventLineEs(e, ctx)}
              onUndo={() => void undo(h.group.id, false)}
              onAmend={() => {
                const latest = h.versions[h.versions.length - 1] ?? h.versions[0];
                if (latest) setAmending({ groupId: h.group.id, action: latest.action });
              }}
            />
          ))}
        </ol>
      </div>
      {amending ? <AmendSheet groupId={amending.groupId} action={amending.action} onClose={() => setAmending(null)} /> : null}
      {pending ? (
        <DependentsDialog
          dependents={pending.dependents}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const id = pending.groupId;
            setPending(null);
            void undo(id, true);
          }}
        />
      ) : null}
    </main>
  );
}

/** Groups whose single line cannot show every transfer: History lists them on demand (US7-7). */
const MULTI_STEP: ReadonlySet<string> = new Set(["mergeCompanies", "forcedTrainPurchase", "declareBankruptcy"]);

function HistoryItem({
  item,
  bad,
  summary,
  lines,
  onUndo,
  onAmend,
}: {
  item: GroupHistory;
  bad: boolean;
  summary: (a: Action, events: readonly PrimitiveEvent[]) => string;
  /** One line per transfer, for multi-step groups (US7-7). */
  lines?: (e: PrimitiveEvent) => string | undefined;
  onUndo: () => void;
  onAmend: () => void;
}) {
  const { group, status, versions } = item;
  const source = SOURCE_ICON[group.source];
  const original = versions[0];
  const latest = versions[versions.length - 1];
  const editable = status !== "reverted" && group.action.type !== "createSession";
  return (
    <li className={`history-item status-${status}${bad ? " invariant-broken" : ""}`} data-group={group.id}>
      <div className="history-head">
        <span className="history-source" title={source.label} aria-label={source.label}>
          {source.icon}
        </span>
        <span className="muted">{time(group.at)}</span>
        {status === "reverted" ? <span className="badge">deshecha</span> : null}
        {status === "amended" ? <span className="badge">corregida</span> : null}
        {bad ? <span className="badge danger">descuadre desde aquí</span> : null}
      </div>
      {status === "amended" && original && latest ? (
        <div className="history-summary">
          <s className="muted">{summary(original.action, original.events)}</s>
          <span>{summary(latest.action, latest.events)}</span>
        </div>
      ) : (
        <div className="history-summary">
          {status === "reverted" ? (
            <s>{summary(group.action, group.events)}</s>
          ) : (
            <span>{summary(group.action, group.events)}</span>
          )}
        </div>
      )}
      {MULTI_STEP.has(group.action.type) && lines ? (
        <details className="history-moves">
          <summary>Movimientos</summary>
          <ul>
            {group.events.map((e, i) => {
              const line = lines(e);
              return line ? <li key={i}>{line}</li> : null;
            })}
          </ul>
        </details>
      ) : null}
      {group.transcript ? <p className="muted transcript">«{group.transcript}»</p> : null}
      {group.warnings.map((w) => (
        <p key={w.code} className="toast-warning">
          ⚠ {w.messageEs}
        </p>
      ))}
      {editable ? (
        <div className="row">
          <button onClick={onUndo}>{status === "amended" ? "Deshacer corrección" : "Deshacer"}</button>
          <button onClick={onAmend}>Corregir</button>
        </div>
      ) : null}
    </li>
  );
}
