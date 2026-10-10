import { useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { CompanyId } from "../../domain/types";
import { formatMoney } from "../../domain/i18n/format";
import { mergePreview } from "../../domain/mechanics/custom/mergers";
import { operatingOrder } from "../../domain/mechanics/operatingOrder";
import { CompanyBadge } from "../components/CompanyBadge";
import { Sheet } from "../components/Sheet";

/**
 * The Merger Round (US7, contracts/ui.md "Merger sheet"): pick two minors in operating order, then
 * an unstarted major and its identity; the preview shows the president (and a tie broken by the
 * order), the shares, price, treasury and trains. At most 3 taps once the minors are chosen.
 */
export function MergerSheet({ onClose }: { onClose: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const [minors, setMinors] = useState<CompanyId[]>([]);
  const [into, setInto] = useState<CompanyId | null>(null);
  const [identity, setIdentity] = useState<"primary" | "alt">("primary");
  const game = meta.game;
  const def = (id: CompanyId) => game.companies.find((c) => c.id === id);
  const inPlay = operatingOrder(game, state).filter((id) => def(id)?.tier === "minor");
  const majors = game.companies.filter((c) => c.tier === "major" && state.companies[c.id]?.status === "unstarted");
  const [a, b] = minors;
  const preview = a && b ? mergePreview(game, meta.players, state, a, b) : undefined;
  const money = (n: number) => formatMoney(n, game);
  const holderLabel = (h: string) =>
    h === "treasury" ? "tesorería" : h === "pool" ? "pool" : (meta.players.find((p) => `player:${p.id}` === h)?.name ?? h);

  const toggleMinor = (id: CompanyId) =>
    setMinors((chosen) => (chosen.includes(id) ? chosen.filter((m) => m !== id) : [...chosen, id].slice(-2)));
  const merge = async () => {
    if (!a || !b || !into) return;
    const result = await dispatch({ type: "mergeCompanies", a, b, into, identity });
    if (result.ok) onClose();
  };
  const major = into ? def(into) : undefined;

  return (
    <Sheet title="Fusionar minors" onClose={onClose}>
      <div className="choice-grid" role="group" aria-label="Minors">
        {inPlay.map((id) => {
          const c = def(id);
          return c ? (
            <button key={id} aria-pressed={minors.includes(id)} onClick={() => toggleMinor(id)}>
              <CompanyBadge company={c} size="sm" />
            </button>
          ) : null;
        })}
      </div>
      <div className="choice-grid" role="group" aria-label="Corporación">
        {majors.map((c) => (
          <button
            key={c.id}
            aria-pressed={into === c.id}
            onClick={() => {
              setInto(c.id);
              setIdentity("primary");
            }}
          >
            {c.shortName} · {c.name}
            {c.altName ? ` / ${c.altName}` : ""}
          </button>
        ))}
      </div>
      {major?.altName ? (
        <div className="row" role="group" aria-label="Identidad">
          <button aria-pressed={identity === "primary"} onClick={() => setIdentity("primary")}>
            {major.name}
          </button>
          <button aria-pressed={identity === "alt"} onClick={() => setIdentity("alt")}>
            {major.altName}
          </button>
        </div>
      ) : null}
      {preview ? (
        <div className="stack merge-preview" data-testid="merge-preview">
          <p>
            Presidencia: {meta.players.find((p) => p.id === preview.president)?.name ?? "—"}
            {preview.tie ? <span className="badge">desempate por orden</span> : null}
          </p>
          <p>{preview.holdings.map(([h, units]) => `${holderLabel(h)} ${units}`).join(" · ")}</p>
          <p>
            Precio {money(preview.price)} · Tesorería {money(preview.treasury)} · {preview.trains.length}{" "}
            {preview.trains.length === 1 ? "tren" : "trenes"}
          </p>
          {preview.overLimit ? <p className="toast-warning">⚠ Supera el límite de trenes: tendrá que retirar uno.</p> : null}
        </div>
      ) : (
        <p className="muted">Elige dos minors.</p>
      )}
      <button className="primary big" disabled={!a || !b || !into} onClick={() => void merge()}>
        Fusionar
      </button>
    </Sheet>
  );
}
