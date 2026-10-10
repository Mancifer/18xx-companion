import { useState } from "react";
import { useAppActions } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { END_TRIGGER_LABELS } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import type { GameEnd } from "../../domain/mechanics/gameEnd";
import { finalResults, type PlayerResult } from "../../domain/mechanics/scores";
import { Sheet } from "../components/Sheet";
import { UndoToast } from "../components/UndoToast";
import { useNav } from "../nav";

/** "10/10 20:15" */
function when(iso: string): string {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** "automático", the fired conditions, or "sin condición de fin". */
function howItEnded(end: GameEnd): string {
  if (end.auto) return "automático";
  return end.triggers.length > 0 ? end.triggers.map((t) => END_TRIGGER_LABELS[t]).join(", ") : "sin condición de fin";
}

function laterEntriesEs(n: number): string {
  return n === 1
    ? "Hay 1 entrada posterior al final que no cuenta en esta clasificación."
    : `Hay ${n} entradas posteriores al final que no cuentan en esta clasificación.`;
}

/** "1", or "=1" when another player shares the rank; "—" when eliminated. */
function rankText(r: PlayerResult, all: readonly PlayerResult[]): string {
  if (r.rank === null) return "—";
  return all.filter((o) => o.rank === r.rank).length > 1 ? `=${r.rank}` : String(r.rank);
}

/**
 * The ranking (feature 007, contracts/ui.md §1): final and frozen at the end once the game is
 * finished (FR-012), provisional before (FR-014). Text markers, never color alone (FR-013).
 */
export function Results({ from }: { from: "table" | "home" }) {
  const { meta, state, gameEnd, eliminationOrder } = useSession();
  const { go } = useNav();
  const { closeSession } = useAppActions();
  const { dispatch } = useDispatch();
  const [reopening, setReopening] = useState(false);
  const { end, laterEntries } = gameEnd;
  const results = end
    ? finalResults(meta.game, meta.players, end.state, end.eliminationOrder)
    : finalResults(meta.game, meta.players, state, eliminationOrder);
  const money = (n: number) => formatMoney(n, meta.game);
  const name = (id: string) => meta.players.find((p) => p.id === id)?.name ?? id;
  const short = (id: string) => meta.game.companies.find((c) => c.id === id)?.shortName ?? id;

  /** FR-005a: its own entry; on failure the toast shows the store's message and the results stay. */
  const reopen = async () => {
    const result = await dispatch({ type: "reopenGame" });
    setReopening(false);
    if (result.ok) go({ name: "table" });
  };

  const back = () => {
    if (from === "home") {
      closeSession();
      go({ name: "home" });
    } else {
      go({ name: "table" });
    }
  };

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label="Volver" onClick={back}>
          ←
        </button>
        <h1 className="topbar-center">{end ? "Resultados" : "Clasificación provisional"}</h1>
      </header>
      <div className="screen-body results-layout">
        <section>
          <p className="muted results-subtitle">
            {end ? `${meta.game.name} · terminó ${when(end.at)} · ${howItEnded(end)}` : "La partida no terminó todavía."}
          </p>
          <table className="score-table">
            <thead>
              <tr>
                <th scope="col">Puesto</th>
                <th scope="col">Jugador</th>
                <th scope="col" className="num">
                  Dinero
                </th>
                <th scope="col" className="num">
                  Acciones
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.player} className={r.status === "eliminated" ? "eliminated" : r.winner ? "winner" : undefined}>
                  <td>{rankText(r, results)}</td>
                  <td>
                    {name(r.player)}
                    {r.winner ? (
                      <>
                        {" "}
                        <span className="badge winner">🏆 Ganador</span>
                      </>
                    ) : null}
                    {r.status === "bankrupt" ? (
                      <>
                        {" "}
                        <span className="badge danger">Quiebra</span>
                      </>
                    ) : null}
                  </td>
                  <td className="num" data-label="Dinero">
                    {money(r.cash)}
                  </td>
                  <td className="num" data-label="Acciones">
                    {money(r.sharesValue)}
                  </td>
                  <td className="num">{r.total !== null ? money(r.total) : "Eliminado"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          {end && laterEntries > 0 ? (
            <p className="results-notice" role="note">
              {laterEntriesEs(laterEntries)}
            </p>
          ) : null}
          {results
            .filter((r) => r.tieBreak)
            .map((r) => (
              <p key={r.player} className="muted tie-break">
                {name(r.player)} · <span>desempate: presidente de {short(r.tieBreak ?? "")}</span>
              </p>
            ))}
          <div className="results-actions">
            {from === "home" ? <button onClick={() => go({ name: "table" })}>Ver mesa</button> : null}
            {end ? <button onClick={() => setReopening(true)}>Reabrir partida</button> : null}
          </div>
        </section>
      </div>
      {reopening ? (
        <Sheet title="¿Reabrir la partida?" onClose={() => setReopening(false)}>
          <p>La partida deja de estar completa y se pueden registrar o corregir entradas. El final queda en el historial.</p>
          <div className="row">
            <button onClick={() => setReopening(false)}>Cancelar</button>
            <span className="spacer" />
            <button className="primary" onClick={() => void reopen()}>
              Reabrir
            </button>
          </div>
        </Sheet>
      ) : null}
      <UndoToast />
    </main>
  );
}
