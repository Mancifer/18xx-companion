import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import { summaryEs } from "../../src/domain/i18n/es";
import { TestSession, makePlayers } from "../helpers/dispatch";
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
    expect(summaryEs(action, s, s.lastEvents)).toBe("Ana abre la NYC a $82");
  });

  it("a sale with its price move and a presidency change", () => {
    const s = seedCompany(TestSession.start(g1830, players), "Erie", {
      cell: { row: 1, col: 6 },
      holders: { "player:p3": 4, "player:p2": 3 },
    });
    const action: Action = { type: "sellShares", seller: "player:p3", company: "Erie", count: 2 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe(
      "Carla vende 2 Erie · Erie → $76 · Presidencia de la Erie: Carla → Bruno",
    );
  });

  it("a float with capital pending (quickstart 13)", () => {
    const s = TestSession.start(g1830, players)
      .do({ type: "parCompany", player: "p1", company: "PRR", price: 100 })
      .do({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 3 });
    const action: Action = { type: "buyShare", buyer: "player:p3", company: "PRR", source: "ipo", count: 1 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Carla compra 1 PRR de la IPO · PRR flota (capital al final de la ronda)");
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
    expect(summaryEs(issue, s, s.lastEvents)).toBe("EXP emite 1 acción de su tesorería al pool · EXP → $70");
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
    expect(summaryEs(action, s, s.lastEvents)).toBe("CON compra un ∞ al banco entregando un 5 · fuera del juego: 1 × 5");
  });

  it("a Resourceful train kept rusted reads 'oxidado, última carrera'", () => {
    const s = rotlaSession();
    seedRotla(s, "RES", { price: 80, holders: { "player:p1": 5 }, trains: ["train:2:1"] });
    seedRotla(s, "CON", { price: 100, holders: { "player:p2": 10 }, treasury: 3000 });
    const action = buyTrain("CON", "4");
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("CON compra un 4 al banco · fase Verde · RES: el 2 queda oxidado, última carrera · fuera del juego: 6 × 2");
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
