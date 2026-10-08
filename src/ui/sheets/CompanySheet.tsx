import type { ReactNode } from "react";
import { useSession } from "../../app/useSession";
import { cashOf, holdersOf, presidencyHolder } from "../../domain/events/state";
import { holderName, statusLabel } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { priceOf } from "../../domain/mechanics/market";
import type { CompanyId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
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
            <span className="money sheet-figure">{formatMoney(cashOf(state, ref), meta.game)}</span>
            <span className="muted">
              {statusLabel[record.status]}
              {price !== undefined ? ` · precio ${formatMoney(price, meta.game)}` : ""}
              {record.parPrice !== undefined ? ` · par ${formatMoney(record.parPrice, meta.game)}` : ""}
            </span>
          </p>
          <ul className="holders">
            {holders.map(([h, units]) => (
              <li key={h}>
                <span>
                  {holderName(h, meta.game, meta.players)}
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
