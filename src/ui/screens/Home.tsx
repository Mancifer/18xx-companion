import { useCallback, useEffect, useRef, useState } from "react";
import { useAppActions, useServices } from "../../app/AppProvider";
import { backfillOutcome, deleteSession } from "../../app/sessions";
import type { SessionMeta } from "../../domain/session";
import { importSession, parseImport, type ParsedImport } from "../../persistence/exportImport";
import { Sheet } from "../components/Sheet";
import { useNav } from "../nav";
import { exportSessionFile } from "../useExport";

type Ready = Extract<ParsedImport, { ok: true }>;

/** "Ganó Ana", "Ganaron Ana y Bruno", "Ganaron Ana, Bruno y Carla" (feature 007). */
function winnersEs(meta: SessionMeta, winners: readonly string[]): string {
  const names = winners.map((id) => meta.players.find((p) => p.id === id)?.name ?? id);
  if (names.length === 1) return `Ganó ${names[0] ?? ""}`;
  return `Ganaron ${names.slice(0, -1).join(", ")} y ${names.at(-1) ?? ""}`;
}

/**
 * Resume the last session (FR-006), open another, start a new one, import a file (US8), or
 * delete a past session after a confirmation (feature 006).
 */
export function Home() {
  const { sessions, settings } = useServices();
  const { openSession } = useAppActions();
  const { go } = useNav();
  const [list, setList] = useState<SessionMeta[] | null>(null);
  const [lastId, setLastId] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ parsed: Ready; exists: boolean } | null>(null);
  const [toDelete, setToDelete] = useState<SessionMeta | null>(null);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const backfilled = useRef(new Set<string>());

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
      setDeleteError("No se pudo eliminar la partida.");
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
      setDeleteError("No se pudo exportar la partida.");
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
      setImportError("El archivo no es JSON.");
      return;
    }
    const parsed = await parseImport(json);
    if (!parsed.ok) {
      setImportError(parsed.errorEs);
      return;
    }
    const exists = (await sessions.loadSession(parsed.file.session.id)) !== undefined;
    setPending({ parsed, exists });
  };

  const finish = async (mode: "replace" | "copy") => {
    if (!pending) return;
    const meta = await importSession(sessions, pending.parsed, { mode });
    setPending(null);
    await open(meta.id, isFinished(meta));
  };

  const last = list?.find((s) => s.id === lastId);

  return (
    <main className="screen">
      <div className="screen-body">
        <h1>18xx Companion</h1>
        {last ? (
          <button className="primary big" onClick={() => void open(last.id, isFinished(last))}>
            Continuar · {last.name}
          </button>
        ) : null}
        <div className="choice-grid">
          <button onClick={() => go({ name: "newSession" })}>Nueva partida</button>
          <button onClick={() => go({ name: "customGame" })}>Juego personalizado</button>
          <button onClick={() => fileInput.current?.click()}>Importar partida</button>
          <button onClick={() => go({ name: "settings" })}>Ajustes</button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Archivo de partida"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void readFile(file);
          }}
        />
        {importError ? (
          <p className="toast-warning" role="alert">
            {importError}
          </p>
        ) : null}
        {list && list.length > 0 ? (
          <section className="stack">
            <h2>Partidas</h2>
            <ul className="session-list">
              {list.map((s) => (
                <li key={s.id}>
                  <div className="session-row">
                    <button className="session-item" onClick={() => void open(s.id, isFinished(s))}>
                      <span>
                        {s.name}
                        {s.outcome ? <span className="badge ok">Completa</span> : null}
                      </span>
                      {s.outcome?.winners.length ? <span>{winnersEs(s, s.outcome.winners)}</span> : null}
                      <span className="muted">
                        {s.players.map((p) => p.name).join(", ")} · {s.entryCount} entradas
                      </span>
                    </button>
                    <button className="danger" aria-label={`Eliminar partida «${s.name}»`} onClick={() => setToDelete(s)}>
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      {pending ? (
        <Sheet title={`Importar «${pending.parsed.file.session.name}»`} onClose={() => setPending(null)}>
          {pending.parsed.warningEs ? (
            <p className="toast-warning" role="alert">
              ⚠ {pending.parsed.warningEs}. Se importa igualmente: el historial manda.
            </p>
          ) : null}
          <p className="muted">
            {pending.parsed.file.session.game.name} · {pending.parsed.file.entries.length} entradas
          </p>
          {pending.exists ? <p>Ya tienes esta partida en el dispositivo.</p> : null}
          <div className="row">
            <button onClick={() => setPending(null)}>Cancelar</button>
            <span className="spacer" />
            {pending.exists ? <button onClick={() => void finish("copy")}>Importar como copia</button> : null}
            <button className="primary" onClick={() => void finish("replace")}>
              {pending.exists ? "Reemplazar" : "Importar"}
            </button>
          </div>
        </Sheet>
      ) : null}
      {toDelete ? (
        <Sheet title={`¿Eliminar «${toDelete.name}»?`} onClose={closeDelete}>
          <p className="muted">
            {toDelete.game.name} · {toDelete.players.map((p) => p.name).join(", ")} · {toDelete.entryCount} entradas
          </p>
          <p>Esta acción no se puede deshacer.</p>
          {deleteError ? (
            <p className="toast-warning" role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="row">
            <button disabled={busy !== null} onClick={closeDelete}>
              Cancelar
            </button>
            <span className="spacer" />
            <button disabled={busy !== null} onClick={() => void exportFirst(toDelete)}>
              Exportar antes
            </button>
            <button className="primary danger" disabled={busy !== null} onClick={() => void confirmDelete(toDelete)}>
              Eliminar
            </button>
          </div>
        </Sheet>
      ) : null}
    </main>
  );
}
