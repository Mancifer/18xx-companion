import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { HolderRef } from "../../src/domain/types";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import { balanceLineEs, formatMoney, movementLineEs, summaryEs, trainsLineEs, type SummaryContext } from "../../src/domain/i18n/es";
import { markMention, stripMentions } from "../../src/domain/i18n/mentions";
import { trainLimitFor } from "../../src/domain/mechanics/phases";
import type { Movement } from "../../src/domain/ledger/breakdown";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { FLOW, NAMES, candidates, rng } from "../helpers/randomWalk";
import { seedCompany } from "../helpers/seed";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

describe("Spanish summaries (US3)", () => {
  it("starting the OR from the SR shows the end of the SR and its sold-out move (feature 003, FR-010)", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 2, col: 6 }, holders: { "player:p1": 6, "player:p2": 4 } });
    const action: Action = { type: "startOR" };
    s.do(action);
    const summary = summaryEs(action, s, s.lastEvents);
    expect(summary).toContain("fin de la ronda de acciones");
    expect(summary).toContain("PRR → $90");
  });

  it("a payout with its price move", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6 },
    });
    const action: Action = { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 240 }], mode: "full" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("PRR paga $240 ($24/acción) · PRR → $112");
  });

  it("a loan with its moves", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1848"), players), "QR", {
      cell: { row: 1, col: 10 },
      holders: { "player:p1": 6 },
    });
    s.apply({ t: "turnAdvance", phase: "3" });
    const action: Action = { type: "takeLoan", company: "QR", count: 1 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("QR pide 1 préstamo: +£100 · QR → £150 · BoE → £80");
  });

  it("a takeover lists its effects", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1848"), players), "VR", {
      cell: { row: 2, col: 3 },
      par: 70,
      holders: { "player:p1": 6 },
      trains: ["train:2:1"],
    });
    const action: Action = { type: "enterReceivership", company: "VR" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe(
      "VR pasa a administración del banco nacional · VR en administración · fuera del juego: 1 × 2",
    );
  });

  it("21Moon two-part revenue", () => {
    const game = getBuiltInGame("21moon");
    const action: Action = {
      type: "runAndPayout",
      company: "VH",
      parts: [
        { part: "local", amount: 60 },
        { part: "spacePort", amount: 40 },
      ],
      mode: null,
    };
    expect(summaryEs(action, { game, players })).toBe("VH: base local ₡60, puerto espacial ₡40");
  });
});

describe("Spanish summaries (US4)", () => {
  const g1830 = getBuiltInGame("1830");

  it("par", () => {
    const s = TestSession.start(g1830, players);
    const action: Action = { type: "parCompany", player: "p1", company: "NYC", price: 82 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Ana abre la NYC a $82 y paga $164");
  });

  it("a sale with its price move and a presidency change", () => {
    const s = seedCompany(TestSession.start(g1830, players), "Erie", {
      cell: { row: 1, col: 6 },
      holders: { "player:p3": 4, "player:p2": 3 },
    });
    const action: Action = { type: "sellShares", seller: "player:p3", company: "Erie", count: 2 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe(
      "Carla vende 2 Erie por $180 · Erie → $76 · Presidencia de la Erie: Carla → Bruno",
    );
  });

  it("a float with capital pending (quickstart 13)", () => {
    const s = TestSession.start(g1830, players)
      .do({ type: "parCompany", player: "p1", company: "PRR", price: 100 })
      .do({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 3 });
    const action: Action = { type: "buyShare", buyer: "player:p3", company: "PRR", source: "ipo", count: 1 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Carla compra 1 PRR de la IPO por $100 · PRR flota (capital al final de la ronda)");
  });
});

describe("nextCompany summary (T015)", () => {
  const twoInOR = () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
    seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
    return s.do({ type: "startOR" });
  };
  const next: Action = { type: "nextCompany" };

  it("names the company that did not run, with its move and the next turn", () => {
    const s = twoInOR();
    const ctx = { game: s.game, players: s.players, state: s.state };
    s.do(next);
    expect(summaryEs(next, ctx, s.lastEvents)).toBe("PRR no corrió · PRR → $112 · turno de NYC");
  });

  it("is the plain next company after a recorded run", () => {
    const s = twoInOR().do({ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 0 }], mode: "withhold" });
    s.do(next);
    expect(summaryEs(next, s, s.lastEvents)).toBe("Siguiente compañía · turno de NYC");
  });
});

