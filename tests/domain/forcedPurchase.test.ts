import { describe, expect, it } from "vitest";
import { unitsOf } from "../../src/domain/events/state";
import { priceOf } from "../../src/domain/mechanics/market";
import { eventsOf, netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** The forced train purchase (US6-4, research R16, B p.17). */

const buyTrain = (company: string, trainType: string) => ({
  type: "buyTrain",
  company,
  trainType,
  variant: null,
  from: "bank",
  seller: null,
  price: null,
  tradeIn: null,
});

/** Ana presides CON (no train, treasury 150) and holds EXP and TUN shares to sell. */
function setup(options: Record<string, string> = {}, cash = 0) {
  const s = rotlaSession({ options });
  seedCompany(s, "CON", { price: 100, holders: { "player:p1": 6, "player:p2": 4 }, treasury: 150 });
  seedCompany(s, "EXP", { price: 80, holders: { "player:p2": 2, "player:p1": 3 }, operated: true });
  seedCompany(s, "TUN", { price: 70, holders: { "player:p3": 2, "player:p1": 1, "company:TUN": 2 }, operated: true });
  // Ana has no money unless given some.
  const ana = s.state.money["player:p1"] ?? 0;
  if (ana > 0) s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: ana });
  if (cash > 0) s.apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: cash });
  return s;
}

describe("buyTrain with presidentPays", () => {
  it("treasury 150, train 300, president 400: one group, president → company 150, then the purchase", () => {
    const s = setup({}, 400).do(buyTrain("CON", "4"));
    expect(s.lastEvents.slice(0, 3)).toEqual([
      { t: "moneyTransfer", from: "player:p1", to: "company:CON", amount: 150 },
      { t: "moneyTransfer", from: "company:CON", to: "bank", amount: 300 },
      { t: "assetTransfer", asset: "train:4:1", from: "bank", to: "company:CON" },
    ]);
    expect(s.lastWarnings.map((w) => w.code)).toContain("forcedPurchase");
  });
});

describe("forcedTrainPurchase", () => {
  const forced = (sales: { company: string; count: number }[]) => ({
    type: "forcedTrainPurchase",
    company: "CON",
    trainType: "4",
    variant: null,
    from: "bank",
    sales,
  });

  it("sales at pre-sale prices, then the shortfall, then the purchase, then one drop per company", () => {
    const s = setup({ stockDrops: "perShare" }, 0);
    s.do(forced([{ company: "EXP", count: 2 }, { company: "TUN", count: 1 }]));
    const e = s.lastEvents;
    expect(e.slice(0, 7)).toEqual([
      { t: "shareTransfer", company: "EXP", from: "player:p1", to: "pool", units: 2 },
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 160 },
      { t: "shareTransfer", company: "TUN", from: "player:p1", to: "pool", units: 1 },
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 70 },
      { t: "moneyTransfer", from: "player:p1", to: "company:CON", amount: 150 },
      { t: "moneyTransfer", from: "company:CON", to: "bank", amount: 300 },
      { t: "assetTransfer", asset: "train:4:1", from: "bank", to: "company:CON" },
    ]);
    expect(eventsOf(e, "marketMove").map((m) => [m.company, m.reason])).toEqual([
      ["EXP", "sell"],
      ["TUN", "sell"],
    ]);
    // Once each, even with stockDrops: perShare.
    expect(priceOf(s.game, s.state, "EXP")).toBe(70);
    expect(priceOf(s.game, s.state, "TUN")).toBe(60);
    expect(netMoney(e)["player:p1"]).toBe(80);
    expect(unitsOf(s.state, "player:p1", "EXP")).toBe(1);
    expect(s.violations()).toEqual([]);
  });

  const codes = (s: ReturnType<typeof setup>, action: unknown) => {
    const result = s.tryDo(action);
    expect(result.kind).toBe("ok");
    return result.kind === "ok" ? result.warnings.map((w) => w.code) : [];
  };

  it("warns when a sale would change the buying company's presidency", () => {
    const s = setup({}, 0);
    expect(codes(s, forced([{ company: "CON", count: 3 }, { company: "EXP", count: 2 }]))).toContain("presidencyChange");
  });

  it("warns when a sale puts the pool above 50%", () => {
    const s = setup({}, 0);
    s.apply({ t: "shareTransfer", company: "EXP", from: "player:p2", to: "pool", units: 1 });
    expect(codes(s, forced([{ company: "EXP", count: 2 }]))).toContain("poolLimit");
  });

  it("warns when the company is still short (suggests bankruptcy)", () => {
    const s = setup({}, 0);
    const warned = codes(s, forced([{ company: "TUN", count: 1 }]));
    expect(warned).toContain("presidentShort");
  });

  it("warns when the company already has a train", () => {
    const s = setup({}, 0);
    s.apply({ t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:CON" });
    expect(codes(s, forced([{ company: "EXP", count: 2 }]))).toContain("hasTrain");
  });
});
