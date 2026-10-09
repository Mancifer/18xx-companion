import { useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { COUNTER_LABELS, holderName } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import type { HolderRef } from "../../domain/types";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

/** One more tap before a big, many-step action (bankruptcy, receivership, closing). Undo still works. */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  action,
  onClose,
}: {
  title: ReactNode;
  body: ReactNode;
  confirmLabel: string;
  action: unknown;
  onClose: () => void;
}) {
  const { dispatch } = useDispatch();
  return (
    <Sheet title={title} onClose={onClose}>
      <p>{body}</p>
      <div className="row">
        <button onClick={onClose}>Cancelar</button>
        <span className="spacer" />
        <button
          className="primary danger"
          onClick={() =>
            void dispatch(action).then((r) => {
              if (r.ok) onClose();
            })
          }
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

const KEYS = ["debt", "eastWestTokens"] as const;

/** adjustCounter: a manual fix to debt, bonus tokens or any counter (FR-024). */
export function CounterSheet({ subject, initialKey = "debt", onClose }: { subject: HolderRef; initialKey?: string; onClose: () => void }) {
  const { meta } = useSession();
  const { dispatch } = useDispatch();
  const [key, setKey] = useState(initialKey);
  const [amount, setAmount] = useState<number | null>(null);
  const [negative, setNegative] = useState(false);
  const isMoney = key === "debt";
  const delta = (negative ? -1 : 1) * (amount ?? 0);
  return (
    <Sheet title={<>Ajustar contador · {holderName(subject, meta.game, meta.players)}</>} onClose={onClose}>
      <div className="row">
        {KEYS.map((k) => (
          <button key={k} aria-pressed={key === k} onClick={() => setKey(k)}>
            {COUNTER_LABELS[k] ?? k}
          </button>
        ))}
      </div>
      <div className="row">
        <button aria-pressed={!negative} onClick={() => setNegative(false)}>
          + Suma
        </button>
        <button aria-pressed={negative} onClick={() => setNegative(true)}>
          − Resta
        </button>
      </div>
      <Keypad value={amount} onChange={setAmount} game={isMoney ? meta.game : { currency: { symbol: "" } }} />
      <button
        className="primary"
        disabled={delta === 0}
        onClick={() =>
          void dispatch({ type: "adjustCounter", subject, key, delta }).then((r) => {
            if (r.ok) onClose();
          })
        }
      >
        Ajustar {isMoney ? formatMoney(delta, meta.game) : delta}
      </button>
    </Sheet>
  );
}
