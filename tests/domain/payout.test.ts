import { describe, expect, it } from "vitest";
import { reduceAll } from "../../src/domain/events/reduce";
import { initialState, type SessionState } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { GameDefinition } from "../../src/domain/games/schema";
import { computePayout } from "../../src/domain/mechanics/payout";
import { miniGame, miniPlayers } from "../helpers/miniGame";
import { netMoney } from "../helpers/flows";

/** contracts/actions.md "Payout": perShare, routing by holder type, half and parts. */

function withGame(patch: Partial<GameDefinition>): GameDefinition {
  return { ...miniGame, ...patch };
}

/** AA floated at 50 with the given holdings (units); the rest stays in the IPO. */
function stateWith(game: GameDefinition, holdings: Record<string, number>): SessionState {
  const events: PrimitiveEvent[] = [
    { t: "companyStatus", company: "AA", status: "floated", parPrice: 50 },
    { t: "marketMove", company: "AA", to: { row: 0, col: 0 }, reason: "par" },
  ];
  let first = true;
  for (const [holder, units] of Object.entries(holdings)) {
    events.push({
      t: "shareTransfer",
      company: "AA",
      from: "ipo:AA",
      to: holder as never,
      units,
      ...(first && holder.startsWith("player:") ? { presidency: true } : {}),
    });
    if (holder.startsWith("player:")) first = false;
  }
  return reduceAll(initialState(game, miniPlayers), events);
}

const revenue = (amount: number) => [{ part: "revenue", amount }];

describe("perShare rounding (FR-032)", () => {
  const holdings = { "player:p1": 10 };
  it.each([
    ["floor", 24],
    ["ceil", 25],
    ["round", 25],
  ] as const)("%s: 245 over 10 shares", (perShare, expected) => {
    const game = withGame({ rounding: { perShare, halfRetain: "floorToCompany", unit: 1 } });
    const result = computePayout(game, stateWith(game, holdings), "AA", revenue(245), "full");
    expect(netMoney(result.transfers)["player:p1"]).toBe(expected * 10);
  });
});

describe("routing by holder type (FR-031)", () => {
  it("player shares are paid to the player", () => {
    const s = stateWith(miniGame, { "player:p1": 6, "player:p2": 2 });
    const net = netMoney(computePayout(miniGame, s, "AA", revenue(100), "full").transfers);
    expect(net["player:p1"]).toBe(60);
    expect(net["player:p2"]).toBe(20);
  });

  it("pool shares go to unownedDividends.pool (company here) and IPO shares to .ipo (none)", () => {
    const s = stateWith(miniGame, { "player:p1": 6, pool: 2 });
    const net = netMoney(computePayout(miniGame, s, "AA", revenue(100), "full").transfers);
    expect(net["company:AA"]).toBe(20);
    expect(net["ipo:AA"]).toBeUndefined();
    // The two IPO shares are not paid: the money never leaves the bank.
    expect(net.bank).toBe(-80);
  });

  it("a destination of 'none' emits no transfer at all", () => {
    const game = withGame({ unownedDividends: { ipo: "none", pool: "none", treasury: "none" } });
    const s = stateWith(game, { "player:p1": 6, pool: 2, "company:AA": 2 });
    const result = computePayout(game, s, "AA", revenue(100), "full");
    expect(result.transfers.every((t) => t.to === "player:p1")).toBe(true);
  });

  it("own treasury shares follow unownedDividends.treasury", () => {
    const game = withGame({ unownedDividends: { ipo: "none", pool: "none", treasury: "company" } });
    const s = stateWith(game, { "player:p1": 6, "company:AA": 1 });
    expect(netMoney(computePayout(game, s, "AA", revenue(100), "full").transfers)["company:AA"]).toBe(10);
  });

  it("shares of AA held by company BB are paid to BB", () => {
    const s = stateWith(miniGame, { "player:p1": 6, "company:BB": 1 });
    expect(netMoney(computePayout(miniGame, s, "AA", revenue(100), "full").transfers)["company:BB"]).toBe(10);
  });

  it("everything is paid by the bank", () => {
    const s = stateWith(miniGame, { "player:p1": 6, "player:p2": 2, pool: 2 });
    const result = computePayout(miniGame, s, "AA", revenue(100), "full");
    expect(result.transfers.every((t) => t.from === "bank")).toBe(true);
  });
});

describe("modes", () => {
  const s = stateWith(miniGame, { "player:p1": 6, "player:p2": 4 });

  it("withhold puts the whole revenue in the treasury", () => {
    const result = computePayout(miniGame, s, "AA", revenue(180), "withhold");
    expect(netMoney(result.transfers)).toEqual({ bank: -180, "company:AA": 180 });
    expect(result.moveKind).toBe("withhold");
  });

  it("half: the company keeps amount − paid, the paid part is distributed", () => {
    const result = computePayout(miniGame, s, "AA", revenue(300), "half");
    const net = netMoney(result.transfers);
    expect(net["company:AA"]).toBe(150);
    expect(net["player:p1"]).toBe(90);
    expect(net["player:p2"]).toBe(60);
    expect(result.moveKind).toBe("half");
  });

  it("half with floorToCompany rounds the retained half down to the unit", () => {
    const game = withGame({ rounding: { perShare: "floor", halfRetain: "floorToCompany", unit: 10 } });
    const result = computePayout(game, stateWith(game, { "player:p1": 10 }), "AA", revenue(250), "half");
    const net = netMoney(result.transfers);
    expect(net["company:AA"]).toBe(120);
    expect(net["player:p1"]).toBe(130);
  });

  it("a full payout of 0 moves like a withhold (nothing is paid)", () => {
    const result = computePayout(miniGame, s, "AA", revenue(0), "full");
    expect(result.transfers).toEqual([]);
    expect(result.moveKind).toBe("withhold");
  });
});

describe("revenue parts (FR-030)", () => {
  const game = withGame({
    revenueParts: [
      { id: "local", label: "Local", to: "treasury" },
      { id: "port", label: "Puerto", to: "dividend" },
    ],
    payoutModes: [],
  });
  const s = stateWith(game, { "player:p1": 6, "player:p2": 2 });

  it("treasury parts go to the company and dividend parts to the holders", () => {
    const result = computePayout(
      game,
      s,
      "AA",
      [
        { part: "local", amount: 60 },
        { part: "port", amount: 40 },
      ],
      null,
    );
    const net = netMoney(result.transfers);
    expect(net["company:AA"]).toBe(60);
    expect(net["player:p1"]).toBe(24);
    expect(net["player:p2"]).toBe(8);
    expect(result.moveKind).toBe("payout");
    expect(result.dividend).toBe(40);
  });

  it("a missing part counts as 0", () => {
    const result = computePayout(game, s, "AA", [{ part: "local", amount: 60 }], null);
    expect(netMoney(result.transfers)).toEqual({ bank: -60, "company:AA": 60 });
    expect(result.dividend).toBe(0);
  });
});
