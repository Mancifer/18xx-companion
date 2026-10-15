import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { forcedWithholdReason, tradeInProblem, trainPrice, zeroRunAction } from "../../domain/actions/expand/operating";
import { handlerFor } from "../../domain/actions/expand";
import type { ActionType } from "../../domain/actions/schemas";
import { cashOf, counterOf, presidentOf, unitsOf, type SessionState } from "../../domain/events/state";
import type { GameDefinition, NamedPayment, PayoutMode, TrainDef } from "../../domain/games/schema";
import { summaryEs } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { CANYON, cliffKeyFor, ROCK } from "../../domain/mechanics/custom/landmarks";
import { nationalBankConfig, nationalMinDividend } from "../../domain/mechanics/custom/nationalBank";
import { priceOf } from "../../domain/mechanics/market";
import { operatingOrder } from "../../domain/mechanics/operatingOrder";
import { turnActivity } from "../../domain/queries";
import { overLimitCompanies, RUSTED, trainsHeldBy, trainStack } from "../../domain/mechanics/phases";
import { effectiveTraits } from "../../domain/mechanics/traits";
import { trainTypeOf, type CompanyId } from "../../domain/types";
import { TrainsLine } from "../components/TrainsLine";
import { CompanyBadge } from "../components/CompanyBadge";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

export type OperateView = "run" | "train" | "cost" | "bonus" | "payment" | "cliff" | "private" | "loan" | "discard" | "supply";
type View = OperateView;
type Amounts = Record<string, number | null>;

const MODE_LABEL: Readonly<Record<PayoutMode, string>> = { full: "Pagar", withhold: "Retener", half: "Mitad" };
const COST_REASONS = ["terreno", "estación", "ficha", "río"];

/** Whether the game offers an action at all (a mechanic it enables, or a core action its data gates). */
function offers(ctx: ActionContext, type: ActionType): boolean {
  const handler = handlerFor(ctx, type);
  return handler !== undefined && (handler.offered?.(ctx.game) ?? true);
}

/**
 * The touch path for an operating turn (US3, T092): revenue on the keypad, then one tap on an
 * allowed payout mode (SC-006), or one field per revenue part (21Moon). Other operating actions
 * are one tap away; actions the game does not offer are hidden, and those not available now are
 * shown disabled with the reason.
 */
