import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { isPlayerBankrupt } from "../../domain/events/state";
import { formatMoney } from "../../domain/i18n/format";
import { launchPrice } from "../../domain/mechanics/market";
import type { CompanyId, PlayerId } from "../../domain/types";
import { ChipStrip } from "../components/ChipStrip";
import { CompanyBadge } from "../components/CompanyBadge";
import { Keypad } from "../components/Keypad";
import { Sheet } from "../components/Sheet";

/**
 * An auction win by touch (US2, contracts/ui.md "Launch sheet"): the player, the minor, the bid
 * (prefilled with the minimum), a live preview of price, treasury and shares, and one confirm.
 */
export function LaunchSheet({ companyId, onClose }: { companyId?: CompanyId; onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const game = meta.game;
  const money = (n: number) => formatMoney(n, game);
  const [player, setPlayer] = useState<PlayerId | null>(null);
  const [company, setCompany] = useState<CompanyId | null>(companyId ?? null);
  const [bid, setBid] = useState<number | null>(game.auction?.minBid ?? null);
  const [override, setOverride] = useState<number | null>(null);
  const [choosingPrice, setChoosingPrice] = useState(false);

  const minors = game.companies.filter(
    (c) => availabilityOf(ctx, "launchCompany", { type: "launchCompany", player: "", company: c.id, bid: 1, price: null }).ok,
  );
  const players = [...meta.players].sort((a, b) => a.seat - b.seat).filter((p) => !isPlayerBankrupt(state, p.id));
  const def = game.companies.find((c) => c.id === company);
  const result = bid !== null ? launchPrice(game, state, bid, override) : undefined;
  const shares = def ? def.shareCount - def.presidencyUnits : 0;
  const treasury = (bid ?? 0) - (def?.traits?.launchFee ?? 0);
  const prices = game.market.cells.flatMap((row) => row.flatMap((c) => (c && !c.tags?.includes("closed") ? [c.price] : [])));
  const playerName = meta.players.find((p) => p.id === player)?.name;

  const confirm = async () => {
    if (!player || !company || bid === null) return;
    const res = await dispatch({ type: "launchCompany", player, company, bid, price: override });
    if (res.ok) onClose();
  };

  return (
    <Sheet title="Abrir minor" onClose={onClose}>
      <fieldset className="choice-fieldset">
        <legend className="muted">Jugador</legend>
        <div className="choice-grid">
          {players.map((p) => (
            <button key={p.id} aria-pressed={player === p.id} onClick={() => setPlayer(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="choice-fieldset" aria-label="Minor">
        <legend className="muted">Minor</legend>
        <div className="choice-grid">
          {minors.map((c) => (
            <button key={c.id} aria-pressed={company === c.id} aria-label={`${c.shortName} ${c.name}`} onClick={() => setCompany(c.id)}>
              <CompanyBadge company={c} size="sm" /> {c.name}
            </button>
          ))}
        </div>
      </fieldset>
      <Keypad
        value={bid}
        onChange={(v) => {
          setBid(v);
          setOverride(null);
        }}
        game={game}
        label="Puja"
        quick={[5, 10, 50]}
      />
      {result ? (
        <div className="stack">
          <p className="row">
            <span data-testid="launch-preview">
              Precio {money(result.price)} · Tesorería {money(treasury)} · {shares} {shares === 1 ? "acción" : "acciones"} en tesorería
            </span>
          </p>
          <div className="row">
            <button aria-label={`Precio ${money(result.price)} (cambiar)`} onClick={() => setChoosingPrice((x) => !x)}>
              Precio {money(result.price)} ✎
            </button>
            {result.clamped ? <span className="badge warn">Tope de fase {money(result.price)}</span> : null}
          </div>
          {choosingPrice ? (
            <div className="choice-grid">
              {prices.map((p) => (
                <button
                  key={p}
                  aria-pressed={override === p}
                  onClick={() => {
                    setOverride(p);
                    setChoosingPrice(false);
                  }}
                >
                  {money(p)}
                </button>
              ))}
            </div>
          ) : null}
          {playerName && bid !== null && bid > 0 && meta.chipSet.chips.length > 0 ? (
            <ChipStrip
              flow={{ counterparty: `player:${player ?? ""}`, direction: "toBank", amount: bid }}
              set={meta.chipSet}
              game={game}
              label={`${playerName} entrega`}
            />
          ) : null}
        </div>
      ) : null}
      <button className="primary big" disabled={!player || !company || bid === null || bid <= 0} onClick={() => void confirm()}>
        Abrir
      </button>
    </Sheet>
  );
}
