import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { AssetId, CellRef } from "../../src/domain/types";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";
import { overLimitCompanies, trainLimitFor, trainStack } from "../../src/domain/mechanics/phases";

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

describe("RotLA trains, phases and limits (US6)", () => {
  /** A 3-player RotLA game with rich companies: minors EXP, TUN and the major CON. */
  function rotla(options: Record<string, string> = {}) {
    const s = rotlaSession({ options });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 5 }, treasury: 5000 });
    seedRotla(s, "TUN", { price: 70, holders: { "player:p2": 5 }, treasury: 5000 });
    seedRotla(s, "CON", { price: 100, holders: { "player:p3": 10 }, treasury: 5000 });
    return s;
  }
  const limits = (s: TestSession) => ({
    minor: trainLimitFor(s.game, s.state, "EXP"),
    major: trainLimitFor(s.game, s.state, "CON"),
  });

  it("the first 3, 4, 5, 6 and 7 start green, green4, purple, purple6 and grey with their limits", () => {
    const s = rotla();
    expect(s.state.turn.phase).toBe("yellow");
    expect(limits(s)).toEqual({ minor: 2, major: 2 });
    const steps = [
      ["3", "green", { minor: 2, major: 4 }],
      ["4", "green4", { minor: 2, major: 3 }],
      ["5", "purple", { minor: 1, major: 2 }],
      ["6", "purple6", { minor: 1, major: 2 }],
      ["7", "grey", { minor: 1, major: 2 }],
    ] as const;
    for (const [type, phase, limit] of steps) {
      s.do(buy("CON", type));
      expect(s.state.turn.phase).toBe(phase);
      expect(limits(s)).toEqual(limit);
    }
  });

  it("2s rust at the first 4, 3s at the first 6, 4s at the first 7", () => {
    const s = rotla();
    s.do(buy("EXP", "2")).do(buy("TUN", "3"));
    s.do(buy("CON", "4"));
    expect(holder(s, "train:2:1")).toBe("removed");
    expect(holder(s, "train:3:1")).toBe("company:TUN");
    s.do(buy("CON", "5")).do(buy("CON", "6"));
    expect(holder(s, "train:3:1")).toBe("removed");
    expect(holder(s, "train:4:1")).toBe("company:CON");
    s.do(buy("CON", "7", { variant: "7" }));
    expect(holder(s, "train:4:1")).toBe("removed");
  });

  it("trainLimitFor adds the Spacious bonus, and overLimitCompanies lists who is over", () => {
    const s = rotla();
    seedRotla(s, "SPC", { price: 60, holders: { "player:p1": 5 }, treasury: 5000 });
    expect(trainLimitFor(s.game, s.state, "SPC")).toBe(3);
    s.do(buy("EXP", "2")).do(buy("EXP", "2")).do(buy("SPC", "2")).do(buy("SPC", "2")).do(buy("SPC", "2"));
    expect(overLimitCompanies(s.game, s.state)).toEqual([]);
    s.do(buy("CON", "3")).do(buy("CON", "3")).do(buy("CON", "3")).do(buy("CON", "4"));
    // The 4 rusts the 2s; CON holds 3+3+3+4 against a limit of 3 in green4.
    expect(overLimitCompanies(s.game, s.state)).toEqual([{ company: "CON", count: 4, limit: 3 }]);
  });

  it("buyTrain warns against the tier-aware limit", () => {
    const s = rotla();
    s.do(buy("EXP", "2")).do(buy("EXP", "2"));
    const third = s.tryDo(buy("EXP", "2"));
    expect(third.kind === "ok" && third.warnings.map((w) => w.code)).toContain("trainLimit");
  });

  it("7/∞: the 7 costs 750 and the ∞ 1000", () => {
    const s = rotla();
    s.do(buy("CON", "7", { variant: "7" }));
    expect(netMoney(s.lastEvents)["company:CON"]).toBe(-750);
    s.do(buy("CON", "7", { variant: "∞" }));
    expect(netMoney(s.lastEvents)["company:CON"]).toBe(-1000);
  });

  it("∞ trading in a non-rusted 5 costs 800, and the 5 leaves the game", () => {
    const s = rotla();
    s.do(buy("CON", "5"));
    s.do(buy("CON", "7", { variant: "∞", tradeIn: "5" }));
    expect(netMoney(s.lastEvents)["company:CON"]).toBe(-800);
    expect(holder(s, "train:5:1")).toBe("removed");
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("tradeIn");
  });

  it("the trade-in price does not apply to the 7 variant", () => {
    const s = rotla();
    s.do(buy("CON", "5"));
    const result = s.tryDo(buy("CON", "7", { variant: "7", tradeIn: "5" }));
    expect(result.kind === "ok" && result.warnings.map((w) => w.code)).toContain("tradeIn");
    s.do(buy("CON", "7", { variant: "7", tradeIn: "5" }));
    expect(netMoney(s.lastEvents)["company:CON"]).toBe(-750);
    expect(holder(s, "train:5:1")).toBe("company:CON");
  });

  it("rust comes first: the first 7/∞ as ∞ trading in a 4 rusts the 4s and charges 1000", () => {
    const s = rotla();
    s.do(buy("CON", "4")).do(buy("EXP", "4"));
    const result = s.tryDo(buy("CON", "7", { variant: "∞", tradeIn: "4" }));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.warnings.find((w) => w.code === "tradeIn")?.messageEs).toBe("El 4 se oxida con esta compra: no se puede entregar.");
    s.do(buy("CON", "7", { variant: "∞", tradeIn: "4" }));
    expect(netMoney(s.lastEvents)["company:CON"]).toBe(-1000);
    expect(holder(s, "train:4:1")).toBe("removed");
    expect(holder(s, "train:4:2")).toBe("removed");
    // Only the rust moved the 4s: no trade-in transfer.
    expect(eventsOf(s.lastEvents, "assetTransfer").filter((e) => e.asset === "train:4:1")).toHaveLength(1);
  });

  it("the same first ∞ trading in a 5 costs 800", () => {
    const s = rotla();
    s.do(buy("CON", "4")).do(buy("CON", "5"));
    s.do(buy("CON", "7", { variant: "∞", tradeIn: "5" }));
    expect(netMoney(s.lastEvents)["company:CON"]).toBe(-800);
    expect(holder(s, "train:5:1")).toBe("removed");
  });

  it("selling or trading in a special or permanent train warns", () => {
    const s = rotla();
    s.do(buy("TUN", "2"));
    s.apply({ t: "counterChange", subject: "company:TUN", key: "permanent:train:2:1", delta: 1 });
    const sale = s.tryDo(buy("EXP", "2", { from: "company", seller: "TUN", price: 50 }));
    expect(sale.kind === "ok" && sale.warnings.map((w) => w.code)).toContain("keptTrain");
  });

  it("trainStack lists the bank's trains top first, 7/∞ as ∞", () => {
    const s = rotla();
    expect(trainStack(s.game, s.state)).toEqual([
      { type: "2", displayName: "2", left: 7 },
      { type: "3", displayName: "3", left: 5 },
      { type: "4", displayName: "4", left: 4 },
      { type: "5", displayName: "5", left: 3 },
      { type: "6", displayName: "6", left: 2 },
      { type: "7", displayName: "7/∞", left: "∞" },
    ]);
    for (let i = 0; i < 7; i++) s.apply({ t: "assetTransfer", asset: `train:2:${i + 1}`, from: "bank", to: "removed" });
    expect(trainStack(s.game, s.state)[0]).toEqual({ type: "3", displayName: "3", left: 5 });
  });
});