describe("nextCompany round-end titles (feature 011, US5)", () => {
  const next: Action = { type: "nextCompany" };
  const g1830 = getBuiltInGame("1830");
  const ctx = { game: g1830, players };
  const twoORs = () => {
    const s = TestSession.start(g1830, players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
    s.apply({ t: "turnAdvance", phase: "3" }); // 2 ORs per set
    return s.do({ type: "startOR" });
  };

  it("a new OR in the set: Fin de la OR S.(I−1) · empieza la OR S.I", () => {
    const events = [{ t: "turnAdvance", round: "OR", orSet: 2, orIndex: 2, orsInSet: 2, operatingOrder: ["NYC"], company: "NYC" }] as const;
    expect(summaryEs(next, ctx, events)).toBe("Fin de la OR 2.1 · empieza la OR 2.2 · turno de NYC");
  });

  it("the set complete: Fin de las rondas de operaciones, naming no next round", () => {
    expect(summaryEs(next, ctx, [{ t: "turnAdvance", company: null }])).toBe("Fin de las rondas de operaciones");
  });

  it("a plain turn change, or no events, stays Siguiente compañía", () => {
    expect(summaryEs(next, ctx, [{ t: "turnAdvance", company: "NYC" }])).toBe("Siguiente compañía · turno de NYC");
    expect(summaryEs(next, ctx)).toBe("Siguiente compañía");
  });

  it("a zero run that ends the OR keeps both: PRR no corrió · Fin de la OR …", () => {
    const s = twoORs();
    s.do(next);
    expect(summaryEs(next, s, s.lastEvents)).toMatch(/^PRR no corrió · Fin de la OR 1\.1 · empieza la OR 1\.2 · PRR → \$/);
  });

  it("RotLA mid-set end uses the cycle wording", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 10 } });
    s.do({ type: "startSR" }).do({ type: "startOR" });
    s.do({ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 0 }], mode: "withhold" });
    s.do(next);
    expect(summaryEs(next, s, s.lastEvents)).toMatch(/^Fin de RO 1\/2 · empieza RO 2\/2/);
  });

  it("RotLA in green, ending OR n.2 (a merger round follows): no stock-round wording (US5-2)", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 10 } });
    s.do({ type: "startSR" });
    s.apply({ t: "turnAdvance", phase: "green" });
    s.do({ type: "startOR" }).do(next).do(next);
    expect(s.state.turn.currentCompany).toBeUndefined();
    const line = summaryEs(next, s, s.lastEvents);
    expect(line).toMatch(/Fin de las rondas de operaciones/);
    expect(line).not.toMatch(/acciones/);
  });

  it("the setComplete warning names no next round (FR-022)", () => {
    const s = twoORs().do(next).do(next);
    expect(s.lastWarnings.find((w) => w.code === "setComplete")?.messageEs).toBe("Fin de las rondas de operaciones.");
  });
});

