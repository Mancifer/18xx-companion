import { describe, expect, it } from "vitest";
import { unitsOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { priceOf } from "../../src/domain/mechanics/market";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { rotlaSession, seedCompany } from "../helpers/rotla";
import { seedCompany as seed1830 } from "../helpers/seed";

/** Issue and redeem in the operating round (US5, research R9, FR-017). */

function minorInOR() {
  const s = rotlaSession();
  seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 2, "company:EXP": 2, pool: 1 }, treasury: 200, operated: true });
  return s.do({ type: "startOR" });
}

const issue = { type: "issueShares", company: "EXP", count: 1 };
const redeem = { type: "redeemShare", company: "EXP", count: null };

describe("RotLA issueShares (from the treasury)", () => {
  it("at 80: one share company → pool, +80 from the bank, down 1 to 70", () => {
    const s = minorInOR().do(issue);
    expect(eventsOf(s.lastEvents, "shareTransfer")).toEqual([
      { t: "shareTransfer", company: "EXP", from: "company:EXP", to: "pool", units: 1 },
    ]);
    expect(netMoney(s.lastEvents)).toEqual({ bank: -80, "company:EXP": 80 });
    expect(priceOf(s.game, s.state, "EXP")).toBe(70);
    expect(s.lastWarnings).toEqual([]);
  });

  it("is unavailable when the treasury holds no shares", () => {
    const s = rotlaSession();
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 2, "player:p2": 3 }, operated: true });
    expect(s.tryDo(issue).kind).toBe("unavailable");
  });
});

describe("RotLA redeemShare", () => {
  it("at 80: one share pool → company, 80 to the bank, no market move", () => {
    const s = minorInOR().do(redeem);
    expect(eventsOf(s.lastEvents, "shareTransfer")).toEqual([
      { t: "shareTransfer", company: "EXP", from: "pool", to: "company:EXP", units: 1 },
    ]);
    expect(netMoney(s.lastEvents)).toEqual({ "company:EXP": -80, bank: 80 });
    expect(eventsOf(s.lastEvents, "marketMove")).toEqual([]);
    expect(unitsOf(s.state, "company:EXP", "EXP")).toBe(3);
  });

  it("null company means the operating company", () => {
    const s = minorInOR();
    expect(s.state.turn.currentCompany).toBe("EXP");
    s.do({ type: "redeemShare", company: null, count: 1 });
    expect(unitsOf(s.state, "pool", "EXP")).toBe(0);
  });

  it("is unavailable with no pool share", () => {
    const s = minorInOR().do(redeem);
    expect(s.tryDo(redeem)).toMatchObject({ kind: "unavailable" });
  });

  it("warns when the company cannot pay", () => {
    const s = rotlaSession();
    seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 2, "company:EXP": 2, pool: 1 }, treasury: 50, operated: true });
    const result = s.tryDo(redeem);
    expect(result.kind === "ok" && result.warnings.map((w) => w.code)).toContain("insufficientCash");
  });
});

describe("one issue or redeem per company per OR (warning only)", () => {
  it("a second issue or redeem by the same company in the same OR warns", () => {
    const s = minorInOR().do(issue);
    const again = s.tryDo(redeem);
    expect(again.kind).toBe("ok");
    expect(again.kind === "ok" && again.warnings.map((w) => w.code)).toEqual(["treasuryTradeTwice"]);
    s.do(redeem);
    const third = s.tryDo(issue);
    expect(third.kind === "ok" && third.warnings.map((w) => w.code)).toEqual(["treasuryTradeTwice"]);
  });

  it("the next OR starts the count again", () => {
    const s = minorInOR().do(issue).do({ type: "nextCompany" });
    expect(s.state.turn.orIndex).toBe(2);
    const result = s.tryDo(redeem);
    expect(result.kind === "ok" && result.warnings).toEqual([]);
  });
});

describe("other games", () => {
  const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

  it("1830 has neither action", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    seed1830(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6, pool: 1 } });
    expect(s.tryDo({ type: "issueShares", company: "PRR", count: 1 }).kind).toBe("unavailable");
    expect(s.tryDo({ type: "redeemShare", company: "PRR", count: 1 }).kind).toBe("unavailable");
  });

  it("21Moon issues from the IPO with the same events as before", () => {
    const s = TestSession.start(getBuiltInGame("21moon"), players).do({ type: "startSR" }).do({ type: "startCR" });
    seed1830(s, "VH", { cell: { row: 4, col: 3 }, holders: { "player:p1": 4 } });
    const before = s.state.companies["VH"]!.position;
    s.do({ type: "issueShares", company: "VH", count: 2 });
    expect(eventsOf(s.lastEvents, "shareTransfer")).toEqual([
      { t: "shareTransfer", company: "VH", from: "ipo:VH", to: "pool", units: 2 },
    ]);
    expect(eventsOf(s.lastEvents, "marketMove")).toEqual([
      { t: "marketMove", company: "VH", to: { row: (before as { row: number }).row + 1, col: 3 }, reason: "issue" },
    ]);
    expect(s.tryDo({ type: "redeemShare", company: "VH", count: 1 }).kind).toBe("unavailable");
  });
});
