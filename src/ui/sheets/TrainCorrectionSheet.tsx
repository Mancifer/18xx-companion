import { useMessageText } from "../useMessage";
import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { trainPrice } from "../../domain/actions/expand/operating";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";
import { trainsHeldBy, trainStack } from "../../domain/mechanics/phases";
import { trainTypeOf, type AssetId, type CompanyId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

type Destination = "bank" | "pool" | "removed";

/**
 * "Corregir trenes · PRR" (feature 011, contracts/ui.md §3): take back a train recorded by
 * mistake, to the supply (with the list price refunded by default), the pool or out of the game,
 * or give the company a train. Each choice dispatches one `correctTrain` at once.
 */
export function TrainCorrectionSheet({ companyId, onClose }: { companyId: CompanyId; onClose: () => void }) {
  const reasonText = useMessageText();
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const tx = useText().sheets.trainCorrection;
  const { lang } = useLang();
  const [picked, setPicked] = useState<AssetId | null>(null);
  const [refundOn, setRefundOn] = useState(true);
  const [refund, setRefund] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [payment, setPayment] = useState<number | null>(null);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const def = meta.game.companies.find((c) => c.id === companyId);
  if (!def) return null;
  const money = (n: number) => formatMoney(n, meta.game, lang);
  const listPrice = (trainType: string) => trainPrice(meta.game, { trainType, variant: null, from: "bank", price: null, tradeIn: null });
  const typeName = (type: string) => meta.game.trains.find((t) => t.type === type)?.displayName ?? type;

  const run = async (action: unknown) => {
    const result = await dispatch(action);
    if (result.ok) onClose();
  };
  const remove = (to: Destination) => {
    if (!picked) return;
    const amount = to !== "bank" ? null : refundOn ? refund : 0;
    void run({ type: "correctTrain", company: companyId, train: picked, op: "remove", to, amount });
  };
  const pickedType = picked ? trainTypeOf(picked) : undefined;
  const refundLabel = pickedType === undefined ? "" : refundOn ? tx.refundLabel(money(refund ?? listPrice(pickedType))) : tx.noRefund;

  return (
    <Sheet
      title={
        <>
          {tx.title[0]}
          <CompanyBadge company={def} size="inline" />
          {tx.title[1]}
        </>
      }
      onClose={onClose}>
      <fieldset className="choice-fieldset menu-section">
        <legend className="muted">{tx.removeOne}</legend>
        <div className="choice-grid">
          {trainsHeldBy(state, `company:${companyId}`).map((asset) => (
            <button key={asset} aria-pressed={picked === asset} onClick={() => setPicked(asset)}>
              {tx.removeThe(typeName(trainTypeOf(asset)))}
            </button>
          ))}
        </div>
        {picked ? (
          <>
            <div className="row">
              <label className="row checkbox">
                <input type="checkbox" checked={refundOn} onChange={(e) => setRefundOn(e.target.checked)} />
                {tx.refund}
              </label>
              <button className="ghost" aria-pressed={editing} disabled={!refundOn} onClick={() => setEditing((v) => !v)}>
                {tx.edit}
              </button>
            </div>
            {editing && refundOn ? <Keypad value={refund} onChange={setRefund} game={meta.game} label={tx.refundAmount} /> : null}
            <div className="choice-grid">
              <button className="primary" onClick={() => remove("bank")}>
                {tx.toBank}
                {refundLabel}
              </button>
              {meta.game.discardedTrainsTo === "pool" ? <button onClick={() => remove("pool")}>{tx.toPool}</button> : null}
              <button onClick={() => remove("removed")}>{tx.outOfGame}</button>
            </div>
          </>
        ) : null}
      </fieldset>
      <fieldset className="choice-fieldset menu-section">
        <legend className="muted">{tx.give}</legend>
        <Keypad value={payment} onChange={setPayment} game={meta.game} label={tx.payment} />
        <div className="choice-grid">
          {trainStack(meta.game, state).map((entry) => {
            const action = { type: "correctTrain", company: companyId, train: entry.type, op: "add", to: null, amount: payment } as const;
            const ok = availabilityOf(ctx, "correctTrain", action);
            return (
              <button key={entry.type} disabled={!ok.ok} title={ok.ok ? undefined : reasonText(ok.reason)} onClick={() => void run(action)}>
                {entry.displayName} · {money(listPrice(entry.type))}
              </button>
            );
          })}
        </div>
      </fieldset>
    </Sheet>
  );
}
