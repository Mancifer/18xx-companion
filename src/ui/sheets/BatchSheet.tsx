import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { batchItemPrices } from "../../domain/actions/expand/stock";
import type { ActionOf } from "../../domain/actions/schemas";
import { summaryEs } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { parPricesFor } from "../../domain/mechanics/market";
import type { CompanyId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Keypad } from "../components/Keypad";
import { RichText } from "../components/RichText";
import { Sheet } from "../components/Sheet";

type Item = ActionOf<"stockBatch">["items"][number];
type Kind = "buyIpo" | "buyPool" | "sell" | "par";

const KIND_LABEL: Readonly<Record<Kind, string>> = {
  buyIpo: "Compra IPO",
  buyPool: "Compra pool",
  sell: "Venta",
  par: "Apertura",
};

/**
 * Batch entry (FR-042, US4-5): rows in the order they happened, each with the price assumed at
 * that point (editable), shown on one card and recorded as one group.
 */
export function BatchSheet({ onClose }: { onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const [items, setItems] = useState<Item[]>([]);
  const [assumed, setAssumed] = useState<(number | null)[]>([]);
  const [draft, setDraft] = useState<{ kind: Kind; player: string | null; company: CompanyId | null; count: number; par: number | null } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const prices = batchItemPrices(ctx, items, assumed);
  const summaryCtx = { game: meta.game, players: meta.players, state, marks: true as const };
  const batch = { type: "stockBatch", items, assumedPrices: assumed } as const;
  const ok = items.length > 0 ? availabilityOf(ctx, "stockBatch", batch as never) : { ok: false as const, reasonEs: "" };

  if (editing !== null) {
    return (
      <PriceEditor
        value={prices[editing] ?? null}
        onDone={(v) => {
          setAssumed((a) => a.map((x, i) => (i === editing ? v : x)));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    );
  }

  if (draft) {
    const complete = draft.player !== null && draft.company !== null && (draft.kind !== "par" || draft.par !== null);
    const add = () => {
      if (!draft.player || !draft.company) return;
      const item: Item =
        draft.kind === "par"
          ? { type: "parCompany", player: draft.player, company: draft.company, price: draft.par ?? 0 }
          : draft.kind === "sell"
            ? { type: "sellShares", seller: `player:${draft.player}`, company: draft.company, count: draft.count }
            : {
                type: "buyShare",
                buyer: `player:${draft.player}`,
                company: draft.company,
                source: draft.kind === "buyIpo" ? "ipo" : "pool",
                count: draft.count,
              };
      setItems((xs) => [...xs, item]);
      setAssumed((xs) => [...xs, null]);
      setDraft(null);
    };
    return (
      <Sheet title={KIND_LABEL[draft.kind]} onClose={() => setDraft(null)}>
        <div className="choice-grid">
          {meta.players.map((p) => (
            <button key={p.id} aria-pressed={draft.player === p.id} onClick={() => setDraft({ ...draft, player: p.id })}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="choice-grid">
          {meta.game.companies.map((c) => (
            <button key={c.id} aria-pressed={draft.company === c.id} onClick={() => setDraft({ ...draft, company: c.id })}>
              <CompanyBadge company={c} size="sm" />
            </button>
          ))}
        </div>
        {draft.kind === "par" && draft.company ? (
          <div className="choice-grid">
            {parPricesFor(meta.game, draft.company).map((p) => (
              <button key={p} aria-pressed={draft.par === p} onClick={() => setDraft({ ...draft, par: p })}>
                {formatMoney(p, meta.game)}
              </button>
            ))}
          </div>
        ) : draft.kind !== "par" ? (
          <div className="row">
            <button aria-label="Menos" onClick={() => setDraft({ ...draft, count: Math.max(1, draft.count - 1) })}>
              −
            </button>
            <span className="money stepper-value">{draft.count}</span>
            <button aria-label="Más" onClick={() => setDraft({ ...draft, count: draft.count + 1 })}>
              +
            </button>
          </div>
        ) : null}
        <button className="primary" disabled={!complete} onClick={add}>
          Añadir fila
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Lote de acciones" onClose={onClose}>
      <ol className="batch-rows">
        {items.map((item, i) => (
          <li key={i} className="batch-row">
            <span>
              <RichText text={summaryEs(item, summaryCtx)} />
            </span>
            <button className="money" aria-label={`Precio de la fila ${i + 1}`} onClick={() => setEditing(i)}>
              {prices[i] !== undefined ? formatMoney(prices[i], meta.game) : "—"}
              {assumed[i] !== null && assumed[i] !== undefined ? " ✎" : ""}
            </button>
            <button
              aria-label={`Quitar la fila ${i + 1}`}
              onClick={() => {
                setItems((xs) => xs.filter((_, j) => j !== i));
                setAssumed((xs) => xs.filter((_, j) => j !== i));
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <div className="choice-grid">
        {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
          <button key={kind} onClick={() => setDraft({ kind, player: null, company: null, count: 1, par: null })}>
            + {KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      {!ok.ok && items.length > 0 ? <p className="toast-warning">{ok.reasonEs}</p> : null}
      <button
        className="primary big"
        disabled={!ok.ok}
        onClick={() =>
          void dispatch(batch).then((r) => {
            if (r.ok) onClose();
          })
        }
      >
        Anotar el lote ({items.length})
      </button>
    </Sheet>
  );
}

function PriceEditor({ value, onDone, onClose }: { value: number | null; onDone: (v: number | null) => void; onClose: () => void }) {
  const { meta } = useSession();
  const [price, setPrice] = useState<number | null>(value);
  return (
    <Sheet title="Precio supuesto" onClose={onClose}>
      <Keypad value={price} onChange={setPrice} game={meta.game} label="Precio" />
      <div className="row">
        <button onClick={() => onDone(null)}>Precio del momento</button>
        <span className="spacer" />
        <button className="primary" disabled={price === null || price <= 0} onClick={() => onDone(price)}>
          Listo
        </button>
      </div>
    </Sheet>
  );
}
