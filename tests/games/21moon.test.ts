import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { zeroRunAction } from "../../src/domain/actions/expand/operating";
import { cashOf } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { touchesOf, type LogEntry } from "../../src/domain/ledger/entries";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf, netMoney } from "../helpers/flows";
import { seedCompany, seedEvents } from "../helpers/seed";
import { makeMeta } from "../helpers/session";

/** 21Moon (research R15). Test names cite the rulebook §. */

const g21 = getBuiltInGame("21moon");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = () => TestSession.start(g21, players);
const run = (company: string, local: number, spacePort: number) => ({
  type: "runAndPayout",
  company,
  parts: [
    { part: "local", amount: local },
    { part: "spacePort", amount: spacePort },
  ],
  mode: null,
});
function seedGroup(seq: number, action: unknown, events: readonly PrimitiveEvent[]): LogEntry {
  return {
    kind: "group",
    seq,
    id: `g${seq}`,
    at: "2026-10-08T20:00:00.000Z",
    source: "system",
    action: action as never,
    events,
    touches: touchesOf(events),
    warnings: [],
  };
}

const VH_HOLDERS = { "player:p1": 2, "player:p2": 1, "player:p3": 1, "player:p4": 1 };

describe("21Moon two-base revenue (§11.5)", () => {
  it("quickstart 12: local 60 to the treasury, Space Port 40 as 4 per share, none for IPO; right 1", () => {
    const s = seedCompany(start(), "VH", { cell: { row: 4, col: 2 }, holders: VH_HOLDERS });
    s.do(run("VH", 60, 40));
    expect(netMoney(s.lastEvents)).toEqual({
      bank: -80,
      "company:VH": 60,
      "player:p1": 8,
      "player:p2": 4,
      "player:p3": 4,
      "player:p4": 4,
    });
    expect(s.state.companies["VH"]!.position).toEqual({ row: 4, col: 3 });
  });

  it("quickstart 12: amending the Space Port to 30 gives no move; to 0 moves left 1", async () => {
    const created = start();
    const seed = seedEvents("VH", { cell: { row: 4, col: 2 }, holders: VH_HOLDERS });
    const log: LogEntry[] = [
      seedGroup(1, { type: "createSession", players, walletMode: "appTruth" }, created.lastEvents),
      seedGroup(2, { type: "note", text: "seed" }, seed),
    ];
    const store = new SessionStore({ appendEntry: () => Promise.resolve() }, makeMeta({ game: g21, players }), log);

    const paid = await store.dispatch(run("VH", 60, 40));
    if (!paid.ok) throw new Error(paid.messageEs);
    const position = () => store.getSnapshot().state.companies["VH"]!.position;
    expect(position()).toEqual({ row: 4, col: 3 });

    await store.amend(paid.group.id, run("VH", 60, 30), { confirmed: true });
    expect(position()).toEqual({ row: 4, col: 2 });
    expect(cashOf(store.getSnapshot().state, "player:p2")).toBe(410 + 3);

    await store.amend(paid.group.id, run("VH", 60, 0), { confirmed: true });
    expect(position()).toEqual({ row: 4, col: 1 });
  });

  it("§11.5: a company's own treasury shares are paid to the company (user-confirmed)", () => {
    const s = seedCompany(start(), "VH", { cell: { row: 4, col: 2 }, holders: { ...VH_HOLDERS, "company:VH": 1 } });
    s.do(run("VH", 0, 40));
    expect(netMoney(s.lastEvents)["company:VH"]).toBe(4);
  });

  it("§11.5 example: SSF holding 10% of VH receives 35 into its treasury", () => {
    const s = seedCompany(start(), "SSF", { cell: { row: 4, col: 2 }, holders: { "player:p2": 2 } });
    seedCompany(s, "VH", { cell: { row: 2, col: 9 }, holders: { "player:p1": 2, "company:SSF": 1 } });
    s.do(run("VH", 0, 350));
    expect(netMoney(s.lastEvents)["company:SSF"]).toBe(35);
  });

  it("§6.1.3: P3 Space Bridge — the bank pays the company ₡60 once", () => {
    const s = seedCompany(start(), "VH", { cell: { row: 4, col: 2 }, holders: VH_HOLDERS });
    s.do({ type: "bankPays", company: "VH", amount: 60, reason: "Space Bridge" });
    expect(netMoney(s.lastEvents)).toEqual({ bank: -60, "company:VH": 60 });
    expect(s.violations()).toEqual([]);
  });

  it("§11.8.2: a company in receivership withholds everything and moves left 1 each run", () => {
    const s = seedCompany(start(), "VH", { cell: { row: 4, col: 2 }, status: "receivership", holders: VH_HOLDERS });
    s.do(run("VH", 60, 40));
    expect(netMoney(s.lastEvents)).toEqual({ bank: -100, "company:VH": 100 });
    expect(s.state.companies["VH"]!.position).toEqual({ row: 4, col: 1 });
  });

  it("§12: entering the Closed cell bankrupts the company", () => {
    const s = seedCompany(start(), "SSF", { cell: { row: 3, col: 2 }, holders: { "player:p2": 2 } });
    seedCompany(s, "VH", {
      cell: { row: 5, col: 0 }, // 40, left arrow down to Closed
      cash: 50,
      holders: { ...VH_HOLDERS, "company:SSF": 1 },
      trains: ["train:2:1"],
    });
    s.apply({ t: "shareTransfer", company: "SSF", from: "ipo:SSF", to: "company:VH", units: 1 });
    s.do(run("VH", 0, 0));
    expect(s.state.companies["VH"]!.status).toBe("bankrupt");
    expect(s.state.holdings["removed"]?.["VH"]).toBe(10);
    expect(s.state.holdings["pool"]?.["SSF"]).toBe(1);
    expect(cashOf(s.state, "company:VH")).toBe(0);
    expect(s.state.assets["train:2:1"]).toBe("removed");
    expect(eventsOf(s.lastEvents, "companyStatus").at(-1)?.status).toBe("bankrupt");
    expect(s.violations()).toEqual([]);
  });

  it("there is no payout-mode choice", () => {
    const s = seedCompany(start(), "VH", { cell: { row: 4, col: 2 }, holders: VH_HOLDERS });
    expect(s.tryDo({ ...run("VH", 60, 40), mode: "half" }).kind).toBe("unavailable");
  });
});