describe("RotLA summaries (feature 004)", () => {
  it("launchCompany names the bid, price, treasury and treasury shares", () => {
    const s = rotlaSession();
    const action: Action = { type: "launchCompany", player: "p1", company: "TUN", bid: 140, price: null };
    expect(summaryEs(action, s)).toBe("Ana abre Tunneling por $140 · precio $70 · tesorería $140 · 3 acciones en tesorería");
  });

  function minorInOR(id: string, holders: Record<string, number>) {
    const s = rotlaSession();
    seedRotla(s, id, { price: 80, holders, treasury: 300, operated: true });
    return s.do({ type: "startOR" });
  }

  it("namedPayment: the cost and the bonus in one line", () => {
    const s = minorInOR("TUN", { "player:p1": 2, "company:TUN": 3 });
    const action: Action = { type: "namedPayment", company: "TUN", payment: "tunneling", amount: null };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Tunneling: montaña −$40 · bonificación +$60");
  });

  it("namedPayment: a company payment", () => {
    const s = minorInOR("EXV", { "player:p1": 2, "company:EXV": 3 });
    const action: Action = { type: "namedPayment", company: "EXV", payment: "expansiveToken", amount: null };
    expect(summaryEs(action, s)).toBe("Expansive: ficha extra −$40");
  });

  it("issueShares from the treasury, and redeemShare", () => {
    const s = minorInOR("EXP", { "player:p1": 2, "company:EXP": 2, pool: 1 });
    const issue: Action = { type: "issueShares", company: "EXP", count: 1 };
    s.do(issue);
    expect(summaryEs(issue, s, s.lastEvents)).toBe("EXP emite 1 acción de su tesorería al pool por $80 · EXP → $70");
    const redeem: Action = { type: "redeemShare", company: "EXP", count: null };
    expect(summaryEs(redeem, s)).toBe("EXP recompra 1 acción del pool por $70");
  });

  it("a restack reads 'pasa al fondo de la pila'", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 10 } });
    const action: Action = { type: "runAndPayout", company: "CON", parts: [{ part: "revenue", amount: 60 }], mode: "full" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("CON paga $60 ($6/acción) · CON pasa al fondo de la pila");
  });

  it("merge and bonus moves read as plain moves", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 10 } });
    const note: Action = { type: "note", text: "x" };
    const to = { row: 14, col: 0 };
    expect(summaryEs(note, s, [{ t: "marketMove", company: "CON", to, reason: "bonus" }])).toBe("Nota: x · CON → $120");
    expect(summaryEs(note, s, [{ t: "marketMove", company: "CON", to, reason: "merge" }])).toBe("Nota: x · CON → $120");
  });

  const buyTrain = (company: string, trainType: string, extra: Record<string, unknown> = {}): Action =>
    ({ type: "buyTrain", company, trainType, variant: null, from: "bank", seller: null, price: null, tradeIn: null, ...extra });

  it("the ∞ variant with a trade-in names both trains, and the traded train leaves the game", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 10 }, treasury: 3000, trains: ["train:5:1"] });
    s.apply({ t: "turnAdvance", phase: "grey" });
    const action = buyTrain("CON", "7", { variant: "∞", tradeIn: "5" });
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("CON compra un ∞ al banco por $800 entregando un 5 · fuera del juego: 1 × 5");
  });

  it("a Resourceful train kept rusted reads 'oxidado, última carrera'", () => {
    const s = rotlaSession();
    seedRotla(s, "RES", { price: 80, holders: { "player:p1": 5 }, trains: ["train:2:1"] });
    seedRotla(s, "CON", { price: 100, holders: { "player:p2": 10 }, treasury: 3000 });
    const action = buyTrain("CON", "4");
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("CON compra un 4 al banco por $300 · fase Verde · RES: el 2 queda oxidado, última carrera · fuera del juego: 6 × 2");
  });

  it("forcedTrainPurchase lists the sales", () => {
    const s = rotlaSession();
    const action: Action = {
      type: "forcedTrainPurchase",
      company: "CON",
      trainType: "4",
      variant: null,
      from: "bank",
      sales: [
        { company: "EXP", count: 2 },
        { company: "TUN", count: 1 },
      ],
    };
    expect(summaryEs(action, s)).toBe("Compra forzada: CON compra un 4 al banco · el presidente vende 2 EXP y 1 TUN");
  });

  function mergerRound() {
    const s = rotlaSession();
    s.apply({ t: "turnAdvance", round: "MR", srNumber: 2, phase: "green" });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 3, "player:p2": 2 }, treasury: 200, trains: ["train:2:1", "train:2:2"] });
    seedRotla(s, "TUN", { price: 70, holders: { "player:p2": 3, "company:TUN": 2 }, treasury: 110, trains: ["train:3:1"] });
    return s;
  }
  const merge = (identity: "primary" | "alt" | null = null): Action => ({ type: "mergeCompanies", a: "EXP", b: "TUN", into: "UNI", identity });

  it("mergeCompanies: the preview before, and the same line from the events after", () => {
    const s = mergerRound();
    const line = "Express + Tunneling → Union · presidente Bruno · precio $70 · tesorería $310 · 3 trenes";
    expect(summaryEs(merge(), s)).toBe(line);
    s.do(merge());
    expect(summaryEs(merge(), s, s.lastEvents)).toBe(line);
    expect(summaryEs(merge(), { game: s.game, players: s.players }, s.lastEvents)).toBe(line);
  });

  it("mergeCompanies with the alt identity names it", () => {
    const s = mergerRound();
    expect(summaryEs(merge("alt"), { game: s.game, players: s.players })).toBe("Express + Tunneling → Unlimited");
  });

  it("after an alt merger, names use the alt identity", () => {
    const s = mergerRound().do(merge("alt"));
    const action: Action = { type: "namedPayment", company: "UNI", payment: "tunneling", amount: null };
    expect(summaryEs(action, s)).toBe("Unlimited: montaña −$40 · bonificación +$60");
  });

  it("startMR", () => {
    expect(summaryEs({ type: "startMR" }, rotlaSession())).toBe("Empieza la ronda de fusiones");
  });

  it("startSR names the export, its phase and its rust", () => {
    const s = rotlaSession();
    for (let n = 1; n <= 5; n++) s.apply({ t: "assetTransfer", asset: `train:2:${n}`, from: "bank", to: "removed" });
    for (let n = 1; n <= 5; n++) s.apply({ t: "assetTransfer", asset: `train:3:${n}`, from: "bank", to: "removed" });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 5 }, trains: ["train:2:6", "train:2:7"] });
    s.do({ type: "startOR" }).do({ type: "startOR" });
    const action: Action = { type: "startSR" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Empieza la ronda de acciones · Exportado: 4 → fase verde; se oxidan los 2");
  });

  it("startSR exporting every 2", () => {
    const s = rotlaSession().do({ type: "startOR" }).do({ type: "startOR" });
    const action: Action = { type: "startSR" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Empieza la ronda de acciones · Exportado: 7 × 2");
  });

  it("a player's bankruptcy names the closed companies and what other players were paid", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p3": 4, "player:p1": 3, "player:p2": 2, pool: 1 } });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p3": 2, "player:p2": 1, "company:EXP": 2 } });
    const action: Action = { type: "declareBankruptcy", player: "p3", company: null };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe(
      "Quiebra de Carla: sale de la partida; se cierran Express y Consortium; se pagan $580 a otros accionistas",
    );
  });

  it("a dissolution at 0 says so", () => {
    const s = rotlaSession();
    seedRotla(s, "EXP", { price: 10, holders: { "player:p1": 5 } });
    const action: Action = { type: "runAndPayout", company: "EXP", parts: [{ part: "revenue", amount: 0 }], mode: "withhold" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("EXP retiene $0 · EXP → casilla cerrada · EXP se disuelve");
  });

  it("Landmarks: Rock Formation, Cliff, Canyon, and Manufacturing's launch", () => {
    const s = rotlaSession({ options: { expansion: "landmarks" } });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 4, pool: 1 }, trains: ["train:5:1"] });
    const rock: Action = { type: "rockFormation", company: "EXP" };
    s.do(rock);
    expect(summaryEs(rock, s, s.lastEvents)).toBe("EXP: formación rocosa (+2) · EXP → $100");
    const cliff: Action = { type: "cliffSale", company: "EXP", train: "5" };
    expect(summaryEs(cliff, s)).toBe("EXP vende el 5 en el acantilado: +$225");
    expect(summaryEs({ type: "canyonTrain", company: "EXP" }, s)).toBe("EXP recibe el tren del cañón (un 2 que no se oxida)");
    const mfg: Action = { type: "launchCompany", player: "p2", company: "MFG", bid: 140, price: null };
    expect(summaryEs(mfg, s)).toBe(
      "Bruno abre Manufacturing por $140 · precio $70 · tesorería $90 ($50 al banco) · 3 acciones en tesorería · con su propio tren",
    );
  });
});

