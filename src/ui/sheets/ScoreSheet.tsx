import { useSession } from "../../app/useSession";
import { formatMoney } from "../../domain/i18n/format";
import { finalScores } from "../../domain/mechanics/scores";
import { Sheet } from "../components/Sheet";

/**
 * Final scores (US8, research R12): cash, shares at the current price, total and rank, with the
 * tie-break when one was needed; eliminated players last. Read-only.
 */
export function ScoreSheet({ onClose }: { onClose: () => void }) {
  const { meta, state } = useSession();
  const money = (n: number) => formatMoney(n, meta.game);
  const name = (id: string) => meta.players.find((p) => p.id === id)?.name ?? id;
  const short = (id: string) => meta.game.companies.find((c) => c.id === id)?.shortName ?? id;
  const scores = finalScores(meta.game, meta.players, state);
  return (
    <Sheet title="Puntuación" onClose={onClose}>
      <table className="score-table">
        <thead>
          <tr>
            <th scope="col">Puesto</th>
            <th scope="col">Jugador</th>
            <th scope="col">Dinero</th>
            <th scope="col">Acciones</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.player} className={s.eliminated ? "eliminated" : undefined}>
              <td>{s.rank ?? "—"}</td>
              <td>{name(s.player)}</td>
              <td>{money(s.cash)}</td>
              <td>{money(s.sharesValue)}</td>
              <td>{s.total !== null ? money(s.total) : "Eliminado"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {scores
        .filter((s) => s.tieBreak)
        .map((s) => (
          <p key={s.player} className="muted tie-break">
            {name(s.player)} · <span>desempate: presidente de {short(s.tieBreak ?? "")}</span>
          </p>
        ))}
    </Sheet>
  );
}
