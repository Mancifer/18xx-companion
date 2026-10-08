import { useState, type ReactNode } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { cashOf, unitsOf } from "../../domain/events/state";
import { holderName } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import type { CompanyId, HolderRef } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

type Mode = "menu" | "pay" | "receive" | "set" | "shares";

/**
 * Manual adjustments for one holder (FR-024): pay, receive from the bank, set a value, and
 * move shares. Each confirmation dispatches exactly one action.
 */
export function HolderSheet({
  holder,
  title,
  onClose,
  info,
  extraActions,
}: {
  holder: HolderRef;
  title: ReactNode;
  onClose: () => void;
  info?: ReactNode;
  extraActions?: ReactNode;
}) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const [mode, setMode] = useState<Mode>("menu");
  const [amount, setAmount] = useState<number | null>(null);
  const [target, setTarget] = useState<HolderRef | null>(null);
  const ctx = { game: meta.game, players: meta.players };
  const name = (h: HolderRef) => holderName(h, meta.game, meta.players);
  const toName = (h: HolderRef) => (h === "bank" ? "al banco" : `a ${name(h)}`);

  const moneyTargets: HolderRef[] = (
    [
      "bank",
      ...meta.players.map((p) => `player:${p.id}` as const),
      ...meta.game.companies.map((c) => `company:${c.id}` as const),
    ] satisfies HolderRef[]
  ).filter((h) => h !== holder);

  const run = async (action: unknown) => {
    const result = await dispatch(action);
    if (result.ok) onClose();
  };

  if (mode === "pay") {
    return (
      <Sheet title={<>Pagar desde {title}</>} onClose={onClose}>
        <ChoiceGrid label="A quién" options={moneyTargets} value={target} onChange={setTarget} render={name} />
        <Keypad value={amount} onChange={setAmount} game={meta.game} />
        <button
          className="primary"
          disabled={amount === null || amount <= 0 || target === null}
          onClick={() => void run({ type: "transferMoney", from: holder, to: target, amount })}
        >
          Pagar {amount !== null ? formatMoney(amount, meta.game) : ""} {target ? toName(target) : ""}
        </button>
      </Sheet>
    );
  }

  if (mode === "receive") {
    return (
      <Sheet title={<>{title} cobra del banco</>} onClose={onClose}>
        <Keypad value={amount} onChange={setAmount} game={meta.game} />
        <button
          className="primary"
          disabled={amount === null || amount <= 0}
          onClick={() => void run({ type: "transferMoney", from: "bank", to: holder, amount })}
        >
          Cobrar {amount !== null ? formatMoney(amount, meta.game) : ""}
        </button>
      </Sheet>
    );
  }

  if (mode === "set") {
    return (
      <Sheet title={<>Fijar dinero de {title}</>} onClose={onClose}>
        <p className="muted">Ahora: {formatMoney(cashOf(state, holder), meta.game)}</p>
        <Keypad value={amount} onChange={setAmount} game={meta.game} label="Nuevo valor" />
        <button
          className="primary"
          disabled={amount === null}
          onClick={() => void run({ type: "adjustMoney", holder, delta: null, setTo: amount })}
        >
          Fijar en {amount !== null ? formatMoney(amount, meta.game) : "…"}
        </button>
      </Sheet>
    );
  }

  if (mode === "shares") {
    return <SharesForm holder={holder} title={title} onClose={onClose} onDone={run} ctx={ctx} />;
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {info}
      <div className="choice-grid">
        <button onClick={() => setMode("pay")}>Pagar…</button>
        <button onClick={() => setMode("receive")}>Cobrar del banco</button>
        <button onClick={() => setMode("set")}>Fijar dinero</button>
        <button onClick={() => setMode("shares")}>Mover acciones</button>
        {extraActions}
      </div>
    </Sheet>
  );
}

function SharesForm({
  holder,
  title,
  onClose,
  onDone,
  ctx,
}: {
  holder: HolderRef;
  title: ReactNode;
  onClose: () => void;
  onDone: (action: unknown) => Promise<void>;
  ctx: { game: ReturnType<typeof useSession>["meta"]["game"]; players: ReturnType<typeof useSession>["meta"]["players"] };
}) {
  const { state } = useSession();
  const [company, setCompany] = useState<CompanyId | null>(null);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [other, setOther] = useState<HolderRef | null>(null);
  const [count, setCount] = useState(1);
  const [presidency, setPresidency] = useState(false);
  const name = (h: HolderRef) => holderName(h, ctx.game, ctx.players);
  const others: HolderRef[] = company
    ? ([
        `ipo:${company}`,
        "pool",
        ...ctx.players.map((p) => `player:${p.id}` as const),
        ...ctx.game.companies.map((c) => `company:${c.id}` as const),
        "removed",
      ] satisfies HolderRef[]).filter((h) => h !== holder)
    : [];
  const from = direction === "in" ? other : holder;
  const to = direction === "in" ? holder : other;

  return (
    <Sheet title={<>Mover acciones · {title}</>} onClose={onClose}>
      <div className="choice-grid">
        {ctx.game.companies.map((c) => (
          <button key={c.id} aria-pressed={company === c.id} onClick={() => setCompany(c.id)}>
            <CompanyBadge company={c} size="sm" /> {unitsOf(state, holder, c.id)}
          </button>
        ))}
      </div>
      {company ? (
        <>
          <div className="row">
            <button aria-pressed={direction === "in"} onClick={() => setDirection("in")}>
              Recibe de…
            </button>
            <button aria-pressed={direction === "out"} onClick={() => setDirection("out")}>
              Entrega a…
            </button>
          </div>
          <ChoiceGrid
            label={direction === "in" ? "De" : "A"}
            options={others}
            value={other}
            onChange={setOther}
            render={(h) => `${name(h)} (${unitsOf(state, h, company)})`}
          />
          <div className="row">
            <button aria-label="Menos" onClick={() => setCount((n) => Math.max(1, n - 1))}>
              −
            </button>
            <span className="money stepper-value">{count}</span>
            <button aria-label="Más" onClick={() => setCount((n) => n + 1)}>
              +
            </button>
            <label className="row checkbox">
              <input type="checkbox" checked={presidency} onChange={(e) => setPresidency(e.target.checked)} />
              Incluye presidencia
            </label>
          </div>
          <button
            className="primary"
            disabled={!from || !to}
            onClick={() =>
              void onDone({ type: "transferShares", company, from, to, units: count, presidency: presidency || null })
            }
          >
            Mover {count}
          </button>
        </>
      ) : null}
    </Sheet>
  );
}

export function ChoiceGrid<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  render: (value: T) => ReactNode;
}) {
  return (
    <fieldset className="choice-fieldset">
      <legend className="muted">{label}</legend>
      <div className="choice-grid">
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}>
            {render(o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
