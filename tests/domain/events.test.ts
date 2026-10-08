import { describe, expect, it } from "vitest";
import { reduce, reduceAll } from "../../src/domain/events/reduce";
import { initialState, cashOf, unitsOf, presidencyHolder } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { miniGame, miniPlayers } from "../helpers/miniGame";

const base = () => initialState(miniGame, miniPlayers);

describe("initial state", () => {
  it("puts the bank total in the bank, all shares in the IPO, and privates and trains in the bank", () => {
    const s = base();
    expect(cashOf(s, "bank")).toBe(1000);
    expect(cashOf(s, "player:p1")).toBe(0);
    expect(unitsOf(s, "ipo:AA", "AA")).toBe(10);
    expect(presidencyHolder(s, "AA")).toBe("ipo:AA");
    expect(s.assets["private:P1"]).toBe("bank");
    expect(s.assets["train:2:1"]).toBe("bank");
    expect(s.assets["train:2:2"]).toBe("bank");
    expect(s.companies["AA"]?.status).toBe("unstarted");
    expect(s.turn.phase).toBe("2");
  });
});

describe("moneyTransfer", () => {
  it("moves money between holders", () => {
    const s = reduce(base(), { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 300 });
    expect(cashOf(s, "bank")).toBe(700);
    expect(cashOf(s, "player:p1")).toBe(300);
  });
});

describe("shareTransfer", () => {
  it("moves units between holders", () => {
    const s = reduce(base(), { t: "shareTransfer", company: "AA", from: "ipo:AA", to: "player:p1", units: 1 });
    expect(unitsOf(s, "ipo:AA", "AA")).toBe(9);
    expect(unitsOf(s, "player:p1", "AA")).toBe(1);
    expect(presidencyHolder(s, "AA")).toBe("ipo:AA");
  });

  it("moves the presidency marker with its units", () => {
    const s = reduce(base(), {
      t: "shareTransfer",
      company: "AA",
      from: "ipo:AA",
      to: "player:p2",
      units: 2,
      presidency: true,
    });
    expect(presidencyHolder(s, "AA")).toBe("player:p2");
    expect(unitsOf(s, "player:p2", "AA")).toBe(2);
  });

  it("never rejects: moving shares a holder does not have still applies arithmetically", () => {
    const s = reduce(base(), { t: "shareTransfer", company: "AA", from: "player:p1", to: "pool", units: 3 });
    expect(unitsOf(s, "player:p1", "AA")).toBe(-3);
    expect(unitsOf(s, "pool", "AA")).toBe(3);
  });
});

describe("marketMove", () => {
  it("places a company and puts a new arrival underneath an occupied cell (1848 §11.3)", () => {
    let s = reduce(base(), { t: "marketMove", company: "AA", to: { row: 0, col: 1 }, reason: "par" });
    s = reduce(s, { t: "marketMove", company: "BB", to: { row: 0, col: 1 }, reason: "par" });
    expect(s.companies["AA"]?.position).toEqual({ row: 0, col: 1 });
    expect(s.companies["BB"]?.stackOrder).toBeGreaterThan(s.companies["AA"]?.stackOrder ?? 0);
  });

  it("keeps the stack order when the company does not change cell", () => {
    let s = reduce(base(), { t: "marketMove", company: "AA", to: { row: 0, col: 1 }, reason: "par" });
    s = reduce(s, { t: "marketMove", company: "BB", to: { row: 0, col: 1 }, reason: "par" });
    const before = s.companies["BB"]?.stackOrder;
    s = reduce(s, { t: "marketMove", company: "BB", to: { row: 0, col: 1 }, reason: "manual" });
    expect(s.companies["BB"]?.stackOrder).toBe(before);
  });
});

describe("companyStatus", () => {
  it("sets status and the optional fields", () => {
    const s = reduce(base(), {
      t: "companyStatus",
      company: "AA",
      status: "parred",
      parPrice: 50,
      floatConfirmed: true,
      capitalPending: true,
    });
    expect(s.companies["AA"]).toMatchObject({
      status: "parred",
      parPrice: 50,
      floatConfirmed: true,
      capitalPending: true,
    });
  });
});

