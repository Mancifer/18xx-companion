import { useLang, useText } from "../../app/language";
import { SETTINGS_CHANGED, VoiceDepsContext, voiceAvailability, voiceSetupIssue } from "../../app/useVoice";
import { voiceEnabled } from "../../i18n/lang";
import type { Message } from "../../i18n/contract/domain";
import { usePlainMessageText } from "../useMessage";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAppActions, useServices } from "../../app/AppProvider";
import { backfillOutcome, deleteSession } from "../../app/sessions";
import type { SessionMeta } from "../../domain/session";
import { importSession, parseImport, type ParsedImport } from "../../persistence/exportImport";
import { Sheet } from "../components/Sheet";
import { useNav } from "../nav";
import { exportSessionFile } from "../useExport";

type Ready = Extract<ParsedImport, { ok: true }>;

/** The players who won, by name ("Ganó Ana", "Ana and Bruno won") (features 007, 014). */
function winnerNames(meta: SessionMeta, winners: readonly string[]): string[] {
  return winners.map((id) => meta.players.find((p) => p.id === id)?.name ?? id);
}

/**
 * Feature 016 (US3, contracts/ui.md §3): why voice won't work until something is set up, read
 * from the saved settings and re-read when they change. Nothing where voice isn't offered.
 */
function useVoiceSetupIssue(): Message | undefined {
  const deps = useContext(VoiceDepsContext);
  const { settings } = useServices();
  const { lang } = useLang();
  const [issue, setIssue] = useState<Message | undefined>();
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!voiceEnabled(lang)) {
        setIssue(undefined);
        return;
      }
      void settings.get().then((s) => {
        if (!cancelled) setIssue(voiceSetupIssue(voiceAvailability(deps, s, lang)));
      });
    };
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, [deps, settings, lang]);
  return issue;
}

/**
 * Resume the last session (FR-006), open another, start a new one, import a file (US8), or
 * delete a past session after a confirmation (feature 006).
 */
