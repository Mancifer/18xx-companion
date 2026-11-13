import { describe, expect, it } from "vitest";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import type { EffectiveGroup } from "../../src/domain/ledger/effectiveLog";
import { lastRun, lastRuns } from "../../src/domain/ledger/lastRun";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { ROTLA_NAMES, rotlaGame, seedCompany as seedRotla } from "../helpers/rotla";
import { seedCompany } from "../helpers/seed";

/** Feature 017 (US2, research R5–R6, contracts/domain.md): a company's last run. */

const g1830 = getBuiltInGame("1830");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const run = (company: string | null, amount: number, mode: "full" | "withhold" | null = "full") => ({
  type: "runAndPayout",
  company,
  parts: [{ part: "revenue", amount }],
  mode,
});

/** 1830 in OR 1.1: Ana presides PRR (60%), Bruno presides NYC (60%). */
function inOR() {
  const s = TestSession.start(g1830, players).do({ type: "startSR" });
  seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } });
  seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, holders: { "player:p2": 6 } });
  return s.do({ type: "startOR" });
}

/** The effective log with the newest `n` groups undone (in-order undo leaves a prefix). */
const undone = (s: TestSession, n: number): EffectiveGroup[] => s.groups.slice(0, s.groups.length - n);

describe("lastRun in 1830 (US2)", () => {
  it("a company that never ran has none (FR-014)", () => {
    const s = inOR();
    expect(lastRun(s.game, s.groups, "PRR")).toBeUndefined();
  });

  it("a full payout: its revenue, part, mode and OR", () => {
    const s = inOR().do(run("PRR", 160));
    expect(lastRun(s.game, s.groups, "PRR")).toEqual({
      company: "PRR",
      groupId: s.groups.at(-1)!.id,
      or: { orSet: 1, orIndex: 1 },
      revenue: 160,
      parts: [{ part: "revenue", amount: 160 }],
      mode: "full",
    });
  });

  it("a later run of 0, withheld, replaces it; undoing it brings 160 back (FR-015)", () => {
    const s = inOR().do(run("PRR", 160)).do(run("PRR", 0, "withhold"));
    expect(lastRun(s.game, s.groups, "PRR")).toMatchObject({ revenue: 0, mode: "withhold" });
    expect(lastRun(s.game, undone(s, 1), "PRR")).toMatchObject({ revenue: 160, mode: "full" });
    expect(lastRun(s.game, undone(s, 2), "PRR")).toBeUndefined();
  });

  it("a full payout of 0 reads as withheld, as the market does", () => {
    const s = inOR().do(run("PRR", 0, "full"));
    expect(lastRun(s.game, s.groups, "PRR")).toMatchObject({ revenue: 0, mode: "withhold" });
  });

  it("is per company", () => {
    const s = inOR().do(run("PRR", 160)).do(run("NYC", 90));
    const all = lastRuns(s.game, s.groups);
    expect(all.get("PRR")?.revenue).toBe(160);
    expect(all.get("NYC")?.revenue).toBe(90);
    expect(all.has("B&O")).toBe(false);
  });

  it("a null company is the operating one", () => {
    const s = inOR();
    const current = s.state.turn.currentCompany!;
    s.do(run(null, 120));
    expect(lastRun(s.game, s.groups, current)?.revenue).toBe(120);
  });

  it("passing the turn with no run records a run of 0, withheld", () => {
    const s = inOR();
    const current = s.state.turn.currentCompany!;
    s.do({ type: "nextCompany" });
    expect(lastRun(s.game, s.groups, current)).toMatchObject({
      revenue: 0,
      parts: [{ part: "revenue", amount: 0 }],
      mode: "withhold",
    });
  });

  it("keeps the previous run, with its own OR, while the next OR has not reached it", () => {
    const s = inOR().do(run("PRR", 160)).do({ type: "nextCompany" });
    // Finish OR 1.1 for everyone, then start the next round of ORs.
    for (let i = 0; i < 10 && s.state.turn.round === "OR"; i++) s.do({ type: "nextCompany" });
    expect(lastRun(s.game, s.groups, "PRR")).toMatchObject({ revenue: 160, or: { orSet: 1, orIndex: 1 } });
  });

  it("in receivership the run is withheld, whatever the action said (R6)", () => {
    // The base ruleset (an option default) brings the forced withhold.
    const s = TestSession.start(applyOptions(g1830, { ruleset: "base" }), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, status: "receivership", holders: { pool: 6 } });
    s.do({ type: "startOR" }).do(run("PRR", 100, "full"));
    expect(lastRun(s.game, s.groups, "PRR")).toMatchObject({ revenue: 100, mode: "withhold" });
  });

  it("a voice compound with the run inside", () => {
    const s = inOR();
    const current = s.state.turn.currentCompany!;
    s.do({ type: "compound", actions: [run(null, 140), { type: "nextCompany" }] });
    expect(lastRun(s.game, s.groups, current)).toMatchObject({ revenue: 140, mode: "full" });
  });

  it("a compound whose run can't be matched has no amount, rather than a wrong one", () => {
    const s = inOR();
    const g: EffectiveGroup = {
      id: "gx",
      seq: 99,
      at: "",
      source: "voice",
      action: { type: "compound", actions: [{ type: "note", text: "?" }] },
      events: [{ t: "counterChange", subject: "company:PRR", key: "runs", delta: 1 }],
      touches: [],
    };
    expect(lastRun(s.game, [...s.groups, g], "PRR")).toMatchObject({ revenue: null, groupId: "gx" });
  });
});

