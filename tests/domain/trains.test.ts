import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { AssetId, CellRef } from "../../src/domain/types";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf } from "../helpers/flows";

const g1830 = getBuiltInGame("1830");
const g1848 = getBuiltInGame("1848");
const g21 = getBuiltInGame("21moon");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

function session(game: GameDefinition): TestSession {
  return TestSession.start(game, players);
}

/** A floated company with cash and, optionally, trains taken from the bank. */
function floated(s: TestSession, company: string, cell: CellRef, cash: number, trains: AssetId[] = []): TestSession {
  s.apply(
    { t: "companyStatus", company, status: "floated" },
    { t: "marketMove", company, to: cell, reason: "par" },
    { t: "moneyTransfer", from: "bank", to: `company:${company}`, amount: cash },
    ...trains.map((asset) => ({ t: "assetTransfer" as const, asset, from: "bank" as const, to: `company:${company}` as const })),
  );
  return s;
}

const buy = (company: string, trainType: string, extra: Record<string, unknown> = {}) => ({
  type: "buyTrain",
  company,
  trainType,
  variant: null,
  from: "bank",
  seller: null,
  price: null,
  tradeIn: null,
  ...extra,
});

const holder = (s: TestSession, asset: string) => s.state.assets[asset];

describe("buyTrain (FR-034)", () => {
  it("from the bank at list cost", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 500);
    s.do(buy("PRR", "2"));
    expect(cashOf(s.state, "company:PRR")).toBe(420);
    expect(holder(s, "train:2:1")).toBe("company:PRR");
    expect(s.violations()).toEqual([]);
  });

  it("the cheapest-numbered train of the type comes first", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 500);
    s.do(buy("PRR", "2")).do(buy("PRR", "2"));
    expect(holder(s, "train:2:2")).toBe("company:PRR");
  });

  it("from the pool at face value, paid to the bank (1830 §7.6)", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 500);
    s.apply({ t: "assetTransfer", asset: "train:3:1", from: "bank", to: "pool" });
    const bank = cashOf(s.state, "bank");
    s.do(buy("PRR", "3", { from: "pool" }));
    expect(holder(s, "train:3:1")).toBe("company:PRR");
    expect(cashOf(s.state, "company:PRR")).toBe(320);
    expect(cashOf(s.state, "bank")).toBe(bank + 180);
  });

  it("from another company at an agreed price ≥ 1", () => {
    const s = session(g1830);
    floated(s, "PRR", { row: 0, col: 6 }, 500);
    floated(s, "NYC", { row: 1, col: 6 }, 100, ["train:2:1"]);
    s.do(buy("PRR", "2", { from: "company", seller: "NYC", price: 1 }));
    expect(holder(s, "train:2:1")).toBe("company:PRR");
    expect(cashOf(s.state, "company:PRR")).toBe(499);
    expect(cashOf(s.state, "company:NYC")).toBe(101);
  });

  it("variants: the 1848 2+ costs £120", () => {
    const s = floated(session(g1848), "QR", { row: 1, col: 5 }, 500);
    s.do(buy("QR", "2", { variant: "2+" }));
    expect(cashOf(s.state, "company:QR")).toBe(380);
  });

  it("an unlimited type creates the next numbered train", () => {
    const s = floated(session(g1848), "QR", { row: 1, col: 5 }, 2000);
    s.apply({ t: "turnAdvance", phase: "6" });
    s.do(buy("QR", "8")).do(buy("QR", "8"));
    expect(holder(s, "train:8:1")).toBe("company:QR");
    expect(holder(s, "train:8:2")).toBe("company:QR");
  });

  it("1830 trade-in: a D for $800 trading a 5, the 5 goes to the open market", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 1000, ["train:5:1"]);
    s.apply({ t: "turnAdvance", phase: "D" });
    s.do(buy("PRR", "D", { tradeIn: "5" }));
    expect(cashOf(s.state, "company:PRR")).toBe(200);
    expect(holder(s, "train:D:1")).toBe("company:PRR");
    expect(holder(s, "train:5:1")).toBe("pool");
  });

  it("1830: the first D rusts the 4s, including one traded in", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 1000, ["train:4:1"]);
    s.apply({ t: "turnAdvance", phase: "6" });
    s.do(buy("PRR", "D", { tradeIn: "4" }));
    expect(s.state.turn.phase).toBe("D");
    expect(holder(s, "train:4:1")).toBe("removed");
    expect(s.violations()).toEqual([]);
  });

  it("an explicit price overrides the list cost (private discounts are applied by the table)", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 500);
    s.do(buy("PRR", "3", { price: 140 }));
    expect(cashOf(s.state, "company:PRR")).toBe(360);
  });

  it("warns when the company cannot pay, and still records it", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 50);
    s.do(buy("PRR", "2"));
    expect(s.lastWarnings.map((w) => w.code)).toContain("insufficientCash");
    expect(cashOf(s.state, "company:PRR")).toBe(-30);
  });

  it("warns when the type is not available yet (D before phase 6)", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 2000);
    s.do(buy("PRR", "D"));
    expect(s.lastWarnings.map((w) => w.code)).toContain("trainNotAvailable");
  });
});

