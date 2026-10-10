import { describe, expect, it } from "vitest";
import { reduceAll } from "../../src/domain/events/reduce";
import { initialState, type SessionState } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { GameDefinition } from "../../src/domain/games/schema";
import { computePayout } from "../../src/domain/mechanics/payout";
import { miniGame, miniPlayers } from "../helpers/miniGame";
import { eventsOf, netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";
import { floorToTrack, priceOf } from "../../src/domain/mechanics/market";
import { operatingOrder } from "../../src/domain/mechanics/operatingOrder";

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

describe("RotLA payouts (US5, SC-002)", () => {
  const minorAt70 = () =>
    seedRotla(rotlaSession(), "TUN", { price: 70, holders: { "player:p1": 2, "player:p2": 2, "company:TUN": 1 } });
  const payout = (amount: number, mode: "full" | "withhold" = "full", company = "TUN") => ({
    type: "runAndPayout",
    company,
    parts: [{ part: "revenue", amount }],
    mode,
  });

  it("Diagram 8: 310 at 70 pays 62 per share, the treasury share pays the minor, up 2 to 90", () => {
    const s = minorAt70().do(payout(310));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -310, "player:p1": 124, "player:p2": 124, "company:TUN": 62 });
    expect(priceOf(s.game, s.state, "TUN")).toBe(90);
  });

  it("60 at 100 for a major: 6 per share, a restack, and it is now last among the 100s", () => {
    const s = rotlaSession();
    seedRotla(s, "CON", { price: 100, holders: { "player:p1": 4, "player:p2": 3, "player:p3": 3 } });
    seedRotla(s, "UNI", { price: 100, holders: { "player:p2": 10 } });
    expect(operatingOrder(s.game, s.state)).toEqual(["CON", "UNI"]);
    s.do(payout(60, "full", "CON"));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -60, "player:p1": 24, "player:p2": 18, "player:p3": 18 });
    expect(eventsOf(s.lastEvents, "marketMove")).toEqual([
      { t: "marketMove", company: "CON", to: floorToTrack(s.game, 100), reason: "restack" },
    ]);
    expect(priceOf(s.game, s.state, "CON")).toBe(100);
    expect(operatingOrder(s.game, s.state)).toEqual(["UNI", "CON"]);
  });

  it("withhold 200 at 100: +200 to the company, down 1 to 90", () => {
    const s = seedRotla(rotlaSession(), "CON", { price: 100, holders: { "player:p1": 10 } }).do(payout(200, "withhold", "CON"));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -200, "company:CON": 200 });
    expect(priceOf(s.game, s.state, "CON")).toBe(90);
  });

  it("a zero run drops 1", () => {
    const s = minorAt70().do(payout(0));
    expect(netMoney(s.lastEvents)).toEqual({});
    expect(priceOf(s.game, s.state, "TUN")).toBe(60);
  });

  it("pool shares pay no one", () => {
    const s = seedRotla(rotlaSession(), "EXP", { price: 80, holders: { "player:p1": 2, pool: 3 } }).do(payout(100, "full", "EXP"));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -40, "player:p1": 40 });
  });

  it("an uneven total pays ⌊total/5⌋ per share and the rest stays in the bank", () => {
    const s = seedRotla(rotlaSession(), "EXP", { price: 80, holders: { "player:p1": 3, "player:p2": 2 } }).do(payout(97, "full", "EXP"));
    // 97 / 5 = 19.4: 19 per share, and the 2 left over never leave the bank.
    expect(netMoney(s.lastEvents)).toEqual({ bank: -95, "player:p1": 57, "player:p2": 38 });
  });
});
