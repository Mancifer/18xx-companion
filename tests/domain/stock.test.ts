import { describe, expect, it } from "vitest";
import { cashOf, presidentOf, unitsOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { priceOf } from "../../src/domain/mechanics/market";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";
import { buy, endSR, par, sell, startSR } from "../helpers/stock";

/** Stock round actions (US4, FR-040–FR-042). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const g1830 = getBuiltInGame("1830");
const g1848 = getBuiltInGame("1848");
const g21 = getBuiltInGame("21moon");
const start = (game = g1830) => TestSession.start(game, players).do(startSR);
const codes = (s: TestSession) => s.lastWarnings.map((w) => w.code);

describe("parCompany (US4-1)", () => {
  it("1830: parred at the price, the presidency to the player, 2 × par to the bank, token on the par cell", () => {
    const s = start().do(par("p1", "NYC", 82));
    expect(s.state.companies["NYC"]).toMatchObject({ status: "parred", parPrice: 82, position: { row: 2, col: 6 } });
    expect(unitsOf(s.state, "player:p1", "NYC")).toBe(2);
    expect(presidentOf(s.state, "NYC")).toBe("p1");
    expect(netMoney(s.lastEvents)).toEqual({ "player:p1": -164, bank: 164 });
  });

  it("21Moon: the president's certificate is paid to the company", () => {
    const s = start(g21).do(par("p1", "VH", 70));
    expect(netMoney(s.lastEvents)).toEqual({ "player:p1": -140, "company:VH": 140 });
  });

  it("a price that is not a par option is not available", () => {
    expect(start().tryDo(par("p1", "NYC", 85)).kind).toBe("unavailable");
  });

  it("a company that is already started cannot be parred again", () => {
    expect(start().do(par("p1", "NYC", 82)).tryDo(par("p2", "NYC", 82)).kind).toBe("unavailable");
  });

  it("1848 CAR always starts at 100", () => {
    expect(start(g1848).tryDo(par("p1", "CAR", 90)).kind).toBe("unavailable");
    expect(start(g1848).tryDo(par("p1", "CAR", 100)).kind).toBe("ok");
  });
});

describe("buyShare", () => {
  function prrAt112() {
    const s = start();
    seedCompany(s, "PRR", { cell: { row: 0, col: 7 }, par: 100, holders: { "player:p1": 2, pool: 1 } });
    return s;
  }

  it("from the IPO at par (1830 §5.1)", () => {
    const s = prrAt112().do(buy("p2", "PRR"));
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -100, bank: 100 });
    expect(unitsOf(s.state, "player:p2", "PRR")).toBe(1);
  });

  it("from the pool at the market price", () => {
    const s = prrAt112().do(buy("p2", "PRR", "pool"));
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -112, bank: 112 });
    expect(unitsOf(s.state, "pool", "PRR")).toBe(0);
  });

  it("several at once", () => {
    const s = prrAt112().do(buy("p2", "PRR", "ipo", 3));
    expect(unitsOf(s.state, "player:p2", "PRR")).toBe(3);
    expect(netMoney(s.lastEvents)["player:p2"]).toBe(-300);
  });

  it("from a company treasury at the market price, paid to the company", () => {
    const s = start(g21);
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 2, "company:VH": 1 } });
    s.do(buy("p2", "VH", "treasury"));
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -80, "company:VH": 80 });
  });

  it("a company that has not been started cannot be bought", () => {
    expect(start().tryDo(buy("p2", "PRR")).kind).toBe("unavailable");
  });
});

describe("sellShares (US4-3, FR-041)", () => {
  it("1830: paid at the pre-sale price, down one row per share after the sale", () => {
    const s = start();
    seedCompany(s, "Erie", { cell: { row: 1, col: 6 }, holders: { "player:p1": 2, "player:p3": 3 } });
    s.do(sell("p3", "Erie", 2));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -180, "player:p3": 180 });
    expect(s.state.companies["Erie"]!.position).toEqual({ row: 3, col: 6 });
    expect(unitsOf(s.state, "pool", "Erie")).toBe(2);
    expect(s.state.soldThisSR["p3"]).toEqual(["Erie"]);
  });

  it("1848: down once per sale, however many shares (§12.5.1)", () => {
    const s = start(g1848);
    seedCompany(s, "QR", { cell: { row: 1, col: 5 }, holders: { "player:p1": 2, "player:p3": 3 } });
    s.do(sell("p3", "QR", 3));
    expect(s.state.companies["QR"]!.position).toEqual({ row: 2, col: 5 });
  });

  it("21Moon: no move before the company has operated (§9.1)", () => {
    const s = start(g21);
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 2, "player:p3": 2 } });
    s.do(sell("p3", "VH", 1));
    expect(s.state.companies["VH"]!.position).toEqual({ row: 4, col: 3 });
    s.apply({ t: "counterChange", subject: "company:VH", key: "runs", delta: 1 });
    s.do(sell("p3", "VH", 1));
    expect(s.state.companies["VH"]!.position).toEqual({ row: 5, col: 3 });
  });

  it("selling more than held warns and still records it", () => {
    const s = start();
    seedCompany(s, "Erie", { cell: { row: 1, col: 6 }, holders: { "player:p1": 2, "player:p3": 1 } });
    s.do(sell("p3", "Erie", 2));
    expect(codes(s)).toContain("notEnoughShares");
  });

  it("no move at the bottom of a column", () => {
    const s = start(g1848);
    seedCompany(s, "QR", { cell: { row: 5, col: 6 }, holders: { "player:p1": 2, "player:p3": 3 } });
    s.do(sell("p3", "QR", 1));
    expect(s.state.companies["QR"]!.position).toEqual({ row: 5, col: 6 });
  });
});

describe("sold-out moves at the end of the SR", () => {
  it("1830: up 1 when every share is held by players, in descending price order", () => {
    const s = start();
    seedCompany(s, "PRR", { cell: { row: 1, col: 7 }, holders: { "player:p1": 6, "player:p2": 4 } });
    seedCompany(s, "NYC", { cell: { row: 2, col: 9 }, holders: { "player:p3": 6, "player:p4": 4 } });
    seedCompany(s, "B&O", { cell: { row: 1, col: 6 }, holders: { "player:p1": 6, pool: 4 } });
    s.do(endSR);
    expect(s.state.companies["PRR"]!.position).toEqual({ row: 0, col: 7 });
    expect(s.state.companies["NYC"]!.position).toEqual({ row: 1, col: 9 });
    expect(s.state.companies["B&O"]!.position).toEqual({ row: 1, col: 6 });
    expect(eventsOf(s.lastEvents, "marketMove").map((e) => e.company)).toEqual(["NYC", "PRR"]);
  });

  it("21Moon sold-out moves happen at the end of the CR, not the SR", () => {
    const s = start(g21);
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 6, "player:p2": 4 } });
    s.do(endSR);
    expect(s.state.companies["VH"]!.position).toEqual({ row: 4, col: 3 });
  });
});

describe("swapCertificates (21Moon §9.2.2)", () => {
  it("exchanges certificates with the company treasury, with no money", () => {
    const s = start(g21);
    seedCompany(s, "SSF", { cell: { row: 3, col: 2 }, holders: { "player:p2": 2, "company:VH": 1 } });
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 3 } });
    s.do({
      type: "swapCertificates",
      player: "p1",
      company: "VH",
      give: { company: "VH", units: 1 },
      take: { company: "SSF", units: 1 },
    });
    expect(netMoney(s.lastEvents)).toEqual({});
    expect(unitsOf(s.state, "player:p1", "SSF")).toBe(1);
    expect(unitsOf(s.state, "company:VH", "VH")).toBe(1);
    expect(unitsOf(s.state, "player:p1", "VH")).toBe(2);
  });
});

describe("stockBatch (US4-5, FR-042)", () => {
  it("one group, applied in order, at the stated prices", () => {
    const s = start();
    seedCompany(s, "Erie", { cell: { row: 1, col: 6 }, par: 90, holders: { "player:p1": 2, "player:p3": 3 } });
    s.do({
      type: "stockBatch",
      items: [buy("p2", "Erie"), sell("p3", "Erie", 2), buy("p4", "Erie", "pool")],
      assumedPrices: [null, 90, 70],
    });
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -90, "player:p3": 180, "player:p4": -70, bank: -20 });
    expect(unitsOf(s.state, "player:p4", "Erie")).toBe(1);
    expect(s.state.companies["Erie"]!.position).toEqual({ row: 3, col: 6 });
  });

  it("an item that is not available makes the batch unavailable", () => {
    const s = start();
    expect(s.tryDo({ type: "stockBatch", items: [buy("p2", "PRR")], assumedPrices: [null] }).kind).toBe("unavailable");
  });
});

describe("warnings (FR-025: never blocking)", () => {
  it("certificate limit, with the 1830 yellow zone not counting", () => {
    const s = start();
    const companies = ["PRR", "NYC", "CPR", "B&O"];
    companies.forEach((c, i) =>
      seedCompany(s, c, { cell: { row: 0, col: 6 + i }, holders: { "player:p1": 4 } }),
    );
    // 4 presidencies of 2 units + 2 more each = 4 × 3 = 12 certificates; add 4 more.
    seedCompany(s, "C&O", { cell: { row: 1, col: 6 }, holders: { "player:p1": 5 } });
    s.do(buy("p1", "C&O"));
    expect(codes(s)).toContain("certificateLimit");
    // A company in the yellow zone does not count.
    const t = start();
    companies.forEach((c, i) => seedCompany(t, c, { cell: { row: 0, col: 6 + i }, holders: { "player:p1": 4 } }));
    seedCompany(t, "C&O", { cell: { row: 2, col: 1 }, holders: { "player:p1": 5 } });
    t.do(buy("p1", "C&O", "ipo"));
    expect(codes(t)).not.toContain("certificateLimit");
  });

  it("per-company limit of 60%, relaxed in the orange zone", () => {
    const s = start();
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    s.do(buy("p1", "PRR"));
    expect(codes(s)).toContain("companyLimit");
    const t = start();
    seedCompany(t, "PRR", { cell: { row: 4, col: 1 }, holders: { "player:p1": 6 } });
    t.do(buy("p1", "PRR"));
    expect(codes(t)).not.toContain("companyLimit");
  });

  it("pool limit (1830: 5 certificates)", () => {
    const s = start();
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 2, "player:p2": 3, pool: 4 } });
    s.do(sell("p2", "PRR", 2));
    expect(codes(s)).toContain("poolLimit");
  });

  it("buying a company sold earlier in the same SR", () => {
    const s = start();
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 2, "player:p2": 3 } });
    s.do(sell("p2", "PRR", 1)).do(buy("p2", "PRR"));
    expect(codes(s)).toContain("boughtAfterSelling");
  });

  it("buying without enough cash", () => {
    const s = start();
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, par: 100, holders: { "player:p1": 2 } });
    s.do(buy("p2", "PRR", "ipo", 7));
    expect(codes(s)).toContain("insufficientCash");
  });

  it("21Moon: 60% per company with two players", () => {
    const two = makePlayers(["Ana", "Bruno"]);
    const s = TestSession.start(g21, two).do(startSR);
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 5 } });
    s.do(buy("p1", "VH"));
    expect(codes(s)).not.toContain("companyLimit");
    s.do(buy("p1", "VH"));
    expect(codes(s)).toContain("companyLimit");
  });
});

describe("nationalBank stock (1848 §5.4)", () => {
  it("BoE shares are bought and sold at the track price, with no price change; money to and from the Bank", () => {
    const s = start(g1848).do(buy("p1", "BOE", "ipo", 2));
    expect(netMoney(s.lastEvents)).toEqual({ "player:p1": -140, bank: 140 });
    s.do(sell("p1", "BOE", 1));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -70, "player:p1": 70 });
    expect(priceOf(g1848, s.state, "BOE")).toBe(70);
    expect(s.state.presidency["BOE"]).toBeNull();
    expect(cashOf(s.state, "company:BOE")).toBe(2000);
  });
});
