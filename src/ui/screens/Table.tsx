import { useState, type ReactNode } from "react";
import { useAppActions } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { useVoice } from "../../app/useVoice";
import { useWakeLock } from "../../app/wakeLock";
import { counterOf } from "../../domain/events/state";
import { formatMoney } from "../../domain/i18n/format";
import { endTriggers } from "../../domain/mechanics/endTriggers";
import { isEnabled } from "../../domain/mechanics/custom";
import type { CompanyId, HolderRef, PlayerId } from "../../domain/types";
import { CompanyCard } from "../components/CompanyCard";
import { MicButton } from "../components/MicButton";
import { PlayerTile } from "../components/PlayerTile";
import { RoundIndicator } from "../components/RoundIndicator";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { UndoToast } from "../components/UndoToast";
import { VoicePanel } from "../components/VoicePanel";
import { useNav } from "../nav";
import { useExportSession } from "../useExport";
import { CompanySheet } from "../sheets/CompanySheet";
import { BatchSheet } from "../sheets/BatchSheet";
import { ExchangeSheet } from "../sheets/ExchangeSheet";
import { OperateSheet } from "../sheets/OperateSheet";
import { PlayerSheet } from "../sheets/PlayerSheet";
import { PrivatesSheet } from "../sheets/PrivatesSheet";
import { ConfirmSheet, CounterSheet } from "../sheets/StatusSheets";
import { StockSheet } from "../sheets/StockSheet";
import { ChipsSheet } from "../sheets/ChipsSheet";
import { TurnSheet } from "../sheets/TurnSheet";

export type Open =
  | { kind: "player"; id: PlayerId }
  | { kind: "company"; id: CompanyId; view: "operate" | "stock" | "details" }
  | { kind: "batch" }
  | { kind: "privates" }
  | { kind: "exchange"; player: PlayerId }
  | { kind: "menu" }
  | { kind: "turn" }
  | { kind: "chips" }
  | { kind: "confirm"; title: string; body: string; confirmLabel: string; action: unknown }
  | { kind: "counter"; subject: HolderRef; key: string }
  | null;

