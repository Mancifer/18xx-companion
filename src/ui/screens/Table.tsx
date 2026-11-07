import { useMessageText } from "../useMessage";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppActions } from "../../app/AppProvider";
import { useDispatch, useSession } from "../../app/useSession";
import { useVoice } from "../../app/useVoice";
import { useWakeLock } from "../../app/wakeLock";
import { isAvailable } from "../../domain/actions/availability";
import type { ActionContext } from "../../domain/actions/context";
import { counterOf } from "../../domain/events/state";
import { formatMoney } from "../../i18n/format";
import { useDomainText, useLang, useText } from "../../app/language";
import { voiceEnabled } from "../../i18n/lang";
import { operatingPhase } from "../../domain/ledger/operatingPhase";
import { cycleCount, endTriggers, type EndTrigger } from "../../domain/mechanics/endTriggers";
import { overLimitCompanies, trainStack } from "../../domain/mechanics/phases";
import { exportEvents, exportPreview, mergerRoundDue } from "../../domain/mechanics/schedule";
import { reduceAll } from "../../domain/events/reduce";
import type { SessionState } from "../../domain/events/state";
import type { GameDefinition } from "../../domain/games/schema";
import type { UiText } from "../../i18n/contract/ui";
import { isEnabled } from "../../domain/mechanics/custom";
import { mechanicConfigOf } from "../../domain/mechanics/custom/config";
import { CorporateBankruptcyConfig } from "../../domain/mechanics/custom/corporateBankruptcy";
import { companyGroups, currentORGroups, purchasablePrivates, upcomingCompanies, type CompanyGroup } from "../../domain/queries";
import type { CompanyId, HolderRef, PlayerId } from "../../domain/types";
import { CompanyName } from "../components/CompanyBadge";
import { CompanyCard } from "../components/CompanyCard";
import { MicButton } from "../components/MicButton";
import { PlayerTile } from "../components/PlayerTile";
import { RoundIndicator } from "../components/RoundIndicator";
import { Sheet } from "../components/Sheet";
import { TopBar } from "../components/TopBar";
import { StartChipsNotice } from "../components/StartChipsNotice";
import { UndoToast } from "../components/UndoToast";
import { VoicePanel } from "../components/VoicePanel";
import { useNav } from "../nav";
import { useExportSession } from "../useExport";
import { CompanySheet } from "../sheets/CompanySheet";
import { BatchSheet } from "../sheets/BatchSheet";
import { LaunchSheet } from "../sheets/LaunchSheet";
import { MergerSheet } from "../sheets/MergerSheet";
import { ExchangeSheet } from "../sheets/ExchangeSheet";
import { OperateSheet } from "../sheets/OperateSheet";
import { PlayerSheet } from "../sheets/PlayerSheet";
import { PrivatesSheet } from "../sheets/PrivatesSheet";
import { ConfirmSheet, CounterSheet } from "../sheets/StatusSheets";
import { StockSheet } from "../sheets/StockSheet";
import { ChipsSheet } from "../sheets/ChipsSheet";
import { IncomeSheet } from "../sheets/IncomeSheet";
import { TrainCorrectionSheet } from "../sheets/TrainCorrectionSheet";
import { TurnSheet } from "../sheets/TurnSheet";

export type Open =
  | { kind: "player"; id: PlayerId }
  | { kind: "company"; id: CompanyId; view: "operate" | "stock" | "details"; outOfTurn?: boolean; discard?: boolean }
  | { kind: "batch" }
  | { kind: "launch" }
  | { kind: "merger" }
  | { kind: "endGame" }
  | { kind: "privates" }
  | { kind: "exchange"; player: PlayerId }
  | { kind: "menu" }
  | { kind: "turn" }
  | { kind: "chips" }
  | { kind: "income" }
  | { kind: "confirm"; title: ReactNode; body: string; confirmLabel: string; action: unknown; scoreAfter?: boolean }
  | { kind: "counter"; subject: HolderRef; key: string }
  | { kind: "trainCorrection"; company: CompanyId }
  | null;

/** The Companies tab's sections, in display order. */
const COMPANY_GROUPS: readonly CompanyGroup[] = ["inPlay", "available", "closed"];