describe("lastRun in other games", () => {
  it("21Moon: the parts in game order, their total, no payout mode", () => {
    const game = getBuiltInGame("21moon");
    const company = game.companies[0]!.id;
    const g: EffectiveGroup = {
      id: "g1",
      seq: 1,
      at: "",
      source: "touch",
      action: { type: "runAndPayout", company, parts: [{ part: "spacePort", amount: 40 }, { part: "local", amount: 80 }], mode: null },
      events: [{ t: "counterChange", subject: `company:${company}`, key: "runs", delta: 1 }],
      touches: [],
    };
    expect(lastRun(game, [g], company)).toMatchObject({
      revenue: 120,
      parts: [
        { part: "local", amount: 80 },
        { part: "spacePort", amount: 40 },
      ],
      mode: null,
    });
  });

  it("1848: the Bank of England never has a last run", () => {
    const game = getBuiltInGame("1848");
    const events: PrimitiveEvent[] = [{ t: "counterChange", subject: "company:BOE", key: "runs", delta: 1 }];
    const g: EffectiveGroup = { id: "g1", seq: 1, at: "", source: "touch", action: { type: "nationalPayout", extra: 0 }, events, touches: [] };
    expect(lastRuns(game, [g]).has("BOE")).toBe(false);
  });

  it("RotLA: a major formed by a merger takes no run from its minors (FR-017)", () => {
    const s = TestSession.start(rotlaGame(), makePlayers(ROTLA_NAMES.slice(0, 3)));
    s.apply({ t: "turnAdvance", round: "MR", srNumber: 2, phase: "green" });
    seedRotla(s, "EXP", { price: 80, holders: { "player:p1": 3, "player:p2": 2 }, treasury: 200, trains: ["train:2:1"] });
    seedRotla(s, "TUN", { price: 70, holders: { "player:p2": 3, "company:TUN": 2 }, treasury: 110, trains: ["train:3:1"] });
    // The minors' runs, as earlier entries.
    const ran = (id: string, company: string, amount: number): EffectiveGroup => ({
      id,
      seq: 0,
      at: "",
      source: "touch",
      action: { type: "runAndPayout", company, parts: [{ part: "revenue", amount }], mode: "full" },
      events: [{ t: "counterChange", subject: `company:${company}`, key: "runs", delta: 1 }],
      touches: [],
    });
    s.do({ type: "mergeCompanies", a: "EXP", b: "TUN", into: "UNI", identity: null });
    const groups = [ran("r1", "EXP", 70), ran("r2", "TUN", 50), ...s.groups];
    const all = lastRuns(s.game, groups);
    expect(all.has("UNI")).toBe(false);
    expect(all.get("EXP")?.revenue).toBe(70);
    expect(all.get("TUN")?.revenue).toBe(50);
  });
});
