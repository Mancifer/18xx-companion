import { describe, expect, it } from "vitest";
import { cashOf, counterOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { priceOf } from "../../src/domain/mechanics/market";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { netMoney } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";

/** 1848 Australia (research R13). Test names cite the GMT 2021 rulebook §. */

const g1848 = getBuiltInGame("1848");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = () => TestSession.start(g1848, players);
const loan = (company: string | null, count = 1) => ({ type: "takeLoan", company, count });
const run = (company: string, amount: number, mode: "full" | "withhold") => ({
  type: "runAndPayout",
  company,
  parts: [{ part: "revenue", amount }],
  mode,
});

describe("1848 loans (§5.6)", () => {
  function withQR(phase = "3", cell = { row: 1, col: 10 } /* 210 */) {
    const s = seedCompany(start(), "QR", {
      cell,
      par: 100,
      holders: { "player:p1": 6 },
    });
    return s.apply({ t: "turnAdvance", round: "OR", orSet: 1, orIndex: 1, phase });
  }

  it("§5.6: loans are not available before phase 3", () => {
    expect(withQR("2").tryDo(loan("QR")).kind).toBe("unavailable");
  });

  it("§5.6.1: £100 from the BoE treasury and the lowest loan marker; first loan left 2; BoE price up", () => {
    const s = withQR();
    s.do(loan("QR"));
    expect(netMoney(s.lastEvents)).toEqual({ "company:BOE": -100, "company:QR": 100 });
    expect(s.state.assets["loan:1"]).toBe("company:QR");
    expect(s.state.companies["QR"]!.position).toEqual({ row: 1, col: 8 });
    expect(priceOf(g1848, s.state, "BOE")).toBe(80);
    expect(s.violations()).toEqual([]);
  });

  it("§5.6: a second loan in the same OR moves left 3", () => {
    const s = withQR();
    s.do(loan("QR")).do(loan("QR"));
    expect(s.state.assets["loan:2"]).toBe("company:QR");
    expect(s.state.companies["QR"]!.position).toEqual({ row: 1, col: 5 });
    expect(priceOf(g1848, s.state, "BOE")).toBe(90);
  });

  it("§5.6: two loans in one action move left 2 then left 3", () => {
    const s = withQR();
    s.do(loan("QR", 2));
    expect(s.state.companies["QR"]!.position).toEqual({ row: 1, col: 5 });
    expect(cashOf(s.state, "company:QR")).toBe(200);
  });

  it("§5.6: the first loan after a new OR starts moves left 2 again", () => {
    const s = withQR();
    s.do(loan("QR"));
    s.do({ type: "startOR" });
    s.do(loan("QR"));
    expect(s.state.companies["QR"]!.position).toEqual({ row: 1, col: 6 });
    expect(priceOf(g1848, s.state, "BOE")).toBe(90);
  });

  it("§5.6: no interest and no repay action exist", () => {
    const s = withQR();
    s.do(loan("QR"));
    expect(s.tryDo({ type: "repayLoan", company: "QR" }).kind).toBe("invalid");
    s.do({ type: "startOR" });
    expect(cashOf(s.state, "company:QR")).toBe(100);
  });

  it("§5.6: more than 5 voluntary loans gets a warning", () => {
    const s = withQR("3", { row: 0, col: 16 });
    s.do(loan("QR", 5));
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("loanLimit");
    s.do(loan("QR"));
    expect(s.lastWarnings.map((w) => w.code)).toContain("loanLimit");
  });
});

describe("1848 Bank of England (§5.4)", () => {
  it("§5.4: pays the phase minimum plus the extra, 10% per share, from the normal Bank", () => {
    const s = start();
    s.apply(
      { t: "shareTransfer", company: "BOE", from: "ipo:BOE", to: "player:p1", units: 2 },
      { t: "shareTransfer", company: "BOE", from: "ipo:BOE", to: "player:p2", units: 1 },
      { t: "turnAdvance", phase: "3" },
    );
    s.do({ type: "nationalPayout", extra: 40 });
    expect(netMoney(s.lastEvents)).toEqual({ bank: -42, "player:p1": 28, "player:p2": 14 });
    expect(counterOf(s.state, "company:BOE", "runs")).toBe(1);
  });

  it("§5.4: the minimum is 0 before phase 3, £200 from phase 5 and £300 from phase 8", () => {
    const s = start();
    s.apply({ t: "shareTransfer", company: "BOE", from: "ipo:BOE", to: "player:p1", units: 1 });
    s.do({ type: "nationalPayout", extra: 0 });
    expect(netMoney(s.lastEvents)).toEqual({});
    s.apply({ t: "turnAdvance", phase: "5" });
    s.do({ type: "nationalPayout", extra: 0 });
    expect(netMoney(s.lastEvents)["player:p1"]).toBe(20);
    s.apply({ t: "turnAdvance", phase: "8" });
    s.do({ type: "nationalPayout", extra: 0 });
    expect(netMoney(s.lastEvents)["player:p1"]).toBe(30);
  });

  it("the BoE has no runAndPayout of its own", () => {
    expect(start().tryDo(run("BOE", 100, "full")).kind).toBe("unavailable");
  });
});

describe("1848 dividends (§5.1.5)", () => {
  it("per-share dividends are rounded down; IPO and pool shares are not paid", () => {
    const s = seedCompany(start(), "QR", {
      cell: { row: 1, col: 5 },
      holders: { "player:p1": 6, pool: 1 },
    });
    s.do(run("QR", 245, "full"));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -144, "player:p1": 144 });
  });

  it("§11.1 payout right 1; at the end of a row, up 1", () => {
    const s = seedCompany(start(), "QR", { cell: { row: 1, col: 16 }, holders: { "player:p1": 6 } });
    s.do(run("QR", 100, "full"));
    expect(s.state.companies["QR"]!.position).toEqual({ row: 0, col: 16 });
  });
});

