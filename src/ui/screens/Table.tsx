import { useState, type ReactNode } from "react";
import { useAppActions } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { useVoice } from "../../app/useVoice";
import { useWakeLock } from "../../app/wakeLock";
import { isAvailable } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { counterOf } from "../../domain/events/state";
import { formatMoney } from "../../domain/i18n/format";
import { cycleCount, endTriggers, gameOver } from "../../domain/mechanics/endTriggers";
import { overLimitCompanies, trainStack } from "../../domain/mechanics/phases";
import { exportEvents, exportPreview, mergerRoundDue } from "../../domain/mechanics/schedule";
import { reduceAll } from "../../domain/events/reduce";
import type { SessionState } from "../../domain/events/state";
import type { GameDefinition } from "../../domain/games/schema";
import { isEnabled } from "../../domain/mechanics/custom";
import { mechanicConfigOf } from "../../domain/mechanics/custom/config";
import { CorporateBankruptcyConfig } from "../../domain/mechanics/custom/corporateBankruptcy";
import { currentORGroups, purchasablePrivates, upcomingCompanies } from "../../domain/queries";
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
import { LaunchSheet } from "../sheets/LaunchSheet";
import { MergerSheet } from "../sheets/MergerSheet";
import { ScoreSheet } from "../sheets/ScoreSheet";
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
  | { kind: "company"; id: CompanyId; view: "operate" | "stock" | "details"; outOfTurn?: boolean; discard?: boolean }
  | { kind: "batch" }
  | { kind: "launch" }
  | { kind: "merger" }
  | { kind: "score" }
  | { kind: "privates" }
  | { kind: "exchange"; player: PlayerId }
  | { kind: "menu" }
  | { kind: "turn" }
  | { kind: "chips" }
  | { kind: "confirm"; title: string; body: string; confirmLabel: string; action: unknown; scoreAfter?: boolean }
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
  // FR-100: in stock and corporate rounds the companies are what gets tapped, so a phone opens
  // on them (and switches when the round changes); tablets show both panes anyway.
  const round = state.turn.round;
  const tabFor = (r: typeof round) => (r === "SR" || r === "CR" ? "companies" : "players");
  const [tab, setTab] = useState<"players" | "companies">(tabFor(round));
  const [tabRound, setTabRound] = useState(round);
  if (tabRound !== round) {
    setTabRound(round);
    setTab(tabFor(round));
  }
  const [open, setOpen] = useState<Open>(null);
  useWakeLock(true);

  const close = () => setOpen(null);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const players = [...meta.players].sort((a, b) => a.seat - b.seat);
  const companyName = (id: CompanyId) => meta.game.companies.find((c) => c.id === id)?.shortName ?? id;
  // FR-011: in an OR only the current company's card opens its turn; the others show details.
  // With no company operating (the set is over) there is no turn to be out of.
  const companyView = (id: CompanyId) => {
    if (round !== "OR") return "stock";
    return current === undefined || id === current ? "operate" : "details";
  };
  const hasCR = isEnabled(meta.game, "corporateRound");
  const current = state.turn.currentCompany;
  const ending = endTriggers(meta.game, state);
  const cycles = cycleCount(meta.game);
  const liquidates = mechanicConfigOf(meta.game, "corporateBankruptcy", CorporateBankruptcyConfig)?.playerMode === "liquidatePresided";
  // The Score sheet opens by itself once when the game ends (cycles done, Bank Break, bankruptcy).
  const over = gameOver(meta.game, state);
  const [scoreShown, setScoreShown] = useState(false);
  if (over !== scoreShown) {
    setScoreShown(over);
    if (over) setOpen({ kind: "score" });
  }
  const upcoming = upcomingCompanies(meta.game, state);
  const ownedPrivates = meta.game.privates.some((p) => {
    const holder = state.assets[`private:${p.id}`];
    return p.income > 0 && (holder?.startsWith("player:") || holder?.startsWith("company:"));
  });
  // FR-037: offer private income once per OR, until it has been paid in this OR.
  const offerIncome =
    round === "OR" && ownedPrivates && !currentORGroups(effective).some((g) => g.action.type === "privateIncome");

  const companyActions = (id: CompanyId): ReactNode => {
    const status = state.companies[id]?.status;
    const outOfTurn = round === "OR" && current !== undefined && id !== current;
    return (
      <>
        {outOfTurn ? (
          <button onClick={() => setOpen({ kind: "company", id, view: "operate", outOfTurn: true })}>Operar fuera de turno…</button>
        ) : (
          <button onClick={() => setOpen({ kind: "company", id, view: "operate" })}>Operar…</button>
        )}
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
              body: liquidates
                ? "Sale de la partida: se cierran las compañías que preside (el banco paga a los demás accionistas), su dinero va al banco y sus acciones al pool."
                : "Su dinero va al banco, sus acciones al pool y sus privadas se cierran.",
              confirmLabel: "Declarar quiebra",
              action: { type: "declareBankruptcy", player: id, company: null },
              scoreAfter: cycles !== undefined,
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
      {overLimitCompanies(meta.game, state).map((o) => (
        <button
          key={o.company}
          className="over-limit"
          onClick={() => setOpen({ kind: "company", id: o.company, view: "operate", discard: true })}
        >
          {meta.game.companies.find((c) => c.id === o.company)?.name ?? o.company}: {o.count} trenes, límite {o.limit}. Elegir cuál va al
          pool
        </button>
      ))}
      <div className="round-controls row">
        {round === "OR" && current ? (
          <button className="primary" onClick={() => setOpen({ kind: "company", id: current, view: "operate" })}>
            Operar {companyName(current)}
          </button>
        ) : null}
        {round === "OR" && current && upcoming.length > 0 ? (
          <span className="round-next">Después: {upcoming.map(companyName).join(", ")}</span>
        ) : null}
        {offerIncome ? (
          <button className="primary" onClick={() => void dispatch({ type: "privateIncome" })}>
            Cobrar privadas
          </button>
        ) : null}
        {(round === "PRIVATES" || round === "SR") && purchasablePrivates(meta.game, state).length > 0 ? (
          <button onClick={() => setOpen({ kind: "privates" })}>Comprar privada</button>
        ) : null}
        {round === "SR" && isAvailable(ctx, "launchCompany") ? (
          <button onClick={() => setOpen({ kind: "launch" })}>Abrir minor</button>
        ) : null}
        {round === "SR" ? <button onClick={() => setOpen({ kind: "batch" })}>Lote de acciones</button> : null}
        {isAvailable(ctx, "startMR") ? (
          <button className="primary" onClick={() => void dispatch({ type: "startMR" })}>
            Ronda de fusiones
          </button>
        ) : null}
        {round === "MR" && isAvailable(ctx, "mergeCompanies") ? (
          <button onClick={() => setOpen({ kind: "merger" })}>Fusionar…</button>
        ) : null}
        {cycles !== undefined ? (
          <CycleControls cycles={cycles} onScore={() => setOpen({ kind: "score" })} />
        ) : (
          <>
            {round !== "SR" ? (
              <button className={round === "OR" && !current ? "primary" : undefined} onClick={() => void dispatch({ type: "startSR" })}>
                Empezar ronda de acciones
              </button>
            ) : null}
            {hasCR && round === "SR" ? (
              <button onClick={() => void dispatch({ type: "startCR" })}>Empezar ronda corporativa</button>
            ) : null}
            <button onClick={() => void dispatch({ type: "startOR" })}>Empezar OR</button>
          </>
        )}
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
                onOpen={() => setOpen({ kind: "company", id: c.id, view: companyView(c.id) })}
              />
            ))}
          </div>
        </section>
      </div>

      {open?.kind === "player" ? <PlayerSheet playerId={open.id} onClose={close} extraActions={playerActions(open.id)} /> : null}
      {open?.kind === "company" && open.view === "operate" ? (
        <OperateSheet
          companyId={open.id}
          outOfTurn={open.outOfTurn === true}
          initialView={open.discard ? "discard" : "run"}
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
      {open?.kind === "launch" ? <LaunchSheet onClose={close} /> : null}
      {open?.kind === "merger" ? <MergerSheet onClose={close} /> : null}
      {open?.kind === "score" ? <ScoreSheet onClose={close} /> : null}
      {open?.kind === "turn" ? <TurnSheet onClose={close} /> : null}
      {open?.kind === "chips" ? <ChipsSheet onClose={close} /> : null}
      {open?.kind === "privates" ? <PrivatesSheet onClose={close} /> : null}
      {open?.kind === "exchange" ? <ExchangeSheet player={open.player} onClose={close} /> : null}
      {open?.kind === "company" && open.view === "details" ? (
        <CompanySheet companyId={open.id} onClose={close} extraActions={companyActions(open.id)} />
      ) : null}
      {open?.kind === "confirm" ? (
        <ConfirmSheet
          title={open.title}
          body={open.body}
          confirmLabel={open.confirmLabel}
          action={open.action}
          onClose={close}
          {...(open.scoreAfter ? { next: { label: "Terminar partida", onClick: () => setOpen({ kind: "score" }) } } : {})}
        />
      ) : null}
      {open?.kind === "counter" ? <CounterSheet subject={open.subject} initialKey={open.key} onClose={close} /> : null}
      {open?.kind === "menu" ? (
        <Sheet title="Menú" onClose={close}>
          <div className="choice-grid">
            <button onClick={() => go({ name: "history" })}>Historial</button>
            <button onClick={() => go({ name: "market" })}>Mercado</button>
            <button onClick={() => setOpen({ kind: "chips" })}>Fichas</button>
            {cycles !== undefined ? <button onClick={() => setOpen({ kind: "score" })}>Puntuación</button> : null}
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

/**
 * Games played in cycles (contracts/ui.md "Round controls"): one button per transition. RO 1,
 * RO 2, then the Merger Round when due (its own button), the export and a new SR, or the scores
 * after the last cycle.
 */
function CycleControls({ cycles, onScore }: { cycles: number; onScore: () => void }) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const turn = state.turn;
  const last = turn.srNumber >= cycles;
  if (turn.round === "SR") {
    return (
      <button className="primary" onClick={() => void dispatch({ type: "startOR" })}>
        Empezar RO 1
      </button>
    );
  }
  if (turn.round === "OR" && turn.orIndex < turn.orsInSet) {
    return (
      <button className={turn.currentCompany ? undefined : "primary"} onClick={() => void dispatch({ type: "startOR" })}>
        Empezar RO {turn.orIndex + 1}
      </button>
    );
  }
  if (turn.round === "OR" && mergerRoundDue(meta.game, state)) return null;
  if (last) {
    return (
      <button className={gameOver(meta.game, state) ? "primary" : undefined} onClick={onScore}>
        Ver puntuación
      </button>
    );
  }
  return (
    <button className={turn.currentCompany ? "stacked" : "primary stacked"} onClick={() => void dispatch({ type: "startSR" })}>
      Exportar y nueva RA
      <span className="muted subtitle">{exportSubtitle(meta.game, state)}</span>
    </button>
  );
}

/** "Sale un 3 · quedan 4×3", "Salen 7×2 · quedan 5×3": what the export takes and what is left on top. */
function exportSubtitle(game: GameDefinition, state: SessionState): string {
  const preview = exportPreview(game, state);
  if (!preview) return "Sin exportación";
  const out = preview.count === 1 ? `Sale un ${preview.displayName}` : `Salen ${preview.count}×${preview.displayName}`;
  const top = trainStack(game, reduceAll(state, exportEvents(game, state)))[0];
  return top ? `${out} · quedan ${top.left}×${top.displayName}` : out;
}
