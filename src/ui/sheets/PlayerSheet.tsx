import { useMessageText } from "../useMessage";
import { useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import { certificateStatus } from "../../domain/actions/limits";
import type { ActionContext } from "../../domain/actions/context";
import { sharePrice } from "../../domain/actions/expand/stock";
import { cashOf, unitsOf } from "../../domain/events/state";
import type { CompanyDef } from "../../domain/games/schema";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";

import { priceOf } from "../../domain/mechanics/market";
import type { CompanyId, PlayerId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { HoldingsTable } from "../components/HoldingsTable";
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
  onHistory,
}: {
  playerId: PlayerId;
  onClose: () => void;
  /** Feature 017: "Historial" for this player. */
  onHistory?: () => void;
  /** The Table's game actions for this player ("Canjear privada…"). */
  gameActions?: ReactNode;
  extraActions?: ReactNode;
}) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const text = useText();
  const t = text.sheets.player;
  const { lang } = useLang();
  const [mode, setMode] = useState<Mode>("menu");
  /** Feature 016 (US2): the company a row's "Vender…" opened the sell view on. */
  const [sellCompany, setSellCompany] = useState<CompanyId | undefined>();
  const player = meta.players.find((p) => p.id === playerId);
  if (!player) return null;
  const ref = `player:${playerId}` as const;
  const money = (n: number) => formatMoney(n, meta.game, lang);
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
      {text.sheets.operate.back}
    </button>
  );

  if (mode === "sell")
    return (
      <SellView 
        playerId={playerId} 
        holdings={holdings} 
        initialCompany={sellCompany} 
        back={back} 
        onClose={onClose} 
        run={run} 
      />
    );

  if (mode === "buy")
    return (
      <BuyView 
        playerId={playerId} 
        back={back} 
        onClose={onClose} 
        run={run} 
      />);

  const inSR = state.turn.round === "SR";
  const certs = certificateStatus(meta.game, state, playerId, meta.players.length);
  const stock = (
    <>
      <button
        disabled={holdings.length === 0}
        title={holdings.length === 0 ? t.noSharesToSell : undefined}
        onClick={() => {
          setSellCompany(undefined);
          setMode("sell");
        }}
      >
        {t.sellShares}
      </button>
      <button onClick={() => setMode("buy")}>{t.buyShare}</button>
    </>
  );

  return (
    <HolderSheet
      holder={ref}
      title={player.name}
      onClose={onClose}
      {...(onHistory ? { onHistory } : {})}
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
      info={
        <>
          <div className="sheet-figures">
            {meta.walletMode === "appTruth" ? <p className="money sheet-figure">{money(cashOf(state, ref))}</p> : null}
            {certs.rows.length > 0 ? (
              <p className={`cert-summary${certs.level === "under" ? "" : ` ${certs.level}`}`}>
                <span>
                  {t.certSummary(certs.counted, certs.limit)}
                  {certs.total !== certs.counted ? ` ${t.certAll(certs.total)}` : ""}
                </span>
                {certs.level === "at" ? <span className="badge warn">{t.atLimit}</span> : null}
                {certs.level === "over" ? <span className="badge danger">{t.overLimit}</span> : null}
              </p>
            ) : null}
          </div>
          <HoldingsTable
            playerId={playerId}
            inSR={inSR}
            onSellOne={(company) => void run({ type: "sellShares", seller: ref, company, count: 1 })}
            onSellSome={(company) => {
              setSellCompany(company);
              setMode("sell");
            }}
          />
        </>
      }
    />
  );
}

type Holding = { readonly company: CompanyDef; readonly units: number; readonly price: number };

function Stepper({ value, onChange, min = 1, max }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const t = useText().sheets.stock;
  return (
    <div className="row">
      <button aria-label={t.less} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <span className="money stepper-value" aria-label={t.shareCount}>
        {value}
      </span>
      <button aria-label={t.more} onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

/** "Vender · Ana": a holding, how many, then "Vender N · cobra $X" (contracts/ui.md §1). */
function SellView({
  playerId,
  holdings,
  initialCompany,
  back,
  onClose,
  run,
}: {
  playerId: PlayerId;
  holdings: readonly Holding[];
  /** Feature 016 (US2): preselected by a holdings row's "Vender…". */
  initialCompany?: CompanyId | undefined;
  back: ReactNode;
  onClose: () => void;
  run: (action: unknown) => Promise<void>;
}) {
  const { meta } = useSession();
  const t = useText().sheets.player;
  const { lang } = useLang();
  const [company, setCompany] = useState<CompanyId | null>(
    initialCompany ?? (holdings.length === 1 ? (holdings[0]?.company.id ?? null) : null),
  );
  const [count, setCount] = useState(1);
  const name = meta.players.find((p) => p.id === playerId)?.name ?? playerId;
  const chosen = holdings.find((h) => h.company.id === company);
  return (
    <Sheet title={<>{t.sellTitle} · {name}</>} onClose={onClose}>
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
            <CompanyBadge company={h.company} size="sm" /> {(h.units * 100) / h.company.shareCount}% · {formatMoney(h.price, meta.game, lang)}
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
            {t.sellN(count, formatMoney(chosen.price * count, meta.game, lang))}
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
  const reasonText = useMessageText();
  const { meta, state } = useSession();
  const text = useText();
  const { lang } = useLang();
  const open = meta.game.companies.filter((c) => {
    const status = state.companies[c.id]?.status;
    return status !== undefined && status !== "unstarted" && status !== "closed" && status !== "bankrupt";
  });
  const [company, setCompany] = useState<CompanyId | null>(open.length === 1 ? (open[0]?.id ?? null) : null);
  const [count, setCount] = useState(1);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const name = meta.players.find((p) => p.id === playerId)?.name ?? playerId;
  const money = (n: number | undefined) => (n !== undefined ? ` ${formatMoney(n, meta.game, lang)}` : "");

  const sources = (id: CompanyId) => {
    // The same sources as the company card's StockSheet (RotLA buys from the treasury).
    const treasuryShares = unitsOf(state, `company:${id}`, id);
    const showIpo = meta.game.defaultBuySource !== "treasury" && (unitsOf(state, `ipo:${id}`, id) > 0 || treasuryShares === 0);
    return [
      ...(showIpo ? [{ source: "ipo" as const, label: text.sheets.stock.sources.ipo }] : []),
      ...(treasuryShares > 0 ? [{ source: "treasury" as const, label: text.sheets.stock.sources.treasury }] : []),
      { source: "pool" as const, label: text.sheets.stock.sources.pool },
    ];
  };

  return (
    <Sheet title={<>{text.sheets.player.buyTitle} · {name}</>} onClose={onClose}>
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
                <button key={source} disabled={!ok.ok} title={ok.ok ? undefined : reasonText(ok.reason)} onClick={() => void run(action)}>
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
