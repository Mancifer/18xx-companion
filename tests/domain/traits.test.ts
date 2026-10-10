import { describe, expect, it } from "vitest";
import { cashOf, counterOf } from "../../src/domain/events/state";
import { countedTrains, overLimitCompanies } from "../../src/domain/mechanics/phases";
import { effectiveTraits } from "../../src/domain/mechanics/traits";
import { netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** Company traits and named payments (US5, research R3, FR-023). */

describe("effectiveTraits", () => {
  it("a company's own traits", () => {
    const s = rotlaSession();
    expect(effectiveTraits(s.game, s.state, "SPC")).toMatchObject({ trainLimitBonus: 1 });
    expect(effectiveTraits(s.game, s.state, "EXP")).toEqual({});
  });

  it("a major adds the traits of every mergedFrom minor: bonuses add up, booleans OR", () => {
    const s = rotlaSession();
    s.apply(
      { t: "counterChange", subject: "company:CON", key: "mergedFrom:SPC", delta: 1 },
      { t: "counterChange", subject: "company:CON", key: "mergedFrom:RES", delta: 1 },
      { t: "counterChange", subject: "company:CON", key: "mergedFrom:TUN", delta: 1 },
    );
    const traits = effectiveTraits(s.game, s.state, "CON");
    expect(traits.trainLimitBonus).toBe(1);
    expect(traits.keepsRustedTrains).toBe(true);
    expect(traits.payments?.map((p) => p.id)).toEqual(["tunneling"]);
  });

  it("two bonuses add up", () => {
    const s = rotlaSession();
    const game = {
      ...s.game,
      companies: s.game.companies.map((c) => (c.id === "EXP" ? { ...c, traits: { trainLimitBonus: 2 } } : c)),
    };
    s.apply(
      { t: "counterChange", subject: "company:CON", key: "mergedFrom:SPC", delta: 1 },
      { t: "counterChange", subject: "company:CON", key: "mergedFrom:EXP", delta: 1 },
    );
    expect(effectiveTraits(game, s.state, "CON").trainLimitBonus).toBe(3);
  });
});

describe("namedPayment", () => {
  function tunneling() {
    const s = rotlaSession();
    seedCompany(s, "TUN", { price: 80, holders: { "player:p1": 2, "company:TUN": 3 }, treasury: 150 });
    return s.do({ type: "startOR" });
  }

  it("tunneling is one group: company → bank 40, then bank → company 60", () => {
    const s = tunneling().do({ type: "namedPayment", company: null, payment: "tunneling", amount: null });
    expect(s.lastEvents).toEqual([
      { t: "moneyTransfer", from: "company:TUN", to: "bank", amount: 40 },
      { t: "moneyTransfer", from: "bank", to: "company:TUN", amount: 60 },
    ]);
    expect(cashOf(s.state, "company:TUN")).toBe(170);
  });

  it("one undo reverts both lines (one group)", () => {
    const s = tunneling();
    const before = s.state;
    s.do({ type: "namedPayment", company: "TUN", payment: "tunneling", amount: null });
    expect(s.groups.at(-1)!.events).toHaveLength(2);
    expect(netMoney(s.groups.at(-1)!.events)).toEqual({ bank: -20, "company:TUN": 20 });
    expect(before).not.toBe(s.state);
  });

  it("expansiveToken: the company pays 40 to the bank", () => {
    const s = rotlaSession();
    seedCompany(s, "EXV", { price: 80, holders: { "player:p1": 2, "company:EXV": 3 }, treasury: 150 });
    s.do({ type: "namedPayment", company: "EXV", payment: "expansiveToken", amount: null });
    expect(s.lastEvents).toEqual([{ t: "moneyTransfer", from: "company:EXV", to: "bank", amount: 40 }]);
  });

  it("a major formed from Tunneling can use it", () => {
    const s = rotlaSession();
    seedCompany(s, "CON", { price: 80, holders: { "player:p1": 10 }, treasury: 300 });
    s.apply({ t: "counterChange", subject: "company:CON", key: "mergedFrom:TUN", delta: 1 });
    expect(s.tryDo({ type: "namedPayment", company: "CON", payment: "tunneling", amount: null }).kind).toBe("ok");
  });

  it("a payment the company does not have is unavailable", () => {
    const s = rotlaSession();
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 5 }, treasury: 300 });
    expect(s.tryDo({ type: "namedPayment", company: "EXP", payment: "tunneling", amount: null }).kind).toBe("unavailable");
  });

  it("a bankPays payment with amount 0 (headquarters) takes the amount from the action", () => {
    const s = rotlaSession({ options: { headquarters: "on" } });
    seedCompany(s, "CON", { price: 80, holders: { "player:p1": 10 }, treasury: 300 });
    s.do({ type: "namedPayment", company: "CON", payment: "headquarters", amount: 35 });
    expect(s.lastEvents).toEqual([{ t: "moneyTransfer", from: "bank", to: "company:CON", amount: 35 }]);
  });
});

describe("Resourceful and Spacious (US6, research R10)", () => {
  const buy = (company: string, trainType: string) => ({
    type: "buyTrain",
    company,
    trainType,
    variant: null,
    from: "bank",
    seller: null,
    price: null,
    tradeIn: null,
  });

  function withTrains() {
    const s = rotlaSession();
    seedCompany(s, "RES", { price: 80, holders: { "player:p1": 5 }, treasury: 2000, trains: ["train:2:1", "train:2:2"] });
    seedCompany(s, "EXP", { price: 70, holders: { "player:p2": 5 }, treasury: 2000, trains: ["train:2:3"] });
    seedCompany(s, "CON", { price: 100, holders: { "player:p3": 10 }, treasury: 2000 });
    return s;
  }

  it("at the first 4, Resourceful keeps its 2s with a rusted: counter; they no longer count", () => {
    const s = withTrains().do(buy("CON", "4"));
    expect(s.state.assets["train:2:1"]).toBe("company:RES");
    expect(s.state.assets["train:2:2"]).toBe("company:RES");
    expect(s.state.assets["train:2:3"]).toBe("removed");
    expect(counterOf(s.state, "company:RES", "rusted:train:2:1")).toBe(1);
    expect(countedTrains(s.game, s.state, "RES")).toEqual([]);
  });

  it("discardTrain sends a rusted train to removed and clears its counter", () => {
    const s = withTrains().do(buy("CON", "4"));
    s.do({ type: "discardTrain", company: "RES", train: "train:2:1" });
    expect(s.lastEvents).toEqual([
      { t: "assetTransfer", asset: "train:2:1", from: "company:RES", to: "removed" },
      { t: "counterChange", subject: "company:RES", key: "rusted:train:2:1", delta: -1 },
    ]);
  });

  it("a normal discardTrain goes to the pool", () => {
    const s = withTrains();
    s.do({ type: "discardTrain", company: "EXP", train: "2" });
    expect(s.state.assets["train:2:3"]).toBe("pool");
  });

  it("Spacious one train over the normal limit is not over its limit", () => {
    const s = rotlaSession();
    seedCompany(s, "SPC", { price: 80, holders: { "player:p1": 5 }, treasury: 2000, trains: ["train:2:1", "train:2:2", "train:2:3"] });
    expect(overLimitCompanies(s.game, s.state)).toEqual([]);
    s.apply({ t: "assetTransfer", asset: "train:2:4", from: "bank", to: "company:SPC" });
    expect(overLimitCompanies(s.game, s.state)).toEqual([{ company: "SPC", count: 4, limit: 3 }]);
  });
});