describe("one money transfer: the summary carries the amount (feature 010, FR-014, R6)", () => {
  // Payouts state the revenue and the per-share amount instead (FR-012); the breakdown lists each recipient.
  const PAYOUTS = new Set(["runAndPayout", "nationalPayout"]);
  const games: [string, GameDefinition][] = [
    ["1830", getBuiltInGame("1830")],
    ["1848", getBuiltInGame("1848")],
    ["21moon", getBuiltInGame("21moon")],
    ["rotla", applyOptions(getBuiltInGame("rotla"), {})],
  ];

  it.each(games)("%s: every action type seen in random play with one money flow names it", (_id, game) => {
    const missing = new Map<string, string>();
    for (const seed of [11, 12, 13]) {
      const s = TestSession.start(game, makePlayers(NAMES.slice(0, 4)));
      const rand = rng(seed);
      for (let step = 0; step < 150; step++) {
        const next = [...candidates(s, rand), ...FLOW].find((a) => s.tryDo(a).kind === "ok");
        if (!next) break;
        const before = { game, players: s.players, state: s.state };
        s.do(next);
        const transfers = s.lastEvents.filter((e) => e.t === "moneyTransfer");
        const action = s.groups[s.groups.length - 1]!.action;
        const [only] = transfers;
        if (transfers.length !== 1 || only?.t !== "moneyTransfer" || PAYOUTS.has(action.type)) continue;
        const summary = summaryEs(action, before, s.lastEvents);
        if (!summary.includes(formatMoney(only.amount, game))) missing.set(action.type, summary);
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });

  it("table: actions with one money movement", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", { cell: { row: 0, col: 6 }, cash: 500, holders: { "player:p1": 6 } });
    const cases: [Action, string][] = [
      [{ type: "transferMoney", from: "player:p1", to: "bank", amount: 100 }, "$100"],
      [{ type: "adjustMoney", holder: "player:p2", delta: 25, setTo: null }, "$25"],
      [{ type: "payCost", company: "PRR", amount: 60, reason: null }, "$60"],
      [{ type: "bankPays", company: "PRR", amount: 40, reason: "puente" }, "$40"],
    ];
    for (const [action, amount] of cases) {
      const before = s.state;
      s.do(action);
      expect(summaryEs(action, { game: s.game, players: s.players, state: before }, s.lastEvents)).toContain(amount);
    }
  });

  it("setting money reads the difference from its event", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    const action: Action = { type: "adjustMoney", holder: "player:p1", delta: null, setTo: 520 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Ana: dinero fijado en $520 (−$80)");
    s.do({ type: "adjustMoney", holder: "player:p1", delta: null, setTo: 560 });
    expect(summaryEs(s.groups.at(-1)!.action, s, s.lastEvents)).toBe("Ana: dinero fijado en $560 (+$40)");
  });
});

describe("breakdown lines (feature 010, contracts/history-ui.md)", () => {
  const game = getBuiltInGame("1830");
  const ctx = { game, players };

  it.each([
    [{ kind: "money", from: "bank", to: "player:p1", amount: 240 }, "$240: Banco → Ana"],
    [{ kind: "shares", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true }, "2 PRR: IPO → Ana (presidencia)"],
    [{ kind: "shares", company: "PRR", from: "player:p1", to: "pool", units: 1, presidency: false }, "1 PRR: Ana → Pool"],
    [{ kind: "asset", asset: "train:3:1", from: "bank", to: "company:PRR" }, "tren 3: Banco → PRR"],
    [{ kind: "asset", asset: "private:CS", from: "player:p1", to: "company:PRR" }, "privada CS: Ana → PRR"],
    [{ kind: "price", company: "PRR", from: 100, to: 112, reason: "payout" }, "PRR: $100 → $112"],
    [{ kind: "price", company: "PRR", from: 100, to: 100, reason: "restack" }, "PRR: pasa al fondo de la pila"],
    [{ kind: "price", company: "PRR", from: 60, to: null, reason: "sell" }, "PRR: $60 → sin precio"],
    [{ kind: "status", company: "PRR", from: "floated", to: "closed" }, "PRR: flotada → cerrada"],
    [{ kind: "counter", subject: "company:PRR", key: "debt", delta: 100 }, "deuda de PRR: +$100"],
    [{ kind: "counter", subject: "company:PRR", key: "runs", delta: 1 }, "operaciones de PRR: +1"],
  ] as [Movement, string][])("%o → %s", (movement, line) => {
    expect(movementLineEs(movement, ctx)).toBe(line);
  });

  it("a turn change reads as effectsEs words it", () => {
    expect(movementLineEs({ kind: "turn", event: { t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1, company: "PRR" } }, ctx)).toBe(
      "OR 1.1 · turno de PRR",
    );
  });

  it("balances: before → after with the difference; an unlimited bank only the amount", () => {
    expect(balanceLineEs({ holder: "player:p1", before: 480, after: 720, delta: 240 }, ctx)).toBe("Ana: $480 → $720 (+$240)");
    expect(balanceLineEs({ holder: "company:PRR", before: 500, after: 420, delta: -80 }, ctx)).toBe("PRR: $500 → $420 (−$80)");
    expect(balanceLineEs({ holder: "bank", before: null, after: null, delta: -240 }, ctx)).toBe("Banco: −$240");
  });
});

describe("trainsLineEs (feature 011, US2, contracts/ui.md §2)", () => {
  const g1830 = getBuiltInGame("1830");
  const prr = (trains: readonly string[], game: GameDefinition = g1830) =>
    seedCompany(TestSession.start(game, players), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 }, trains });

  it("count/limit and types", () => {
    const s = prr(["train:2:1", "train:3:1"]);
    expect(trainsLineEs(s.game, s.state, "PRR")).toEqual({ text: "Trenes 2/4 · 2, 3", warn: false });
  });

  it("a rusted kept train is marked and not counted", () => {
    const s = prr(["train:2:1", "train:3:1"]);
    s.apply({ t: "counterChange", subject: "company:PRR", key: "rusted:train:2:1", delta: 1 });
    expect(trainsLineEs(s.game, s.state, "PRR").text).toBe("Trenes 1/4 · 2 (oxidado), 3");
  });

  it("no trains: Sin trenes, with the warning style", () => {
    const s = prr([]);
    expect(trainsLineEs(s.game, s.state, "PRR")).toEqual({ text: "Sin trenes", warn: true });
  });

  it("over the limit says so, with the warning style", () => {
    const s = prr(["train:2:1", "train:3:1", "train:3:2"]);
    s.apply({ t: "turnAdvance", phase: "5" });
    expect(trainsLineEs(s.game, s.state, "PRR")).toEqual({ text: "Trenes 3/2 · 2, 3, 3 · sobre el límite", warn: true });
  });

  it("no limit in the phase: the count only", () => {
    const unlimited = { ...g1830, phases: g1830.phases.map((p) => ({ ...p, trainLimit: undefined })) } as unknown as GameDefinition;
    const s = prr(["train:2:1", "train:3:1"], unlimited);
    expect(trainsLineEs(s.game, s.state, "PRR").text).toBe("Trenes 2 · 2, 3");
  });

  it("1848: a 2E is listed but not counted", () => {
    const g1848 = getBuiltInGame("1848");
    const s = seedCompany(TestSession.start(g1848, players), "QR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6 },
      trains: ["train:2:1", "train:2E:1"],
    });
    const limit = trainLimitFor(s.game, s.state, "QR");
    expect(trainsLineEs(s.game, s.state, "QR").text).toBe(`Trenes 1/${limit} · 2, 2E`);
  });
});

