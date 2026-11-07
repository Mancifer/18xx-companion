import { useState } from "react";
import { useAppActions } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { useDomainText, useLang, useText } from "../../app/language";
import type { DomainText } from "../../i18n/contract/domain";
import type { UiText } from "../../i18n/contract/ui";
import { formatMoney } from "../../i18n/format";
import type { GameEnd } from "../../domain/mechanics/gameEnd";
import { finalResults, type PlayerResult } from "../../domain/mechanics/scores";
import { CompanyName } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";
import { UndoToast } from "../components/UndoToast";
import { useNav } from "../nav";

/** "automático", the fired conditions, or "sin condición de fin". */
function howItEnded(end: GameEnd, t: UiText["results"], dt: DomainText): string {
  if (end.auto) return t.auto;
  return end.triggers.length > 0 ? end.triggers.map((x) => dt.endTriggerLabels[x]).join(", ") : t.noEndCondition;
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
  const text = useText();
  const t = text.results;
  const dt = useDomainText();
  const { lang } = useLang();
  const [reopening, setReopening] = useState(false);
  const { end, laterEntries } = gameEnd;
  const results = end
    ? finalResults(meta.game, meta.players, end.state, end.eliminationOrder)
    : finalResults(meta.game, meta.players, state, eliminationOrder);
  const money = (n: number) => formatMoney(n, meta.game, lang);
  const name = (id: string) => meta.players.find((p) => p.id === id)?.name ?? id;

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
        <button className="ghost" aria-label={text.common.back} onClick={back}>
          ←
        </button>
        <h1 className="topbar-center">{end ? t.title : t.provisional}</h1>
      </header>
      <div className="screen-body results-layout">
        <section>
          <p className="muted results-subtitle">
            {end ? t.subtitle(meta.game.name, t.when(new Date(end.at)), howItEnded(end, t, dt)) : t.notEnded}
          </p>
          <table className="score-table">
            <thead>
              <tr>
                <th scope="col">{t.rank}</th>
                <th scope="col">{t.player}</th>
                <th scope="col" className="num">
                  {t.cash}
                </th>
                <th scope="col" className="num">
                  {t.shares}
                </th>
                <th scope="col" className="num">
                  {t.total}
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
                        <span className="badge winner">{t.winner}</span>
                      </>
                    ) : null}
                    {r.status === "bankrupt" ? (
                      <>
                        {" "}
                        <span className="badge danger">{t.bankrupt}</span>
                      </>
                    ) : null}
                  </td>
                  <td className="num" data-label={t.cash}>
                    {money(r.cash)}
                  </td>
                  <td className="num" data-label={t.shares}>
                    {money(r.sharesValue)}
                  </td>
                  <td className="num">{r.total !== null ? money(r.total) : t.eliminated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          {end && laterEntries > 0 ? (
            <p className="results-notice" role="note">
              {t.laterEntries(laterEntries)}
            </p>
          ) : null}
          {results
            .filter((r) => r.tieBreak)
            .map((r) => (
              <p key={r.player} className="muted tie-break">
                {name(r.player)} · <span>
                  {t.tieBreak[0]}
                  <CompanyName game={meta.game} id={r.tieBreak ?? ""} />
                  {t.tieBreak[1]}
                </span>
              </p>
            ))}
          <div className="results-actions">
            {from === "home" ? <button onClick={() => go({ name: "table" })}>{t.viewTable}</button> : null}
            {end ? <button onClick={() => setReopening(true)}>{t.reopenGame}</button> : null}
          </div>
        </section>
      </div>
      {reopening ? (
        <Sheet title={t.reopenTitle} onClose={() => setReopening(false)}>
          <p>{t.reopenBody}</p>
          <div className="row">
            <button onClick={() => setReopening(false)}>{text.common.cancel}</button>
            <span className="spacer" />
            <button className="primary" onClick={() => void reopen()}>
              {t.reopen}
            </button>
          </div>
        </Sheet>
      ) : null}
      <UndoToast />
    </main>
  );
}