/** Text around a company's name, as in "Quiebra de PRR". */
function around([before, after]: readonly [string, string], name: ReactNode): ReactNode {
  return (
    <>
      {before}
      {name}
      {after}
    </>
  );
}

/** The main screen: a tile per player and a card per company (US1), with round controls (US3). */
export function Table({ topCenter }: { topCenter?: ReactNode }) {
  const reasonText = useMessageText();
  const t = useText().table;
  const { lang } = useLang();
  const dt = useDomainText();
  const { meta, state, effective, gameEnd } = useSession();
  const { dispatch } = useDispatch();
  const groups = companyGroups(meta.game, state);
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
  /** "Entendido" on the start notice: this view only, nothing written (feature 008, R9). */
  const [chipsNoticeDismissed, setChipsNoticeDismissed] = useState(false);
  useWakeLock(true);

  const close = () => setOpen(null);
  const ctx: ActionContext = { game: meta.game, players: meta.players, state };
  const players = [...meta.players].sort((a, b) => a.seat - b.seat);
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
  const finished = gameEnd.end !== null;
  const showResults = () => go({ name: "results", from: "table" });
  // FR-006: the results open when the game ends while the Table is shown (an automatic end, a
  // confirmed endGame, or a voice endGame that moves the end), not when it opens on a finished game.
  const endId = gameEnd.end?.groupId ?? null;
  const seenEnd = useRef(endId);
  useEffect(() => {
    if (endId === seenEnd.current) return;
    seenEnd.current = endId;
    if (endId !== null) go({ name: "results", from: "table" });
  }, [endId, go]);
  // A player's bankruptcy may end the game (1830 Classic C-2.5, 21Moon §13, RotLA): offer it next.
  const bankruptcyEnds = cycles !== undefined || meta.game.endTriggers.some((t) => t.type === "bankruptcy");
  const upcoming = upcomingCompanies(meta.game, state);
  const ownedPrivates = meta.game.privates.some((p) => {
    const holder = state.assets[`private:${p.id}`];
    return p.income > 0 && (holder?.startsWith("player:") || holder?.startsWith("company:"));
  });
  // FR-037: offer private income once per OR, until it has been paid in this OR.
  const offerIncome =
    round === "OR" && ownedPrivates && !currentORGroups(effective).some((g) => g.action.type === "privateIncome");
  // Feature 012: what each player settles with the bank, offered only during the ORs.
  const phase = useMemo(() => operatingPhase(meta.game, meta.players, effective, state), [meta.game, meta.players, effective, state]);

  const companyActions = (id: CompanyId): ReactNode => {
    const status = state.companies[id]?.status;
    const outOfTurn = round === "OR" && current !== undefined && id !== current;
    return (
      <>
        {outOfTurn ? (
          <button onClick={() => setOpen({ kind: "company", id, view: "operate", outOfTurn: true })}>{t.operateOutOfTurn}</button>
        ) : (
          <button onClick={() => setOpen({ kind: "company", id, view: "operate" })}>{t.operateMenu}</button>
        )}
        <button onClick={() => setOpen({ kind: "company", id, view: "stock" })}>{t.sharesMenu}</button>
        {meta.game.trains.length > 0 ? (
          <button onClick={() => setOpen({ kind: "trainCorrection", company: id })}>{t.correctTrains}</button>
        ) : null}
        {status !== "receivership" ? (
          <button
            onClick={() =>
              setOpen({
                kind: "confirm",
                title: around(t.receivershipTitle, <CompanyName game={meta.game} id={id} />),
                body: t.receivershipBody,
                confirmLabel: t.enterReceivership,
                action: { type: "enterReceivership", company: id },
              })
            }
          >
            {t.enterReceivership}
          </button>
        ) : null}
        {status !== "bankrupt" ? (
          <button
            onClick={() =>
              setOpen({
                kind: "confirm",
                title: around(t.companyBankruptcyTitle, <CompanyName game={meta.game} id={id} />),
                body: t.companyBankruptcyBody,
                confirmLabel: t.declareBankruptcy,
                action: { type: "declareBankruptcy", player: null, company: id },
              })
            }
          >
            {t.declareBankruptcy}
          </button>
        ) : null}
        {status !== "closed" ? (
          <button
            onClick={() =>
              setOpen({
                kind: "confirm",
                title: around(t.closeTitle, <CompanyName game={meta.game} id={id} />),
                body: t.closeBody,
                confirmLabel: t.closeCompany,
                action: { type: "closeCompany", company: id },
              })
            }
          >
            {t.closeCompany}
          </button>
        ) : null}
        <button onClick={() => setOpen({ kind: "counter", subject: `company:${id}`, key: "debt" })}>{t.adjustCounter}</button>
      </>
    );
  };

  /** The player's game actions, under "Jugada" with selling and buying (feature 011). */
  const playerGameActions = (id: PlayerId): ReactNode => {
    const ref = `player:${id}` as const;
    const exchangeable = meta.game.privates.some((p) => p.exchange && state.assets[`private:${p.id}`] === ref);
    return exchangeable ? <button onClick={() => setOpen({ kind: "exchange", player: id })}>{t.exchangePrivate}</button> : null;
  };

  /** The player's adjustments, under "Ajustes"; bankruptcy last. */
  const playerActions = (id: PlayerId): ReactNode => {
    const ref = `player:${id}` as const;
    const name = meta.players.find((p) => p.id === id)?.name ?? id;
    const debt = counterOf(state, ref, "debt");
    return (
      <>
        <button onClick={() => setOpen({ kind: "counter", subject: ref, key: "debt" })}>
          {t.adjustDebt(debt > 0 ? formatMoney(debt, meta.game, lang) : undefined)}
        </button>
        <button
          onClick={() =>
            setOpen({
              kind: "confirm",
              title: t.playerBankruptcyTitle(name),
              body: liquidates ? t.playerLiquidateBody : t.playerBankruptcyBody,
              confirmLabel: t.declareBankruptcy,
              action: { type: "declareBankruptcy", player: id, company: null },
              scoreAfter: bankruptcyEnds,
            })
          }
        >
          {t.declareBankruptcy}
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
      {finished ? (
        <button className="finished-banner" onClick={showResults}>
          {t.finishedBanner}
        </button>
      ) : null}
      {ending.length > 0 ? (
        <div className="end-banner" role="alert">
          {ending.map((e) => (
            <span key={e.type}>⚑ {reasonText(e.message)}</span>
          ))}
          {!finished ? (
            <button className="primary" onClick={() => setOpen({ kind: "endGame" })}>
              {t.endGame}
            </button>
          ) : null}
        </div>
      ) : null}
      {overLimitCompanies(meta.game, state).map((o) => (
        <button
          key={o.company}
          className="over-limit"
          onClick={() => setOpen({ kind: "company", id: o.company, view: "operate", discard: true })}
        >
          {t.overLimit(meta.game.companies.find((c) => c.id === o.company)?.name ?? o.company, o.count, o.limit)}
        </button>
      ))}
      <div className="round-controls row">
        {phase ? (
          <button className={phase.over ? "primary" : undefined} onClick={() => setOpen({ kind: "income" })}>
            {dt.income.title}
          </button>
        ) : null}
        {round === "OR" && current ? (
          <button className="primary" onClick={() => setOpen({ kind: "company", id: current, view: "operate" })}>
            {around(t.operateCompany, <CompanyName game={meta.game} id={current} />)}
          </button>
        ) : null}
        {round === "OR" && current && upcoming.length > 0 ? (
          <span className="round-next">
            {t.next}{" "}
            {upcoming.map((id, i) => (
              <span key={id}>
                {i > 0 ? ", " : null}
                <CompanyName game={meta.game} id={id} />
              </span>
            ))}
          </span>
        ) : null}
        {offerIncome ? (
          <button className="primary" onClick={() => void dispatch({ type: "privateIncome" })}>
            {t.collectPrivates}
          </button>
        ) : null}
        {(round === "PRIVATES" || round === "SR") && purchasablePrivates(meta.game, state).length > 0 ? (
          <button onClick={() => setOpen({ kind: "privates" })}>{t.buyPrivate}</button>
        ) : null}
        {round === "SR" && isAvailable(ctx, "launchCompany") ? (
          <button onClick={() => setOpen({ kind: "launch" })}>{t.openMinor}</button>
        ) : null}
        {round === "SR" ? <button onClick={() => setOpen({ kind: "batch" })}>{t.shareBatch}</button> : null}
        {isAvailable(ctx, "startMR") ? (
          <button className="primary" onClick={() => void dispatch({ type: "startMR" })}>
            {t.mergerRound}
          </button>
        ) : null}
        {round === "MR" && isAvailable(ctx, "mergeCompanies") ? (
          <button onClick={() => setOpen({ kind: "merger" })}>{t.merge}</button>
        ) : null}
        {cycles !== undefined ? (
          <CycleControls cycles={cycles} finished={finished} onEnd={() => setOpen({ kind: "endGame" })} onResults={showResults} />
        ) : (
          <>
            {round !== "SR" ? (
              <button className={round === "OR" && !current ? "primary" : undefined} onClick={() => void dispatch({ type: "startSR" })}>
                {t.startSR}
              </button>
            ) : null}
            {hasCR && round === "SR" ? (
              <button onClick={() => void dispatch({ type: "startCR" })}>{t.startCR}</button>
            ) : null}
            <button onClick={() => void dispatch({ type: "startOR" })}>{t.startOR}</button>
          </>
        )}
      </div>
      <div className="table-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "players"} onClick={() => setTab("players")}>
          {t.playersTab}
        </button>
        <button role="tab" aria-selected={tab === "companies"} onClick={() => setTab("companies")}>
          {t.companiesTab}
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
          {COMPANY_GROUPS.map((group) => {
            const ids = groups[group];
            const title = t.groups[group];
            return ids.length > 0 ? (
              <div key={group} className="company-group" role="group" aria-label={title} data-testid={`company-group-${group}`}>
                <h2 className="company-group-title">{title}</h2>
                <div className="company-grid">
                  {ids.map((id) => (
                    <CompanyCard
                      key={id}
                      companyId={id}
                      current={state.turn.currentCompany === id}
                      onOpen={() => setOpen({ kind: "company", id, view: companyView(id) })}
                    />
                  ))}
                </div>
              </div>
            ) : null;
          })}
        </section>
      </div>

      {open?.kind === "player" ? (
        <PlayerSheet playerId={open.id} onClose={close} gameActions={playerGameActions(open.id)} extraActions={playerActions(open.id)} />
      ) : null}
      {open?.kind === "company" && open.view === "operate" ? (
        <OperateSheet
          companyId={open.id}
          outOfTurn={open.outOfTurn === true}
          initialView={open.discard ? "discard" : "run"}
          onClose={close}
          onDetails={() => setOpen({ kind: "company", id: open.id, view: "details" })}
          onCorrectTrains={() => setOpen({ kind: "trainCorrection", company: open.id })}
        />
      ) : null}
      {open?.kind === "trainCorrection" ? <TrainCorrectionSheet companyId={open.company} onClose={close} /> : null}
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
      {open?.kind === "endGame" ? <EndGameSheet ending={ending} onClose={close} /> : null}
      {open?.kind === "turn" ? <TurnSheet onClose={close} /> : null}
      {open?.kind === "chips" ? <ChipsSheet onClose={close} /> : null}
      {open?.kind === "income" ? <IncomeSheet onClose={close} /> : null}
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
          {...(open.scoreAfter ? { next: { label: t.endGame, onClick: () => setOpen({ kind: "endGame" }) } } : {})}
        />
      ) : null}
      {open?.kind === "counter" ? <CounterSheet subject={open.subject} initialKey={open.key} onClose={close} /> : null}
      {open?.kind === "menu" ? (
        <Sheet title={t.menu} onClose={close}>
          <div className="choice-grid">
            <button onClick={() => go({ name: "history" })}>{t.history}</button>
            <button onClick={() => go({ name: "market" })}>{t.market}</button>
            <button onClick={() => setOpen({ kind: "chips" })}>{t.chips}</button>
            {phase ? <button onClick={() => setOpen({ kind: "income" })}>{dt.income.title}</button> : null}
            {!finished ? <button onClick={() => setOpen({ kind: "endGame" })}>{t.endGame}</button> : null}
            <button onClick={showResults}>{t.standings}</button>
            {finished ? <button onClick={showResults}>{t.results}</button> : null}
            <button onClick={() => void exportSession()}>{t.exportSession}</button>
            <button onClick={() => go({ name: "settings" })}>{t.settings}</button>
            <button
              onClick={() => {
                closeSession();
                go({ name: "home" });
              }}
            >
              {t.exitHome}
            </button>
          </div>
        </Sheet>
      ) : null}
      {/* Feature 014 (FR-014e): no voice in a language that hasn't passed its eval gate. */}
      {voiceEnabled(lang) ? (
        <>
          <VoicePanel controller={voice.controller} phase={voice.phase} onManual={manual} />
          <MicButton
            phase={voice.phase}
            availability={voice.availability}
            onPress={() => voice.controller.press()}
            onRelease={() => void voice.controller.release()}
            onCancel={() => voice.controller.cancel()}
          />
        </>
      ) : null}
      {/* Only createSession in the log: the game has just started (feature 008, R9). Hidden while
          a sheet is open, so it never covers the sheet's buttons. */}
      {effective.length === 1 && effective[0]?.action.type === "createSession" && open === null && !chipsNoticeDismissed ? (
        <StartChipsNotice onDismiss={() => setChipsNoticeDismissed(true)} />
      ) : null}
      <UndoToast />
    </main>
  );
}

