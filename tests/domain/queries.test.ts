import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { answerQuery, companyGroups, currentORGroups, turnActivity, upcomingCompanies } from "../../src/domain/queries";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

/** FR-073: questions are answered from the app's own state, never from model text. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

function table() {
  const s = TestSession.start(getBuiltInGame("1830"), players);
  seedCompany(s, "Erie", { cell: { row: 0, col: 7 }, cash: 230, holders: { "player:p3": 4, "player:p2": 3 }, trains: ["train:2:1", "train:3:1"] });
  s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 80 });
  return s;
}
const ask = (s: TestSession, kind: string, player: string | null = null, company: string | null = null) =>
  answerQuery(s, { kind: kind as never, player, company }).textEs;

describe("answerQuery", () => {
  it("cash of a player, or of a company", () => {
    const s = table();
    expect(ask(s, "cash", "p1")).toBe("Ana tiene $520");
    expect(ask(s, "cash", null, "Erie")).toBe("Erie tiene $230 en caja");
  });

  it("shares", () => {
    const s = table();
    expect(ask(s, "shares", "p3", "Erie")).toBe("Carla tiene 4 acciones de Erie (40%)");
    expect(ask(s, "shares", "p3")).toBe("Carla tiene: Erie 40%");
    expect(ask(s, "shares", null, "Erie")).toBe("Erie: Carla 40%, Bruno 30%, IPO 30%");
  });

  it("price, treasury, trains and president", () => {
    const s = table();
    expect(ask(s, "price", null, "Erie")).toBe("Erie está a $112");
    expect(ask(s, "treasury", null, "Erie")).toBe("Erie tiene $230 en caja");
    expect(ask(s, "trains", null, "Erie")).toBe("Erie tiene trenes: 2, 3");
    expect(ask(s, "president", null, "Erie")).toBe("Preside Erie: Carla");
  });

  it("trains on sale when no company is named", () => {
    expect(ask(table(), "trains")).toMatch(/^En el banco: 2 \(5 a \$80\)/);
  });

  it("bank and turn", () => {
    const s = table();
    expect(ask(s, "bank")).toBe("El banco tiene $9.450");
    expect(ask(s, "turn")).toBe("Privadas · fase 2");
  });

  it("asks back when the entity is missing", () => {
    expect(ask(table(), "price")).toBe("¿De qué compañía?");
  });
});

describe("currentORGroups (T002)", () => {
  const twoCompanies = () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
    seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
    return s;
  };

  it("all groups when no OR has started", () => {
    const s = twoCompanies();
    expect(currentORGroups(s.groups)).toEqual(s.groups);
  });

  it("only the groups after the latest OR start", () => {
    const s = twoCompanies().apply({ t: "turnAdvance", phase: "3" }).do({ type: "startOR" }); // 2 ORs per set
    s.do({ type: "payCost", company: "PRR", amount: 10, reason: null });
    expect(currentORGroups(s.groups).map((g) => g.action.type)).toEqual(["payCost"]);
    s.do({ type: "nextCompany" }).do({ type: "nextCompany" }); // OR 1.2 starts inside the second nextCompany
    expect(currentORGroups(s.groups)).toEqual([]);
  });
});

describe("turnActivity (T006)", () => {
  const inOR = () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, cash: 300, holders: { "player:p1": 6 } });
    seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, cash: 300, holders: { "player:p2": 6 } });
    return s.do({ type: "startOR" });
  };
  const run = { type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 50 }], mode: "full" };

  it("nothing recorded: the turn cannot be finished yet", () => {
    const s = inOR();
    expect(turnActivity(s.groups, s.state, "PRR")).toEqual({ runRecorded: false, canFinish: false, groups: [] });
  });

  it("lists this company's groups in this OR, and finishing opens once the run is recorded", () => {
    const s = inOR();
    s.do({ type: "payCost", company: "PRR", amount: 10, reason: null });
    s.do({ type: "payCost", company: "NYC", amount: 5, reason: null });
    expect(turnActivity(s.groups, s.state, "PRR").canFinish).toBe(false);
    s.do(run);
    const activity = turnActivity(s.groups, s.state, "PRR");
    expect(activity.runRecorded).toBe(true);
    expect(activity.canFinish).toBe(true);
    expect(activity.groups.map((g) => g.action.type)).toEqual(["payCost", "runAndPayout"]);
  });

  it("a company that is not current can have a run but cannot finish the turn", () => {
    const s = inOR();
    s.do({ ...run, company: "NYC" });
    expect(turnActivity(s.groups, s.state, "NYC")).toMatchObject({ runRecorded: true, canFinish: false });
  });

  it("a run recorded by voice counts as recorded (FR-009)", () => {
    const s = inOR().do(run);
    const voiced = s.groups.map((g) => (g.action.type === "runAndPayout" ? { ...g, source: "voice" as const } : g));
    expect(turnActivity(voiced, s.state, "PRR").canFinish).toBe(true);
  });

  it("outside an OR the turn cannot be finished", () => {
    const s = inOR().do(run).do({ type: "startSR" });
    expect(turnActivity(s.groups, s.state, "PRR").canFinish).toBe(false);
  });
});

describe("upcomingCompanies (T022)", () => {
  const three = () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
    seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
    seedCompany(s, "B&O", { cell: { row: 0, col: 5 }, holders: { "player:p3": 6 } });
    return s.do({ type: "startOR" });
  };

  it("the companies after the current one, by operating order", () => {
    const s = three();
    expect(s.state.turn.currentCompany).toBe("PRR");
    expect(upcomingCompanies(s.game, s.state)).toEqual(["NYC", "B&O"]);
    expect(upcomingCompanies(s.game, s.state, 1)).toEqual(["NYC"]);
  });

  it("skips companies that already operated and re-sorts after a price move", () => {
    const s = three().do({ type: "nextCompany" }); // PRR did not run
    expect(upcomingCompanies(s.game, s.state)).toEqual(["B&O"]);
    s.do({ type: "setMarket", company: "B&O", cell: { row: 0, col: 9 } });
    s.do({ type: "setTurn", round: null, srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: "B&O" });
    expect(upcomingCompanies(s.game, s.state)).toEqual(["NYC"]);
  });
});

describe("companyGroups (bug companies-tab-status-order)", () => {
  const ids1830 = getBuiltInGame("1830").companies.map((c) => c.id);

  it("with nothing closed, keeps definition order: companies in play first, then the available ones", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
    const groups = companyGroups(s.game, s.state);
    expect(groups.inPlay).toEqual(ids1830.filter((id) => id === "PRR" || id === "NYC"));
    expect(groups.available).toEqual(ids1830.filter((id) => id !== "PRR" && id !== "NYC"));
    expect(groups.closed).toEqual([]);
  });

  it("parred, floated and receivership are in play; closed and bankrupt go last", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    const [a, b, c, d, e] = ids1830 as [string, string, string, string, string, ...string[]];
    s.apply({ t: "companyStatus", company: e, status: "parred", parPrice: 100 });
    s.apply({ t: "companyStatus", company: d, status: "floated" });
    s.apply({ t: "companyStatus", company: c, status: "receivership" });
    s.apply({ t: "companyStatus", company: b, status: "bankrupt" });
    s.apply({ t: "companyStatus", company: a, status: "closed" });
    const groups = companyGroups(s.game, s.state);
    expect(groups.inPlay).toEqual([c, d, e]);
    expect(groups.available).toEqual(ids1830.slice(5));
    expect(groups.closed).toEqual([a, b]);
  });

  it("RotLA: merged minors are closed, the new major is in play, other majors stay available", () => {
    const s = TestSession.start(getBuiltInGame("rotla"), players.slice(0, 3));
    s.apply({ t: "companyStatus", company: "UNI", status: "floated" });
    s.apply({ t: "companyStatus", company: "EXP", status: "closed" });
    s.apply({ t: "companyStatus", company: "TUN", status: "closed" });
    const groups = companyGroups(s.game, s.state);
    expect(groups.inPlay).toEqual(["UNI"]);
    expect(groups.closed).toEqual(s.game.companies.map((c) => c.id).filter((id) => id === "EXP" || id === "TUN"));
    expect(groups.available).toContain("CON");
    expect(groups.available).not.toContain("UNI");
  });
});
