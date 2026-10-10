import { describe, expect, it } from "vitest";
import { cashOf, presidencyHolder, unitsOf } from "../../src/domain/events/state";
import { priceOf } from "../../src/domain/mechanics/market";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** US2: launching a minor from an auction (research R4, contracts/actions.md launchCompany). */

const launch = (player: string, company: string, bid: number, price: number | null = null) => ({
  type: "launchCompany",
  player,
  company,
  bid,
  price,
});

describe("launchCompany", () => {
  it.each([
    [140, 70],
    [165, 80],
    [200, 90],
    [210, 90],
  ])("in yellow, a bid of %i starts at %i", (bid, price) => {
    const s = rotlaSession().do(launch("p1", "TUN", bid));
    expect(priceOf(s.game, s.state, "TUN")).toBe(price);
    expect(cashOf(s.state, "company:TUN")).toBe(bid);
    expect(cashOf(s.state, "player:p1")).toBe(300 - bid);
    expect(unitsOf(s.state, "company:TUN", "TUN")).toBe(3);
    expect(unitsOf(s.state, "player:p1", "TUN")).toBe(2);
    expect(unitsOf(s.state, "ipo:TUN", "TUN")).toBe(0);
    expect(presidencyHolder(s.state, "TUN")).toBe("player:p1");
    expect(s.state.companies["TUN"]).toMatchObject({ status: "floated", parPrice: price });
    expect(s.violations()).toEqual([]);
  });

  it("puts the token at the bottom of its cell's stack", () => {
    const s = rotlaSession().do(launch("p1", "EXP", 165)).do(launch("p2", "TUN", 160));
    expect(priceOf(s.game, s.state, "TUN")).toBe(80);
    expect(s.state.companies["TUN"]!.stackOrder).toBeGreaterThan(s.state.companies["EXP"]!.stackOrder);
  });

  it("an explicit price overrides the computed one", () => {
    const s = rotlaSession().do(launch("p1", "TUN", 200, 100));
    expect(priceOf(s.game, s.state, "TUN")).toBe(100);
  });

  it.each([
    ["minBid", launch("p1", "TUN", 115)],
    ["bidStep", launch("p1", "TUN", 142)],
    ["launchPriceClamped", launch("p1", "TUN", 200)],
    ["notTrackPrice", launch("p1", "TUN", 140, 85)],
    ["insufficientCash", launch("p1", "TUN", 400)],
  ] as const)("warns %s and still records the launch", (code, action) => {
    const result = rotlaSession().tryDo(action);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.warnings.map((w) => w.code)).toContain(code);
  });

  it("the clamp warning names the price used", () => {
    const result = rotlaSession().tryDo(launch("p1", "TUN", 200));
    if (result.kind !== "ok") throw new Error(result.kind);
    expect(result.warnings.find((w) => w.code === "launchPriceClamped")?.messageEs).toMatch(/\$90/);
  });

  it("a clean launch has no warnings", () => {
    const result = rotlaSession().tryDo(launch("p1", "TUN", 140));
    expect(result.kind === "ok" ? result.warnings : null).toEqual([]);
  });

  it("is unavailable for a merger major and for a company already in play", () => {
    expect(rotlaSession().tryDo(launch("p1", "CON", 140)).kind).toBe("unavailable");
    const s = rotlaSession().do(launch("p1", "TUN", 140));
    expect(s.tryDo(launch("p2", "TUN", 140)).kind).toBe("unavailable");
    const seeded = seedCompany(rotlaSession(), "EXP", { price: 80, holders: { "player:p1": 2 } });
    expect(seeded.tryDo(launch("p1", "EXP", 140)).kind).toBe("unavailable");
  });

  it("parCompany is unavailable for auction minors and merger majors", () => {
    const s = rotlaSession();
    expect(s.tryDo({ type: "parCompany", player: "p1", company: "TUN", price: 70 }).kind).toBe("unavailable");
    expect(s.tryDo({ type: "parCompany", player: "p1", company: "CON", price: 70 }).kind).toBe("unavailable");
  });

  it("floats explicitly: the float trigger adds nothing", () => {
    const s = rotlaSession().do(launch("p1", "TUN", 140));
    expect(s.lastEvents.filter((e) => e.t === "companyStatus")).toHaveLength(1);
    expect(s.lastEvents.map((e) => e.t)).toEqual(["companyStatus", "marketMove", "shareTransfer", "shareTransfer", "moneyTransfer"]);
  });

  it("is not available in games without the auctionLaunch mechanic", async () => {
    const { applyOptions, getBuiltInGame } = await import("../../src/domain/games");
    const { TestSession, makePlayers } = await import("../helpers/dispatch");
    const s = TestSession.start(applyOptions(getBuiltInGame("1830"), {}), makePlayers(["Ana", "Bruno", "Carla"]));
    expect(s.tryDo(launch("p1", "PRR", 140)).kind).toBe("unavailable");
  });
});
