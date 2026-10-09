import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { privateResaleOpen } from "../../domain/actions/expand/stock";
import { holderName } from "../../domain/i18n/es";
import { formatMoney } from "../../domain/i18n/format";
import { parPricesFor } from "../../domain/mechanics/market";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

/**
 * Private purchases by players (US4): the initial sale (PRIVATES round) and, where the game allows
 * it, later deals between players (privateResaleOpen), at the price actually paid. A private that
 * grants a presidency asks for the par price (1830 BO).
 */
export function PrivatesSheet({ onClose }: { onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const [chosen, setChosen] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [par, setPar] = useState<number | null>(null);
  const resale = privateResaleOpen(meta.game, state);
  const open = meta.game.privates.filter((p) => {
    const holder = state.assets[`private:${p.id}`] ?? "bank";
    return holder !== "removed" && (holder === "bank" || resale);
  });
  const def = meta.game.privates.find((p) => p.id === chosen);
  const ownerPar = def?.grants?.find((g) => g.par === "ownerChooses");

  return (
    <Sheet title="Comprar privada" onClose={onClose}>
      <div className="choice-grid">
        {open.map((p) => {
          const holder = state.assets[`private:${p.id}`] ?? "bank";
          return (
            <button
              key={p.id}
              aria-pressed={chosen === p.id}
              onClick={() => {
                setChosen(p.id);
                setPrice(p.cost);
                setPar(null);
              }}
            >
              {p.name} · {formatMoney(p.cost, meta.game)}
              <span className="muted reason">{holderName(holder, meta.game, meta.players)}</span>
            </button>
          );
        })}
      </div>
      {def ? (
        <>
          <div className="choice-grid">
            {meta.players.map((p) => (
              <button key={p.id} aria-pressed={buyer === p.id} onClick={() => setBuyer(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
          <Keypad value={price} onChange={setPrice} game={meta.game} label="Precio pagado" />
          {ownerPar ? (
            <div className="choice-grid">
              {parPricesFor(meta.game, ownerPar.company).map((p) => (
                <button key={p} aria-pressed={par === p} onClick={() => setPar(p)}>
                  Salida {formatMoney(p, meta.game)}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="primary"
            disabled={buyer === null || price === null}
            onClick={() =>
              void dispatch({ type: "buyPrivate", buyer, private: def.id, price, par }).then((r) => {
                if (r.ok) onClose();
              })
            }
          >
            Comprar
          </button>
        </>
      ) : null}
    </Sheet>
  );
}