describe("correctTrain summaries (feature 011, contracts/actions.md)", () => {
  const ctx = { game: getBuiltInGame("1830"), players };
  const act = (op: "remove" | "add", to: "bank" | "pool" | "removed" | null, amount: number | null): Action =>
    ({ type: "correctTrain", company: "PRR", train: "2", op, to, amount });
  const asset = (from: HolderRef, to: HolderRef): PrimitiveEvent => ({ t: "assetTransfer", asset: "train:2:2", from, to });
  const money = (from: HolderRef, to: HolderRef, amount: number): PrimitiveEvent => ({ t: "moneyTransfer", from, to, amount });

  it("remove → bank, with and without a refund (the refund read from the events)", () => {
    expect(summaryEs(act("remove", "bank", null), ctx, [asset("company:PRR", "bank"), money("bank", "company:PRR", 80)])).toBe(
      "Corrección: la PRR devuelve un 2 a la oferta y recibe $80",
    );
    expect(summaryEs(act("remove", "bank", 0), ctx, [asset("company:PRR", "bank")])).toBe("Corrección: la PRR devuelve un 2 a la oferta");
  });

  it("remove → pool and → removed", () => {
    expect(summaryEs(act("remove", "pool", null), ctx, [asset("company:PRR", "pool")])).toBe("Corrección: el 2 de la PRR va al pool");
    expect(summaryEs(act("remove", "removed", null), ctx, [asset("company:PRR", "removed")])).toBe(
      "Corrección: el 2 de la PRR queda fuera de juego",
    );
  });

  it("add, with and without a payment", () => {
    expect(summaryEs(act("add", null, null), ctx, [asset("bank", "company:PRR")])).toBe("Corrección: la PRR recibe un 2 de la oferta");
    expect(summaryEs(act("add", null, 80), ctx, [asset("bank", "company:PRR"), money("company:PRR", "bank", 80)])).toBe(
      "Corrección: la PRR recibe un 2 de la oferta y paga $80",
    );
  });
});

