import { describe, expect, it } from "vitest";
import { presidentOf, unitsOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { netMoney } from "../helpers/flows";
import { seedCompany } from "../helpers/seed";

/** privateGrants (research R16): grants on purchase, exchanges, and the closings they cause. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const buyPrivate = (buyer: string, id: string, price: number, par: number | null = null) => ({
  type: "buyPrivate",
  buyer,
  private: id,
  price,
  par,
});
const start = (id: string) => TestSession.start(getBuiltInGame(id), players);

describe("1830 (§4)", () => {
  it("CA grants 10% of the PRR", () => {
    const s = start("1830").do(buyPrivate("p2", "CA", 160));
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -160, bank: 160 });
    expect(s.state.assets["private:CA"]).toBe("player:p2");
    expect(unitsOf(s.state, "player:p2", "PRR")).toBe(1);
  });

  it("BO grants the B&O president's certificate at the par the owner chooses", () => {
    const s = start("1830").do(buyPrivate("p3", "BO", 220, 100));
    expect(s.state.companies["B&O"]).toMatchObject({ status: "parred", parPrice: 100, position: { row: 0, col: 6 } });
    expect(unitsOf(s.state, "player:p3", "B&O")).toBe(2);
    expect(presidentOf(s.state, "B&O")).toBe("p3");
  });

  it("BO without a par price warns (the table sets it later)", () => {
    const s = start("1830").do(buyPrivate("p3", "BO", 220));
    expect(s.lastWarnings.map((w) => w.code)).toContain("grantPar");
    expect(unitsOf(s.state, "player:p3", "B&O")).toBe(2);
  });

  it("BO closes when the B&O buys its first train", () => {
    const s = start("1830").do(buyPrivate("p3", "BO", 220, 100));
    s.apply({ t: "companyStatus", company: "B&O", status: "floated" }, { t: "moneyTransfer", from: "bank", to: "company:B&O", amount: 1000 });
    s.do({ type: "buyTrain", company: "B&O", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    expect(s.state.assets["private:BO"]).toBe("removed");
  });

  it("MH is exchanged for a NYC share from the IPO, closing it", () => {
    const s = start("1830").do(buyPrivate("p4", "MH", 110));
    s.do({ type: "exchangePrivate", private: "MH", source: "ipo", company: null });
    expect(unitsOf(s.state, "player:p4", "NYC")).toBe(1);
    expect(s.state.assets["private:MH"]).toBe("removed");
  });

  it("MH can take the NYC share from the pool", () => {
    const s = start("1830").do(buyPrivate("p4", "MH", 110));
    seedCompany(s, "NYC", { cell: { row: 1, col: 6 }, holders: { "player:p1": 2, pool: 1 } });
    s.do({ type: "exchangePrivate", private: "MH", source: "pool", company: null });
    expect(unitsOf(s.state, "pool", "NYC")).toBe(0);
    expect(unitsOf(s.state, "player:p4", "NYC")).toBe(1);
  });

  it("a private without an exchange cannot be exchanged", () => {
    const s = start("1830").do(buyPrivate("p1", "SV", 20));
    expect(s.tryDo({ type: "exchangePrivate", private: "SV", source: "ipo", company: null }).kind).toBe("unavailable");
  });
});

describe("1848 (§4)", () => {
  it("P5 grants 10% of the QR", () => {
    const s = start("1848").do(buyPrivate("p1", "P5", 170));
    expect(unitsOf(s.state, "player:p1", "QR")).toBe(1);
  });

  it("P6 grants the CAR director's certificate at par 100", () => {
    const s = start("1848").do(buyPrivate("p2", "P6", 230));
    expect(s.state.companies["CAR"]).toMatchObject({ status: "parred", parPrice: 100, position: { row: 1, col: 5 } });
    expect(presidentOf(s.state, "CAR")).toBe("p2");
  });
});

describe("21Moon (§6.1.6)", () => {
  it("P6 takes one pool share of any company for free, closing it", () => {
    const s = start("21moon").do(buyPrivate("p1", "P6", 100));
    seedCompany(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p2": 2, pool: 1 } });
    s.do({ type: "exchangePrivate", private: "P6", source: "pool", company: "VH" });
    expect(netMoney(s.lastEvents)).toEqual({});
    expect(unitsOf(s.state, "player:p1", "VH")).toBe(1);
    expect(s.state.assets["private:P6"]).toBe("removed");
  });

  it("P6 needs a company to be named", () => {
    const s = start("21moon").do(buyPrivate("p1", "P6", 100));
    expect(s.tryDo({ type: "exchangePrivate", private: "P6", source: "pool", company: null }).kind).toBe("unavailable");
  });
});
