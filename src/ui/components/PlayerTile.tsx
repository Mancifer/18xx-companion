import { useSession } from "../../app/useSession";
import { certificateStatus } from "../../domain/actions/limits";
import { cashOf, counterOf, isPlayerBankrupt } from "../../domain/events/state";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";
import type { Player } from "../../domain/types";
import { CertDonut } from "./CertDonut";
import { CompanyBadge } from "./CompanyBadge";

/**
 * Large tile per player (US1). Cash is hidden in "bank only" mode (US1-4). Feature 016 (US7): the
 * companies held in a column with the certificate donut beside them.
 */
export function PlayerTile({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const { meta, state } = useSession();
  const t = useText().table.playerTile;
  const { lang } = useLang();
  const ref = `player:${player.id}` as const;
  const cash = cashOf(state, ref);
  const debt = counterOf(state, ref, "debt");
  const certs = certificateStatus(meta.game, state, player.id, meta.players.length);
  const holdings = certs.rows.flatMap((row) => {
    const company = meta.game.companies.find((c) => c.id === row.company);
    return company ? [{ company, row }] : [];
  });
  return (
    <button className="player-tile" onClick={onOpen} style={{ borderLeftColor: player.color }}>
      <span className="player-tile-head">
        <span className="swatch" style={{ background: player.color }} aria-hidden="true" />
        <span className="player-name">{player.name}</span>
        {isPlayerBankrupt(state, player.id) ? <span className="badge danger">{t.eliminated}</span> : null}
      </span>
      {meta.walletMode === "appTruth" ? (
        <span className={`player-cash money${cash < 0 ? " negative" : ""}`} data-testid={`cash-${player.id}`}>
          {formatMoney(cash, meta.game, lang)}
        </span>
      ) : (
        <span className="player-cash muted" data-testid={`cash-${player.id}`}>
          —
        </span>
      )}
      {debt > 0 ? (
        <span className="player-meta muted">
          <span className="badge danger">
            {t.debt}
            {formatMoney(debt, meta.game, lang)}
          </span>
        </span>
      ) : null}
      <span className="player-tile-body">
        <span className="tile-holdings">
          {holdings.map((h) => (
            <span key={h.company.id} className="holding">
              <CompanyBadge company={h.company} size="sm" />
              <span className="money">
                {h.row.percent}%{h.row.president ? "★" : ""}
              </span>
            </span>
          ))}
        </span>
        <CertDonut status={certs} companies={meta.game.companies} />
      </span>
    </button>
  );
}
