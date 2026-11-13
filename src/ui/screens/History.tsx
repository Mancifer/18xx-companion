import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { Action } from "../../domain/actions/schemas";
import type { PrimitiveEvent } from "../../domain/events/types";
import { useDomainText, useLang, useText } from "../../app/language";
import type { SummaryContext } from "../../i18n/contract/domain";
import { renderWarning } from "../../i18n/render";
import { entryBreakdown } from "../../domain/ledger/breakdown";
import { groupHistory, type GroupHistory } from "../../domain/ledger/effectiveLog";
import type { EntrySource, GroupId, LogEntry } from "../../domain/ledger/entries";
import { filterSections, focusBreakdown, involvedGroupIds, type HistorySubject } from "../../domain/ledger/involvement";
import { roundSections } from "../../domain/ledger/rounds";
import { isSetup, newestUndoable, type UndoRange } from "../../domain/ledger/undo";
import { CompanyBadge } from "../components/CompanyBadge";
import { RichText } from "../components/RichText";
import { UndoRangeSheet } from "../components/UndoRangeSheet";
import { UndoToast } from "../components/UndoToast";
import { useNav, type Screen } from "../nav";
import { useExportSession } from "../useExport";

const SOURCE_ICON: Readonly<Record<EntrySource, string>> = { touch: "👆", voice: "🎤", system: "⚙" };

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
 *
 * Feature 017: with a `subject`, only the entries that involve that player or company, in the
 * full view's round sections, read-only (no undo); each panel links to the full History, which
 * opens with that entry (`focus`) expanded.
 */
