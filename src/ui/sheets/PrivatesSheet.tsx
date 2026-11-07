import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { formatMoney } from "../../i18n/format";
import { useLang, useText } from "../../app/language";
import { parPricesFor } from "../../domain/mechanics/market";
import { purchasablePrivates } from "../../domain/queries";
import { HolderName } from "../components/CompanyBadge";
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
  const t = useText().sheets.privates;
  const { lang } = useLang();
  const [chosen, setChosen] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [par, setPar] = useState<number | null>(null);
  const open = purchasablePrivates(meta.game, state);
  const def = meta.game.privates.find((p) => p.id === chosen);
  const ownerPar = def?.grants?.find((g) => g.par === "ownerChooses");

  return (
    <Sheet title={t.title} onClose={onClose}>
      {open.length === 0 ? <p className="muted">{t.none}</p> : null}
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
              {p.name} · {formatMoney(p.cost, meta.game, lang)}
              <span className="muted reason">
                <HolderName holder={holder} game={meta.game} players={meta.players} />
              </span>
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
          <Keypad value={price} onChange={setPrice} game={meta.game} label={t.pricePaid} />
          {ownerPar ? (
            <div className="choice-grid">
              {parPricesFor(meta.game, ownerPar.company).map((p) => (
                <button key={p} aria-pressed={par === p} onClick={() => setPar(p)}>
                  {t.par(formatMoney(p, meta.game, lang))}
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
            {t.buy}
          </button>
        </>
      ) : null}
    </Sheet>
  );
}
