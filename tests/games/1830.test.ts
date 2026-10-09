import { describe, expect, it } from "vitest";
import { cashOf, counterOf } from "../../src/domain/events/state";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { zeroRunAction } from "../../src/domain/actions/expand/operating";
import { priceOf } from "../../src/domain/mechanics/market";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";

/** 1830 (research R14). Rule sections refer to the Mayfair 2011 rulebook. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const run = (company: string | null, amount: number, mode: string | null) => ({
  type: "runAndPayout",
  company,
  parts: [{ part: "revenue", amount }],
  mode,
});

function start(ruleset?: "base" | "classic") {
  const game = ruleset ? applyOptions(getBuiltInGame("1830"), { ruleset }) : getBuiltInGame("1830");
  return TestSession.start(game, players);
}

describe("1830 operating round", () => {
  it("US3-1: Ana 60%, Bruno 20%, pool 20%, PRR pays 240 → 144 / 48 / pool 48 to PRR, right 1", () => {
    const s = seedCompany(start(), "PRR", {
      cell: { row: 0, col: 6 },
      par: 100,
      holders: { "player:p1": 6, "player:p2": 2, pool: 2 },
    });
    s.do(run("PRR", 240, "full"));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -240, "player:p1": 144, "player:p2": 48, "company:PRR": 48 });
    expect(s.state.companies["PRR"]!.position).toEqual({ row: 0, col: 7 });
    expect(priceOf(s.game, s.state, "PRR")).toBe(112);
    expect(counterOf(s.state, "company:PRR", "runs")).toBe(1);
    expect(s.state.turn.operatedThisOR).toContain("PRR");
    expect(s.violations()).toEqual([]);
  });

  it("§7.5 example: 50% player / 30% IPO / 20% pool on $50 → $25 player, $10 treasury, $15 stays in the Bank", () => {
    const s = seedCompany(start(), "B&O", {
      cell: { row: 1, col: 6 },
      holders: { "player:p1": 5, pool: 2 },
    });
    s.do(run("B&O", 50, "full"));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -35, "player:p1": 25, "company:B&O": 10 });
  });

  it("US3-2: withhold 180 → treasury +180, left 1", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    s.do(run("PRR", 180, "withhold"));
    expect(cashOf(s.state, "company:PRR")).toBe(180);
    expect(s.state.companies["PRR"]!.position).toEqual({ row: 0, col: 5 });
  });

  it("null company means the operating company", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    s.apply({ t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1, company: "PRR" });
    s.do(run(null, 100, "withhold"));
    expect(cashOf(s.state, "company:PRR")).toBe(100);
  });

  it("without an operating company, null is not available", () => {
    const s = start();
    expect(s.tryDo(run(null, 100, "full")).kind).toBe("unavailable");
  });

  it("US3-3: Half is not available", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    expect(s.tryDo(run("PRR", 100, "half")).kind).toBe("unavailable");
  });

  it("US3-7: no loan actions are available", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    expect(s.tryDo({ type: "takeLoan", company: "PRR", count: 1 }).kind).toBe("unavailable");
  });

  it("private income pays each owner; unsold privates pay nothing", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    s.apply(
      { t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p2" },
      { t: "assetTransfer", asset: "private:CA", from: "bank", to: "company:PRR" },
    );
    s.do({ type: "privateIncome" });
    expect(netMoney(s.lastEvents)).toEqual({ bank: -30, "player:p2": 5, "company:PRR": 25 });
  });

  it("a company buys a private from a player within ½× to 2× face value", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, cash: 500, holders: { "player:p1": 6 } });
    s.apply({ t: "assetTransfer", asset: "private:DH", from: "bank", to: "player:p2" });
    s.do({ type: "buyPrivateByCompany", company: "PRR", private: "DH", price: 140 });
    expect(s.state.assets["private:DH"]).toBe("company:PRR");
    expect(netMoney(s.lastEvents)).toEqual({ "company:PRR": -140, "player:p2": 140 });
    expect(s.lastWarnings).toEqual([]);
    s.apply({ t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p3" });
    s.do({ type: "buyPrivateByCompany", company: "PRR", private: "SV", price: 41 });
    expect(s.lastWarnings.map((w) => w.code)).toContain("privatePrice");
  });

  it("payCost: company → bank", () => {
    const s = seedCompany(start(), "PRR", { cell: { row: 0, col: 6 }, cash: 500 });
    s.do({ type: "payCost", company: "PRR", amount: 120, reason: "montaña" });
    expect(netMoney(s.lastEvents)).toEqual({ "company:PRR": -120, bank: 120 });
  });
});

describe("1830 Base: Bank loan and receivership (§7.6.2, §7.7)", () => {
  function forced() {
    const s = seedCompany(start("base"), "PRR", {
      cell: { row: 0, col: 6 },
      cash: 100,
      holders: { "player:p1": 6, "player:p2": 2 },
    });
    s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 500 }, { t: "turnAdvance", phase: "3" });
    return s.do({
      type: "buyTrain",
      company: "PRR",
      trainType: "4",
      variant: null,
      from: "bank",
      seller: null,
      price: null,
      tradeIn: null,
    });
  }

  it("the president pays what they can, the Bank lends the rest, the company enters receivership", () => {
    const s = forced();
    expect(cashOf(s.state, "player:p1")).toBe(0);
    expect(counterOf(s.state, "company:PRR", "debt")).toBe(100);
    expect(s.state.companies["PRR"]!.status).toBe("receivership");
  });

  it("the next run is withheld, repays the debt, and the company is floated again at 0", () => {
    const s = forced();
    s.do(run("PRR", 120, "full"));
    expect(cashOf(s.state, "company:PRR")).toBe(20);
    expect(counterOf(s.state, "company:PRR", "debt")).toBe(0);
    expect(s.state.companies["PRR"]!.status).toBe("floated");
    expect(s.state.companies["PRR"]!.position).toEqual({ row: 0, col: 5 });
    expect(cashOf(s.state, "player:p2")).toBe(600);
    expect(s.lastWarnings.map((w) => w.code)).toContain("forcedWithhold");
    expect(s.violations()).toEqual([]);
  });

  it("a partial repayment keeps the receivership", () => {
    const s = forced();
    s.do(run("PRR", 60, "withhold"));
    expect(counterOf(s.state, "company:PRR", "debt")).toBe(40);
    expect(s.state.companies["PRR"]!.status).toBe("receivership");
  });
});

describe("1830 Classic: bankruptcy ends the game (C-2.3–2.5)", () => {
  it("a president who cannot cover the shortfall gets a warning, then can be declared bankrupt", () => {
    const s = seedCompany(start("classic"), "PRR", {
      cell: { row: 0, col: 6 },
      cash: 100,
      holders: { "player:p1": 6, "player:p2": 2 },
    });
    s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 550 }, { t: "turnAdvance", phase: "3" });
    s.do({
      type: "buyTrain",
      company: "PRR",
      trainType: "4",
      variant: null,
      from: "bank",
      seller: null,
      price: null,
      tradeIn: null,
    });
    expect(cashOf(s.state, "player:p1")).toBe(0);
    expect(cashOf(s.state, "company:PRR")).toBe(-150);
    expect(s.lastWarnings.map((w) => w.code)).toContain("presidentShort");
    expect(counterOf(s.state, "company:PRR", "debt")).toBe(0);

    s.do({ type: "declareBankruptcy", player: "p1", company: null });
    expect(counterOf(s.state, "player:p1", "bankrupt")).toBe(1);
    expect(s.state.holdings["player:p1"]?.["PRR"] ?? 0).toBe(0);
    expect(eventsOf(s.lastEvents, "shareTransfer")[0]).toMatchObject({ from: "player:p1", to: "pool", units: 6 });
    // The presidency leaves the pool for the player with the most shares.
    expect(s.state.presidency["PRR"]).toBe("player:p2");
  });
});

describe("1830 stock round", () => {
  const sr = () => start().do({ type: "startSR" });

  it("§6.3: floats at 60% bought from the IPO; capital (10 × par) arrives at the end of the SR", () => {
    const s = sr()
      .do({ type: "parCompany", player: "p1", company: "NYC", price: 82 })
      .do({ type: "buyShare", buyer: "player:p2", company: "NYC", source: "ipo", count: 2 })
      .do({ type: "buyShare", buyer: "player:p3", company: "NYC", source: "ipo", count: 2 });
    expect(s.state.companies["NYC"]).toMatchObject({ status: "floated", capitalPending: true });
    s.do({ type: "endSR" });
    expect(cashOf(s.state, "company:NYC")).toBe(820);
  });

  it("§5.1: pool shares are bought at the market price", () => {
    const s = seedCompany(sr(), "PRR", { cell: { row: 0, col: 8 }, par: 100, holders: { "player:p1": 2, pool: 2 } });
    s.do({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "pool", count: 1 });
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -126, bank: 126 });
  });

  it("§5.5: selling 2 moves down 2", () => {
    const s = seedCompany(sr(), "Erie", { cell: { row: 2, col: 7 }, holders: { "player:p1": 2, "player:p3": 3 } });
    s.do({ type: "sellShares", seller: "player:p3", company: "Erie", count: 2 });
    expect(netMoney(s.lastEvents)["player:p3"]).toBe(180);
    expect(s.state.companies["Erie"]!.position).toEqual({ row: 4, col: 7 });
  });
});

describe("zero run (T005, SC-002)", () => {
  it("a run of 0 withheld moves the price left 1 and moves no money", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", {
      cell: { row: 0, col: 8 },
      holders: { "player:p1": 6 },
    });
    const bank = cashOf(s.state, "bank");
    s.do(zeroRunAction(s.game, "PRR"));
    expect(zeroRunAction(s.game, "PRR")).toEqual({ type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 0 }], mode: "withhold" });
    expect(s.state.companies["PRR"]?.position).toEqual({ row: 0, col: 7 });
    expect(cashOf(s.state, "bank")).toBe(bank);
    expect(counterOf(s.state, "company:PRR", "runs")).toBe(1);
  });
});
