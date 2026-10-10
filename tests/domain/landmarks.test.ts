import { describe, expect, it } from "vitest";
import { cashOf, counterOf } from "../../src/domain/events/state";
import { priceOf } from "../../src/domain/mechanics/market";
import { countedTrains } from "../../src/domain/mechanics/phases";
import type { TestSession } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** Landmarks money effects (US11, research R13, L p.10–11). */

const landmarks = () => rotlaSession({ options: { expansion: "landmarks" } });
const codes = (s: TestSession, action: unknown) => {
  const r = s.tryDo(action);
  expect(r.kind).toBe("ok");
  return r.kind === "ok" ? r.warnings.map((w) => w.code) : [];
};

describe("rockFormation", () => {
  it("up two spaces before the payout, which is judged against the new price; once per company", () => {
    const s = landmarks();
    // A pool share, so the end of the SR does not move it.
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 4, pool: 1 } });
    s.do({ type: "startOR" });
    s.do({ type: "rockFormation", company: null });
    expect(eventsOf(s.lastEvents, "marketMove")[0]?.reason).toBe("bonus");
    expect(priceOf(s.game, s.state, "EXP")).toBe(100);
    expect(counterOf(s.state, "company:EXP", "landmark:rockFormation")).toBe(1);
    s.do({ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 160 }], mode: "full" });
    expect(priceOf(s.game, s.state, "EXP")).toBe(110);
    expect(codes(s, { type: "rockFormation", company: "EXP" })).toEqual(["landmarkUsed"]);
  });
});

describe("cliffSale", () => {
  function withFive() {
    const s = landmarks();
    seedCompany(s, "CON", { price: 100, holders: { "player:p1": 10 }, trains: ["train:5:1", "train:4:1"] });
    s.do({ type: "startOR" });
    return s;
  }

  it("a 5: +225 from the bank, the 5 to the pool", () => {
    const s = withFive().do({ type: "cliffSale", company: "CON", train: "5" });
    expect(netMoney(s.lastEvents)).toEqual({ bank: -225, "company:CON": 225 });
    expect(s.state.assets["train:5:1"]).toBe("pool");
  });

  it("a second Cliff in the same OR warns; so does a train the company does not own", () => {
    const s = withFive().do({ type: "cliffSale", company: "CON", train: "5" });
    expect(codes(s, { type: "cliffSale", company: "CON", train: "train:4:1" })).toEqual(["cliffTwice"]);
    expect(codes(s, { type: "cliffSale", company: "CON", train: "6" })).toContain("trainNotOwned");
  });

  it("the next OR allows another", () => {
    const s = withFive().do({ type: "cliffSale", company: "CON", train: "5" }).do({ type: "nextCompany" });
    expect(s.state.turn.orIndex).toBe(2);
    expect(codes(s, { type: "cliffSale", company: "CON", train: "4" })).toEqual([]);
  });
});

describe("canyonTrain", () => {
  it("after the first 4: a rusted 2 comes back, permanent, counts for the limit, and warns if sold", () => {
    const s = landmarks();
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 5 }, treasury: 500 });
    seedCompany(s, "CON", { price: 100, holders: { "player:p2": 10 }, treasury: 500 });
    s.apply({ t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:CON" });
    s.do({ type: "buyTrain", company: "CON", trainType: "4", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    expect(s.state.assets["train:2:1"]).toBe("removed");
    s.do({ type: "canyonTrain", company: "EXP" });
    const asset = eventsOf(s.lastEvents, "assetTransfer")[0]!.asset;
    expect(asset).toMatch(/^train:2:/);
    expect(s.state.assets[asset]).toBe("company:EXP");
    expect(counterOf(s.state, "company:EXP", `permanent:${asset}`)).toBe(1);
    expect(counterOf(s.state, "company:EXP", "landmark:canyon")).toBe(1);
    expect(countedTrains(s.game, s.state, "EXP")).toContain(asset);
    const sale = codes(s, { type: "buyTrain", company: "CON", trainType: "2", variant: null, from: "company", seller: "EXP", price: 10, tradeIn: null });
    expect(sale).toContain("keptTrain");
    expect(codes(s, { type: "canyonTrain", company: "EXP" })).toContain("landmarkUsed");
  });

  it("before the first 4 it warns", () => {
    const s = landmarks();
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 5 } });
    s.apply({ t: "assetTransfer", asset: "train:2:1", from: "bank", to: "removed" });
    expect(codes(s, { type: "canyonTrain", company: "EXP" })).toEqual(["canyonEarly"]);
  });
});

describe("Manufacturing", () => {
  it("launched for 140: 50 to the bank, the M2 in its treasury; a leadoff purchase warns", () => {
    const s = landmarks().do({ type: "launchCompany", player: "p1", company: "MFG", bid: 140, price: null });
    expect(cashOf(s.state, "company:MFG")).toBe(90);
    expect(s.state.assets["train:M2:1"]).toBe("company:MFG");
    expect(s.lastWarnings.map((w) => w.code)).toContain("noLeadoffTrain");
    const buy = { type: "buyTrain", company: "MFG", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null };
    expect(codes(s, buy)).toContain("leadoffTrain");
  });
});

describe("expansion majors", () => {
  it("mergeCompanies accepts AUT and LGE", () => {
    const s = landmarks();
    s.apply({ t: "turnAdvance", round: "MR", phase: "green" });
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 5 } });
    seedCompany(s, "TUN", { price: 70, holders: { "player:p2": 5 } });
    seedCompany(s, "CIR", { price: 70, holders: { "player:p3": 5 } });
    seedCompany(s, "CPL", { price: 60, holders: { "player:p3": 5 } });
    s.do({ type: "mergeCompanies", a: "EXP", b: "TUN", into: "AUT", identity: null });
    s.do({ type: "mergeCompanies", a: "CIR", b: "CPL", into: "LGE", identity: "alt" });
    expect(s.state.companies["AUT"]!.status).toBe("floated");
    expect(s.state.companies["LGE"]!.status).toBe("floated");
  });
});
