import { useSession } from "../../app/useSession";
import { assetsHeldBy, cashOf, presidentOf } from "../../domain/events/state";
import { statusLabel } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { floatPending } from "../../domain/mechanics/capitalization";
import { floatConditionConfig } from "../../domain/mechanics/custom/manualFloatCondition";
import { priceOf } from "../../domain/mechanics/market";
import { displayName } from "../../domain/mechanics/traits";
import { trainTypeOf, type CompanyId } from "../../domain/types";
import { CompanyBadge } from "./CompanyBadge";

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
  const def = meta.game.companies.find((c) => c.id === companyId);
  const record = state.companies[companyId];
  if (!def || !record) return null;
  const price = priceOf(meta.game, state, companyId);
  const name = displayName(meta.game, state, companyId);
  const president = presidentOf(state, companyId);
  const presidentName = meta.players.find((p) => p.id === president)?.name;
  const trains = assetsHeldBy(state, `company:${companyId}`, "train").map(trainTypeOf);
  const loans = assetsHeldBy(state, `company:${companyId}`, "loan").length;
  const condition = floatConditionConfig(meta.game);
  const pendingCondition =
    condition?.company === companyId &&
    record.status === "parred" &&
    floatPending({ game: meta.game, state }, companyId) === "condition";
  const status = record.capitalPending ? "flotada (capital al final de la ronda)" : statusLabel[record.status];
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
          <span className="label">Caja</span>
          <span className="money" data-testid={`treasury-${companyId}`}>
            {formatMoney(cashOf(state, `company:${companyId}`), meta.game)}
          </span>
        </span>
        <span>
          <span className="label">Precio</span>
          <span className="money" data-testid={`price-${companyId}`}>
            {price !== undefined ? formatMoney(price, meta.game) : "—"}
          </span>
        </span>
      </span>
      <span className="company-meta muted">
        {def.kind === "national" || !presidentName ? "Sin presidente" : `Pres.: ${presidentName}`}
      </span>
      {pendingCondition ? <span className="badge warn">{condition.question}</span> : null}
      {trains.length > 0 || loans > 0 ? (
        <span className="company-meta">
          {trains.length > 0 ? `Trenes: ${trains.join(" · ")}` : null}
          {loans > 0 ? `${trains.length > 0 ? " · " : ""}Préstamos: ${loans}` : null}
        </span>
      ) : null}
    </button>
  );
}