describe("1848 receivership (§5.5)", () => {
  function nearReceivership(directorCash?: number) {
    const s = seedCompany(start(), "QR", {
      cell: { row: 2, col: 1 }, // 50
      par: 80,
      cash: 150,
      holders: { "player:p1": 6, "player:p2": 2, "player:p3": 1, pool: 1 },
      trains: ["train:2:1"],
    });
    if (directorCash !== undefined) {
      s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 630 - directorCash });
    }
    return s;
  }

  it("§5.5.1: withholding into the receivership column triggers the takeover", () => {
    const s = nearReceivership();
    s.do(run("QR", 60, "withhold"));
    // Compensation: par 80 × 3 non-director shares = 240; QR had 210, Ana pays the 30 shortfall.
    expect(netMoney(s.lastEvents)).toEqual({
      bank: -60,
      "company:QR": -150,
      "player:p1": -30,
      "player:p2": 160,
      "player:p3": 80,
    });
    expect(cashOf(s.state, "company:QR")).toBe(0);
    expect(s.state.assets["train:2:1"]).toBe("removed");
    expect(s.state.companies["QR"]!.status).toBe("receivership");
    expect(counterOf(s.state, "bank", "nationalTakeovers")).toBe(1);
    expect(s.violations()).toEqual([]);
  });

  it("§5.5.2: the remaining treasury goes to the Bank", () => {
    const s = nearReceivership();
    s.apply({ t: "moneyTransfer", from: "bank", to: "company:QR", amount: 500 });
    s.do({ type: "enterReceivership", company: "QR" });
    expect(cashOf(s.state, "company:QR")).toBe(0);
    expect(netMoney(s.lastEvents)).toEqual({ "company:QR": -650, "player:p2": 160, "player:p3": 80, bank: 410 });
  });

  it("§5.5.3: a director short of cash borrows from the Bank and repays from the next income", () => {
    // Shortfall 240 − 150 = 90; Ana has 70 and borrows 20.
    const s = nearReceivership(70);
    s.do({ type: "enterReceivership", company: "QR" });
    expect(cashOf(s.state, "player:p1")).toBe(0);
    expect(counterOf(s.state, "player:p1", "debt")).toBe(20);
    expect(s.violations()).toEqual([]);

    s.do({ type: "transferMoney", from: "bank", to: "player:p1", amount: 50 });
    expect(counterOf(s.state, "player:p1", "debt")).toBe(0);
    expect(cashOf(s.state, "player:p1")).toBe(30);
  });

  it("§5.5.5 / §5.4.4: the 2nd takeover removes the cheapest permanent bank train, which counts as sold", () => {
    const s = nearReceivership();
    s.apply(
      { t: "counterChange", subject: "bank", key: "nationalTakeovers", delta: 1 },
      { t: "turnAdvance", phase: "4" },
      { t: "assetTransfer", asset: "private:P1", from: "bank", to: "player:p2" },
    );
    s.do({ type: "enterReceivership", company: "QR" });
    expect(counterOf(s.state, "bank", "nationalTakeovers")).toBe(2);
    expect(s.state.assets["train:5:3"]).toBe("removed");
    expect(s.state.turn.phase).toBe("5");
    // Phase 5 closes all privates.
    expect(s.state.assets["private:P1"]).toBe("removed");
  });

  it("§13.1: the 5th takeover reaches the end-game count", () => {
    const s = nearReceivership();
    s.apply({ t: "counterChange", subject: "bank", key: "nationalTakeovers", delta: 4 });
    s.do({ type: "enterReceivership", company: "QR" });
    expect(counterOf(s.state, "bank", "nationalTakeovers")).toBe(5);
  });
});

describe("1848 privates (§4)", () => {
  it("§4: all privates close on the first 5/5+", () => {
    const s = seedCompany(start(), "QR", { cell: { row: 1, col: 5 }, cash: 600 });
    s.apply(
      { t: "assetTransfer", asset: "private:P2", from: "bank", to: "player:p1" },
      { t: "turnAdvance", phase: "4" },
    );
    s.do({ type: "buyTrain", company: "QR", trainType: "5", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    expect(s.state.assets["private:P2"]).toBe("removed");
  });
});

describe("1848 stock round", () => {
  const sr = () => start().do({ type: "startSR" });

  it("§5.2.2: COM floats only after the Sydney–Adelaide confirmation, until phase 6", () => {
    const s = sr()
      .do({ type: "parCompany", player: "p1", company: "COM", price: 90 })
      .do({ type: "buyShare", buyer: "player:p2", company: "COM", source: "ipo", count: 4 });
    expect(s.state.companies["COM"]!.status).toBe("parred");
    s.do({ type: "confirmFloatCondition", company: "COM" });
    expect(cashOf(s.state, "company:COM")).toBe(900);
  });

  it("§5.4: BoE shares at the track price, no price change on sale, money to the normal Bank", () => {
    const s = sr();
    s.apply({ t: "marketMove", company: "BOE", to: { index: 3 }, reason: "loan" }); // £100
    s.do({ type: "buyShare", buyer: "player:p1", company: "BOE", source: "ipo", count: 1 });
    expect(netMoney(s.lastEvents)).toEqual({ "player:p1": -100, bank: 100 });
    s.do({ type: "sellShares", seller: "player:p1", company: "BOE", count: 1 });
    expect(netMoney(s.lastEvents)).toEqual({ bank: -100, "player:p1": 100 });
    expect(s.state.companies["BOE"]!.position).toEqual({ index: 3 });
  });
});