describe("assetTransfer", () => {
  it("changes the holder of an asset", () => {
    const s = reduce(base(), { t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:AA" });
    expect(s.assets["train:2:1"]).toBe("company:AA");
  });
});

describe("turnAdvance", () => {
  it("merges only the given fields", () => {
    let s = reduce(base(), { t: "turnAdvance", round: "SR", srNumber: 1 });
    s = reduce(s, { t: "turnAdvance", phase: "3" });
    expect(s.turn.round).toBe("SR");
    expect(s.turn.srNumber).toBe(1);
    expect(s.turn.phase).toBe("3");
  });

  it("clears the current company with null", () => {
    let s = reduce(base(), { t: "turnAdvance", company: "AA" });
    expect(s.turn.currentCompany).toBe("AA");
    s = reduce(s, { t: "turnAdvance", company: null });
    expect(s.turn.currentCompany).toBeUndefined();
  });
});

describe("counterChange and note", () => {
  it("adds a delta to a counter", () => {
    let s = reduce(base(), { t: "counterChange", subject: "player:p1", key: "debt", delta: 50 });
    s = reduce(s, { t: "counterChange", subject: "player:p1", key: "debt", delta: -20 });
    expect(s.counters["player:p1"]?.["debt"]).toBe(30);
  });

  it("note changes nothing", () => {
    const s0 = base();
    expect(reduce(s0, { t: "note", text: "hola" })).toEqual(s0);
  });
});

describe("derived fields (data-model §5)", () => {
  it("a runs counter marks the company as operated in this OR", () => {
    let s = reduce(base(), { t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1 });
    s = reduce(s, { t: "counterChange", subject: "company:AA", key: "runs", delta: 1 });
    expect(s.counters["company:AA"]?.["runs"]).toBe(1);
    expect(s.turn.operatedThisOR).toEqual(["AA"]);
  });

  it("a loan marker reaching a company counts as a loan this OR", () => {
    const s = reduce(base(), { t: "assetTransfer", asset: "loan:1", from: "company:BB", to: "company:AA" });
    expect(s.turn.loansThisOR["AA"]).toBe(1);
  });

  it("a player selling to the pool during an SR is recorded in soldThisSR", () => {
    let s = reduce(base(), { t: "turnAdvance", round: "SR", srNumber: 1 });
    s = reduce(s, { t: "shareTransfer", company: "AA", from: "player:p1", to: "pool", units: 1 });
    expect(s.soldThisSR["p1"]).toEqual(["AA"]);
  });

  it("a sale outside an SR is not recorded", () => {
    let s = reduce(base(), { t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1 });
    s = reduce(s, { t: "shareTransfer", company: "AA", from: "player:p1", to: "pool", units: 1 });
    expect(s.soldThisSR["p1"]).toBeUndefined();
  });

  it("a bankrupt counter marks the player bankrupt", () => {
    const s = reduce(base(), { t: "counterChange", subject: "player:p2", key: "bankrupt", delta: 1 });
    expect(s.counters["player:p2"]?.["bankrupt"]).toBe(1);
  });

  it("changing the OR clears the per-OR sets", () => {
    let s = reduce(base(), { t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1 });
    s = reduceAll(s, [
      { t: "counterChange", subject: "company:AA", key: "runs", delta: 1 },
      { t: "assetTransfer", asset: "loan:1", from: "company:BB", to: "company:AA" },
    ]);
    s = reduce(s, { t: "turnAdvance", orIndex: 2 });
    expect(s.turn.operatedThisOR).toEqual([]);
    expect(s.turn.loansThisOR).toEqual({});
  });

  it("starting a new SR clears soldThisSR, and a change of company does not clear the OR sets", () => {
    let s = reduce(base(), { t: "turnAdvance", round: "SR", srNumber: 1 });
    s = reduce(s, { t: "shareTransfer", company: "AA", from: "player:p1", to: "pool", units: 1 });
    s = reduce(s, { t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1 });
    s = reduce(s, { t: "counterChange", subject: "company:AA", key: "runs", delta: 1 });
    s = reduce(s, { t: "turnAdvance", company: "BB" });
    expect(s.turn.operatedThisOR).toEqual(["AA"]);
    s = reduce(s, { t: "turnAdvance", round: "SR", srNumber: 2 });
    expect(s.soldThisSR).toEqual({});
  });
});

describe("purity", () => {
  it("does not mutate its input and is deterministic", () => {
    const s0 = base();
    const snapshot = JSON.stringify(s0);
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 300 },
      { t: "shareTransfer", company: "AA", from: "ipo:AA", to: "player:p1", units: 2, presidency: true },
      { t: "marketMove", company: "AA", to: { row: 0, col: 0 }, reason: "par" },
    ];
    const a = reduceAll(s0, events);
    const b = reduceAll(s0, events);
    expect(a).toEqual(b);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});
