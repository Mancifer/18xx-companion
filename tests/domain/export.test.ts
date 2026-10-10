import { describe, expect, it } from "vitest";
import { counterOf } from "../../src/domain/events/state";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import { exportEvents } from "../../src/domain/mechanics/schedule";
import type { TestSession } from "../helpers/dispatch";
import { bankTrainCounts, rotlaSession, seedCompany } from "../helpers/rotla";

/** The export at the start of each SR after the first (US8, research R7, B p.19). */

const toEndOfCycle = (s: TestSession) => s.do({ type: "startOR" }).do({ type: "startOR" });
const clearBank = (s: TestSession, type: string, count: number) => {
  for (let n = 1; n <= count; n++) s.apply({ t: "assetTransfer", asset: `train:${type}:${n}`, from: "bank", to: "removed" });
  return s;
};

describe("exportEvents", () => {
  it("a 2 on top: every bank-held 2 leaves the game", () => {
    const s = rotlaSession();
    s.apply({ t: "assetTransfer", asset: "train:2:1", from: "bank", to: "removed" });
    const events = exportEvents(s.game, s.state);
    expect(events).toHaveLength(6);
    expect(events.every((e) => e.t === "assetTransfer" && e.from === "bank" && e.to === "removed" && e.asset.startsWith("train:2:"))).toBe(true);
  });

  it("only 7/∞ left: one new 7 leaves, and the supply stays unlimited", () => {
    const s = rotlaSession();
    for (const [type, n] of [["2", 7], ["3", 5], ["4", 4], ["5", 3], ["6", 2]] as const) clearBank(s, type, n);
    s.apply({ t: "assetTransfer", asset: "train:7:1", from: "bank", to: "company:CON" });
    expect(exportEvents(s.game, s.state)).toEqual([{ t: "assetTransfer", asset: "train:7:2", from: "bank", to: "removed" }]);
  });

  it("Micro games have no export", () => {
    const s = rotlaSession({ players: 2, options: { mode: "micro2" } });
    expect(s.game.trainExport ?? null).toBeNull();
    expect(exportEvents(s.game, s.state)).toEqual([]);
  });
});

describe("startSR with the export", () => {
  it("the first SR exports nothing", () => {
    const s = rotlaSession();
    expect(s.groups[0]!.events.some((e) => e.t === "assetTransfer")).toBe(false);
    expect(bankTrainCounts(s)["2"]).toBe(7);
  });

  it("the end step, then the export, then the new SR; every 2 goes", () => {
    const s = toEndOfCycle(rotlaSession()).do({ type: "startSR" });
    const exportAt = s.lastEvents.findIndex((e) => e.t === "assetTransfer");
    const srAt = s.lastEvents.findIndex((e) => e.t === "turnAdvance" && e.round === "SR");
    expect(exportAt).toBeGreaterThanOrEqual(0);
    expect(exportAt).toBeLessThan(srAt);
    expect(bankTrainCounts(s)["2"]).toBeUndefined();
    expect(s.state.turn).toMatchObject({ round: "SR", srNumber: 2 });
  });

  it("the first 3 exported starts green, with an info that names it", () => {
    const s = toEndOfCycle(clearBank(rotlaSession(), "2", 7));
    const result = s.tryDo({ type: "startSR" });
    expect(result.kind === "ok" && result.warnings).toContainEqual({
      code: "export",
      messageEs: "Se exporta un tren 3: empieza la fase verde.",
      severity: "info",
    });
    s.do({ type: "startSR" });
    expect(s.state.turn.phase).toBe("green");
  });

  it("the first 4 exported rusts every 2 as if bought; Resourceful keeps its 2s, marked", () => {
    const s = clearBank(clearBank(rotlaSession(), "2", 5), "3", 5);
    seedCompany(s, "RES", { price: 80, holders: { "player:p1": 5 }, trains: ["train:2:6"] });
    seedCompany(s, "EXP", { price: 70, holders: { "player:p2": 5 }, trains: ["train:2:7"] });
    toEndOfCycle(s);
    const result = s.tryDo({ type: "startSR" });
    expect(result.kind === "ok" && result.warnings.find((w) => w.code === "export")?.messageEs).toBe(
      "Se exporta un tren 4: empieza la fase verde; se oxidan los 2.",
    );
    s.do({ type: "startSR" });
    expect(s.state.turn.phase).toBe("green4");
    expect(s.state.assets["train:2:7"]).toBe("removed");
    expect(s.state.assets["train:2:6"]).toBe("company:RES");
    expect(counterOf(s.state, "company:RES", "rusted:train:2:6")).toBe(1);
  });

  it("undo restores the stack, the phase and the rusted trains", () => {
    const s = toEndOfCycle(clearBank(rotlaSession(), "2", 7));
    const AT = "2026-10-09T20:00:00.000Z";
    const log: LogEntry[] = s.groups.map(
      (g): GroupEntry => ({ kind: "group", seq: g.seq, id: g.id, at: AT, source: "touch", action: g.action, events: g.events, touches: [], warnings: [] }),
    );
    // The clearing above was applied raw; replay it as the first group's tail.
    const cleared: LogEntry[] = [
      { ...(log[0] as GroupEntry), events: [...(log[0] as GroupEntry).events, ...Array.from({ length: 7 }, (_, i) => ({ t: "assetTransfer" as const, asset: `train:2:${i + 1}`, from: "bank" as const, to: "removed" as const }))] },
      ...log.slice(1),
    ];
    const before = replay(s.game, s.players, cleared).state;
    expect(before).toEqual(s.state);
    s.do({ type: "startSR" });
    const g = s.groups.at(-1)!;
    const after: LogEntry[] = [
      ...cleared,
      { kind: "group", seq: g.seq, id: g.id, at: AT, source: "touch", action: g.action, events: g.events, touches: [], warnings: [] },
      { kind: "revert", seq: g.seq + 1, at: AT, groupId: g.id },
    ];
    expect(replay(s.game, s.players, after).state).toEqual(before);
  });

  it("warns once the game is over", () => {
    const s = rotlaSession({ options: { mode: "short" } });
    s.apply({ t: "turnAdvance", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null });
    const result = s.tryDo({ type: "startSR" });
    expect(result.kind === "ok" && result.warnings.map((w) => w.messageEs)).toContain("La partida terminó.");
  });
});
