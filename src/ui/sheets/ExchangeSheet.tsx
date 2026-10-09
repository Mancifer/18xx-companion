import { useDispatch, useSession } from "../../app/useSession";
import { availabilityOf } from "../../domain/actions/availability";
import type { PlayerId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";

/** privateGrants exchanges (1830 MH for a NYC share, 21Moon P6 for any pool share), closing the private. */
export function ExchangeSheet({ player, onClose }: { player: PlayerId; onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const ctx = { game: meta.game, players: meta.players, state };
  const owned = meta.game.privates.filter((p) => p.exchange && state.assets[`private:${p.id}`] === `player:${player}`);

  const options = owned.flatMap((p) => {
    const exchange = p.exchange;
    if (!exchange) return [];
    const companies = exchange.company === "*" ? meta.game.companies.map((c) => c.id) : [exchange.company];
    const sources = exchange.source === "ipoOrPool" ? (["ipo", "pool"] as const) : [exchange.source];
    return companies.flatMap((company) =>
      sources.map((source) => {
        const action = {
          type: "exchangePrivate",
          private: p.id,
          source,
          company: exchange.company === "*" ? company : null,
        } as const;
        return { key: `${p.id}-${company}-${source}`, p, company, source, action, ok: availabilityOf(ctx, "exchangePrivate", action).ok };
      }),
    );
  });

  return (
    <Sheet title="Canjear privada" onClose={onClose}>
      <div className="choice-grid">
        {options
          .filter((o) => o.ok)
          .map((o) => {
            const company = meta.game.companies.find((c) => c.id === o.company);
            return (
              <button
                key={o.key}
                onClick={() =>
                  void dispatch(o.action).then((r) => {
                    if (r.ok) onClose();
                  })
                }
              >
                {o.p.name} → {company ? <CompanyBadge company={company} size="sm" /> : o.company} {o.source === "ipo" ? "de la IPO" : "del pool"}
              </button>
            );
          })}
      </div>
      {options.every((o) => !o.ok) ? <p className="muted">No hay acciones disponibles para canjear.</p> : null}
    </Sheet>
  );
}