/** The main screen: a tile per player and a card per company (US1), with round controls (US3). */
export function Table({ topCenter }: { topCenter?: ReactNode }) {
  const { meta, state, effective } = useSession();
  const { dispatch } = useDispatch();
  const { closeSession } = useAppActions();
  const exportSession = useExportSession();
  const voice = useVoice();
  const OPERATING_HINTS = ["runAndPayout", "buyTrain", "payCost", "bankPays", "takeLoan", "buyPrivateByCompany", "nationalPayout"];
  const STOCK_HINTS = ["parCompany", "buyShare", "sellShares", "issueShares", "swapCertificates", "stockBatch"];
  /** "Hacerlo a mano" (FR-075): the touch sheet that matches what was said. */
  const manual = (hint: string | undefined) => {
    const current = state.turn.currentCompany;
    if (hint === "buyPrivate" || hint === "exchangePrivate") setOpen({ kind: "privates" });
    else if (hint && STOCK_HINTS.includes(hint)) setOpen({ kind: "batch" });
    else if (current && (!hint || OPERATING_HINTS.includes(hint))) setOpen({ kind: "company", id: current, view: "operate" });
    else if (state.turn.round === "SR") setOpen({ kind: "batch" });
    else setTab("companies");
  };
  const { go } = useNav();
  const [tab, setTab] = useState<"players" | "companies">("players");
  const [open, setOpen] = useState<Open>(null);
  useWakeLock(true);

  const close = () => setOpen(null);
  const players = [...meta.players].sort((a, b) => a.seat - b.seat);
  const companyName = (id: CompanyId) => meta.game.companies.find((c) => c.id === id)?.shortName ?? id;
  const round = state.turn.round;
  const companyView = round === "OR" ? "operate" : "stock";
  const hasCR = isEnabled(meta.game, "corporateRound");
  const current = state.turn.currentCompany;
  const ending = endTriggers(meta.game, state);
  const ownedPrivates = meta.game.privates.some((p) => {
    const holder = state.assets[`private:${p.id}`];
    return p.income > 0 && (holder?.startsWith("player:") || holder?.startsWith("company:"));
  });
  // FR-037: offer private income once per OR, until it has been paid in this OR.
  let orStart = -1;
  effective.forEach((g, i) => {
    if (g.events.some((e) => e.t === "turnAdvance" && e.orIndex !== undefined)) orStart = i;
  });
  const offerIncome =
    round === "OR" && ownedPrivates && !effective.slice(orStart + 1).some((g) => g.action.type === "privateIncome");

  const companyActions = (id: CompanyId): ReactNode => {
    const status = state.companies[id]?.status;
    return (
      <>
        <button onClick={() => setOpen({ kind: "company", id, view: "operate" })}>Operar…</button>
        <button onClick={() => setOpen({ kind: "company", id, view: "stock" })}>Acciones…</button>
        {status !== "receivership" ? (
          <button
            onClick={() =>
              setOpen({
                kind: "confirm",
                title: `Administración de ${companyName(id)}`,
                body: "La compañía pasa a administración, con los pagos que marque el juego.",
                confirmLabel: "Entrar en administración",
                action: { type: "enterReceivership", company: id },
              })
            }
          >
            Entrar en administración
          </button>
        ) : null}
        {status !== "bankrupt" ? (
          <button
            onClick={() =>
              setOpen({
                kind: "confirm",
                title: `Quiebra de ${companyName(id)}`,
                body: "Sus acciones salen del juego, la caja va al banco y sus trenes se retiran.",
                confirmLabel: "Declarar quiebra",
                action: { type: "declareBankruptcy", player: null, company: id },
              })
            }
          >
            Declarar quiebra
          </button>
        ) : null}
        {status !== "closed" ? (
          <button
            onClick={() =>
              setOpen({
                kind: "confirm",
                title: `Cerrar ${companyName(id)}`,
                body: "La compañía queda cerrada; sus bienes se mueven a mano.",
                confirmLabel: "Cerrar compañía",
                action: { type: "closeCompany", company: id },
              })
            }
          >
            Cerrar compañía
          </button>
        ) : null}
        <button onClick={() => setOpen({ kind: "counter", subject: `company:${id}`, key: "debt" })}>Ajustar contador</button>
      </>
    );
  };

  const playerActions = (id: PlayerId): ReactNode => {
    const ref = `player:${id}` as const;
    const name = meta.players.find((p) => p.id === id)?.name ?? id;
    const debt = counterOf(state, ref, "debt");
    const exchangeable = meta.game.privates.some((p) => p.exchange && state.assets[`private:${p.id}`] === ref);
    return (
      <>
        {exchangeable ? <button onClick={() => setOpen({ kind: "exchange", player: id })}>Canjear privada…</button> : null}
        <button onClick={() => setOpen({ kind: "counter", subject: ref, key: "debt" })}>
          Ajustar deuda{debt > 0 ? ` (${formatMoney(debt, meta.game)})` : ""}
        </button>
        <button
          onClick={() =>
            setOpen({
              kind: "confirm",
              title: `Quiebra de ${name}`,
              body: "Su dinero va al banco, sus acciones al pool y sus privadas se cierran.",
              confirmLabel: "Declarar quiebra",
              action: { type: "declareBankruptcy", player: id, company: null },
            })
          }
        >
          Declarar quiebra
        </button>
      </>
    );
  };

  return (
    <main className="screen">
      <TopBar
        onMenu={() => setOpen({ kind: "menu" })}
        onWarnings={() => go({ name: "history" })}
        center={topCenter ?? <RoundIndicator onOpen={() => setOpen({ kind: "turn" })} />}
      />
      {ending.length > 0 ? (
        <div className="end-banner" role="alert">
          {ending.map((t) => (
            <span key={t.type}>⚑ {t.messageEs}</span>
          ))}
        </div>
      ) : null}
      <div className="round-controls row">
        {round === "OR" && current ? (
          <button className="primary" onClick={() => setOpen({ kind: "company", id: current, view: "operate" })}>
            Operar {companyName(current)}
          </button>
        ) : null}
        {round === "OR" ? (
          <button className="primary" onClick={() => void dispatch({ type: "nextCompany" })}>
            Siguiente
          </button>
        ) : null}
        {offerIncome ? (
          <button className="primary" onClick={() => void dispatch({ type: "privateIncome" })}>
            Cobrar privadas
          </button>
        ) : null}
        {round === "PRIVATES" || round === "SR" ? (
          <button onClick={() => setOpen({ kind: "privates" })}>Comprar privada</button>
        ) : null}
        {round === "SR" ? <button onClick={() => setOpen({ kind: "batch" })}>Lote de acciones</button> : null}
        {round === "SR" ? <button onClick={() => void dispatch({ type: "endSR" })}>Fin de ronda de acciones</button> : null}
        {round === "CR" ? <button onClick={() => void dispatch({ type: "endCR" })}>Fin de ronda corporativa</button> : null}
        {round !== "SR" ? <button onClick={() => void dispatch({ type: "startSR" })}>Empezar ronda de acciones</button> : null}
        {hasCR && round === "SR" ? (
          <button onClick={() => void dispatch({ type: "startCR" })}>Empezar ronda corporativa</button>
        ) : null}
        <button onClick={() => void dispatch({ type: "startOR" })}>Empezar OR</button>
      </div>
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
                onOpen={() => setOpen({ kind: "company", id: c.id, view: companyView })}
              />
            ))}
          </div>
        </section>
      </div>

      {open?.kind === "player" ? <PlayerSheet playerId={open.id} onClose={close} extraActions={playerActions(open.id)} /> : null}
      {open?.kind === "company" && open.view === "operate" ? (
        <OperateSheet
          companyId={open.id}
          onClose={close}
          onDetails={() => setOpen({ kind: "company", id: open.id, view: "details" })}
        />
      ) : null}
      {open?.kind === "company" && open.view === "stock" ? (
        <StockSheet
          companyId={open.id}
          onClose={close}
          onOperate={() => setOpen({ kind: "company", id: open.id, view: "operate" })}
          onDetails={() => setOpen({ kind: "company", id: open.id, view: "details" })}
        />
      ) : null}
      {open?.kind === "batch" ? <BatchSheet onClose={close} /> : null}
      {open?.kind === "turn" ? <TurnSheet onClose={close} /> : null}
      {open?.kind === "chips" ? <ChipsSheet onClose={close} /> : null}
      {open?.kind === "privates" ? <PrivatesSheet onClose={close} /> : null}
      {open?.kind === "exchange" ? <ExchangeSheet player={open.player} onClose={close} /> : null}
      {open?.kind === "company" && open.view === "details" ? (
        <CompanySheet companyId={open.id} onClose={close} extraActions={companyActions(open.id)} />
      ) : null}
      {open?.kind === "confirm" ? (
        <ConfirmSheet title={open.title} body={open.body} confirmLabel={open.confirmLabel} action={open.action} onClose={close} />
      ) : null}
      {open?.kind === "counter" ? <CounterSheet subject={open.subject} initialKey={open.key} onClose={close} /> : null}
      {open?.kind === "menu" ? (
        <Sheet title="Menú" onClose={close}>
          <div className="choice-grid">
            <button onClick={() => go({ name: "history" })}>Historial</button>
            <button onClick={() => go({ name: "market" })}>Mercado</button>
            <button onClick={() => setOpen({ kind: "chips" })}>Fichas</button>
            <button onClick={() => void exportSession()}>Exportar partida</button>
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
      <VoicePanel controller={voice.controller} phase={voice.phase} onManual={manual} />
      <MicButton
        phase={voice.phase}
        availability={voice.availability}
        onPress={() => voice.controller.press()}
        onRelease={() => void voice.controller.release()}
      />
      <UndoToast />
    </main>
  );
}