describe("correctTrain is exempt from the phase and private-closing triggers (feature 011, research R4)", () => {
  const correctAdd = (company: string, train: string) => ({ type: "correctTrain", company, train, op: "add", to: null, amount: null });
  const buy = (company: string, trainType: string) => ({ type: "buyTrain", company, trainType, variant: null, from: "bank", seller: null, price: null, tradeIn: null });

  it("adding a 3 in phase 2 starts no phase and rusts nothing", () => {
    const s = floated(session(g1830), "PRR", { row: 0, col: 6 }, 500, ["train:2:1"]);
    s.do(correctAdd("PRR", "3"));
    expect(eventsOf(s.lastEvents, "turnAdvance")).toEqual([]);
    expect(s.state.turn.phase).toBe("2");
    expect(s.state.assets["train:2:1"]).toBe("company:PRR");
  });

  it("the BO private does not close when B&O gets a train by correction", () => {
    const s = floated(session(g1830), "B&O", { row: 0, col: 6 }, 500);
    s.apply({ t: "assetTransfer", asset: "private:BO", from: "bank", to: "player:p1" });
    s.do(correctAdd("B&O", "2"));
    expect(s.state.assets["private:BO"]).toBe("player:p1");
  });

  it("buyTrain still triggers both (regression)", () => {
    const s = floated(session(g1830), "B&O", { row: 0, col: 6 }, 500);
    s.apply({ t: "assetTransfer", asset: "private:BO", from: "bank", to: "player:p1" });
    s.do(buy("B&O", "3"));
    expect(s.state.turn.phase).toBe("3");
    expect(s.state.assets["private:BO"]).toBe("removed");
  });
});
