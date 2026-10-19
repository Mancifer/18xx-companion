import { describe, expect, it } from "vitest";
import { sharePrice, shareSources } from "../../src/domain/actions/expand/stock";
import { unitsOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";
import { seedCompany } from "../helpers/seed";
import { buy, par, startSR } from "../helpers/stock";

/** Feature 013, US3: where shares can be bought, with count and price (data-model.md "Share source"). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const g1830 = getBuiltInGame("1830");
const sources = (s: TestSession, company: string) => shareSources(s, company).map((x) => x.source);

describe("shareSources", () => {
  it("1830 parred: the IPO and the pool, with units and prices from unitsOf and sharePrice", () => {
    const s = TestSession.start(g1830, players).do(startSR).do(par("p1", "PRR", 100)).do(buy("player:p2", "PRR", "ipo", 1));
    s.do({ type: "sellShares", seller: "player:p2", company: "PRR", count: 1 });
    expect(shareSources(s, "PRR")).toEqual([
      { source: "ipo", units: unitsOf(s.state, "ipo:PRR", "PRR"), price: sharePrice(s.game, s.state, "PRR", "ipo") },
      { source: "pool", units: 1, price: sharePrice(s.game, s.state, "PRR", "pool") },
    ]);
  });

  it("an IPO bought out stays listed with 0 units", () => {
    const s = seedCompany(TestSession.start(g1830, players), "PRR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6, "player:p2": 4 },
    });
    expect(shareSources(s, "PRR")[0]).toMatchObject({ source: "ipo", units: 0 });
    expect(sources(s, "PRR")).toEqual(["ipo", "pool"]);
  });

  it("`ipo`: hidden when `defaultBuySource === \"treasury\"`, or when the IPO is empty and the treasury holds shares", () => {
    const rotla = rotlaSession();
    seedRotla(rotla, "EXP", { price: 80, holders: { "player:p1": 3, "company:EXP": 2 } });
    expect(sources(rotla, "EXP")).not.toContain("ipo");

    const g = seedCompany(TestSession.start(g1830, players), "PRR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6, "player:p2": 2, "company:PRR": 2 },
    });
    expect(sources(g, "PRR")).toEqual(["treasury", "pool"]);
  });

  it("`treasury`: shown when it holds shares, or always when `defaultBuySource === \"treasury\"`", () => {
    const rotla = rotlaSession();
    seedRotla(rotla, "EXP", { price: 80, holders: { "player:p1": 5 } });
    expect(shareSources(rotla, "EXP")).toEqual([
      { source: "treasury", units: 0, price: sharePrice(rotla.game, rotla.state, "EXP", "treasury") },
      { source: "pool", units: 0, price: sharePrice(rotla.game, rotla.state, "EXP", "pool") },
    ]);
    const g = seedCompany(TestSession.start(g1830, players), "PRR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6, "company:PRR": 1 },
    });
    expect(sources(g, "PRR")).toEqual(["ipo", "treasury", "pool"]);
  });

  it("`pool`: always shown, last", () => {
    const s = TestSession.start(g1830, players).do(startSR).do(par("p1", "PRR", 100));
    expect(sources(s, "PRR").at(-1)).toBe("pool");
  });
});
