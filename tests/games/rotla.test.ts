import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import { getBuiltInGame, hasUnverified, optionWarnings } from "../../src/domain/games";
import { validateDefinition } from "../../src/domain/games/validateDefinition";
import { cellTagsAt, floorToTrack, priceOf } from "../../src/domain/mechanics/market";
import { SessionStore } from "../../src/app/SessionStore";
import { touchesOf, type GroupEntry, type LogEntry } from "../../src/domain/ledger/entries";
import { endTriggers } from "../../src/domain/mechanics/endTriggers";
import { finalResults } from "../../src/domain/mechanics/scores";
import { ROTLA_NAMES, bankTrainCounts, rotlaGame, rotlaSession } from "../helpers/rotla";
import { makeMeta } from "../helpers/session";
import { makePlayers } from "../helpers/dispatch";

/** The RotLA definition (contracts/game-definition.md). */

const g = getBuiltInGame("rotla");

describe("RotLA definition", () => {
  it("parses and passes validateDefinition", () => {
    const result = validateDefinition(g);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it("has unverified data (the majors' second identities)", () => {
    expect(hasUnverified(g)).toBe(true);
    expect(g.verification["companies"]).toBe("unverified");
  });

  it("has 12 minors and 6 majors with their tiers", () => {
    expect(g.companies.filter((c) => c.tier === "minor")).toHaveLength(12);
    expect(g.companies.filter((c) => c.tier === "major").map((c) => c.id)).toEqual(["CON", "UNI", "SYS", "INT", "FED", "EXM"]);
    expect(g.companies.find((c) => c.id === "CON")?.altName).toBe("Conglomerate");
    expect(g.companies.find((c) => c.id === "TUN")?.traits?.payments?.[0]).toMatchObject({ amount: 60, cost: 40, direction: "bankPays" });
  });

  it("the market is a 27-cell track, 500 on top and 0 tagged closed", () => {
    expect(g.market.shape).toBe("1d");
    expect(g.market.cells).toHaveLength(27);
    expect(g.market.cells.every((row) => row.length === 1)).toBe(true);
    expect(g.market.cells[0]?.[0]?.price).toBe(500);
    expect(g.market.cells[26]?.[0]?.price).toBe(0);
    expect(cellTagsAt(g, { row: 26, col: 0 })).toContain("closed");
  });

  it("the phase table matches the contract", () => {
    expect(
      g.phases.map((p) => [p.id, p.color, p.triggeredBy, p.trainLimitByTier?.minor, p.trainLimitByTier?.major ?? null, p.launchPriceRange]),
    ).toEqual([
      ["yellow", "Amarilla", null, 2, null, [60, 90]],
      ["green", "Verde", "3", 2, 4, [60, 110]],
      ["green4", "Verde", "4", 2, 3, [60, 110]],
      ["purple", "Morada", "5", 1, 2, [60, 135]],
      ["purple6", "Morada", "6", 1, 2, [60, 135]],
      ["grey", "Gris", "7", 1, 2, [60, 135]],
    ]);
    expect(g.trains.map((t) => [t.type, t.rustsOnPhase ?? null])).toEqual([
      ["2", "green4"],
      ["3", "purple6"],
      ["4", "grey"],
      ["5", null],
      ["6", null],
      ["7", null],
    ]);
  });

  it.each([
    [3, { "2": 7, "3": 5, "4": 4, "5": 3, "6": 2 }],
    [4, { "2": 7, "3": 6, "4": 4, "5": 3, "6": 3 }],
  ])("Long %i players: the train stack", (players, counts) => {
    const s = rotlaSession({ players });
    expect(bankTrainCounts(s)).toEqual(counts);
    expect(g.trains.at(-1)).toMatchObject({ type: "7", count: "unlimited", displayName: "7/∞" });
  });
});

describe("SC-002, Diagram 3: launch prices and stacking", () => {
  it("three launches give 80, 80 (below the first) and 70, and OR 1 runs them in that order", () => {
    const launch = (player: string, company: string, bid: number) => ({ type: "launchCompany", player, company, bid, price: null });
    const s = rotlaSession().do(launch("p1", "EXP", 165)).do(launch("p2", "TUN", 160)).do(launch("p3", "AGR", 140));
    expect(["EXP", "TUN", "AGR"].map((c) => priceOf(s.game, s.state, c))).toEqual([80, 80, 70]);
    s.do({ type: "startOR" });
    expect(s.state.turn.operatingOrder).toEqual(["EXP", "TUN", "AGR"]);
    expect(s.state.turn.currentCompany).toBe("EXP");
  });
});

describe("US1: modes × player counts", () => {
  it.each([
    ["long", 3, { "2": 7, "3": 5, "4": 4, "5": 3, "6": 2 }, true],
    ["long", 4, { "2": 7, "3": 6, "4": 4, "5": 3, "6": 3 }, true],
    ["short", 2, { "2": 6, "3": 4, "4": 3, "5": 2, "6": 1 }, true],
    ["short", 4, { "2": 6, "3": 5, "4": 3, "5": 2, "6": 2 }, true],
    ["micro2", 2, { "2": 3, "3": 3, "4": 3 }, false],
    ["micro3", 3, { "2": 5, "3": 4, "4": 4 }, false],
  ] as const)("%s, %i players: train stack", (mode, players, counts, unlimited7) => {
    const s = rotlaSession({ players, options: { mode } });
    expect(bankTrainCounts(s)).toEqual(counts);
    expect(s.game.trains.some((t) => t.type === "7" && t.count === "unlimited")).toBe(unlimited7);
  });

  it.each([
    ["long", 3, 300],
    ["long", 4, 275],
    ["long", 5, 220],
    ["short", 2, 450],
    ["micro2", 2, 225],
    ["micro3", 3, 225],
    // Off-mode counts use the same table.
    ["long", 2, 450],
    ["short", 5, 220],
  ] as const)("%s, %i players: starting cash %i", (mode, players, cash) => {
    const s = rotlaSession({ players, options: { mode } });
    for (let i = 1; i <= players; i++) expect(cashOf(s.state, `player:p${i}`)).toBe(cash);
  });

  it("Long has 12 minors; Short has 8, without ADP, BRG, OVN and SPC", () => {
    const minors = (mode: string) => rotlaGame({ mode }).companies.filter((c) => c.tier === "minor").map((c) => c.id);
    expect(minors("long")).toHaveLength(12);
    expect(minors("short")).toHaveLength(8);
    for (const id of ["ADP", "BRG", "OVN", "SPC"]) expect(minors("short")).not.toContain(id);
  });

  it("cycles: Long 6, the others 4; Micro exports nothing", () => {
    const cycles = (mode: string) => {
      const schedule = rotlaGame({ mode }).roundSchedule;
      return schedule.type === "fixed" ? schedule.sequence.filter((slot) => slot.startsWith("SR")).length : 0;
    };
    expect([cycles("long"), cycles("short"), cycles("micro2"), cycles("micro3")]).toEqual([6, 4, 4, 4]);
    // A merge patch deletes a key set to null: absent and null both mean no export.
    expect(rotlaGame({ mode: "micro2" }).trainExport ?? null).toBeNull();
    expect(rotlaGame({ mode: "micro3" }).trainExport ?? null).toBeNull();
    expect(rotlaGame({ mode: "short" }).trainExport).toEqual({ allOfType: ["2"] });
  });

  it("the game starts in cycle 1, Stock Round", () => {
    const s = rotlaSession();
    expect(s.state.turn.round).toBe("SR");
    expect(s.state.turn.srNumber).toBe(1);
    expect(s.state.turn.scheduleIndex).toBe(0);
  });

  it.each([
    ["long", 2],
    ["short", 5],
  ] as const)("mode %s with %i players warns and still creates the session (US1-2)", (mode, players) => {
    const warnings = optionWarnings(g, { mode }, players);
    expect(warnings.map((w) => w.code)).toContain("recommendedPlayers");
    expect(() => rotlaSession({ players, options: { mode } })).not.toThrow();
  });

  it("no option warning inside the mode's range", () => {
    expect(optionWarnings(g, { mode: "short" }, 3)).toEqual([]);
    expect(optionWarnings(g, {}, 4)).toEqual([]);
  });
});

describe("expansion: landmarks (US11)", () => {
  const ids = (game: ReturnType<typeof rotlaGame>) => game.companies.map((c) => c.id);

  it("adds four minors and two majors with their colors, traits and placeholder identities", () => {
    const game = rotlaGame({ expansion: "landmarks" });
    for (const id of ["CIR", "CPL", "MFG", "TWC", "AUT", "LGE"]) expect(ids(game)).toContain(id);
    const def = (id: string) => game.companies.find((c) => c.id === id)!;
    expect(def("MFG")).toMatchObject({
      name: "Manufacturing",
      color: "#c9a227",
      tier: "minor",
      start: "auction",
      traits: { launchFee: 50, launchAssets: ["train:M2:1"], noLeadoffTrain: true },
    });
    expect(def("CIR")).toMatchObject({ color: "#9c27b0", tier: "minor" });
    expect(def("AUT")).toMatchObject({ name: "Authority", altName: "Authority II", tier: "major", start: "merger", color: "#e0e0e0" });
    expect(def("LGE")).toMatchObject({ name: "League", altName: "League II", tier: "major", color: "#424242" });
  });

  it("adds the special M2 train (cost 0), held by removed at the start, and the landmarks rule", () => {
    const game = rotlaGame({ expansion: "landmarks" });
    expect(game.trains.find((t) => t.type === "M2")).toMatchObject({ count: 1, special: true, variants: [{ name: "2", cost: 0 }] });
    expect(game.customRules.map((r) => r.id)).toContain("landmarks");
    const s = rotlaSession({ options: { expansion: "landmarks" } });
    expect(s.state.assets["train:M2:1"]).toBe("removed");
  });

  it("works with every mode (the M2 survives the mode's train list)", () => {
    for (const mode of ["long", "short", "micro2", "micro3"]) {
      expect(rotlaGame({ mode, expansion: "landmarks" }).trains.some((t) => t.type === "M2")).toBe(true);
    }
  });

  it("off: none of it", () => {
    const game = rotlaGame({ expansion: "off" });
    for (const id of ["CIR", "CPL", "MFG", "TWC", "AUT", "LGE"]) expect(ids(game)).not.toContain(id);
    expect(game.trains.some((t) => t.type === "M2")).toBe(false);
    expect(game.customRules.map((r) => r.id)).not.toContain("landmarks");
  });
});

describe("US4: reopen an automatic end, fix the last dividend (feature 007, FR-005a–c)", () => {
  /** RotLA Short in OR 4.2 with EXP (Ana's) operating: its turn is the last of the game. */
  function lastTurnStore() {
    const s = rotlaSession({ options: { mode: "short" } });
    const seed: GroupEntry["events"] = [
      { t: "companyStatus", company: "EXP", status: "floated", parPrice: 80 },
      { t: "marketMove", company: "EXP", to: floorToTrack(s.game, 80), reason: "par" },
      { t: "shareTransfer", company: "EXP", from: "ipo:EXP", to: "player:p1", units: 3, presidency: true },
      { t: "shareTransfer", company: "EXP", from: "ipo:EXP", to: "player:p2", units: 1 },
      { t: "turnAdvance", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: "EXP" },
    ];
    const group = (seq: number, action: GroupEntry["action"], events: GroupEntry["events"]): GroupEntry => ({
      kind: "group", seq, id: `g${seq}`, at: `2026-10-10T20:0${seq}:00.000Z`, source: "system", action, events, touches: touchesOf(events), warnings: [],
    });
    const created = s.groups[0]!;
    const log: LogEntry[] = [group(1, created.action, created.events), group(2, { type: "note", text: "seed" }, seed)];
    return new SessionStore({ appendEntry: () => Promise.resolve() }, makeMeta({ game: s.game, players: [...s.players] }), log);
  }
  const pay = (amount: number) => ({ type: "runAndPayout", company: "EXP", parts: [{ part: "revenue", amount }], mode: "full" });
  const must = async <T extends { ok: boolean }>(p: Promise<T>): Promise<Extract<T, { ok: true }>> => {
    const r = await p;
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r as Extract<T, { ok: true }>;
  };
  const anaTotal = (store: SessionStore) => {
    const { meta, gameEnd } = store.getSnapshot();
    const end = gameEnd.end!;
    return finalResults(meta.game, meta.players, end.state, end.eliminationOrder).find((r) => r.player === "p1")!.total;
  };

  it("automatic end → reopen → no automatic end; fixing the dividend ends it again with the new results", async () => {
    const store = lastTurnStore();
    const paid = await must(store.dispatch(pay(100)));
    const next = await must(store.dispatch({ type: "nextCompany" }));
    expect(store.getSnapshot().gameEnd.end).toMatchObject({ groupId: next.group.id, auto: true });
    const firstTotal = anaTotal(store);

    await must(store.dispatch({ type: "reopenGame" }));
    const open = store.getSnapshot();
    expect(open.gameEnd.end).toBeNull();
    expect(endTriggers(open.meta.game, open.state).map((t) => t.type)).toContain("cyclesComplete");

    // Undo runs newest first (feature 010): the reopening, the end, then the dividend.
    await must(store.undoLast());
    await must(store.undoLast());
    const undone = await must(store.undoLast());
    expect(undone.undone.map((g) => g.id)).toEqual([paid.group.id]);
    expect(store.getSnapshot().gameEnd.end).toBeNull();
    await must(store.dispatch(pay(200)));
    const again = await must(store.dispatch({ type: "nextCompany" }));
    expect(store.getSnapshot().gameEnd.end).toMatchObject({ groupId: again.group.id, auto: true });
    expect(anaTotal(store)).toBeGreaterThan(firstTotal!);
    expect(store.getSnapshot().autoEndGroups).toEqual([again.group.id]);
  });

  it("undoing the reopening instead restores the original end and results", async () => {
    const store = lastTurnStore();
    await must(store.dispatch(pay(100)));
    const next = await must(store.dispatch({ type: "nextCompany" }));
    const original = store.getSnapshot().gameEnd.end;
    const reopened = await must(store.dispatch({ type: "reopenGame" }));
    const undone = await must(store.undoLast());
    expect(undone.undone.map((g) => g.id)).toEqual([reopened.group.id]);
    expect(store.getSnapshot().gameEnd.end).toEqual(original);
    expect(store.getSnapshot().gameEnd.end?.groupId).toBe(next.group.id);
  });
});

describe("SC-002: undoing an issue after a run restores the price (feature 010, stale-market bug)", () => {
  const players = makePlayers(ROTLA_NAMES.slice(0, 3));
  async function issuedAndPaid() {
    const store = new SessionStore({ appendEntry: () => Promise.resolve() }, makeMeta({ game: rotlaGame(), players }), []);
    for (const action of [
      { type: "createSession", players, walletMode: "appTruth" },
      { type: "launchCompany", player: "p1", company: "TUN", bid: 160, price: null },
      { type: "launchCompany", player: "p2", company: "EXP", bid: 160, price: null },
      { type: "startOR" },
    ]) {
      const r = await store.dispatch(action);
      if (!r.ok) throw new Error(`${action.type}: ${r.messageEs}`);
    }
    return store;
  }
  const price = (store: SessionStore) => {
    const { meta, state } = store.getSnapshot();
    return priceOf(meta.game, state, "TUN");
  };
  const cash = (store: SessionStore) => {
    const { state } = store.getSnapshot();
    return ["company:TUN", "player:p1", "player:p2", "player:p3", "bank"].map((h) => cashOf(state, h as never));
  };

  it("issue (80 → 70), run and pay out, undo twice: price 80, treasury and cash as before the issue", async () => {
    const store = await issuedAndPaid();
    expect(price(store)).toBe(80);
    const before = store.getSnapshot().state;
    const cashBefore = cash(store);
    expect((await store.dispatch({ type: "issueShares", company: "TUN", count: 1 })).ok).toBe(true);
    expect(price(store)).toBe(70);
    const paid = await store.dispatch({ type: "runAndPayout", company: "TUN", parts: [{ part: "revenue", amount: 50 }], mode: "full" });
    expect(paid.ok).toBe(true);

    expect((await store.undoLast()).ok).toBe(true);
    expect((await store.undoLast()).ok).toBe(true);
    expect(price(store)).toBe(80);
    expect(cash(store)).toEqual(cashBefore);
    expect(store.getSnapshot().state).toEqual(before);
  });
});
