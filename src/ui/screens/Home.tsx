import { useEffect, useState } from "react";
import { useAppActions, useServices } from "../../app/AppProvider";
import type { SessionMeta } from "../../domain/session";
import { useNav } from "../nav";

/** Resume the last session (FR-006), open another, or start a new one. */
export function Home() {
  const { sessions, settings } = useServices();
  const { openSession } = useAppActions();
  const { go } = useNav();
  const [list, setList] = useState<SessionMeta[] | null>(null);
  const [lastId, setLastId] = useState<string | undefined>();

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
          <button onClick={() => go({ name: "settings" })}>Ajustes</button>
        </div>
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
    </main>
  );
}
