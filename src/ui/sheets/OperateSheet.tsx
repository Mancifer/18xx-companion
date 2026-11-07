import { useMessageText } from "../useMessage";
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { forcedWithholdReason, tradeInProblem, trainPrice, zeroRunAction } from "../../domain/actions/expand/operating";
import { handlerFor } from "../../domain/actions/expand";
import type { ActionType } from "../../domain/actions/schemas";
import { cashOf, counterOf, presidentOf, unitsOf, type SessionState } from "../../domain/events/state";
import type { GameDefinition, NamedPayment, TrainDef } from "../../domain/games/schema";
import { useDomainText, useLang, useText } from "../../app/language";
import { gameText } from "../../i18n/gameText";
import { formatMoney } from "../../i18n/format";
import { CANYON, cliffKeyFor, ROCK } from "../../domain/mechanics/custom/landmarks";
import { nationalBankConfig, nationalMinDividend } from "../../domain/mechanics/custom/nationalBank";
import { priceOf } from "../../domain/mechanics/market";
import { operatingOrder } from "../../domain/mechanics/operatingOrder";
import { turnActivity } from "../../domain/queries";
import { overLimitCompanies, RUSTED, trainsHeldBy, trainStack } from "../../domain/mechanics/phases";
import { effectiveTraits } from "../../domain/mechanics/traits";
import { trainTypeOf, type CompanyId } from "../../domain/types";
import { TrainsLine } from "../components/TrainsLine";
import { CompanyBadge, CompanyName } from "../components/CompanyBadge";
import { RichText } from "../components/RichText";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

export type OperateView = "run" | "train" | "cost" | "bonus" | "payment" | "cliff" | "private" | "loan" | "discard" | "supply";
type View = OperateView;
type Amounts = Record<string, number | null>;

/** Whether the game offers an action at all (a mechanic it enables, or a core action its data gates). */
function offers(ctx: ActionContext, type: ActionType): boolean {
  const handler = handlerFor(ctx, type);
  return handler !== undefined && (handler.offered?.(ctx.game) ?? true);
}

