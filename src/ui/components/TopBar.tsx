import type { ReactNode } from "react";
import { useSession } from "../../app/useSession";
import { cashOf } from "../../domain/events/state";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";

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
  const t = useText().table.topBar;
  const { lang } = useLang();
  const unlimited = meta.game.bank === "unlimited";
  const bank = cashOf(state, "bank");
  return (
    <header className="topbar">
      <button className="ghost" aria-label={t.menu} onClick={onMenu}>
        ☰
      </button>
      <div className="topbar-center">{center}</div>
      <div className="topbar-bank">
        <span className="label">{t.bank}</span>
        {unlimited ? (
          <span className="money">{t.unlimited}</span>
        ) : (
          <span className={`money${bank <= 0 ? " negative" : ""}`} data-testid="bank">
            {formatMoney(bank, meta.game, lang)}
          </span>
        )}
        {!unlimited && bank <= 0 ? <span className="badge danger">{t.bankBroken}</span> : null}
      </div>
      {violations.length > 0 ? (
        <button className="badge-button danger" onClick={onWarnings} aria-label={t.balanceWarnings}>
          ⚠ {violations.length}
        </button>
      ) : null}
      {right}
    </header>
  );
}