export function Home() {
  const t = useText();
  const plainText = usePlainMessageText();
  const { sessions, settings } = useServices();
  const { openSession } = useAppActions();
  const { go } = useNav();
  const [list, setList] = useState<SessionMeta[] | null>(null);
  const [lastId, setLastId] = useState<string | undefined>();
  const [importError, setImportError] = useState<Message | "notJson" | null>(null);
  const [pending, setPending] = useState<{ parsed: Ready; exists: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<SessionMeta | null>(null);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backfilled = useRef(new Set<string>());
  const voiceIssue = useVoiceSetupIssue();

  /** Reads the list and the "Continuar" pointer from storage, the single source of truth. */
  const load = useCallback(() => Promise.all([sessions.listSessions(), settings.get()]), [sessions, settings]);

  useEffect(() => {
    let cancelled = false;
    void load().then(([all, s]) => {
      if (cancelled) return;
      setList(all);
      setLastId(s.lastSessionId);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Sessions saved before feature 007 have no outcome: replay each once, then show its marker.
  useEffect(() => {
    const legacy = (list ?? []).filter((s) => !("outcome" in s) && !backfilled.current.has(s.id));
    if (legacy.length === 0) return;
    for (const s of legacy) backfilled.current.add(s.id);
    let cancelled = false;
    void Promise.all(legacy.map((s) => backfillOutcome(sessions, s))).then((updated) => {
      if (cancelled) return;
      const byId = new Map(updated.map((m) => [m.id, m]));
      setList((current) => current?.map((m) => byId.get(m.id) ?? m) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [list, sessions]);

  const reload = async () => {
    const [all, s] = await load();
    setList(all);
    setLastId(s.lastSessionId);
  };

  const closeDelete = () => {
    setToDelete(null);
    setDeleteError(null);
  };

  const confirmDelete = async (target: SessionMeta) => {
    setBusy("delete");
    setDeleteError(null);
    try {
      await deleteSession(sessions, settings, target.id);
      setToDelete(null);
    } catch {
      setDeleteError(t.home.deleteFailed);
    } finally {
      await reload();
      setBusy(null);
    }
  };

  const exportFirst = async (target: SessionMeta) => {
    setBusy("export");
    setDeleteError(null);
    try {
      await exportSessionFile(sessions, target.id);
    } catch {
      setDeleteError(t.home.exportFailed);
    } finally {
      setBusy(null);
    }
  };

  /** A finished game opens on its results (FR-016); any other on the Table. */
  const open = async (id: string, finished = false) => {
    if (await openSession(id)) go(finished ? { name: "results", from: "home" } : { name: "table" });
  };
  const isFinished = (s: SessionMeta) => Boolean(s.outcome);

  const readFile = async (file: File) => {
    setImportError(null);
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setImportError("notJson");
      return;
    }
    const parsed = await parseImport(json);
    if (!parsed.ok) {
      setImportError(parsed.error);
      return;
    }
    const exists = (await sessions.loadSession(parsed.file.session.id)) !== undefined;
    setPending({ parsed, exists });
  };

  const finish = async (mode: "replace" | "copy") => {
    if (!pending) return;
    const meta = await importSession(sessions, pending.parsed, { mode, copyName: t.home.copyName });
    setPending(null);
    await open(meta.id, isFinished(meta));
  };

  const last = list?.find((s) => s.id === lastId);

  return (
    <main className="screen">
      <div className="screen-body">
        <h1>18xx Companion</h1>
        {voiceIssue ? (
          <div className="row voice-notice">
            <p role="note" className="muted spacer">
              {plainText(voiceIssue)}
            </p>
            <button onClick={() => go({ name: "settings" })}>{t.home.voiceNoticeOpenSettings}</button>
          </div>
        ) : null}
        {last ? (
          <button className="primary big" onClick={() => void open(last.id, isFinished(last))}>
            {t.home.continue} {last.name}
          </button>
        ) : null}
        <div className="choice-grid">
          <button onClick={() => go({ name: "newSession" })}>{t.home.newSession}</button>
          <button onClick={() => go({ name: "customGame" })}>{t.home.customGame}</button>
          <button onClick={() => fileInput.current?.click()}>{t.home.importSession}</button>
          <button onClick={() => go({ name: "settings" })}>{t.home.settings}</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label={t.home.fileLabel}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void readFile(file);
          }}
        />
        {importError ? (
          <p className="toast-warning" role="alert">
            {importError === "notJson" ? t.home.notJson : plainText(importError)}
          </p>
        ) : null}
        {list && list.length > 0 ? (
          <section className="stack">
            <h2>{t.home.sessions}</h2>
            <ul className="session-list">
              {list.map((s) => (
                <li key={s.id}>
                  <div className="session-row">
                    <button className="session-item" onClick={() => void open(s.id, isFinished(s))}>
                      <span>
                        {s.name}
                        {s.outcome ? <span className="badge ok">{t.home.finished}</span> : null}
                      </span>
                      {s.outcome?.winners.length ? <span>{t.home.winners(winnerNames(s, s.outcome.winners))}</span> : null}
                      <span className="muted">
                        {s.players.map((p) => p.name).join(", ")} · {s.entryCount} {t.home.entries}
                      </span>
                    </button>
                    <button className="danger" aria-label={t.home.deleteSession(s.name)} onClick={() => setToDelete(s)}>
                      {t.home.delete}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      {pending ? (
        <Sheet title={t.home.importTitle(pending.parsed.file.session.name)} onClose={() => setPending(null)}>
          {pending.parsed.warning ? (
            <p className="toast-warning" role="alert">
              ⚠ {plainText(pending.parsed.warning)}
              {t.home.importAnyway}
            </p>
          ) : null}
          <p className="muted">
            {pending.parsed.file.session.game.name} · {pending.parsed.file.entries.length} {t.home.entries}
          </p>
          {pending.exists ? <p>{t.home.alreadyHere}</p> : null}
          <div className="row">
            <button onClick={() => setPending(null)}>{t.common.cancel}</button>
            <span className="spacer" />
            {pending.exists ? <button onClick={() => void finish("copy")}>{t.home.importCopy}</button> : null}
            <button className="primary" onClick={() => void finish("replace")}>
              {pending.exists ? t.home.replace : t.home.import}
            </button>
          </div>
        </Sheet>
      ) : null}
      {toDelete ? (
        <Sheet title={t.home.deleteTitle(toDelete.name)} onClose={closeDelete}>
          <p className="muted">
            {toDelete.game.name} · {toDelete.players.map((p) => p.name).join(", ")} · {toDelete.entryCount} {t.home.entries}
          </p>
          <p>{t.home.cannotUndo}</p>
          {deleteError ? (
            <p className="toast-warning" role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="row">
            <button disabled={busy !== null} onClick={closeDelete}>
              {t.common.cancel}
            </button>
            <span className="spacer" />
            <button disabled={busy !== null} onClick={() => void exportFirst(toDelete)}>
              {t.home.exportFirst}
            </button>
            <button className="primary danger" disabled={busy !== null} onClick={() => void confirmDelete(toDelete)}>
              {t.home.delete}
            </button>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