/**
 * "¿Terminar la partida?" (feature 007, contracts/ui.md §2): the fired end conditions, or a note
 * that none has fired yet; the table decides either way (constitution III).
 */
function EndGameSheet({ ending, onClose }: { ending: readonly EndTrigger[]; onClose: () => void }) {
  const reasonText = useMessageText();
  const t = useText().table;
  return (
    <ConfirmSheet
      title={t.endGameTitle}
      body={
        ending.length > 0 ? (
          <ul>
            {ending.map((e) => (
              <li key={e.type}>{reasonText(e.message)}</li>
            ))}
          </ul>
        ) : (
          t.noEndYet
        )
      }
      confirmLabel={t.end}
      action={{ type: "endGame", triggers: null }}
      onClose={onClose}
    />
  );
}

/**
 * Games played in cycles (contracts/ui.md "Round controls"): one button per transition. RO 1,
 * RO 2, then the Merger Round when due (its own button), the export and a new SR, or after the
 * last cycle the results (or "Terminar partida" on a reopened game).
 */
function CycleControls({
  cycles,
  finished,
  onEnd,
  onResults,
}: {
  cycles: number;
  finished: boolean;
  onEnd: () => void;
  onResults: () => void;
}) {
  const { meta, state } = useSession();
  const { dispatch } = useDispatch();
  const t = useText().table;
  const turn = state.turn;
  const last = turn.srNumber >= cycles;
  if (turn.round === "SR") {
    return (
      <button className="primary" onClick={() => void dispatch({ type: "startOR" })}>
        {t.startCycleOR(1)}
      </button>
    );
  }
  if (turn.round === "OR" && turn.orIndex < turn.orsInSet) {
    return (
      <button className={turn.currentCompany ? undefined : "primary"} onClick={() => void dispatch({ type: "startOR" })}>
        {t.startCycleOR(turn.orIndex + 1)}
      </button>
    );
  }
  if (turn.round === "OR" && mergerRoundDue(meta.game, state)) return null;
  if (last) {
    return finished ? (
      <button className="primary" onClick={onResults}>
        {t.viewResults}
      </button>
    ) : (
      <button onClick={onEnd}>{t.endGame}</button>
    );
  }
  return (
    <button className={turn.currentCompany ? "stacked" : "primary stacked"} onClick={() => void dispatch({ type: "startSR" })}>
      {t.exportAndNewSR}
      <span className="muted subtitle">{exportSubtitle(meta.game, state, t)}</span>
    </button>
  );
}

/** "Sale un 3 · quedan 4×3", "Salen 7×2 · quedan 5×3": what the export takes and what is left on top. */
function exportSubtitle(game: GameDefinition, state: SessionState, t: UiText["table"]): string {
  const preview = exportPreview(game, state);
  if (!preview) return t.noExport;
  const out = t.exportOut(preview.count, preview.displayName);
  const top = trainStack(game, reduceAll(state, exportEvents(game, state)))[0];
  return top ? t.exportLeft(out, top.left, top.displayName) : out;
}
