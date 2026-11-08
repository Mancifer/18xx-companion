import { useSession } from "../../app/useSession";
import { assetsHeldBy, cashOf, presidentOf } from "../../domain/events/state";
import { useDomainText, useLang, useText } from "../../app/language";
import { gameText } from "../../i18n/gameText";
import { formatMoney } from "../../i18n/format";
import { floatPending } from "../../domain/mechanics/capitalization";
import { floatConditionConfig } from "../../domain/mechanics/custom/manualFloatCondition";
import { priceOf } from "../../domain/mechanics/market";
import { displayName } from "../../domain/mechanics/traits";
import type { CompanyId } from "../../domain/types";
import { CompanyBadge } from "./CompanyBadge";
import { TrainCards } from "./TrainCards";

/** Treasury, price, president and status of one company (US1). */
export function CompanyCard({
  companyId,
  onOpen,
  current = false,
}: {
  companyId: CompanyId;
  onOpen: () => void;
  current?: boolean;
}) {
  const { meta, state } = useSession();
  const text = useText();
  const t = text.table.companyCard;
  const dt = useDomainText();
  const { lang } = useLang();
  const def = meta.game.companies.find((c) => c.id === companyId);
  const record = state.companies[companyId];
  if (!def || !record) return null;
  const price = priceOf(meta.game, state, companyId);
  const name = displayName(meta.game, state, companyId);
  const president = presidentOf(state, companyId);
  const presidentName = meta.players.find((p) => p.id === president)?.name;
  const hasTrains = assetsHeldBy(state, `company:${companyId}`, "train").length > 0;
  const loans = assetsHeldBy(state, `company:${companyId}`, "loan").length;
  const condition = floatConditionConfig(meta.game);
  const pendingCondition =
    condition?.company === companyId &&
    record.status === "parred" &&
    floatPending({ game: meta.game, state }, companyId) === "condition";
  const status = record.capitalPending ? t.capitalPending : dt.status[record.status];
  return (
    <button
      className={`company-card status-${record.status}${current ? " current" : ""}`}
      onClick={onOpen}
      aria-current={current ? "true" : undefined}
    >
      <span className="company-card-head">
        <CompanyBadge company={def} size="lg" name={name} />
        {name !== def.name ? <span className="company-alt-name">{name}</span> : null}
        <span className="company-status muted">{status}</span>
      </span>
      <span className="company-figures">
        <span>
          <span className="label">{t.treasury}</span>
          <span className="money" data-testid={`treasury-${companyId}`}>
            {formatMoney(cashOf(state, `company:${companyId}`), meta.game, lang)}
          </span>
        </span>
        <span>
          <span className="label">{t.price}</span>
          <span className="money" data-testid={`price-${companyId}`}>
            {price !== undefined ? formatMoney(price, meta.game, lang) : "—"}
          </span>
        </span>
      </span>
      <span className="company-meta muted">
        {def.kind === "national" || !presidentName ? t.noPresident : t.president(presidentName)}
      </span>
      {pendingCondition ? <span className="badge warn">{gameText(meta.game, lang).ruleText("manualFloatCondition", "question") || condition.question}</span> : null}
      {hasTrains || loans > 0 ? (
        <span className="company-meta company-trains">
          {/* Feature 016 (US6): named on large screens, where the cards have room (CSS). */}
          {hasTrains ? <span className="label company-trains-label">{text.table.trains.label}</span> : null}
          {hasTrains ? <TrainCards company={companyId} size="sm" /> : null}
          {loans > 0 ? <span>
              {t.loans}
              {loans}
            </span> : null}
        </span>
      ) : null}
    </button>
  );
}
