import { useState, type ReactNode } from "react";
import { useAppActions } from "../../app/AppProvider";
import { useSession } from "../../app/useSession";
import { useWakeLock } from "../../app/wakeLock";
import type { CompanyId, PlayerId } from "../../domain/types";
import { CompanyCard } from "../components/CompanyCard";
import { PlayerTile } from "../components/PlayerTile";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { UndoToast } from "../components/UndoToast";
import { useNav } from "../nav";
import { CompanySheet } from "../sheets/CompanySheet";
import { PlayerSheet } from "../sheets/PlayerSheet";

type Open = { kind: "player"; id: PlayerId } | { kind: "company"; id: CompanyId } | { kind: "menu" } | null;

/** The main screen: a tile per player and a card per company (US1). */
export function Table({ topCenter, renderCompanyActions }: {
  topCenter?: ReactNode;
  renderCompanyActions?: (company: CompanyId, close: () => void) => ReactNode;
}) {
  const { meta, state } = useSession();
  const { closeSession } = useAppActions();
  const { go } = useNav();
  const [tab, setTab] = useState<"players" | "companies">("players");
  const [open, setOpen] = useState<Open>(null);
  useWakeLock(true);

  const close = () => setOpen(null);
  const players = [...meta.players].sort((a, b) => a.seat - b.seat);

  return (
    <main className="screen">
      <TopBar
        onMenu={() => setOpen({ kind: "menu" })}
        onWarnings={() => go({ name: "history" })}
        center={topCenter ?? <span className="session-name">{meta.name}</span>}
      />
      <div className="table-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "players"} onClick={() => setTab("players")}>
          Jugadores
        </button>
        <button role="tab" aria-selected={tab === "companies"} onClick={() => setTab("companies")}>
          Compañías
        </button>
      </div>
      <div className="table-layout">
        <section data-pane="players" style={{ display: tab === "players" ? "block" : "none" }}>
          <div className="player-grid">
            {players.map((p) => (
              <PlayerTile key={p.id} player={p} onOpen={() => setOpen({ kind: "player", id: p.id })} />
            ))}
          </div>
        </section>
        <section data-pane="companies" style={{ display: tab === "companies" ? "block" : "none" }}>
          <div className="company-grid">
            {meta.game.companies.map((c) => (
              <CompanyCard
                key={c.id}
                companyId={c.id}
                current={state.turn.currentCompany === c.id}
                onOpen={() => setOpen({ kind: "company", id: c.id })}
              />
            ))}
          </div>
        </section>
      </div>

      {open?.kind === "player" ? <PlayerSheet playerId={open.id} onClose={close} /> : null}
      {open?.kind === "company" ? (
        <CompanySheet companyId={open.id} onClose={close} extraActions={renderCompanyActions?.(open.id, close)} />
      ) : null}
      {open?.kind === "menu" ? (
        <Sheet title="Menú" onClose={close}>
          <div className="choice-grid">
            <button onClick={() => go({ name: "history" })}>Historial</button>
            <button onClick={() => go({ name: "market" })}>Mercado</button>
            <button onClick={() => go({ name: "settings" })}>Ajustes</button>
            <button
              onClick={() => {
                closeSession();
                go({ name: "home" });
              }}
            >
              Salir al inicio
            </button>
          </div>
        </Sheet>
      ) : null}
      <UndoToast />
    </main>
  );
}
