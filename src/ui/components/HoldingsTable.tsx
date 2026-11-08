import { useLang, useText } from "../../app/language";
import { useSession } from "../../app/useSession";
import { certificateStatus } from "../../domain/actions/limits";
import { priceOf } from "../../domain/mechanics/market";
import type { CompanyId, PlayerId } from "../../domain/types";
import { formatMoney } from "../../i18n/format";
import { CompanyBadge } from "./CompanyBadge";

/**
 * Feature 016 (US2, contracts/ui.md §2): a player's shares, one row per company (badge, %, ★,
 * cards, whether they count), each with its sell button: one tap in a stock round, the count
 * picker otherwise. The certificate summary lives in the sheet header (US7, FR-034).
 */
export function HoldingsTable({
  playerId,
  inSR,
  onSellOne,
  onSellSome,
}: {
  playerId: PlayerId;
  inSR: boolean;
  onSellOne: (company: CompanyId) => void;
  onSellSome: (company: CompanyId) => void;
}) {
  const { meta, state } = useSession();
  const t = useText().sheets.player;
  const { lang } = useLang();
  const status = certificateStatus(meta.game, state, playerId, meta.players.length);
  
  if (status.rows.length === 0) 
    return <p className="muted">{t.noHoldings}</p>;
  
  return (
    <div className="holdings-sheet">
      <div className="holdings-table" role="table" aria-label={t.holdingsTitle}>
        {status.rows.map((row) => {
          const company = meta.game.companies.find((c) => c.id === row.company);
          if (!company) return null;
          const price = priceOf(meta.game, state, row.company);
          return (
            <div key={row.company} className="holdings-row" role="row">
              <span role="cell">
                <CompanyBadge company={company} size="sm" />
              </span>
              <span role="cell" className="money">
                {row.percent}%{row.president ? "★" : ""}
              </span>
              <span role="cell" className="muted">
                {t.certs(row.certificates)}
                {row.counts ? null : <span className="holdings-exempt"> · {t.notCounted}</span>}
              </span>
              <span role="cell" className="holdings-sell">
                {price === undefined ? null : inSR ? (
                  <button onClick={() => onSellOne(row.company)}>
                    {t.sellOne[0]}
                    <CompanyBadge company={company} size="inline" />
                    {t.sellOne[1]}
                    {formatMoney(price, meta.game, lang)}
                  </button>
                ) : (
                  <button onClick={() => onSellSome(row.company)}>{t.sellRow}</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
