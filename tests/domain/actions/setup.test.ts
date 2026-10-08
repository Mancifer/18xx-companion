import { describe, expect, it } from "vitest";
import { applyOptions, getBuiltInGame } from "../../../src/domain/games";
import { cashOf, unitsOf } from "../../../src/domain/events/state";
import { TestSession, makePlayers } from "../../helpers/dispatch";

const four = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

describe("createSession", () => {
  it("1830, 4 players: deals $600 each and the bank shows $9,600 (US1-1)", () => {
    const g = applyOptions(getBuiltInGame("1830"), {});
    const s = TestSession.start(g, four);
    for (const p of four) expect(cashOf(s.state, `player:${p.id}`)).toBe(600);
    expect(cashOf(s.state, "bank")).toBe(9600);
    for (const c of g.companies) expect(unitsOf(s.state, `ipo:${c.id}`, c.id)).toBe(c.shareCount);
    expect(s.state.assets["private:SV"]).toBe("bank");
    expect(s.state.assets["train:2:1"]).toBe("bank");
    expect(s.violations()).toEqual([]);
  });

  it("emits one bank→player transfer per player", () => {
    const g = applyOptions(getBuiltInGame("1830"), {});
    const s = TestSession.start(g, four);
    const transfers = s.lastEvents.filter((e) => e.t === "moneyTransfer");
    expect(transfers).toHaveLength(4);
  });

  it("1848: the BoE's £2,000 and loans sit outside the bank total; total money is £12,000", () => {
    const g = getBuiltInGame("1848");
    const s = TestSession.start(g, four);
    expect(cashOf(s.state, "bank")).toBe(10000 - 4 * 630);
    expect(cashOf(s.state, "company:BOE")).toBe(2000);
    expect(s.state.assets["loan:20"]).toBe("company:BOE");
    const total = Object.values(s.state.money).reduce((a, b) => a + b, 0);
    expect(total).toBe(12000);
    expect(s.violations()).toEqual([]);
  });

  it("1848: the BoE starts floated at the start of its price track", () => {
    const s = TestSession.start(getBuiltInGame("1848"), four);
    expect(s.state.companies["BOE"]).toMatchObject({ status: "floated", position: { index: 0 } });
  });

  it("21Moon: unlimited bank, no money invariant, and reserve transports out of the game", () => {
    const g = applyOptions(getBuiltInGame("21moon"), { lateCompany: "KR" });
    const s = TestSession.start(g, four);
    expect(cashOf(s.state, "player:p1")).toBe(410);
    expect(s.violations()).toEqual([]);
    const reserve = Object.entries(s.state.assets).filter(([, h]) => h === "removed");
    expect(reserve.length).toBeGreaterThan(0);
  });

  it("starts in the private-company round", () => {
    const s = TestSession.start(applyOptions(getBuiltInGame("1830"), {}), four);
    expect(s.state.turn.round).toBe("PRIVATES");
  });

  it("warns when the player count is outside the game's range", () => {
    const s = TestSession.start(applyOptions(getBuiltInGame("1830"), {}), makePlayers(["Ana"]));
    expect(s.lastWarnings.map((w) => w.code)).toContain("playerCount");
  });

  it("rejects more than 7 players", () => {
    const eight = makePlayers(["A", "B", "C", "D", "E", "F", "G", "H"]);
    const s = new TestSession(applyOptions(getBuiltInGame("1830"), {}), eight);
    expect(s.tryDo({ type: "createSession", players: eight, walletMode: "appTruth" }).kind).toBe("invalid");
  });

  it("rejects duplicate player names and non-permutation seats", () => {
    const dupes = makePlayers(["Ana", "Ana"]);
    const s = new TestSession(applyOptions(getBuiltInGame("1830"), {}), dupes);
    expect(s.tryDo({ type: "createSession", players: dupes, walletMode: "appTruth" }).kind).toBe("invalid");
    const badSeats = makePlayers(["Ana", "Bruno"]).map((p) => ({ ...p, seat: 1 }));
    expect(s.tryDo({ type: "createSession", players: badSeats, walletMode: "appTruth" }).kind).toBe("invalid");
  });

  it("warns, without failing, on duplicate aliases (accent- and case-insensitive)", () => {
    const players = makePlayers(["Ana", "Bruno"]).map((p, i) => ({ ...p, aliases: i === 0 ? ["Pé"] : ["pe"] }));
    const s = TestSession.start(applyOptions(getBuiltInGame("1830"), {}), players);
    expect(s.lastWarnings.map((w) => w.code)).toContain("duplicateAlias");
  });
});
