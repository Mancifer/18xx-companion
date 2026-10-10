import { describe, expect, it } from "vitest";
import { builtInGames, applyOptions, getBuiltInGame } from "../../src/domain/games";
import { validateDefinition } from "../../src/domain/games/validateDefinition";
import type { GameDefinition } from "../../src/domain/games/schema";

const game = (id: string): GameDefinition => getBuiltInGame(id);

describe("built-in definitions", () => {
  it.each(builtInGames.map((g) => [g.id, g] as const))("%s passes validateDefinition", (_id, def) => {
    const result = validateDefinition(def);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  // RotLA ships the majors' second identities unverified (research R14).
  it.each(builtInGames.filter((g) => g.id !== "rotla").map((g) => [g.id, g] as const))("%s has every verification entry verified", (_id, def) => {
    expect(Object.values(def.verification).every((v) => v === "verified")).toBe(true);
    expect(Object.keys(def.verification).length).toBeGreaterThan(0);
  });

  it("built-ins are deeply frozen", () => {
    const g = game("1830");
    expect(Object.isFrozen(g)).toBe(true);
    expect(Object.isFrozen(g.companies[0])).toBe(true);
  });
});

describe("1830 (research R14)", () => {
  const g = game("1830");
  it("has a $12,000 bank and the rulebook starting cash", () => {
    expect(g.bank).toEqual({ total: 12000 });
    expect(g.startingCash).toEqual({ "2": 1200, "3": 800, "4": 600, "5": 480, "6": 400, "7": 350 });
    expect(g.playerCount).toEqual({ min: 2, max: 7 });
  });
  it("routes pool dividends to the company and IPO dividends nowhere (§7.5)", () => {
    expect(g.unownedDividends).toEqual({ ipo: "none", pool: "company", treasury: "none" });
    expect(g.payoutModes).toEqual(["full", "withhold"]);
  });
  it("pays capital at the end of the SR", () => {
    expect(g.capitalization).toEqual({ type: "full", timing: "endOfSR" });
  });
  it("has eight companies and six privates", () => {
    expect(g.companies.map((c) => c.id)).toEqual(["PRR", "NYC", "CPR", "B&O", "C&O", "Erie", "NNH", "B&M"]);
    expect(g.privates.map((p) => p.id)).toEqual(["SV", "CS", "DH", "MH", "CA", "BO"]);
  });
  it("blocks upward moves at 350", () => {
    const top = g.market.cells[0]?.find((c) => c?.price === 350);
    expect(top?.tags).toContain("noUp");
  });
  it("the ruleset option toggles mechanics (Base: bankDebt + forcedWithhold; Classic: corporateBankruptcy)", () => {
    const base = applyOptions(g, { ruleset: "base" });
    const classic = applyOptions(g, { ruleset: "classic" });
    expect(base.customRules.map((r) => r.id).sort()).toEqual(["bankDebt", "forcedWithhold", "privateGrants"]);
    expect(classic.customRules.map((r) => r.id).sort()).toEqual(["corporateBankruptcy", "privateGrants"]);
  });
  it("defaults to the Base ruleset", () => {
    expect(applyOptions(g, {}).customRules.map((r) => r.id)).toContain("bankDebt");
  });
});

describe("1848 (research R13)", () => {
  const g = game("1848");
  it("has a £10,000 bank plus the BoE's separate £2,000 and 20 loan markers", () => {
    expect(g.bank).toEqual({ total: 10000 });
    expect(g.startingCash).toEqual({ "3": 840, "4": 630, "5": 510, "6": 430 });
    expect(g.playerCount).toEqual({ min: 3, max: 6 });
    const boe = g.initialTreasuries.find((t) => t.company === "BOE");
    expect(boe?.money).toBe(2000);
    expect(boe?.assets).toEqual(Array.from({ length: 20 }, (_, i) => `loan:${i + 1}`));
  });
  it("loans have no interest and are never repaid", () => {
    expect(g.loans).toMatchObject({ amount: 100, supply: 20, interestPerOR: 0, repayable: false });
  });
  it("has the BoE price track", () => {
    expect(g.market.tracks?.["BOE"]).toEqual({
      startPrice: 70,
      byLoansIssued: [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 195, 210, 225, 240, 260, 280, 300, 320, 340],
      endGameAtIndex: 15,
    });
  });
  it("pays nothing for unowned shares and only offers pay or withhold", () => {
    expect(g.unownedDividends).toEqual({ ipo: "none", pool: "none", treasury: "none" });
    expect(g.payoutModes).toEqual(["full", "withhold"]);
  });
  it("has nine companies including the national BoE", () => {
    expect(g.companies.map((c) => c.id)).toEqual(["BOE", "QR", "COM", "FED", "VR", "SAR", "WA", "NSW", "CAR"]);
    expect(g.companies.find((c) => c.id === "BOE")?.kind).toBe("national");
  });
});

describe("21Moon (research R15)", () => {
  const g = game("21moon");
  it("has an unlimited bank and the rulebook starting cash", () => {
    expect(g.bank).toBe("unlimited");
    expect(g.startingCash).toEqual({ "2": 600, "3": 540, "4": 410, "5": 340 });
    expect(g.playerCount).toEqual({ min: 2, max: 5 });
  });
  it("splits revenue into a local part to the treasury and a Space Port part as dividends", () => {
    expect(g.revenueParts.map((p) => [p.id, p.to])).toEqual([
      ["local", "treasury"],
      ["spacePort", "dividend"],
    ]);
    expect(g.payoutModes).toEqual([]);
  });
  it("capitalizes incrementally at the market price", () => {
    expect(g.capitalization).toEqual({ type: "incremental" });
    expect(g.ipoPrice).toBe("market");
    expect(g.floatPercent).toBe(50);
  });
  it("the lateCompany option marks one company as available from SR3", () => {
    const def = applyOptions(g, { lateCompany: "KR" });
    expect(def.companies.find((c) => c.id === "KR")?.availableFrom).toBe("SR3");
    expect(def.companies.filter((c) => c.availableFrom !== undefined)).toHaveLength(1);
  });
});