export function OperateSheet({
  companyId,
  outOfTurn = false,
  initialView = "run",
  onClose,
  onDetails,
  onCorrectTrains,
}: {
  companyId: CompanyId;
  /** Opened deliberately for a company whose turn it is not (FR-012). */
  outOfTurn?: boolean;
  /** "discard" opens the train picker directly (the over-limit banner, FR-020). */
  initialView?: OperateView;
  onClose: () => void;
  onDetails?: () => void;
  /** Opens the train correction view (feature 011, US3) from the trains line. */
  onCorrectTrains?: () => void;
}) {
  const { meta, state, effective } = useSession();
  const { dispatch } = useDispatch();
  const [view, setView] = useState<View>(initialView);
  // The turn draft (FR-006): typed but unconfirmed revenue, kept across sub-views, never logged.
  const [amounts, setAmounts] = useState<Amounts>({});
  const [editingPart, setEditingPart] = useState(meta.game.revenueParts[0]?.id ?? "revenue");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const def = meta.game.companies.find((c) => c.id === companyId);
  if (!def) return null;
  const ref = `company:${companyId}` as const;
  const price = priceOf(meta.game, state, companyId);

  const run = async (action: unknown) => {
    const result = await dispatch(action);
    if (result.ok) onClose();
  };
  // The operating turn (US1): the current company in an OR records its run, or "no run", then
  // finishes the turn. A payout keeps the turn open for trains and costs.
  const turn = state.turn;
  const inTurn = !outOfTurn && turn.round === "OR" && turn.currentCompany === companyId;
  const activity = turnActivity(effective, state, companyId);
  /** In the turn, a recorded action returns to the turn instead of closing it (FR-007). */
  const runInTurn = async (action: unknown) => {
    const result = await dispatch(action);
    if (result.ok) setView("run");
  };
  const step = inTurn ? runInTurn : run;
  const pay = async (action: unknown) => {
    const result = await dispatch(action);
    if (!result.ok) return;
    setAmounts({});
    if (!inTurn) onClose();
  };
  const finish = () => run({ type: "nextCompany" });

  const title = (
    <span className="row">
      <CompanyBadge company={def} /> {formatMoney(cashOf(state, ref), meta.game)}
      {price !== undefined ? <span className="muted"> · {formatMoney(price, meta.game)}</span> : null}
    </span>
  );
  const back = (
    <button className="ghost" onClick={() => setView("run")}>
      ← Volver
    </button>
  );

  if (view === "train") return <TrainView ctx={ctx} company={companyId} title={title} back={back} onClose={onClose} run={step} />;
  if (view === "cost" || view === "bonus") {
    return <AmountView kind={view} company={companyId} title={title} back={back} onClose={onClose} run={step} />;
  }
  if (view === "payment" && paymentId) {
    return <PaymentView ctx={ctx} company={companyId} payment={paymentId} title={title} back={back} onClose={onClose} run={step} />;
  }
  if (view === "private") return <PrivateView ctx={ctx} company={companyId} title={title} back={back} onClose={onClose} run={step} />;
  if (view === "loan") return <LoanView ctx={ctx} company={companyId} title={title} back={back} onClose={onClose} run={step} />;
  if (view === "cliff") {
    return (
      <Sheet title={<>Acantilado · {title}</>} onClose={onClose}>
        {back}
        <div className="choice-grid">
          {trainsHeldBy(state, ref).map((asset) => (
            <button key={asset} onClick={() => void step({ type: "cliffSale", company: companyId, train: asset })}>
              Vender el {trainTypeOf(asset)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (view === "discard") {
    return (
      <Sheet title={title} onClose={onClose}>
        {back}
        <div className="choice-grid">
          {trainsHeldBy(state, ref).map((asset) => (
            <button key={asset} onClick={() => void step({ type: "discardTrain", company: companyId, train: asset })}>
              Descartar un {trainTypeOf(asset)}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (view === "supply") {
    return (
      <Sheet title="Oferta de trenes" onClose={onClose}>
        {back}
        <div className="choice-grid">
          {meta.game.trains
            .filter((t) => (t.reserve ?? 0) > 0)
            .flatMap((t) =>
              (["add", "remove"] as const).map((op) => {
                const action = { type: "changeTrainSupply", trainType: t.type, op } as const;
                const ok = availabilityOf(ctx, "changeTrainSupply", action);
                return (
                  <button key={`${t.type}-${op}`} disabled={!ok.ok} title={ok.ok ? undefined : ok.reasonEs} onClick={() => void step(action)}>
                    {op === "add" ? "Añadir" : "Quitar"} un {t.type}
                  </button>
                );
              }),
            )}
        </div>
      </Sheet>
    );
  }

  const offered = (type: ActionType) => handlerFor(ctx, type) !== undefined;
  /** A concrete payload for this company, so availability never falls back to "the operating company". */
  const more: { view: View; label: string; probe?: { type: ActionType } & Record<string, unknown>; show: boolean }[] = [
    { view: "train", label: "Comprar tren", show: true },
    { view: "cost", label: "Pagar costo", show: true },
    { view: "bonus", label: "Cobro del banco", show: true },
    { view: "private", label: "Comprar privada", show: meta.game.privates.length > 0 },
    {
      view: "loan",
      label: "Préstamo",
      probe: { type: "takeLoan", company: companyId, count: 1 },
      show: offered("takeLoan"),
    },
    { view: "discard", label: "Descartar tren", show: trainsHeldBy(state, ref).length > 0 },
    {
      view: "supply",
      label: "Cambiar oferta de trenes",
      probe: { type: "changeTrainSupply" },
      show: meta.game.trains.some((t) => (t.reserve ?? 0) > 0),
    },
  ];
  const overLimit = overLimitCompanies(meta.game, state).find((o) => o.company === companyId);
  const rusted = trainsHeldBy(state, ref).filter((asset) => counterOf(state, ref, `${RUSTED}${asset}`) > 0);

  return (
    <Sheet title={title} onClose={onClose}>
      <TrainsLine company={companyId} onCorrect={onCorrectTrains} />
      {outOfTurn && turn.currentCompany ? (
        <p className="out-of-turn" role="note">
          Fuera de turno: le toca a {meta.game.companies.find((c) => c.id === turn.currentCompany)?.shortName ?? turn.currentCompany}. Lo
          que registres quedará marcado en el historial.
        </p>
      ) : null}
      {overLimit ? (
        <button className="over-limit" onClick={() => setView("discard")}>
          {def.name}: {overLimit.count} trenes, límite {overLimit.limit}. Elegir cuál va al pool
        </button>
      ) : null}
      {inTurn ? (
        <div className="turn-summary">
          <span className="label">Este turno</span>
          {activity.groups.length === 0 ? (
            <p className="muted">—</p>
          ) : (
            <ul>
              {activity.groups.map((g) => (
                <li key={g.id}>{summaryEs(g.action, ctx, g.events)}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {activity.runRecorded ? (
        <p className="run-recorded">✓ Operación registrada</p>
      ) : def.kind === "national" ? (
        <NationalPayout ctx={ctx} run={pay} />
      ) : (
        <RevenueEntry
          ctx={ctx}
          company={companyId}
          run={pay}
          noRun={inTurn ? () => void pay(zeroRunAction(meta.game, companyId)) : undefined}
          amounts={amounts}
          setAmounts={setAmounts}
          editing={editingPart}
          setEditing={setEditingPart}
        />
      )}
      {rusted.map((asset) => (
        <div key={asset} className="row rusted-train">
          <span>{trainTypeOf(asset)} · Oxidado · última carrera</span>
          <button onClick={() => void step({ type: "discardTrain", company: companyId, train: asset })}>
            Retirar el {trainTypeOf(asset)}
          </button>
        </div>
      ))}
      <AbilityChips
        ctx={ctx}
        company={companyId}
        run={step}
        onAmount={(id) => {
          setPaymentId(id);
          setView("payment");
        }}
      />
      <LandmarkChips ctx={ctx} company={companyId} run={step} onCliff={() => setView("cliff")} />
      <div className="choice-grid">
        {more
          .filter((m) => m.show && def.kind !== "national")
          .map((m) => {
            const ok = m.probe
              ? availabilityOf(ctx, m.probe.type, m.probe.type === "changeTrainSupply" ? undefined : (m.probe as never))
              : { ok: true as const };
            return (
              <button key={m.view} disabled={!ok.ok} title={ok.ok ? undefined : ok.reasonEs} onClick={() => setView(m.view)}>
                {m.label}
                {ok.ok ? null : <span className="muted reason"> · {ok.reasonEs}</span>}
              </button>
            );
          })}
        {onDetails ? <button onClick={onDetails}>Detalles y ajustes…</button> : null}
      </div>
      {inTurn ? (
        <div className="stack">
          <button className="primary big" disabled={!activity.canFinish} onClick={() => void finish()}>
            Terminar turno → siguiente: {nextLabel(meta.game, state, companyId)}
          </button>
          {activity.canFinish ? null : <p className="muted">Registra lo que corrió o «No corrió» primero</p>}
        </div>
      ) : null}
    </Sheet>
  );
}

/** Who operates after this company: the next one in order, a new OR in the set, or the set's end. */
function nextLabel(game: GameDefinition, state: SessionState, company: CompanyId): string {
  const next = operatingOrder(game, state).find((id) => id !== company && !state.turn.operatedThisOR.includes(id));
  if (next) return game.companies.find((c) => c.id === next)?.shortName ?? next;
  return state.turn.orIndex < state.turn.orsInSet ? `OR ${state.turn.orSet}.${state.turn.orIndex + 1}` : "fin del set";
}

function RevenueEntry({
  ctx,
  company,
  run,
  noRun,
  amounts,
  setAmounts,
  editing,
  setEditing,
}: {
  ctx: ActionContext;
  company: CompanyId;
  run: (action: unknown) => Promise<void>;
  /** "No corrió" (FR-002), offered only in the company's own turn. */
  noRun?: (() => void) | undefined;
  amounts: Amounts;
  setAmounts: Dispatch<SetStateAction<Amounts>>;
  editing: string;
  setEditing: (part: string) => void;
}) {
  const parts = ctx.game.revenueParts;
  const choice = parts.length === 1 && parts[0]?.to === "choice" ? parts[0] : undefined;
  const forced = forcedWithholdReason(ctx, company);

  if (choice) {
    const amount = amounts[choice.id] ?? null;
    return (
      <div className="stack">
        <Keypad value={amount} onChange={(v) => setAmounts({ [choice.id]: v })} game={ctx.game} label={choice.label} />
        {forced ? <p className="toast-warning">{forced}</p> : null}
        <div className="row payout-modes">
          {ctx.game.payoutModes.map((mode) => {
            const blocked = forced !== undefined && mode !== "withhold";
            return (
              <button
                key={mode}
                className={mode === "full" ? "primary big" : "big"}
                disabled={amount === null || blocked}
                title={blocked ? forced : undefined}
                onClick={() => void run({ type: "runAndPayout", company, parts: [{ part: choice.id, amount }], mode })}
              >
                {MODE_LABEL[mode]}
              </button>
            );
          })}
          {noRun ? (
            <button className="big" onClick={noRun}>
              No corrió
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const current = parts.find((p) => p.id === editing) ?? parts[0];
  const complete = parts.every((p) => amounts[p.id] !== undefined && amounts[p.id] !== null);
  return (
    <div className="stack">
      <div className="row">
        {parts.map((p) => (
          <button key={p.id} className="field-row" aria-pressed={p.id === editing} onClick={() => setEditing(p.id)}>
            <span className="label">{p.label}</span>
            <span className="money">{amounts[p.id] != null ? formatMoney(amounts[p.id] ?? 0, ctx.game) : "—"}</span>
          </button>
        ))}
      </div>
      {current ? (
        <Keypad
          value={amounts[current.id] ?? null}
          onChange={(v) => setAmounts((a) => ({ ...a, [current.id]: v }))}
          game={ctx.game}
          label={current.label}
        />
      ) : null}
      {forced ? <p className="toast-warning">{forced}</p> : null}
      <button
        className="primary big"
        disabled={!complete}
        onClick={() =>
          void run({
            type: "runAndPayout",
            company,
            parts: parts.map((p) => ({ part: p.id, amount: amounts[p.id] ?? 0 })),
            mode: null,
          })
        }
      >
        Confirmar
      </button>
      {noRun ? (
        <button className="big" onClick={noRun}>
          No corrió
        </button>
      ) : null}
    </div>
  );
}

function NationalPayout({ ctx, run }: { ctx: ActionContext; run: (action: unknown) => Promise<void> }) {
  const [extra, setExtra] = useState<number | null>(0);
  const min = nationalMinDividend(ctx.game, ctx.state);
  if (!nationalBankConfig(ctx.game)) return null;
  return (
    <div className="stack">
      <p className="muted">Mínimo de la fase: {formatMoney(min, ctx.game)}. Añade el valor de las ciudades administradas.</p>
      <Keypad value={extra} onChange={setExtra} game={ctx.game} label="Extra de ciudades" />
      <button className="primary big" onClick={() => void run({ type: "nationalPayout", extra: extra ?? 0 })}>
        Pagar dividendo ({formatMoney(min + (extra ?? 0), ctx.game)})
      </button>
    </div>
  );
}

interface ViewProps {
  ctx: ActionContext;
  company: CompanyId;
  title: ReactNode;
  back: ReactNode;
  onClose: () => void;
  run: (action: unknown) => Promise<void>;
}

function TrainView({ ctx, company, title, back, onClose, run }: ViewProps) {
  const [seller, setSeller] = useState<CompanyId | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [sellerTrain, setSellerTrain] = useState<string | null>(null);
  const [tradeInFor, setTradeInFor] = useState<string | null>(null);
  const ref = `company:${company}` as const;
  const buy = (train: TrainDef, from: "bank" | "pool", variant: string | null, tradeIn: string | null) => ({
    type: "buyTrain",
    company,
    trainType: train.type,
    variant,
    from,
    seller: null,
    price: null,
    tradeIn,
  });
  const option = (train: TrainDef, from: "bank" | "pool", variant: string | null, tradeIn: string | null, label: string) => {
    const action = buy(train, from, variant, tradeIn);
    const ok = availabilityOf(ctx, "buyTrain", action as never);
    if (!ok.ok) return null;
    const cost = formatMoney(trainPrice(ctx.game, action, ctx.state), ctx.game);
    return (
      <button key={`${from}-${train.type}-${variant ?? ""}-${tradeIn ?? ""}`} onClick={() => void run(action)}>
        {/* An unlimited type with variants (7/∞): "7: $750"; otherwise "3 (5) · $200", as before. */}
        {train.count === "unlimited" && train.variants.length > 1 && tradeIn === null ? `${label}: ${cost}` : `${label} · ${cost}`}
      </button>
    );
  };
  /** Types the company could trade in for this train: held, not rusted, and not rusted by this purchase. */
  const tradeIns = (t: TrainDef, variant: string | null): string[] =>
    (t.tradeIn?.fromTypes ?? []).filter((from) => {
      const held = trainsHeldBy(ctx.state, ref, from).filter((a) => counterOf(ctx.state, ref, `${RUSTED}${a}`) === 0);
      return held.length > 0 && !tradeInProblem(ctx.game, ctx.state, buy(t, "bank", variant, from));
    });
  const others = ctx.game.companies.filter((c) => c.id !== company && trainsHeldBy(ctx.state, `company:${c.id}`).length > 0);

  return (
    <Sheet title={<>Comprar tren · {title}</>} onClose={onClose}>
      {back}
      <ForcedPurchaseCard ctx={ctx} company={company} run={run} />
      <h3>Del banco</h3>
      <div className="choice-grid">
        {ctx.game.trains
          .filter((t) => !t.special)
          .flatMap((t) => {
            const left = t.count === "unlimited" ? "∞" : String(trainsHeldBy(ctx.state, "bank", t.type).length);
            const variants = t.variants.length > 1 ? t.variants.map((v) => v.name) : [null];
            const buttons: ReactNode[] = variants.map((v) =>
              option(t, "bank", v, null, v === null ? `${t.type} (${left})` : t.count === "unlimited" ? v : `${v} (${left})`),
            );
            const tradeVariant = t.tradeIn?.variant ?? t.variants.at(-1)?.name ?? null;
            const froms = tradeIns(t, tradeVariant);
            if (t.tradeIn?.variant !== undefined) {
              // The trade-in price is for one variant (RotLA ∞): one chip opens the trains to hand over.
              if (froms.length > 0) {
                buttons.push(
                  <button key={`trade-${t.type}`} aria-expanded={tradeInFor === t.type} onClick={() => setTradeInFor(t.type)}>
                    {tradeVariant} entregando…
                  </button>,
                );
              }
              if (tradeInFor === t.type) {
                for (const from of froms) buttons.push(option(t, "bank", tradeVariant, from, `${tradeVariant} entregando un ${from}`));
              }
            } else {
              for (const from of t.tradeIn?.fromTypes ?? []) {
                if (trainsHeldBy(ctx.state, ref, from).length > 0) {
                  buttons.push(option(t, "bank", tradeVariant, from, `${tradeVariant ?? t.type} entregando un ${from}`));
                }
              }
            }
            return buttons;
          })}
      </div>
      {ctx.game.trains.some((t) => trainsHeldBy(ctx.state, "pool", t.type).length > 0) ? (
        <>
          <h3>Del pool</h3>
          <div className="choice-grid">{ctx.game.trains.map((t) => option(t, "pool", null, null, t.type))}</div>
        </>
      ) : null}
      {others.length > 0 ? (
        <>
          <h3>De otra compañía</h3>
          <div className="choice-grid">
            {others.map((c) => (
              <button key={c.id} aria-pressed={seller === c.id} onClick={() => setSeller(c.id)}>
                <CompanyBadge company={c} size="sm" />
              </button>
            ))}
          </div>
          {seller ? (
            <>
              <div className="choice-grid">
                {[...new Set(trainsHeldBy(ctx.state, `company:${seller}`).map(trainTypeOf))].map((type) => (
                  <button key={type} aria-pressed={sellerTrain === type} onClick={() => setSellerTrain(type)}>
                    {type}
                  </button>
                ))}
              </div>
              <Keypad value={price} onChange={setPrice} game={ctx.game} label="Precio acordado" />
              <button
                className="primary"
                disabled={price === null || price < 1 || sellerTrain === null}
                onClick={() =>
                  void run({
                    type: "buyTrain",
                    company,
                    trainType: sellerTrain,
                    variant: null,
                    from: "company",
                    seller,
                    price,
                    tradeIn: null,
                  })
                }
              >
                Comprar
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

/**
 * "Compra forzada" (US6-4, contracts/ui.md): a company with no train that cannot pay the top of
 * the stack. The president puts in the difference, selling shares first if they need to.
 */
function ForcedPurchaseCard({ ctx, company, run }: { ctx: ActionContext; company: CompanyId; run: (action: unknown) => Promise<void> }) {
  const [counts, setCounts] = useState<Partial<Record<CompanyId, number>>>({});
  const ref = `company:${company}` as const;
  const president = presidentOf(ctx.state, company);
  const top = trainStack(ctx.game, ctx.state)[0];
  const train = top ? ctx.game.trains.find((t) => t.type === top.type) : undefined;
  if (!offers(ctx, "forcedTrainPurchase") || !president || !train || trainsHeldBy(ctx.state, ref).length > 0) return null;
  const cost = trainPrice(ctx.game, { trainType: train.type, variant: null, from: "bank", price: null, tradeIn: null }, ctx.state);
  const cash = cashOf(ctx.state, ref);
  if (cash >= cost) return null;
  const money = (n: number) => formatMoney(n, ctx.game);
  const presidentRef = `player:${president}` as const;
  const presidentName = ctx.players.find((p) => p.id === president)?.name ?? president;
  const presidentCash = cashOf(ctx.state, presidentRef);
  // Every share the president could sell, so the table need not look up their portfolio.
  const holdings = ctx.game.companies.flatMap((c) => {
    const units = unitsOf(ctx.state, presidentRef, c.id);
    const price = priceOf(ctx.game, ctx.state, c.id);
    return units > 0 && price !== undefined ? [{ company: c, units, price }] : [];
  });
  const sales = holdings.flatMap((h) => {
    const count = counts[h.company.id] ?? 0;
    return count > 0 ? [{ company: h.company.id, count }] : [];
  });
  const proceeds = holdings.reduce((sum, h) => sum + h.price * (counts[h.company.id] ?? 0), 0);
  const shortfall = cost - cash;
  const missing = shortfall - (presidentCash + proceeds);
  const setCount = (id: CompanyId, count: number) => setCounts((all) => ({ ...all, [id]: count }));
  return (
    <fieldset className="forced-purchase stack" aria-label="Compra forzada">
      <legend>Compra forzada</legend>
      <p>
        {presidentName} (presidente) pone {money(shortfall)} · tiene {money(presidentCash)}
        {proceeds > 0 ? <> + {money(proceeds)} por ventas</> : null}
        {missing > 0 ? <span className="toast-warning"> · le faltan {money(missing)}</span> : null}
      </p>
      {holdings.length > 0 ? (
        <ul className="forced-sales stack" aria-label={`Acciones de ${presidentName}`}>
          {holdings.map((h) => {
            const count = counts[h.company.id] ?? 0;
            return (
              <li key={h.company.id} className="row">
                <span>
                  <CompanyBadge company={h.company} size="sm" /> {(h.units * 100) / h.company.shareCount}% · {money(h.price)}
                </span>
                <button
                  aria-label={`Vender una ${h.company.shortName} menos`}
                  disabled={count === 0}
                  onClick={() => setCount(h.company.id, count - 1)}
                >
                  −
                </button>
                <span className="money stepper-value" aria-label={`${h.company.shortName} a vender`}>
                  {count}
                </span>
                <button
                  aria-label={`Vender una ${h.company.shortName} más`}
                  disabled={count >= h.units}
                  onClick={() => setCount(h.company.id, count + 1)}
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>{presidentName} no tiene acciones para vender.</p>
      )}
      <button
        className="primary"
        onClick={() => void run({ type: "forcedTrainPurchase", company, trainType: train.type, variant: null, from: "bank", sales })}
      >
        Comprar el {top?.displayName ?? train.type} · {money(cost)}
      </button>
    </fieldset>
  );
}

function AmountView({
  kind,
  company,
  title,
  back,
  onClose,
  run,
}: Omit<ViewProps, "ctx"> & { kind: "cost" | "bonus" }) {
  const { meta } = useSession();
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const isCost = kind === "cost";
  return (
    <Sheet title={<>{isCost ? "Pagar costo" : "Cobro del banco"} · {title}</>} onClose={onClose}>
      {back}
      <Keypad value={amount} onChange={setAmount} game={meta.game} />
      <label className="field-row">
        <span className="label">Motivo</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isCost ? "opcional" : "obligatorio"} />
      </label>
      {isCost ? (
        <div className="row">
          {COST_REASONS.map((r) => (
            <button key={r} aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
      ) : null}
      <button
        className="primary"
        disabled={amount === null || amount <= 0 || (!isCost && reason.trim() === "")}
        onClick={() =>
          void run(
            isCost
              ? { type: "payCost", company, amount, reason: reason.trim() || null }
              : { type: "bankPays", company, amount, reason: reason.trim() },
          )
        }
      >
        {isCost ? "Pagar" : "Cobrar"} {amount !== null ? formatMoney(amount, meta.game) : ""}
      </button>
    </Sheet>
  );
}

/** "Montaña (−40 / +60)", "Ficha extra (−40)", "Sede (+…)": the label of a company ability's money. */
function paymentLabel(p: NamedPayment): string {
  if (p.cost) return `${p.labelEs} (−${p.cost} / +${p.amount})`;
  if (p.amount === 0) return `${p.labelEs} (${p.direction === "bankPays" ? "+" : "−"}…)`;
  return `${p.labelEs} (${p.direction === "bankPays" ? "+" : "−"}${p.amount})`;
}

/**
 * One-tap chips (contracts/ui.md "Operate sheet additions"): issue and redeem when the game defines
 * them, and the company's ability payments from its effective traits. A payment whose amount is
 * entered at use opens the keypad.
 */
function AbilityChips({
  ctx,
  company,
  run,
  onAmount,
}: {
  ctx: ActionContext;
  company: CompanyId;
  run: (action: unknown) => Promise<void>;
  onAmount: (payment: string) => void;
}) {
  const chips: { key: string; label: string; action: { type: ActionType } & Record<string, unknown> }[] = [];
  if (offers(ctx, "issueShares")) chips.push({ key: "issue", label: "Emitir", action: { type: "issueShares", company, count: 1 } });
  if (offers(ctx, "redeemShare")) chips.push({ key: "redeem", label: "Recomprar", action: { type: "redeemShare", company, count: null } });
  const payments = effectiveTraits(ctx.game, ctx.state, company).payments ?? [];
  if (chips.length === 0 && payments.length === 0) return null;
  return (
    <div className="row ability-chips">
      {chips.map((c) => {
        const ok = availabilityOf(ctx, c.action.type, c.action as never);
        return (
          <button key={c.key} disabled={!ok.ok} title={ok.ok ? undefined : ok.reasonEs} onClick={() => void run(c.action)}>
            {c.label}
            {ok.ok ? null : <span className="muted reason"> · {ok.reasonEs}</span>}
          </button>
        );
      })}
      {payments.map((p) => (
        <button
          key={p.id}
          onClick={() => (p.amount === 0 ? onAmount(p.id) : void run({ type: "namedPayment", company, payment: p.id, amount: null }))}
        >
          {paymentLabel(p)}
        </button>
      ))}
    </div>
  );
}

/**
 * Landmarks postcards (US11, contracts/ui.md): one chip each, shown only when the game enables
 * them. A used one reads "Ya usada" and ignores a tap; a long press (or right click) still
 * records a repeat, which the app then warns about.
 */
function LandmarkChips({
  ctx,
  company,
  run,
  onCliff,
}: {
  ctx: ActionContext;
  company: CompanyId;
  run: (action: unknown) => Promise<void>;
  onCliff: () => void;
}) {
  if (!offers(ctx, "rockFormation")) return null;
  const ref = `company:${company}` as const;
  const used = (key: string) => counterOf(ctx.state, ref, key) > 0;
  const chips = [
    { key: "rock", label: "Formación rocosa (+2)", used: used(ROCK), act: () => void run({ type: "rockFormation", company }) },
    {
      key: "cliff",
      label: "Acantilado",
      used: used(cliffKeyFor(ctx.state.turn)),
      act: onCliff,
    },
    { key: "canyon", label: "Cañón", used: used(CANYON), act: () => void run({ type: "canyonTrain", company }) },
  ];
  return (
    <div className="row ability-chips">
      {chips.map((c) => (
        <button
          key={c.key}
          className={c.used ? "used" : undefined}
          aria-disabled={c.used ? "true" : undefined}
          onClick={() => {
            if (!c.used) c.act();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            c.act();
          }}
        >
          {c.label}
          {c.used ? " · Ya usada" : ""}
        </button>
      ))}
    </div>
  );
}

/** A named payment whose amount is entered at use (Sede: half the city's printed value). */
function PaymentView({ ctx, company, payment, title, back, onClose, run }: ViewProps & { payment: string }) {
  const [amount, setAmount] = useState<number | null>(null);
  const def = effectiveTraits(ctx.game, ctx.state, company).payments?.find((p) => p.id === payment);
  const bankPays = def?.direction !== "companyPays";
  return (
    <Sheet title={<>{def?.labelEs ?? payment} · {title}</>} onClose={onClose}>
      {back}
      <Keypad value={amount} onChange={setAmount} game={ctx.game} />
      <button
        className="primary"
        disabled={amount === null || amount <= 0}
        onClick={() => void run({ type: "namedPayment", company, payment, amount })}
      >
        {bankPays ? "Cobrar" : "Pagar"} {amount !== null ? formatMoney(amount, ctx.game) : ""}
      </button>
    </Sheet>
  );
}

function PrivateView({ ctx, company, title, back, onClose, run }: ViewProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const choices = ctx.game.privates.filter((p) => {
    const holder = ctx.state.assets[`private:${p.id}`];
    return holder !== undefined && holder !== "removed" && holder !== `company:${company}`;
  });
  return (
    <Sheet title={<>Comprar privada · {title}</>} onClose={onClose}>
      {back}
      <div className="choice-grid">
        {choices.map((p) => (
          <button key={p.id} aria-pressed={chosen === p.id} onClick={() => setChosen(p.id)}>
            {p.name} ({formatMoney(p.cost, ctx.game)})
          </button>
        ))}
      </div>
      {chosen ? (
        <>
          <Keypad value={price} onChange={setPrice} game={ctx.game} label="Precio" />
          <button
            className="primary"
            disabled={price === null || price <= 0}
            onClick={() => void run({ type: "buyPrivateByCompany", company, private: chosen, price })}
          >
            Comprar {price !== null ? formatMoney(price, ctx.game) : ""}
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

function LoanView({ ctx, company, title, back, onClose, run }: ViewProps) {
  const [count, setCount] = useState(1);
  const amount = ctx.game.loans?.amount ?? 0;
  return (
    <Sheet title={<>Préstamo · {title}</>} onClose={onClose}>
      {back}
      <p className="muted">Sin intereses y sin devolución.</p>
      <div className="row">
        <button aria-label="Menos" onClick={() => setCount((n) => Math.max(1, n - 1))}>
          −
        </button>
        <span className="money stepper-value">{count}</span>
        <button aria-label="Más" onClick={() => setCount((n) => n + 1)}>
          +
        </button>
      </div>
      <button className="primary" onClick={() => void run({ type: "takeLoan", company, count })}>
        Pedir {count} ({formatMoney(count * amount, ctx.game)})
      </button>
    </Sheet>
  );
}
