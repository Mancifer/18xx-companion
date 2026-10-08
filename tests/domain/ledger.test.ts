import { describe, expect, it } from "vitest";
import type { GroupEntry, LogEntry, RevertEntry } from "../../src/domain/ledger/entries";
import { effectiveLog } from "../../src/domain/ledger/effectiveLog";
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
