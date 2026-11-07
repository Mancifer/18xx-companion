import { useSession } from "../../app/useSession";
import { cashOf, certificateCount, counterOf, isPlayerBankrupt, presidencyHolder, unitsOf } from "../../domain/events/state";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";
import type { Player } from "../../domain/types";
import { CompanyBadge } from "./CompanyBadge";

/** Large tile per player (US1). Cash is hidden in "bank only" mode (US1-4). */
export function PlayerTile({ player, onOpen }: { player: Player; onOpen: () => void }) {
  const { meta, state } = useSession();
  const t = useText().table.playerTile;
  const { lang } = useLang();
  const ref = `player:${player.id}` as const;
  const cash = cashOf(state, ref);
  const debt = counterOf(state, ref, "debt");
  const holdings = meta.game.companies
    .map((c) => ({ company: c, units: unitsOf(state, ref, c.id), president: presidencyHolder(state, c.id) === ref }))
    .filter((h) => h.units > 0);
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
      <span className="player-meta muted">
        {certificateCount(meta.game, state, player.id)}
        {t.certs}
        {debt > 0 ? <span className="badge danger">
            {t.debt}
            {formatMoney(debt, meta.game, lang)}
          </span> : null}
      </span>
      {holdings.length > 0 ? (
        <span className="holdings">
          {holdings.map((h) => (
            <span key={h.company.id} className="holding">
              <CompanyBadge company={h.company} size="sm" />
              <span className="money">
                {(h.units * 100) / h.company.shareCount}%{h.president ? "★" : ""}
              </span>
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
