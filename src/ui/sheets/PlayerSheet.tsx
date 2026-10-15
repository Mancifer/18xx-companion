import { useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { sharePrice } from "../../domain/actions/expand/stock";
import { cashOf, unitsOf } from "../../domain/events/state";
import type { CompanyDef } from "../../domain/games/schema";
import { formatMoney } from "../../domain/i18n/format";
import { priceOf } from "../../domain/mechanics/market";
import type { CompanyId, PlayerId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";
import { HolderSheet } from "./HolderSheet";

type Mode = "menu" | "sell" | "buy";

/**
 * A player's sheet: "Jugada" (sell and buy shares, the Table's game actions) above "Ajustes"
 * (manual adjustments, FR-024). Selling and buying dispatch the same `sellShares` and `buyShare`
 * as the company card (feature 011, US1).
 */
export function PlayerSheet({
  playerId,
  onClose,
  gameActions,
  extraActions,
}: {
  playerId: PlayerId;
  onClose: () => void;
  /** The Table's game actions for this player ("Canjear privada…"). */
  gameActions?: ReactNode;
  extraActions?: ReactNode;
}) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const [mode, setMode] = useState<Mode>("menu");
  const player = meta.players.find((p) => p.id === playerId);
  if (!player) return null;
  const ref = `player:${playerId}` as const;
  const money = (n: number) => formatMoney(n, meta.game);
  const holdings = meta.game.companies.flatMap((c) => {
    const units = unitsOf(state, ref, c.id);
    const price = priceOf(meta.game, state, c.id);
    return units > 0 && price !== undefined ? [{ company: c, units, price }] : [];
  });

  const run = async (action: unknown) => {
    const result = await dispatch(action);
    if (result.ok) onClose();
  };
  const back = (
    <button className="ghost" onClick={() => setMode("menu")}>
      ← Volver
    </button>
  );

  if (mode === "sell") return <SellView playerId={playerId} holdings={holdings} back={back} onClose={onClose} run={run} />;
  if (mode === "buy") return <BuyView playerId={playerId} back={back} onClose={onClose} run={run} />;

  const inSR = state.turn.round === "SR";
  const stock = (
    <>
      {inSR
        ? holdings.map((h) => (
            <button key={h.company.id} onClick={() => void run({ type: "sellShares", seller: ref, company: h.company.id, count: 1 })}>
              Vender 1 {h.company.shortName} · {money(h.price)}
            </button>
          ))
        : null}
      <button
        disabled={holdings.length === 0}
        title={holdings.length === 0 ? "No tiene acciones para vender" : undefined}
        onClick={() => setMode("sell")}
      >
        Vender acciones
      </button>
      <button onClick={() => setMode("buy")}>Comprar acción</button>
    </>
  );

  return (
    <HolderSheet
      holder={ref}
      title={player.name}
      onClose={onClose}
      gameActions={
        inSR ? (
          <>
            {stock}
            {gameActions}
          </>
        ) : (
          <>
            {gameActions}
            {stock}
          </>
        )
      }
      extraActions={extraActions}
      info={meta.walletMode === "appTruth" ? <p className="money sheet-figure">{money(cashOf(state, ref))}</p> : null}
    />
  );
}

type Holding = { readonly company: CompanyDef; readonly units: number; readonly price: number };

function Stepper({ value, onChange, min = 1, max }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="row">
      <button aria-label="Menos" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="money stepper-value" aria-label="Cantidad de acciones">
        {value}
      </span>
      <button aria-label="Más" onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

/** "Vender · Ana": a holding, how many, then "Vender N · cobra $X" (contracts/ui.md §1). */
function SellView({
  playerId,
  holdings,
  back,
  onClose,
  run,
}: {
  playerId: PlayerId;
  holdings: readonly Holding[];
  back: ReactNode;
  onClose: () => void;
  run: (action: unknown) => Promise<void>;
}) {
  const { meta } = useSession();
  const [company, setCompany] = useState<CompanyId | null>(holdings.length === 1 ? (holdings[0]?.company.id ?? null) : null);
  const [count, setCount] = useState(1);
  const name = meta.players.find((p) => p.id === playerId)?.name ?? playerId;
  const chosen = holdings.find((h) => h.company.id === company);
  return (
    <Sheet title={<>Vender · {name}</>} onClose={onClose}>
      {back}
      <div className="choice-grid">
        {holdings.map((h) => (
          <button
            key={h.company.id}
            aria-pressed={company === h.company.id}
            onClick={() => {
              setCompany(h.company.id);
              setCount(1);
            }}
          >
            <CompanyBadge company={h.company} size="sm" /> {(h.units * 100) / h.company.shareCount}% · {formatMoney(h.price, meta.game)}
          </button>
        ))}
      </div>
      {chosen ? (
        <>
          <Stepper value={count} onChange={setCount} max={chosen.units} />
          <button
            className="primary"
            onClick={() => void run({ type: "sellShares", seller: `player:${playerId}`, company: chosen.company.id, count })}
          >
            Vender {count} · cobra {formatMoney(chosen.price * count, meta.game)}
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

/** "Comprar · Ana": an open company, how many, then one tap on a source (contracts/ui.md §1). */
function BuyView({
  playerId,
  back,
  onClose,
  run,
}: {
  playerId: PlayerId;
  back: ReactNode;
  onClose: () => void;
  run: (action: unknown) => Promise<void>;
}) {
  const { meta, state } = useSession();
  const open = meta.game.companies.filter((c) => {
    const status = state.companies[c.id]?.status;
    return status !== undefined && status !== "unstarted" && status !== "closed" && status !== "bankrupt";
  });
  const [company, setCompany] = useState<CompanyId | null>(open.length === 1 ? (open[0]?.id ?? null) : null);
  const [count, setCount] = useState(1);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const name = meta.players.find((p) => p.id === playerId)?.name ?? playerId;
  const money = (n: number | undefined) => (n !== undefined ? ` ${formatMoney(n, meta.game)}` : "");

  const sources = (id: CompanyId) => {
    // The same sources as the company card's StockSheet (RotLA buys from the treasury).
    const treasuryShares = unitsOf(state, `company:${id}`, id);
    const showIpo = meta.game.defaultBuySource !== "treasury" && (unitsOf(state, `ipo:${id}`, id) > 0 || treasuryShares === 0);
    return [
      ...(showIpo ? [{ source: "ipo" as const, label: "IPO" }] : []),
      ...(treasuryShares > 0 ? [{ source: "treasury" as const, label: "Tesorería" }] : []),
      { source: "pool" as const, label: "Pool" },
    ];
  };

  return (
    <Sheet title={<>Comprar · {name}</>} onClose={onClose}>
      {back}
      <div className="choice-grid">
        {open.map((c) => (
          <button key={c.id} aria-pressed={company === c.id} onClick={() => setCompany(c.id)}>
            <CompanyBadge company={c} size="sm" />
            {money(priceOf(meta.game, state, c.id))}
          </button>
        ))}
      </div>
      {company ? (
        <>
          <Stepper value={count} onChange={setCount} />
          <div className="choice-grid">
            {sources(company).map(({ source, label }) => {
              const action = { type: "buyShare", buyer: `player:${playerId}`, company, source, count } as const;
              const ok = availabilityOf(ctx, "buyShare", action);
              return (
                <button key={source} disabled={!ok.ok} title={ok.ok ? undefined : ok.reasonEs} onClick={() => void run(action)}>
                  {label}
                  {money(sharePrice(meta.game, state, company, source))}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