export function History({
  extraActions,
  subject: requested,
  focus,
  back,
}: {
  extraActions?: ReactNode;
  /** Feature 017: only the entries that involve this player or company, read-only. */
  subject?: HistorySubject;
  /** Feature 017 (US4): the entry to open expanded and scroll to. */
  focus?: GroupId;
  /** Where the back arrow goes; the Table by default. */
  back?: Screen;
}) {
  const { meta, log, violations, autoEndGroups } = useSession();
  const text = useText();
  const t = text.history;
  const dt = useDomainText();
  const { lang } = useLang();
  const { undoLast, undoTo } = useDispatch();
  const { go } = useNav();
  const exportSession = useExportSession();
  const [confirming, setConfirming] = useState<UndoRange | null>(null);
  const history = useMemo(() => groupHistory(log), [log]);
  const byId = useMemo(() => new Map(history.map((h) => [h.group.id, h])), [history]);
  // Round sections, newest first (feature 011, US4); each lists its entries newest first.
  const allSections = useMemo(() => [...roundSections(meta.game, history, lang)].reverse(), [meta.game, history, lang]);
  // An unknown subject (e.g. after an import) falls back to the full History (data-model §1).
  const subjectPlayer = requested?.kind === "player" ? meta.players.find((p) => p.id === requested.id) : undefined;
  const subjectCompany = requested?.kind === "company" ? meta.game.companies.find((c) => c.id === requested.id) : undefined;
  const subject = subjectPlayer || subjectCompany ? requested : undefined;
  const involved = useMemo(() => (subject ? involvedGroupIds(history, subject) : undefined), [history, subject]);
  // Sections come from the full history, so titles and boundaries match the full view.
  const sections = useMemo(() => (involved ? filterSections(allSections, involved) : allSections), [allSections, involved]);
  const subjectName = subjectPlayer?.name ?? subjectCompany?.name ?? "";
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
        <button className="ghost" aria-label={text.common.back} onClick={() => go(back ?? { name: "table" })}>
          ←
        </button>
        <h1 className="topbar-center">
          {t.title}
          {subjectPlayer ? ` · ${subjectPlayer.name}` : null}
          {subjectCompany ? (
            <>
              {" · "}
              <CompanyBadge company={subjectCompany} /> {subjectCompany.name}
            </>
          ) : null}
        </h1>
        <button onClick={() => void exportSession()}>{t.export}</button>
        {extraActions}
      </header>
      <div className="screen-body">
        {violations.length > 0 ? (
          <div className="toast-warning" role="alert">
            {t.notBalanced}
            {violations.map((v) => v.detail).join("; ")}
          </div>
        ) : null}
        {history.length === 0 ? <p className="muted">{t.empty}</p> : null}
        {involved && involved.size === 0 && history.length > 0 ? <p className="muted">{t.emptyFor(subjectName)}</p> : null}
        {sections.map((section) => (
          <section key={`${section.key}@${section.groupIds[0] ?? ""}`} className="round-section" aria-label={section.title}>
            <h2 className="round-header">
              {section.icon} {section.title} · {section.finished ? t.finished : t.inProgress}
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
                    summary={(a, events) => dt.summary(a, ctx, events)}
                    log={log}
                    ctx={ctx}
                    subject={subject}
                    focused={!subject && h.group.id === focus}
                    // Feature 017 (FR-008): a filtered History never undoes; it links to the full one.
                    onUndo={!subject && h.group.id === newestId ? () => void undoLast() : undefined}
                    onUndoBackTo={!subject && undoable && h.group.id !== newestId ? () => void undoBackTo(h.group.id) : undefined}
                    onShowInFull={
                      subject
                        ? () => go({ name: "history", focus: h.group.id, back: { name: "history", subject, ...(back ? { back } : {}) } })
                        : undefined
                    }
                  />
                );
              })}
            </ol>
            <p className="round-start">
              {t.start}
              {section.title}
            </p>
          </section>
        ))}
      </div>
      {confirming && !subject ? (
        <UndoRangeSheet
          range={confirming}
          ctx={ctx}
          onConfirm={() => undoTo(confirming.targetId, { confirmed: true })}
          onClose={() => setConfirming(null)}
        />
      ) : null}
      {subject ? null : <UndoToast undoOnly />}
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
  subject,
  focused = false,
  onShowInFull,
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
  /** Feature 017: the subject's lines come first in the breakdown. */
  subject?: HistorySubject | undefined;
  /** Feature 017 (US4): opened expanded and scrolled into view once. */
  focused?: boolean;
  /** Feature 017 (US4): "Ver en el historial completo", in a filtered History. */
  onShowInFull?: (() => void) | undefined;
}) {
  const { group, status, versions } = item;
  const text = useText();
  const t = text.history;
  const { lang } = useLang();
  const dt = useDomainText();
  const source = { icon: SOURCE_ICON[group.source], label: t.sources[group.source] };
  const original = versions[0];
  const latest = versions[versions.length - 1];
  const [open, setOpen] = useState(focused);
  const itemRef = useRef<HTMLLIElement>(null);
  const focusedAtMount = useRef(focused);
  useEffect(() => {
    // Mount only: the entry reached from a filtered History (US4).
    if (focusedAtMount.current) itemRef.current?.scrollIntoView({ block: "center" });
  }, []);
  return (
    <li ref={itemRef} className={`history-item status-${status}${bad ? " invariant-broken" : ""}`} data-group={group.id}>
      <details className="history-details" open={focused || undefined} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <div className="history-head">
            <span className="history-source" title={source.label} aria-label={source.label}>
              {source.icon}
            </span>
            <span className="muted">{time(group.at)}</span>
            {status === "reverted" ? <span className="badge">{t.reverted}</span> : null}
            {status === "amended" ? <span className="badge">{t.amended}</span> : null}
            {bad ? <span className="badge danger">{t.badFromHere}</span> : null}
            {autoEnd ? <span className="badge">{t.autoEnd}</span> : null}
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
          {open ? <Breakdown log={log} groupId={group.id} ctx={ctx} subject={subject} /> : null}
          {group.transcript ? <p className="muted transcript">«{group.transcript}»</p> : null}
          {group.warnings.map((w) => (
            <p key={w.code} className="toast-warning">
              ⚠ {renderWarning(w, ctx, lang)}
            </p>
          ))}
          {onUndoBackTo ? (
            <div className="row">
              <button onClick={onUndoBackTo}>{dt.undoRange.undoBackToHere}</button>
            </div>
          ) : null}
          {onShowInFull ? (
            <div className="row">
              <button onClick={onShowInFull}>{t.showInFull}</button>
            </div>
          ) : null}
        </div>
      </details>
      {onUndo ? (
        <div className="row">
          <button onClick={onUndo}>{t.undo}</button>
        </div>
      ) : null}
    </li>
  );
}

/** "Movimientos" and "Saldos" (feature 010, US3); an empty section is left out. */
function Breakdown({
  log,
  groupId,
  ctx,
  subject,
}: {
  log: readonly LogEntry[];
  groupId: string;
  ctx: SummaryContext;
  subject?: HistorySubject | undefined;
}) {
  const t = useText().history;
  const dt = useDomainText();
  const breakdown = useMemo(() => {
    const b = entryBreakdown(ctx.game, ctx.players, log, groupId);
    // Feature 017 (FR-006): the subject's lines first, marked.
    return b && subject ? focusBreakdown(b, subject) : b;
  }, [ctx.game, ctx.players, log, groupId, subject]);
  if (!breakdown) return null;
  const mineClass = (x: object) => ("mine" in x && x.mine === true ? "history-mine" : undefined);
  const moves = breakdown.movements.flatMap((m, i) => {
    const line = dt.movementLine(m, ctx);
    return line ? [<li key={i} className={mineClass(m)}><RichText text={line} /></li>] : [];
  });
  return (
    <>
      {moves.length > 0 ? (
        <section className="history-moves">
          <h3>{t.movements}</h3>
          <ul>{moves}</ul>
        </section>
      ) : null}
      {breakdown.balances.length > 0 ? (
        <section className="history-balances">
          <h3>{t.balances}</h3>
          <ul>
            {breakdown.balances.map((b) => (
              <li key={b.holder} className={mineClass(b)}>
                <RichText text={dt.balanceLine(b, ctx)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