describe("company mentions (feature 013, contracts/ui.md)", () => {
  const PRIVATE_USE = /[\uE000-\uE002]/;
  const PRR = markMention("PRR", "PRR");
  const g1830 = getBuiltInGame("1830");
  /** Plain and marked: the marked line strips back to the plain one, and the plain one has no markers. */
  const both = (line: (ctx: SummaryContext) => string | undefined, ctx: SummaryContext) => {
    const plain = line(ctx) ?? "";
    const rich = line({ ...ctx, marks: true }) ?? "";
    expect(PRIVATE_USE.test(plain)).toBe(false);
    expect(stripMentions(rich)).toBe(plain);
    return rich;
  };

  function floated() {
    const s = TestSession.start(g1830, players);
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    seedCompany(s, "NYC", { cell: { row: 0, col: 5 }, holders: { "player:p2": 6 } });
    return s;
  }

  it("a share purchase marks the company", () => {
    const s = floated();
    const action: Action = { type: "buyShare", buyer: "player:p3", company: "PRR", source: "ipo", count: 1 };
    s.do(action);
    const rich = both((ctx) => summaryEs(action, ctx, s.lastEvents), { game: s.game, players: s.players, state: s.state });
    expect(rich).toContain(PRR);
  });

  it("a company paying is marked and still starts the sentence", () => {
    const s = floated();
    const action: Action = { type: "transferMoney", from: "company:PRR", to: "player:p1", amount: 10 };
    const rich = both((ctx) => summaryEs(action, ctx), { game: s.game, players: s.players });
    expect(rich.startsWith(PRR)).toBe(true);
    expect(stripMentions(rich).startsWith("PRR")).toBe(true);
  });

  it("an IPO holder reads 'la IPO de' and the company", () => {
    const action: Action = { type: "transferShares", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 1, presidency: null };
    const rich = both((ctx) => summaryEs(action, ctx), { game: g1830, players });
    expect(rich).toContain(`la IPO de ${PRR}`);
  });

  it("a merger into the second identity marks the full names", () => {
    const s = rotlaSession();
    s.apply({ t: "turnAdvance", round: "MR", srNumber: 2, phase: "green" });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 3, "player:p2": 2 }, treasury: 200, trains: ["train:2:1", "train:2:2"] });
    seedRotla(s, "TUN", { price: 70, holders: { "player:p2": 3, "company:TUN": 2 }, treasury: 110, trains: ["train:3:1"] });
    const action: Action = { type: "mergeCompanies", a: "EXP", b: "TUN", into: "UNI", identity: "alt" };
    const rich = both((ctx) => summaryEs(action, ctx), { game: s.game, players: s.players });
    expect(rich).toBe(`${markMention("EXP", "Express")} + ${markMention("TUN", "Tunneling")} → ${markMention("UNI", "Unlimited")}`);
  });

  it.each([
    [{ kind: "shares", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true }, `2 ${PRR}: IPO → Ana (presidencia)`],
    [{ kind: "asset", asset: "train:3:1", from: "bank", to: "company:PRR" }, `tren 3: Banco → ${PRR}`],
    [{ kind: "price", company: "PRR", from: 100, to: 112, reason: "payout" }, `${PRR}: $100 → $112`],
    [{ kind: "status", company: "PRR", from: "floated", to: "closed" }, `${PRR}: flotada → cerrada`],
    [{ kind: "counter", subject: "company:PRR", key: "debt", delta: 100 }, `deuda de ${PRR}: +$100`],
  ] as [Movement, string][])("movement %o is marked", (movement, line) => {
    expect(both((ctx) => movementLineEs(movement, ctx), { game: g1830, players })).toBe(line);
  });

  it("balance lines mark a company holder only", () => {
    const ctx = { game: g1830, players };
    expect(both((c) => balanceLineEs({ holder: "company:PRR", before: 500, after: 420, delta: -80 }, c), ctx)).toBe(
      `${PRR}: $500 → $420 (−$80)`,
    );
    expect(both((c) => balanceLineEs({ holder: "player:p1", before: 480, after: 720, delta: 240 }, c), ctx)).toBe("Ana: $480 → $720 (+$240)");
  });
});
