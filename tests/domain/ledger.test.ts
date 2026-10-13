import { describe, expect, it } from "vitest";
import type { AmendEntry, GroupEntry, LogEntry, RevertEntry, UndoEntry } from "../../src/domain/ledger/entries";
import { effectiveLog, groupHistory } from "../../src/domain/ledger/effectiveLog";
import { replay } from "../../src/domain/ledger/replay";
import { cashOf } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { miniGame, miniPlayers } from "../helpers/miniGame";

const AT = "2026-10-07T20:00:00.000Z";

function group(seq: number, events: PrimitiveEvent[]): GroupEntry {
  return {
    kind: "group",
    seq,
    id: `g${seq}`,
    at: AT,
    source: "touch",
    action: { type: "note", text: `n${seq}` },
    events,
    touches: [],
    warnings: [],
  };
}

function revert(seq: number, groupId: string): RevertEntry {
  return { kind: "revert", seq, at: AT, groupId };
}

function undo(seq: number, ...groupIds: string[]): UndoEntry {
  return { kind: "undo", seq, at: AT, groupIds };
}

function amend(seq: number, groupId: string, events: PrimitiveEvent[]): AmendEntry {
  return { kind: "amend", seq, at: AT, groupId, action: { type: "note", text: `a${seq}` }, events, touches: [] };
}

const pay = (to: string, amount: number): PrimitiveEvent => ({
  t: "moneyTransfer",
  from: "bank",
  to: to as `player:${string}`,
  amount,
});

describe("effective log", () => {
  it("keeps groups in order", () => {
    const log: LogEntry[] = [group(1, [pay("player:p1", 10)]), group(2, [pay("player:p2", 20)])];
    expect(effectiveLog(log).map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("skips reverted groups but keeps them in the log", () => {
    const log: LogEntry[] = [group(1, [pay("player:p1", 10)]), group(2, [pay("player:p2", 20)]), revert(3, "g2")];
    expect(effectiveLog(log).map((g) => g.id)).toEqual(["g1"]);
    expect(log).toHaveLength(3);
  });
});

describe("replay", () => {
  it("reduces the effective log", () => {
    const log: LogEntry[] = [group(1, [pay("player:p1", 10)]), group(2, [pay("player:p1", 20)]), revert(3, "g2")];
    const { state } = replay(miniGame, miniPlayers, log);
    expect(cashOf(state, "player:p1")).toBe(10);
    expect(cashOf(state, "bank")).toBe(990);
  });

  it("is deterministic", () => {
    const log: LogEntry[] = [group(1, [pay("player:p1", 10)]), group(2, [pay("player:p2", 20)])];
    expect(replay(miniGame, miniPlayers, log)).toEqual(replay(miniGame, miniPlayers, log));
  });

  it("checks invariants after every group and reports the first bad group", () => {
    const log: LogEntry[] = [
      group(1, [pay("player:p1", 10)]),
      group(2, [{ t: "moneyTransfer", from: "bank", to: "pool", amount: 5 }]),
      group(3, [pay("player:p2", 20)]),
    ];
    const { violations } = replay(miniGame, miniPlayers, log);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "moneyHolder", firstBadGroupId: "g2" });
  });

  it("clears a violation when the bad group is reverted", () => {
    const log: LogEntry[] = [
      group(1, [{ t: "moneyTransfer", from: "bank", to: "pool", amount: 5 }]),
      revert(2, "g1"),
    ];
    expect(replay(miniGame, miniPlayers, log).violations).toEqual([]);
  });
});

describe("undo entries (feature 010, R1)", () => {
  const status = (log: LogEntry[]) => Object.fromEntries(groupHistory(log).map((h) => [h.group.id, h.status]));

  it("marks every listed group reverted and drops them from the effective log", () => {
    const log: LogEntry[] = [group(1, [pay("player:p1", 10)]), group(2, [pay("player:p1", 20)]), group(3, [pay("player:p2", 5)]), undo(4, "g3", "g2")];
    expect(effectiveLog(log).map((g) => g.id)).toEqual(["g1"]);
    expect(status(log)).toEqual({ g1: "active", g2: "reverted", g3: "reverted" });
    expect(cashOf(replay(miniGame, miniPlayers, log).state, "player:p1")).toBe(10);
  });

  it("reverts an amended group as a whole, not just its correction", () => {
    const log: LogEntry[] = [group(1, [pay("player:p1", 10)]), amend(2, "g1", [pay("player:p1", 30)]), undo(3, "g1")];
    expect(effectiveLog(log)).toEqual([]);
    expect(status(log)).toEqual({ g1: "reverted" });
  });

  it("records undoneBy for undo and legacy revert entries", () => {
    const log: LogEntry[] = [group(1, []), group(2, []), group(3, []), revert(4, "g1"), undo(5, "g3", "g2")];
    const by = Object.fromEntries(groupHistory(log).map((h) => [h.group.id, h.undoneBy]));
    expect(by).toEqual({ g1: 4, g2: 5, g3: 5 });
  });

  it("a legacy revert that only pops an amendment sets no undoneBy", () => {
    const log: LogEntry[] = [group(1, []), amend(2, "g1", [pay("player:p1", 5)]), revert(3, "g1")];
    const [h] = groupHistory(log);
    expect(h?.status).toBe("active");
    expect(h?.undoneBy).toBeUndefined();
  });

  it("legacy logs with an out-of-order revert and an amend replay as before (R7)", () => {
    const log: LogEntry[] = [
      group(1, [pay("player:p1", 10)]),
      group(2, [pay("player:p2", 20)]),
      group(3, [pay("player:p1", 30)]),
      revert(4, "g1"),
      amend(5, "g3", [pay("player:p1", 35)]),
    ];
    expect(effectiveLog(log).map((g) => [g.id, g.events])).toEqual([
      ["g2", [pay("player:p2", 20)]],
      ["g3", [pay("player:p1", 35)]],
    ]);
    expect(status(log)).toEqual({ g1: "reverted", g2: "active", g3: "amended" });
    const { state } = replay(miniGame, miniPlayers, log);
    expect(cashOf(state, "player:p1")).toBe(35);
    expect(cashOf(state, "player:p2")).toBe(20);
  });
});
