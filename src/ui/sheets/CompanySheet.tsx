import type { ReactNode } from "react";
import { useSession } from "../../app/useSession";
import { cashOf, holdersOf, presidencyHolder } from "../../domain/events/state";
import { useDomainText, useLang, useText } from "../../app/language";
import { formatMoney } from "../../i18n/format";
import { priceOf } from "../../domain/mechanics/market";
import type { CompanyId } from "../../domain/types";
import { CompanyBadge, HolderName } from "../components/CompanyBadge";
import { HolderSheet } from "./HolderSheet";

/** Company details and manual adjustments (FR-024). */
export function CompanySheet({
  companyId,
  onClose,
  extraActions,
}: {
  companyId: CompanyId;
  onClose: () => void;
  extraActions?: ReactNode;
}) {
  const { meta, state } = useSession();
  const t = useText().sheets.company;
  const dt = useDomainText();
  const { lang } = useLang();
  const def = meta.game.companies.find((c) => c.id === companyId);
  const record = state.companies[companyId];
  if (!def || !record) return null;
  const ref = `company:${companyId}` as const;
  const price = priceOf(meta.game, state, companyId);
  const president = presidencyHolder(state, companyId);
  const holders = holdersOf(state, companyId).sort((a, b) => b[1] - a[1]);
  return (
    <HolderSheet
      holder={ref}
      title={
        <span className="row">
          <CompanyBadge company={def} /> {def.name}
        </span>
      }
      onClose={onClose}
      extraActions={extraActions}
      info={
        <div className="stack">
          <p className="row">
            <span className="money sheet-figure">{formatMoney(cashOf(state, ref), meta.game, lang)}</span>
            <span className="muted">
              {dt.status[record.status]}
              {price !== undefined ? t.price(formatMoney(price, meta.game, lang)) : ""}
              {record.parPrice !== undefined ? t.par(formatMoney(record.parPrice, meta.game, lang)) : ""}
            </span>
          </p>
          <ul className="holders">
            {holders.map(([h, units]) => (
              <li key={h}>
                <span>
                  <HolderName holder={h} game={meta.game} players={meta.players} />
                  {h === president ? " ★" : ""}
                </span>
                <span className="money">{(units * 100) / def.shareCount}%</span>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