/** This sheet's text, and the display language for money. */
function useOperateText() {
  const text = useText();
  const { lang } = useLang();
  return { tx: text.sheets.operate, text, lang };
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
  const reasonText = useMessageText();
  const { tx, text, lang } = useOperateText();
  const dt = useDomainText();
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
      <CompanyBadge company={def} /> {formatMoney(cashOf(state, ref), meta.game, lang)}
      {price !== undefined ? <span className="muted"> · {formatMoney(price, meta.game, lang)}</span> : null}
    </span>
  );
  const back = (
    <button className="ghost" onClick={() => setView("run")}>
      {tx.back}
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
      <Sheet title={<>{tx.cliff} · {title}</>} onClose={onClose}>
        {back}
        <div className="choice-grid">
          {trainsHeldBy(state, ref).map((asset) => (
            <button key={asset} onClick={() => void step({ type: "cliffSale", company: companyId, train: asset })}>
              {tx.sellTrain(trainTypeOf(asset))}
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
              {tx.discardOne(trainTypeOf(asset))}
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  if (view === "supply") {
    return (
      <Sheet title={tx.supply} onClose={onClose}>
        {back}
        <div className="choice-grid">
          {meta.game.trains
            .filter((t) => (t.reserve ?? 0) > 0)
            .flatMap((t) =>
              (["add", "remove"] as const).map((op) => {
                const action = { type: "changeTrainSupply", trainType: t.type, op } as const;
                const ok = availabilityOf(ctx, "changeTrainSupply", action);
                return (
                  <button key={`${t.type}-${op}`} disabled={!ok.ok} title={ok.ok ? undefined : reasonText(ok.reason)} onClick={() => void step(action)}>
                    {tx.supplyChange(op, t.type)}
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
    { view: "train", label: tx.buyTrain, show: true },
    { view: "cost", label: tx.payCost, show: true },
    { view: "bonus", label: tx.bankPays, show: true },
    { view: "private", label: tx.buyPrivate, show: meta.game.privates.length > 0 },
    {
      view: "loan",
      label: tx.loan,
      probe: { type: "takeLoan", company: companyId, count: 1 },
      show: offered("takeLoan"),
    },
    { view: "discard", label: tx.discardTrain, show: trainsHeldBy(state, ref).length > 0 },
    {
      view: "supply",
      label: tx.changeSupply,
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
          {tx.outOfTurn[0]}
          <CompanyName game={meta.game} id={turn.currentCompany} />
          {tx.outOfTurn[1]}
        </p>
      ) : null}
      {overLimit ? (
        <button className="over-limit" onClick={() => setView("discard")}>
          {text.table.overLimit(def.name, overLimit.count, overLimit.limit)}
        </button>
      ) : null}
      {inTurn ? (
        <div className="turn-summary">
          <span className="label">{tx.thisTurn}</span>
          {activity.groups.length === 0 ? (
            <p className="muted">—</p>
          ) : (
            <ul>
              {activity.groups.map((g) => (
                <li key={g.id}>
                  <RichText text={dt.summary(g.action, { ...ctx, marks: true }, g.events)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {activity.runRecorded ? (
        <p className="run-recorded">{tx.runRecorded}</p>
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
          <span>{tx.rustedLine(trainTypeOf(asset))}</span>
          <button onClick={() => void step({ type: "discardTrain", company: companyId, train: asset })}>
            {tx.retire(trainTypeOf(asset))}
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
              <button key={m.view} disabled={!ok.ok} title={ok.ok ? undefined : reasonText(ok.reason)} onClick={() => setView(m.view)}>
                {m.label}
                {ok.ok ? null : <span className="muted reason"> · {reasonText(ok.reason)}</span>}
              </button>
            );
          })}
        {onDetails ? <button onClick={onDetails}>{tx.details}</button> : null}
      </div>
      {inTurn ? (
        <div className="stack">
          <button className="primary big" disabled={!activity.canFinish} onClick={() => void finish()}>
            {tx.finishTurn}
            <NextLabel game={meta.game} state={state} company={companyId} />
          </button>
          {activity.canFinish ? null : <p className="muted">{tx.recordFirst}</p>}
        </div>
      ) : null}
    </Sheet>
  );
}

/** Who operates after this company: the next one in order, a new OR in the set, or the set's end. */
function NextLabel({ game, state, company }: { game: GameDefinition; state: SessionState; company: CompanyId }) {
  const { tx } = useOperateText();
  const next = operatingOrder(game, state).find((id) => id !== company && !state.turn.operatedThisOR.includes(id));
  if (next) return <CompanyName game={game} id={next} />;
  return <>{state.turn.orIndex < state.turn.orsInSet ? `OR ${state.turn.orSet}.${state.turn.orIndex + 1}` : tx.endOfSet}</>;
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
  const reasonText = useMessageText();
  const { tx, text, lang } = useOperateText();
  const partLabel = (id: string) => gameText(ctx.game, lang).revenuePart(id);
  const parts = ctx.game.revenueParts;
  const choice = parts.length === 1 && parts[0]?.to === "choice" ? parts[0] : undefined;
  const forcedReason = forcedWithholdReason(ctx, company);
  const forced = forcedReason ? reasonText(forcedReason) : undefined;

  if (choice) {
    const amount = amounts[choice.id] ?? null;
    return (
      <div className="stack">
        <Keypad value={amount} onChange={(v) => setAmounts({ [choice.id]: v })} game={ctx.game} label={partLabel(choice.id)} />
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
                {tx.modes[mode]}
              </button>
            );
          })}
          {noRun ? (
            <button className="big" onClick={noRun}>
              {tx.noRun}
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
            <span className="label">{partLabel(p.id)}</span>
            <span className="money">{amounts[p.id] != null ? formatMoney(amounts[p.id] ?? 0, ctx.game, lang) : "—"}</span>
          </button>
        ))}
      </div>
      {current ? (
        <Keypad
          value={amounts[current.id] ?? null}
          onChange={(v) => setAmounts((a) => ({ ...a, [current.id]: v }))}
          game={ctx.game}
          label={partLabel(current.id)}
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
        {text.common.confirm}
      </button>
      {noRun ? (
        <button className="big" onClick={noRun}>
          {tx.noRun}
        </button>
      ) : null}
    </div>
  );
}

function NationalPayout({ ctx, run }: { ctx: ActionContext; run: (action: unknown) => Promise<void> }) {
  const { tx, lang } = useOperateText();
  const [extra, setExtra] = useState<number | null>(0);
  const min = nationalMinDividend(ctx.game, ctx.state);
  if (!nationalBankConfig(ctx.game)) return null;
  return (
    <div className="stack">
      <p className="muted">{tx.nationalMin(formatMoney(min, ctx.game, lang))}</p>
      <Keypad value={extra} onChange={setExtra} game={ctx.game} label={tx.cityExtra} />
      <button className="primary big" onClick={() => void run({ type: "nationalPayout", extra: extra ?? 0 })}>
        {tx.payDividend(formatMoney(min + (extra ?? 0), ctx.game, lang))}
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
  const { tx, lang } = useOperateText();
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
    const cost = formatMoney(trainPrice(ctx.game, action, ctx.state), ctx.game, lang);
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
    <Sheet title={<>{tx.buyTrain} · {title}</>} onClose={onClose}>
      {back}
      <ForcedPurchaseCard ctx={ctx} company={company} run={run} />
      <h3>{tx.fromBank}</h3>
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
                    {tx.tradeInOpen(tradeVariant ?? "")}
                  </button>,
                );
              }
              if (tradeInFor === t.type) {
                for (const from of froms) buttons.push(option(t, "bank", tradeVariant, from, tx.tradeInWith(tradeVariant ?? "", from)));
              }
            } else {
              for (const from of t.tradeIn?.fromTypes ?? []) {
                if (trainsHeldBy(ctx.state, ref, from).length > 0) {
                  buttons.push(option(t, "bank", tradeVariant, from, tx.tradeInWith(tradeVariant ?? t.type, from)));
                }
              }
            }
            return buttons;
          })}
      </div>
      {ctx.game.trains.some((t) => trainsHeldBy(ctx.state, "pool", t.type).length > 0) ? (
        <>
          <h3>{tx.fromPool}</h3>
          <div className="choice-grid">{ctx.game.trains.map((t) => option(t, "pool", null, null, t.type))}</div>
        </>
      ) : null}
      {others.length > 0 ? (
        <>
          <h3>{tx.fromCompany}</h3>
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
              <Keypad value={price} onChange={setPrice} game={ctx.game} label={tx.agreedPrice} />
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
                {tx.buy}
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
  const { tx, lang } = useOperateText();
  const [counts, setCounts] = useState<Partial<Record<CompanyId, number>>>({});
  const ref = `company:${company}` as const;
  const president = presidentOf(ctx.state, company);
  const top = trainStack(ctx.game, ctx.state)[0];
  const train = top ? ctx.game.trains.find((t) => t.type === top.type) : undefined;
  if (!offers(ctx, "forcedTrainPurchase") || !president || !train || trainsHeldBy(ctx.state, ref).length > 0) return null;
  const cost = trainPrice(ctx.game, { trainType: train.type, variant: null, from: "bank", price: null, tradeIn: null }, ctx.state);
  const cash = cashOf(ctx.state, ref);
  if (cash >= cost) return null;
  const money = (n: number) => formatMoney(n, ctx.game, lang);
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
    <fieldset className="forced-purchase stack" aria-label={tx.forced}>
      <legend>{tx.forced}</legend>
      <p>
        {tx.forcedPuts(presidentName, money(shortfall), money(presidentCash))}
        {proceeds > 0 ? tx.forcedProceeds(money(proceeds)) : null}
        {missing > 0 ? <span className="toast-warning">{tx.forcedMissing(money(missing))}</span> : null}
      </p>
      {holdings.length > 0 ? (
        <ul className="forced-sales stack" aria-label={tx.sharesOf(presidentName)}>
          {holdings.map((h) => {
            const count = counts[h.company.id] ?? 0;
            return (
              <li key={h.company.id} className="row">
                <span>
                  <CompanyBadge company={h.company} size="sm" /> {(h.units * 100) / h.company.shareCount}% · {money(h.price)}
                </span>
                <button
                  aria-label={tx.sellOneLess(h.company.shortName)}
                  disabled={count === 0}
                  onClick={() => setCount(h.company.id, count - 1)}
                >
                  −
                </button>
                <span className="money stepper-value" aria-label={tx.toSell(h.company.shortName)}>
                  {count}
                </span>
                <button
                  aria-label={tx.sellOneMore(h.company.shortName)}
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
        <p>{tx.noSharesToSell(presidentName)}</p>
      )}
      <button
        className="primary"
        onClick={() => void run({ type: "forcedTrainPurchase", company, trainType: train.type, variant: null, from: "bank", sales })}
      >
        {tx.buyThe(top?.displayName ?? train.type, money(cost))}
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
  const { tx, lang } = useOperateText();
  const { meta } = useSession();
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const isCost = kind === "cost";
  return (
    <Sheet title={<>{isCost ? tx.payCost : tx.bankPays} · {title}</>} onClose={onClose}>
      {back}
      <Keypad value={amount} onChange={setAmount} game={meta.game} />
      <label className="field-row">
        <span className="label">{tx.reason}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isCost ? tx.optional : tx.required} />
      </label>
      {isCost ? (
        <div className="row">
          {tx.costReasons.map((r) => (
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
        {isCost ? tx.pay : tx.collect} {amount !== null ? formatMoney(amount, meta.game, lang) : ""}
      </button>
    </Sheet>
  );
}

/** "Montaña (−40 / +60)", "Ficha extra (−40)", "Sede (+…)": the label of a company ability's money. */
function paymentLabel(p: NamedPayment, name: string): string {
  if (p.cost) return `${name} (−${p.cost} / +${p.amount})`;
  if (p.amount === 0) return `${name} (${p.direction === "bankPays" ? "+" : "−"}…)`;
  return `${name} (${p.direction === "bankPays" ? "+" : "−"}${p.amount})`;
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
  const reasonText = useMessageText();
  const { tx, lang } = useOperateText();
  const chips: { key: string; label: string; action: { type: ActionType } & Record<string, unknown> }[] = [];
  if (offers(ctx, "issueShares")) chips.push({ key: "issue", label: tx.issue, action: { type: "issueShares", company, count: 1 } });
  if (offers(ctx, "redeemShare")) chips.push({ key: "redeem", label: tx.redeem, action: { type: "redeemShare", company, count: null } });
  const payments = effectiveTraits(ctx.game, ctx.state, company).payments ?? [];
  if (chips.length === 0 && payments.length === 0) return null;
  return (
    <div className="row ability-chips">
      {chips.map((c) => {
        const ok = availabilityOf(ctx, c.action.type, c.action as never);
        return (
          <button key={c.key} disabled={!ok.ok} title={ok.ok ? undefined : reasonText(ok.reason)} onClick={() => void run(c.action)}>
            {c.label}
            {ok.ok ? null : <span className="muted reason"> · {reasonText(ok.reason)}</span>}
          </button>
        );
      })}
      {payments.map((p) => (
        <button
          key={p.id}
          onClick={() => (p.amount === 0 ? onAmount(p.id) : void run({ type: "namedPayment", company, payment: p.id, amount: null }))}
        >
          {paymentLabel(p, gameText(ctx.game, lang).payment(p.id, p.labelEs))}
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
  const { tx } = useOperateText();
  if (!offers(ctx, "rockFormation")) return null;
  const ref = `company:${company}` as const;
  const used = (key: string) => counterOf(ctx.state, ref, key) > 0;
  const chips = [
    { key: "rock", label: tx.rock, used: used(ROCK), act: () => void run({ type: "rockFormation", company }) },
    {
      key: "cliff",
      label: tx.cliff,
      used: used(cliffKeyFor(ctx.state.turn)),
      act: onCliff,
    },
    { key: "canyon", label: tx.canyon, used: used(CANYON), act: () => void run({ type: "canyonTrain", company }) },
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
          {c.used ? tx.alreadyUsed : ""}
        </button>
      ))}
    </div>
  );
}

/** A named payment whose amount is entered at use (Sede: half the city's printed value). */
function PaymentView({ ctx, company, payment, title, back, onClose, run }: ViewProps & { payment: string }) {
  const { tx, lang } = useOperateText();
  const [amount, setAmount] = useState<number | null>(null);
  const def = effectiveTraits(ctx.game, ctx.state, company).payments?.find((p) => p.id === payment);
  const bankPays = def?.direction !== "companyPays";
  return (
    <Sheet title={<>{gameText(ctx.game, lang).payment(payment, def?.labelEs)} · {title}</>} onClose={onClose}>
      {back}
      <Keypad value={amount} onChange={setAmount} game={ctx.game} />
      <button
        className="primary"
        disabled={amount === null || amount <= 0}
        onClick={() => void run({ type: "namedPayment", company, payment, amount })}
      >
        {bankPays ? tx.collect : tx.pay} {amount !== null ? formatMoney(amount, ctx.game, lang) : ""}
      </button>
    </Sheet>
  );
}

function PrivateView({ ctx, company, title, back, onClose, run }: ViewProps) {
  const { tx, lang } = useOperateText();
  const [chosen, setChosen] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const choices = ctx.game.privates.filter((p) => {
    const holder = ctx.state.assets[`private:${p.id}`];
    return holder !== undefined && holder !== "removed" && holder !== `company:${company}`;
  });
  return (
    <Sheet title={<>{tx.buyPrivate} · {title}</>} onClose={onClose}>
      {back}
      <div className="choice-grid">
        {choices.map((p) => (
          <button key={p.id} aria-pressed={chosen === p.id} onClick={() => setChosen(p.id)}>
            {p.name} ({formatMoney(p.cost, ctx.game, lang)})
          </button>
        ))}
      </div>
      {chosen ? (
        <>
          <Keypad value={price} onChange={setPrice} game={ctx.game} label={tx.price} />
          <button
            className="primary"
            disabled={price === null || price <= 0}
            onClick={() => void run({ type: "buyPrivateByCompany", company, private: chosen, price })}
          >
            {tx.buy} {price !== null ? formatMoney(price, ctx.game, lang) : ""}
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

function LoanView({ ctx, company, title, back, onClose, run }: ViewProps) {
  const { tx, lang } = useOperateText();
  const [count, setCount] = useState(1);
  const amount = ctx.game.loans?.amount ?? 0;
  return (
    <Sheet title={<>{tx.loan} · {title}</>} onClose={onClose}>
      {back}
      <p className="muted">{tx.loanNote}</p>
      <div className="row">
        <button aria-label={tx.less} onClick={() => setCount((n) => Math.max(1, n - 1))}>
          −
        </button>
        <span className="money stepper-value">{count}</span>
        <button aria-label={tx.more} onClick={() => setCount((n) => n + 1)}>
          +
        </button>
      </div>
      <button className="primary" onClick={() => void run({ type: "takeLoan", company, count })}>
        {tx.takeLoans(count, formatMoney(count * amount, ctx.game, lang))}
      </button>
    </Sheet>
  );
}
