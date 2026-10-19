import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { shareSources, type ShareSource } from "../../domain/actions/expand/stock";
import { cashOf, isPlayerBankrupt, presidencyHolder, unitsOf } from "../../domain/events/state";
import { formatMoney } from "../../domain/i18n/format";
import { floatPending } from "../../domain/mechanics/capitalization";
import { isEnabled } from "../../domain/mechanics/custom";
import { floatConditionConfig } from "../../domain/mechanics/custom/manualFloatCondition";
import { parPricesFor, priceOf } from "../../domain/mechanics/market";
import type { CompanyId, HolderRef } from "../../domain/types";
import { CompanyBadge, CompanyName } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";
import { LaunchSheet } from "./LaunchSheet";

const SOURCE_LABEL: Readonly<Record<ShareSource["source"], string>> = { ipo: "IPO", treasury: "Tesorería", pool: "Pool" };

/**
 * Stock round by touch (US4, T113). From the company card, one tap on "IPO", "Pool" or "Vender"
 * in a player's row applies it (FR-100: two taps from the Table). An unstarted company shows the
 * par prices first, then one tap per player. In a corporate round, companies trade too.
 */
export function StockSheet({
  companyId,
  onClose,
  onOperate,
  onDetails,
}: {
  companyId: CompanyId;
  onClose: () => void;
  onOperate?: () => void;
  onDetails?: () => void;
}) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const [count, setCount] = useState(1);
  const [parPrice, setParPrice] = useState<number | null>(null);
  const [issue, setIssue] = useState(1);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const def = meta.game.companies.find((c) => c.id === companyId);
  const record = state.companies[companyId];
  if (!def || !record) return null;
  const money = (n: number) => formatMoney(n, meta.game);
  const price = priceOf(meta.game, state, companyId);

  const run = async (action: unknown) => {
    const result = await dispatch(action);
    if (result.ok) onClose();
  };

  const traders: HolderRef[] = [
    ...[...meta.players]
      .sort((a, b) => a.seat - b.seat)
      .filter((p) => !isPlayerBankrupt(state, p.id))
      .map((p) => `player:${p.id}` as const),
    ...(isEnabled(meta.game, "corporateRound") && state.turn.round === "CR"
      ? meta.game.companies.filter((c) => state.companies[c.id]?.status === "floated").map((c) => `company:${c.id}` as const)
      : []),
  ];
  const traderName = (h: HolderRef) =>
    h.startsWith("player:") ? (meta.players.find((p) => `player:${p.id}` === h)?.name ?? h) : h.slice("company:".length);

  const condition = floatConditionConfig(meta.game);
  const askCondition =
    condition?.company === companyId && record.status === "parred" && floatPending(ctx, companyId) === "condition";

  const footer = (
    <div className="choice-grid">
      {onOperate ? <button onClick={onOperate}>Operar…</button> : null}
      {onDetails ? <button onClick={onDetails}>Detalles y ajustes…</button> : null}
    </div>
  );

  const title = (
    <span className="row">
      <CompanyBadge company={def} /> {price !== undefined ? money(price) : "sin abrir"}
    </span>
  );

  // Auction companies open with a bid (feature 004), not at a par price.
  if (record.status === "unstarted" && def.start === "auction") return <LaunchSheet companyId={companyId} onClose={onClose} />;

  if (record.status === "unstarted" && def.kind !== "national") {
    const prices = parPricesFor(meta.game, companyId);
    return (
      <Sheet title={<>Abrir · {title}</>} onClose={onClose}>
        <fieldset className="choice-fieldset">
          <legend className="muted">Precio de salida</legend>
          <div className="choice-grid">
            {prices.map((p) => (
              <button key={p} aria-pressed={parPrice === p} onClick={() => setParPrice(p)}>
                {money(p)}
              </button>
            ))}
          </div>
        </fieldset>
        {parPrice !== null ? (
          <fieldset className="choice-fieldset">
            <legend className="muted">Quién abre ({money(parPrice * def.presidencyUnits)})</legend>
            <div className="choice-grid">
              {meta.players.filter((p) => !isPlayerBankrupt(state, p.id)).map((p) => (
                <button key={p.id} onClick={() => void run({ type: "parCompany", player: p.id, company: companyId, price: parPrice })}>
                  {p.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
        {footer}
      </Sheet>
    );
  }

  const button = (label: string, action: { type: "buyShare" | "sellShares" } & Record<string, unknown>) => {
    const ok = availabilityOf(ctx, action.type, action as never);
    return (
      <button
        key={label}
        disabled={!ok.ok}
        title={ok.ok ? undefined : ok.reasonEs}
        aria-label={`${label} ${traderName((action["buyer"] ?? action["seller"]) as HolderRef)}`}
        onClick={() => void run(action)}
      >
        {label}
      </button>
    );
  };
  // Where shares can be bought (feature 013, US3): the IPO button follows the IPO tile; a company
  // holding its own shares sells them from its treasury (RotLA).
  const sources = shareSources(ctx, companyId);
  const treasuryShares = unitsOf(state, `company:${companyId}`, companyId);
  const showIpo = sources.some((s) => s.source === "ipo");

  return (
    <Sheet title={title} onClose={onClose}>
      {askCondition ? (
        <div className="row toast-warning">
          <span>{condition.question}</span>
          <span className="spacer" />
          <button className="primary" onClick={() => void run({ type: "confirmFloatCondition", company: companyId })}>
            Sí
          </button>
        </div>
      ) : null}
      <ul className="share-sources" aria-label="Acciones disponibles">
        {sources.map((s) => (
          <li key={s.source} className={s.units === 0 ? "share-source empty" : "share-source"} data-testid={`source-${s.source}`}>
            <span className="share-source-label">{SOURCE_LABEL[s.source]}</span>
            <span className="share-source-units">
              {s.units}
              {s.units === 0 ? " agotada" : ""}
            </span>
            <span className="share-source-price">{s.price !== undefined ? `a ${money(s.price)}` : "—"}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <span className="muted">Cantidad</span>
        <span className="spacer" />
        <button aria-label="Menos" onClick={() => setCount((n) => Math.max(1, n - 1))}>
          −
        </button>
        <span className="money stepper-value" aria-label="Cantidad de acciones">
          {count}
        </span>
        <button aria-label="Más" onClick={() => setCount((n) => n + 1)}>
          +
        </button>
      </div>
      <ul className="trader-rows">
        {traders.map((h) => {
          const units = unitsOf(state, h, companyId);
          return (
            <li key={h} className="trader-row">
              <span className="trader-name">
                {h.startsWith("company:") ? <CompanyName game={meta.game} id={h.slice("company:".length)} size="sm" /> : traderName(h)}
                <span className="muted">
                  {" "}
                  {(units * 100) / record.shareCount}%{presidencyHolder(state, companyId) === h ? "★" : ""} ·{" "}
                  {money(cashOf(state, h))}
                </span>
              </span>
              {showIpo ? button("IPO", { type: "buyShare", buyer: h, company: companyId, source: "ipo", count }) : null}
              {treasuryShares > 0 && h !== `company:${companyId}`
                ? button("Tesorería", { type: "buyShare", buyer: h, company: companyId, source: "treasury", count })
                : null}
              {button("Pool", { type: "buyShare", buyer: h, company: companyId, source: "pool", count })}
              {units > 0 || h === `company:${companyId}` ? button("Vender", { type: "sellShares", seller: h, company: companyId, count }) : null}
            </li>
          );
        })}
      </ul>
      {isEnabled(meta.game, "corporateRound") && state.turn.round === "CR" ? (
        <div className="row">
          <button aria-label="Menos a emitir" onClick={() => setIssue((n) => Math.max(1, n - 1))}>
            −
          </button>
          <span className="money stepper-value">{issue}</span>
          <button aria-label="Más a emitir" onClick={() => setIssue((n) => n + 1)}>
            +
          </button>
          <button onClick={() => void run({ type: "issueShares", company: companyId, count: issue })}>Emitir {issue}</button>
        </div>
      ) : null}
      <SwapRow companyId={companyId} run={run} />
      {footer}
    </Sheet>
  );
}

/** 21Moon §9.2.2: the president swaps a certificate with the company treasury. */
function SwapRow({ companyId, run }: { companyId: CompanyId; run: (action: unknown) => Promise<void> }) {
  const { meta, state } = useSession();
  const treasury = `company:${companyId}` as const;
  const president = presidencyHolder(state, companyId);
  if (!isEnabled(meta.game, "corporateRound") || !president?.startsWith("player:")) return null;
  const held = meta.game.companies.filter((c) => unitsOf(state, treasury, c.id) > 0);
  if (held.length === 0) return null;
  const player = president.slice("player:".length);
  return (
    <fieldset className="choice-fieldset">
      <legend className="muted">Cambiar con la tesorería (sin dinero)</legend>
      <div className="choice-grid">
        {held.map((c) => (
          <button
            key={c.id}
            onClick={() =>
              void run({
                type: "swapCertificates",
                player,
                company: companyId,
                give: { company: companyId, units: 1 },
                take: { company: c.id, units: 1 },
              })
            }
          >
            1 <CompanyName game={meta.game} id={companyId} /> por 1 <CompanyBadge company={c} size="inline" />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
