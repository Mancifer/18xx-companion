import { useMemo, type ReactNode } from "react";
import { useSession } from "../../app/useSession";
import { cashOf, holdersOf, presidencyHolder } from "../../domain/events/state";
import { useDomainText, useLang, useText } from "../../app/language";
import { formatMoney } from "../../i18n/format";
import { gameText } from "../../i18n/gameText";
import { lastRun } from "../../domain/ledger/lastRun";
import { priceOf } from "../../domain/mechanics/market";
import type { CompanyId } from "../../domain/types";
import { CompanyBadge, HolderName } from "../components/CompanyBadge";
import { HolderSheet } from "./HolderSheet";

/** Company details and manual adjustments (FR-024). */
export function CompanySheet({
  companyId,
  onClose,
  extraActions,
  onHistory,
}: {
  companyId: CompanyId;
  onClose: () => void;
  extraActions?: ReactNode;
  /** Feature 017: "Historial" for this company. */
  onHistory?: () => void;
}) {
  const { meta, state, effective } = useSession();
  const t = useText().sheets.company;
  const dt = useDomainText();
  const { lang } = useLang();
  const def = meta.game.companies.find((c) => c.id === companyId);
  const record = state.companies[companyId];
  const run = useMemo(() => lastRun(meta.game, effective, companyId), [meta.game, effective, companyId]);
  if (!def || !record) return null;
  // data-model §6: hidden before the first run, when unreadable, and once closed (FR-016).
  const shownRun = run && run.revenue !== null && record.status !== "closed" ? run : undefined;
  const partLabel = (id: string) => gameText(meta.game, lang).revenuePart(id);
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
      {...(onHistory ? { onHistory } : {})}
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
          {shownRun ? (
            <div className="company-last-run" data-testid={`sheet-last-run-${companyId}`}>
              <p className="row">
                <span>
                  {t.lastRun}
                  <span className="money">{formatMoney(shownRun.revenue ?? 0, meta.game, lang)}</span>
                  {shownRun.mode ? ` · ${t.runModes[shownRun.mode]}` : ""}
                  {` · ${dt.income.orHeading(shownRun.or.orSet, shownRun.or.orIndex)}`}
                </span>
              </p>
              {shownRun.parts.length > 1 ? (
                <p className="muted">
                  {shownRun.parts.map((p) => `${partLabel(p.part)} ${formatMoney(p.amount, meta.game, lang)}`).join(" · ")}
                </p>
              ) : null}
            </div>
          ) : null}
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
