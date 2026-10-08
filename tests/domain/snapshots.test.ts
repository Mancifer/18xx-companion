import { describe, expect, it } from "vitest";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import {
  SNAPSHOT_EVERY,
  replayFromSnapshot,
  snapshotsFor,
  invalidatedBy,
  type Snapshot,
} from "../../src/domain/ledger/snapshots";
import { miniGame, miniPlayers } from "../helpers/miniGame";

const AT = "2026-10-07T20:00:00.000Z";
const pay = (seq: number, amount: number): GroupEntry => ({
  kind: "group",
  seq,
  id: `g${seq}`,
  at: AT,
  source: "touch",
  action: { type: "note", text: "x" },
  events: [{ t: "moneyTransfer", from: "bank", to: seq % 2 ? "player:p1" : "player:p2", amount }],
  touches: [],
  warnings: [],
});

function longLog(groups: number): LogEntry[] {
  return Array.from({ length: groups }, (_, i) => pay(i + 1, (i % 7) + 1));
}

describe("snapshots (research R3)", () => {
  it("takes one every 50 effective groups", () => {
    const snaps = snapshotsFor(miniGame, miniPlayers, longLog(120));
    expect(SNAPSHOT_EVERY).toBe(50);
    expect(snaps.map((s) => s.seq)).toEqual([50, 100]);
  });

  it("snapshot + tail equals the full replay", () => {
    const log = longLog(130);
    const snaps = snapshotsFor(miniGame, miniPlayers, log);
    const last = snaps[snaps.length - 1] as Snapshot;
    expect(replayFromSnapshot(miniGame, log, last)).toEqual(replay(miniGame, miniPlayers, log));
  });

  it("a revert or amend aimed before a snapshot invalidates it and later ones", () => {
    const log = longLog(130);
    const snaps = snapshotsFor(miniGame, miniPlayers, log);
    const revert: LogEntry = { kind: "revert", seq: 131, at: AT, groupId: "g70" };
    const kept = snaps.filter((s) => !invalidatedBy(log, revert, s));
    expect(kept.map((s) => s.seq)).toEqual([50]);
    const after = [...log, revert];
    expect(replayFromSnapshot(miniGame, after, kept[0] as Snapshot)).toEqual(replay(miniGame, miniPlayers, after));
  });

  it("a new group never invalidates snapshots", () => {
    const log = longLog(60);
    const [snap] = snapshotsFor(miniGame, miniPlayers, log);
    expect(invalidatedBy(log, pay(61, 1), snap as Snapshot)).toBe(false);
  });

  it("keeps the first group of an invariant violation across a snapshot", () => {
    const log: LogEntry[] = longLog(60);
    log[9] = { ...(log[9] as GroupEntry), events: [{ t: "moneyTransfer", from: "bank", to: "pool", amount: 1 }] };
    const [snap] = snapshotsFor(miniGame, miniPlayers, log);
    expect(replayFromSnapshot(miniGame, log, snap as Snapshot).violations[0]?.firstBadGroupId).toBe("g10");
  });
});