describe("21Moon stock round (quickstart 12)", () => {
  it("§9.2: Ana starts VH at 70 → ₡140 to VH; three IPO buys at 70 → VH floats at 50% with ₡350", () => {
    const s = start().do({ type: "startSR" }).do({ type: "parCompany", player: "p1", company: "VH", price: 70 });
    expect(netMoney(s.lastEvents)).toEqual({ "player:p1": -140, "company:VH": 140 });
    for (const p of ["p2", "p3", "p4"]) {
      s.do({ type: "buyShare", buyer: `player:${p}`, company: "VH", source: "ipo", count: 1 });
    }
    expect(s.state.companies["VH"]!.status).toBe("floated");
    expect(cashOf(s.state, "company:VH")).toBe(350);
    expect(s.violations()).toEqual([]);
  });

  it("§2.4: the late company cannot be started before SR3 (warning)", () => {
    const game = applyOptions(g21, { lateCompany: "KR" });
    const s = TestSession.start(game, players).do({ type: "startSR" });
    s.do({ type: "parCompany", player: "p1", company: "KR", price: 70 });
    expect(s.lastWarnings.map((w) => w.code)).toContain("notYetAvailable");
  });
});

describe("zero run (T005, SC-002)", () => {
  it("§11.5: no Space Port earnings moves the price left 1 and moves no money", () => {
    const s = seedCompany(start(), "VH", { cell: { row: 4, col: 2 }, holders: VH_HOLDERS });
    const bank = cashOf(s.state, "bank");
    expect(zeroRunAction(g21, "VH")).toEqual({
      type: "runAndPayout",
      company: "VH",
      parts: [
        { part: "local", amount: 0 },
        { part: "spacePort", amount: 0 },
      ],
      mode: null,
    });
    s.do(zeroRunAction(g21, "VH"));
    expect(s.state.companies["VH"]?.position).toEqual({ row: 4, col: 1 });
    expect(cashOf(s.state, "bank")).toBe(bank);
  });
});