describe("phase changes (FR-035)", () => {
  it("only the first train of a type changes the phase, once", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 1000);
    s.do(buy("PRR", "3"));
    expect(s.state.turn.phase).toBe("3");
    expect(eventsOf(s.lastEvents, "turnAdvance")).toHaveLength(1);
    s.do(buy("PRR", "3"));
    expect(eventsOf(s.lastEvents, "turnAdvance")).toHaveLength(0);
  });

  it("1830 phase 4 rusts the 2-trains (they go to removed)", () => {
    const s = session(g1830);
    floated(s, "PRR", { row: 0, col: 6 }, 1000, ["train:2:1"]);
    floated(s, "NYC", { row: 1, col: 6 }, 100, ["train:2:2"]);
    s.apply({ t: "turnAdvance", phase: "3" });
    s.do(buy("PRR", "4"));
    expect(s.state.turn.phase).toBe("4");
    expect(holder(s, "train:2:1")).toBe("removed");
    expect(holder(s, "train:2:2")).toBe("removed");
    expect(s.violations()).toEqual([]);
  });

  it("1830 phase 5 closes the privates (they go to removed)", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 1000);
    s.apply(
      { t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p1" },
      { t: "assetTransfer", asset: "private:CS", from: "bank", to: "company:PRR" },
      { t: "turnAdvance", phase: "4" },
    );
    s.do(buy("PRR", "5"));
    expect(holder(s, "private:SV")).toBe("removed");
    expect(holder(s, "private:CS")).toBe("removed");
  });

  it("skipping a phase applies the effects of every phase passed", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 2000, ["train:2:1"]);
    s.do(buy("PRR", "4"));
    expect(s.state.turn.phase).toBe("4");
    expect(holder(s, "train:2:1")).toBe("removed");
  });

  it("1848 P6 closes when CAR buys a train", () => {
    const s = floated(session(g1848), "CAR", { row: 1, col: 5 }, 500);
    s.apply({ t: "assetTransfer", asset: "private:P6", from: "bank", to: "player:p1" });
    s.do(buy("CAR", "2"));
    expect(holder(s, "private:P6")).toBe("removed");
  });
});

describe("train limit warnings", () => {
  it("1830: limit 3 from phase 4 (counting after rust)", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 2000, ["train:3:1", "train:3:2", "train:3:3"]);
    s.apply({ t: "turnAdvance", phase: "3" });
    s.do(buy("PRR", "4"));
    expect(s.lastWarnings.map((w) => w.code)).toContain("trainLimit");
  });

  it("1848: limit 2 from phase 5, the 2E does not count", () => {
    const s = floated(session(g1848), "QR", { row: 1, col: 5 }, 2000, ["train:5:1", "train:6:1"]);
    s.apply({ t: "turnAdvance", phase: "6" });
    s.do(buy("QR", "2E"));
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("trainLimit");
    s.do(buy("QR", "6"));
    expect(s.lastWarnings.map((w) => w.code)).toContain("trainLimit");
  });

  it("21Moon: two per base, two bases", () => {
    const s = floated(session(g21), "VH", { row: 4, col: 2 }, 2000, ["train:2:1", "train:2:2", "train:2:3"]);
    s.do(buy("VH", "2"));
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("trainLimit");
    s.do(buy("VH", "3"));
    expect(s.lastWarnings.map((w) => w.code)).toContain("trainLimit");
  });
});

describe("discardTrain and changeTrainSupply", () => {
  it("1830 discards to the open market (pool)", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 0, ["train:3:1"]);
    s.do({ type: "discardTrain", company: "PRR", train: "3" });
    expect(holder(s, "train:3:1")).toBe("pool");
  });

  it("1848 removes discarded trains from the game (§8.1)", () => {
    const s = floated(session(g1848), "QR", { row: 1, col: 5 }, 0, ["train:3:1"]);
    s.do({ type: "discardTrain", company: "QR", train: "train:3:1" });
    expect(holder(s, "train:3:1")).toBe("removed");
  });

  it("21Moon P2: adds a reserve transport to the bank and removes one", () => {
    const s = session(g21);
    expect(holder(s, "train:3:5")).toBe("removed");
    s.do({ type: "changeTrainSupply", trainType: "3", op: "add" });
    expect(holder(s, "train:3:5")).toBe("bank");
    s.do({ type: "changeTrainSupply", trainType: "4", op: "remove" });
    expect(holder(s, "train:4:3")).toBe("removed");
    expect(s.state.turn.phase).toBe("2");
  });

  it("changeTrainSupply is not offered without reserve trains", () => {
    const s = session(g1830);
    expect(s.tryDo({ type: "changeTrainSupply", trainType: "3", op: "add" }).kind).toBe("unavailable");
  });
});

describe("forced purchases", () => {
  const base = applyOptions(g1830, { ruleset: "base" });

  it("1830 Base: the president pays what they can and the bank lends the rest (§7.7)", () => {
    const s = floated(session(base), "PRR", { row: 0, col: 6 }, 100);
    s.apply({ t: "shareTransfer", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true });
    s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 500 }); // Ana keeps 100
    s.apply({ t: "turnAdvance", phase: "3" });
    s.do(buy("PRR", "4"));
    expect(cashOf(s.state, "player:p1")).toBe(0);
    expect(cashOf(s.state, "company:PRR")).toBe(0);
    expect(s.state.counters["company:PRR"]?.["debt"]).toBe(100);
    expect(s.state.companies["PRR"]!.status).toBe("receivership");
    expect(s.violations()).toEqual([]);
  });
});
