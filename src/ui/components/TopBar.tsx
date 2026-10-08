import type { ReactNode } from "react";
import { useSession } from "../../app/useSession";
import { cashOf } from "../../domain/events/state";
import { formatMoney } from "../../domain/i18n/format";

/** Bank remaining, bank broken (FR-082), the invariant badge (FR-015), plus slots. */
export function TopBar({
  onMenu,
  onWarnings,
  center,
  right,
}: {
  onMenu: () => void;
  onWarnings: () => void;
  center?: ReactNode;
  right?: ReactNode;
}) {
  const { meta, state, violations } = useSession();
  const unlimited = meta.game.bank === "unlimited";
  const bank = cashOf(state, "bank");
  return (
    <header className="topbar">
      <button className="ghost" aria-label="Menú" onClick={onMenu}>
        ☰
      </button>
      <div className="topbar-center">{center}</div>
      <div className="topbar-bank">
        <span className="label">Banco</span>
        {unlimited ? (
          <span className="money">ilimitado</span>
        ) : (
          <span className={`money${bank <= 0 ? " negative" : ""}`} data-testid="bank">
            {formatMoney(bank, meta.game)}
          </span>
        )}
        {!unlimited && bank <= 0 ? <span className="badge danger">banca quebrada</span> : null}
      </div>
      {violations.length > 0 ? (
        <button className="badge-button danger" onClick={onWarnings} aria-label="Avisos de cuadre">
          ⚠ {violations.length}
        </button>
      ) : null}
      {right}
    </header>
  );
}
