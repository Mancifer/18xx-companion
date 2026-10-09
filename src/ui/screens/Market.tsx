import { useEffect, useRef, useState } from "react";
import { useDispatch, useSession } from "../../app/useSession";
import type { CompanyDef } from "../../domain/games/schema";
import { formatMoney } from "../../domain/i18n/format";
import { cellEquals, type CellRef, type CompanyId } from "../../domain/types";
import { CompanyBadge } from "../components/CompanyBadge";
import { UndoToast } from "../components/UndoToast";
import { useNav } from "../nav";

const TAG_LABEL: Readonly<Record<string, string>> = {
  par: "salida",
  receivership: "administración",
  closed: "cerrada",
  top: "fin",
  noUp: "techo",
};

/**
 * The market (FR-052): the grid with each company's token (stacked by arrival), 1-D tracks such
 * as the 1848 BoE, and manual moves by dragging a token or by tapping it and then a cell. Every
 * move is a recorded `setMarket` (US7-3), so cell effects (receivership, closed) still apply.
 */
export function Market() {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const { go } = useNav();
  const [selected, setSelected] = useState<CompanyId | null>(null);
  const dragging = useRef<CompanyId | null>(null);
  const game = meta.game;

  const place = (company: CompanyId, cell: CellRef) => {
    setSelected(null);
    if (cellEquals(state.companies[company]?.position, cell)) return;
    void dispatch({ type: "setMarket", company, cell });
  };

  // Drag: the pointer goes down on a token and up over a cell (touch keeps the target, so the
  // cell is found from the point).
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const company = dragging.current;
      dragging.current = null;
      if (!company) return;
      // Not every environment can hit-test (jsdom); then only tap-to-place is available.
      if (typeof document.elementFromPoint !== "function") return;
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell]");
      const raw = target?.dataset["cell"];
      if (!raw) return;
      const cell = JSON.parse(raw) as CellRef;
      // A tap on a token ends on its own cell: that is a selection, not a move.
      if (!cellEquals(state.companies[company]?.position, cell)) place(company, cell);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  });

  const tokensAt = (cell: CellRef): CompanyDef[] =>
    game.companies
      .filter((c) => cellEquals(state.companies[c.id]?.position, cell))
      .sort((a, b) => (state.companies[a.id]?.stackOrder ?? 0) - (state.companies[b.id]?.stackOrder ?? 0));

  const token = (c: CompanyDef) => (
    <button
      key={c.id}
      className="market-token"
      aria-label={`Ficha ${c.shortName}`}
      aria-pressed={selected === c.id}
      onPointerDown={() => {
        dragging.current = c.id;
      }}
      onClick={(e) => {
        e.stopPropagation();
        setSelected((s) => (s === c.id ? null : c.id));
      }}
    >
      <CompanyBadge company={c} size="sm" />
    </button>
  );

  const cellView = (cell: CellRef, price: number, extraClass: string, label: string) => (
    <div
      key={JSON.stringify(cell)}
      className={`market-cell ${extraClass}${selected ? " placeable" : ""}`}
      data-cell={JSON.stringify(cell)}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => {
        if (selected) place(selected, cell);
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && selected) place(selected, cell);
      }}
    >
      <span className="market-price">{price > 0 ? formatMoney(price, game) : ""}</span>
      <span className="market-tokens">{tokensAt(cell).map(token)}</span>
    </div>
  );

  const width = Math.max(...game.market.cells.map((r) => r.length));
  const unplaced = game.companies.filter((c) => !state.companies[c.id]?.position && state.companies[c.id]?.status !== "unstarted");

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label="Volver" onClick={() => go({ name: "table" })}>
          ←
        </button>
        <h1 className="topbar-center">Mercado</h1>
      </header>
      <div className="screen-body">
        <p className="muted">
          {selected
            ? `Toca la casilla a la que mover ${game.companies.find((c) => c.id === selected)?.shortName ?? selected}.`
            : "Arrastra una ficha, o tócala y después toca una casilla."}
        </p>
        <div className="market-scroll">
          <div className="market-grid" style={{ gridTemplateColumns: `repeat(${width}, minmax(56px, 1fr))` }}>
            {game.market.cells.flatMap((row, r) =>
              Array.from({ length: width }, (_, c) => {
                const cell = row[c];
                if (!cell) return <div key={`${r}-${c}`} className="market-gap" aria-hidden="true" />;
                const tags = cell.tags ?? [];
                const classes = [cell.zone ? `zone-${cell.zone}` : "", ...tags.map((t) => `tag-${t}`)].join(" ");
                const tagText = tags.map((t) => TAG_LABEL[t] ?? t).join(", ");
                const label = `Casilla ${tags.includes("receivership") ? "administración" : tags.includes("closed") ? "cerrada" : formatMoney(cell.price, game)} (fila ${r + 1}, columna ${c + 1})${tagText ? `, ${tagText}` : ""}`;
                return cellView({ row: r, col: c }, cell.price, classes, label);
              }),
            )}
          </div>
        </div>
        {Object.entries(game.market.tracks ?? {}).map(([company, track]) => (
          <section key={company} className="stack">
            <h2>{game.companies.find((c) => c.id === company)?.name ?? company}</h2>
            <div className="market-scroll">
              <div className="market-track">
                {[track.startPrice, ...track.byLoansIssued].map((price, index) =>
                  cellView(
                    { index },
                    price,
                    index - 1 === track.endGameAtIndex ? "tag-top" : "",
                    `Casilla ${formatMoney(price, game)} (posición ${index})`,
                  ),
                )}
              </div>
            </div>
          </section>
        ))}
        {unplaced.length > 0 ? (
          <section className="stack">
            <h2>Sin ficha en el mercado</h2>
            <div className="row">{unplaced.map(token)}</div>
          </section>
        ) : null}
      </div>
      <UndoToast />
    </main>
  );
}
