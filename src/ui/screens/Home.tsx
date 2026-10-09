import { useEffect, useRef, useState } from "react";
import { useAppActions, useServices } from "../../app/AppProvider";
import type { SessionMeta } from "../../domain/session";
import { importSession, parseImport, type ParsedImport } from "../../persistence/exportImport";
import { Sheet } from "../components/Sheet";
import { useNav } from "../nav";

type Ready = Extract<ParsedImport, { ok: true }>;

/** Resume the last session (FR-006), open another, start a new one, or import a file (US8). */
export function Home() {
  const { sessions, settings } = useServices();
  const { openSession } = useAppActions();
  const { go } = useNav();
  const [list, setList] = useState<SessionMeta[] | null>(null);
  const [lastId, setLastId] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ parsed: Ready; exists: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([sessions.listSessions(), settings.get()]).then(([all, s]) => {
      if (cancelled) return;
      setList(all);
      setLastId(s.lastSessionId);
    });
    return () => {
      cancelled = true;
    };
  }, [sessions, settings]);

  const open = async (id: string) => {
    if (await openSession(id)) go({ name: "table" });
  };

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
    await open(meta.id);
  };

  const last = list?.find((s) => s.id === lastId);

  return (
    <main className="screen">
      <div className="screen-body">
        <h1>18xx Companion</h1>
        {last ? (
          <button className="primary big" onClick={() => void open(last.id)}>
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
                  <button className="session-item" onClick={() => void open(s.id)}>
                    <span>{s.name}</span>
                    <span className="muted">
                      {s.players.map((p) => p.name).join(", ")} · {s.entryCount} entradas
                    </span>
                  </button>
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
    </main>
  );
}
