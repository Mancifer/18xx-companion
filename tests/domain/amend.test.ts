import { describe, expect, it } from "vitest";
import { buildAmend } from "../../src/domain/ledger/amend";
import { effectiveLog, groupStatus, groupHistory } from "../../src/domain/ledger/effectiveLog";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import { runPipeline } from "../../src/domain/actions/pipeline";
import { cashOf } from "../../src/domain/events/state";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { makePlayers } from "../helpers/dispatch";

const game = applyOptions(getBuiltInGame("1830"), {});
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const AT = "2026-10-07T20:00:00.000Z";

/** Builds a log by running actions through the pipeline, as the store does. */
function logOf(...actions: unknown[]): LogEntry[] {
  const log: LogEntry[] = [];
  for (const action of actions) {
    const { state } = replay(game, players, log);
    const result = runPipeline({ game, players, state }, action);
    if (result.kind !== "ok") throw new Error(result.kind);
    const seq = log.length + 1;
    log.push({
      kind: "group",
      seq,
      id: `g${seq}`,
      at: AT,
      source: "touch",
      action: result.action,
      events: result.events,
      touches: result.touches,
      warnings: result.warnings,
    } satisfies GroupEntry);
  }
  return log;
}

const start = { type: "createSession", players, walletMode: "appTruth" };
const pay = (from: string, amount: number) => ({ type: "transferMoney", from, to: "bank", amount });
const set = (holder: string, setTo: number) => ({ type: "adjustMoney", holder, delta: null, setTo });

describe("amend (research R3)", () => {
  it("swaps in the corrected version and keeps the original visible (US2-2)", () => {
    const log = logOf(start, pay("player:p1", 240));
    const amend = buildAmend(game, players, log, "g2", pay("player:p1", 260), { seq: 3, at: AT });
    expect(amend.ok).toBe(true);
    if (!amend.ok) return;
    const after = [...log, amend.entry];
    expect(cashOf(replay(game, players, after).state, "player:p1")).toBe(340);
    expect(groupStatus(after, "g2")).toBe("amended");
    const history = groupHistory(after).find((h) => h.group.id === "g2");
    expect(history?.versions).toHaveLength(2);
  });

  it("expands against the state at the original group's position", () => {
    // g2 sets Ana to 100; g3 pays 50 (Ana → 50). Amending g2 to "set Ana to 200" is expanded
    // against Ana's cash before g2 (600), so the amended transfer is −400, not +150.
    const log = logOf(start, set("player:p1", 100), pay("player:p1", 50));
    const amend = buildAmend(game, players, log, "g2", set("player:p1", 200), { seq: 4, at: AT });
    expect(amend.ok).toBe(true);
    if (!amend.ok) return;
    expect(amend.entry.events).toEqual([{ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 400 }]);
    expect(cashOf(replay(game, players, [...log, amend.entry]).state, "player:p1")).toBe(150);
  });

  it("keeps later groups' stored events (they are not re-expanded)", () => {
    const log = logOf(start, set("player:p1", 100), set("player:p1", 300));
    const g3Events = (log[2] as GroupEntry).events;
    const amend = buildAmend(game, players, log, "g2", set("player:p1", 500), { seq: 4, at: AT });
    if (!amend.ok) throw new Error("amend failed");
    const after = [...log, amend.entry];
    expect(effectiveLog(after).find((g) => g.id === "g3")?.events).toEqual(g3Events);
    // g3 still adds the +200 it recorded at the table: 500 + 200.
    expect(cashOf(replay(game, players, after).state, "player:p1")).toBe(700);
  });

  it("an amend that breaks an invariant is surfaced, not corrected", () => {
    const log = logOf(start, { type: "transferShares", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true });
    const amend = buildAmend(
      game,
      players,
      log,
      "g2",
      { type: "transferShares", company: "PRR", from: "pool", to: "player:p1", units: 2, presidency: true },
      { seq: 3, at: AT },
    );
    if (!amend.ok) throw new Error("amend failed");
    const { violations } = replay(game, players, [...log, amend.entry]);
    expect(violations.map((v) => v.kind)).toContain("negativeUnits");
  });

  it("undoing an amend re-activates the previous version", () => {
    const log = logOf(start, pay("player:p1", 240));
    const amend = buildAmend(game, players, log, "g2", pay("player:p1", 260), { seq: 3, at: AT });
    if (!amend.ok) throw new Error("amend failed");
    const after: LogEntry[] = [...log, amend.entry, { kind: "revert", seq: 4, at: AT, groupId: "g2" }];
    expect(cashOf(replay(game, players, after).state, "player:p1")).toBe(360);
    expect(groupStatus(after, "g2")).toBe("active");
  });

  it("refuses to amend a reverted group", () => {
    const log: LogEntry[] = [...logOf(start, pay("player:p1", 240)), { kind: "revert", seq: 3, at: AT, groupId: "g2" }];
    const amend = buildAmend(game, players, log, "g2", pay("player:p1", 260), { seq: 4, at: AT });
    expect(amend.ok).toBe(false);
  });

  it("refuses an invalid corrected action", () => {
    const log = logOf(start, pay("player:p1", 240));
    expect(buildAmend(game, players, log, "g2", pay("player:p1", -5), { seq: 3, at: AT }).ok).toBe(false);
  });

  it("derives group status: active, reverted, amended", () => {
    const log = logOf(start, pay("player:p1", 1), pay("player:p1", 2));
    const amend = buildAmend(game, players, log, "g3", pay("player:p1", 3), { seq: 4, at: AT });
    if (!amend.ok) throw new Error("amend failed");
    const after: LogEntry[] = [...log, { kind: "revert", seq: 4, at: AT, groupId: "g2" }, { ...amend.entry, seq: 5 }];
    expect(groupStatus(after, "g1")).toBe("active");
    expect(groupStatus(after, "g2")).toBe("reverted");
    expect(groupStatus(after, "g3")).toBe("amended");
  });
});
