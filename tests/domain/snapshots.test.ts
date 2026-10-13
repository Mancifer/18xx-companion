import { describe, expect, it } from "vitest";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import {
  SNAPSHOT_EVERY,
  replayFromSnapshot,
  snapshotsFor,
  invalidatedBy,
  rebuild,
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

  it("an undo entry invalidates snapshots from its oldest group on (R4)", () => {
    const log = longLog(130);
    const snaps = snapshotsFor(miniGame, miniPlayers, log);
    const shallow: LogEntry = { kind: "undo", seq: 131, at: AT, groupIds: ["g130", "g120", "g101"] };
    expect(snaps.filter((s) => !invalidatedBy(log, shallow, s)).map((s) => s.seq)).toEqual([50, 100]);
    const deep: LogEntry = { kind: "undo", seq: 131, at: AT, groupIds: ["g130", "g100"] };
    const kept = snaps.filter((s) => !invalidatedBy(log, deep, s));
    expect(kept.map((s) => s.seq)).toEqual([50]);
    const after = [...log, deep];
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

describe("snapshots carry the game-end status (feature 007, research R9)", () => {
  const endGame = (seq: number): GroupEntry => ({
    ...pay(seq, 1),
    action: { type: "endGame", triggers: [] },
    events: [{ t: "note", text: "Fin de la partida" }],
  });
  const bankrupt = (seq: number): GroupEntry => ({
    ...pay(seq, 1),
    events: [{ t: "counterChange", subject: "player:p2", key: "bankrupt", delta: 1 }],
  });
  function endedLog(): LogEntry[] {
    const log = longLog(130);
    log[29] = bankrupt(30);
    log[59] = endGame(60);
    return log;
  }

  it("a snapshot stores over, end, eliminationOrder and autoEndGroups", () => {
    const [, second] = snapshotsFor(miniGame, miniPlayers, endedLog());
    expect(second).toMatchObject({ seq: 100, over: false, eliminationOrder: ["p2"], autoEndGroups: [] });
    expect(second?.end).toMatchObject({ groupId: "g60", auto: false, eliminationOrder: ["p2"] });
  });

  it("replayFromSnapshot returns the same end status as a full replay", () => {
    const log = endedLog();
    const snaps = snapshotsFor(miniGame, miniPlayers, log);
    for (const snap of snaps) {
      const r = replayFromSnapshot(miniGame, log, snap);
      const full = replay(miniGame, miniPlayers, log);
      expect(r).toEqual(full);
      expect(r.end?.groupId).toBe("g60");
    }
  });

  it("rebuild uses a current snapshot, and skips a pre-feature one (no end fields), replaying from the start", () => {
    const log = endedLog();
    const full = replay(miniGame, miniPlayers, log);
    const [first] = snapshotsFor(miniGame, miniPlayers, log);
    const fromCurrent = rebuild(miniGame, miniPlayers, log, [first as Snapshot]);
    expect(fromCurrent.state).toEqual(full.state);
    expect(fromCurrent.end).toEqual(full.end);

    // The old shape: { seq, groupCount, state, firstSeen }, with a state that would be wrong if used.
    const legacy = {
      seq: first!.seq,
      groupCount: first!.groupCount,
      state: { ...first!.state, money: { ...first!.state.money, bank: 0 } },
      firstSeen: first!.firstSeen,
    } as unknown as Snapshot;
    const rebuilt = rebuild(miniGame, miniPlayers, log, [legacy]);
    expect(rebuilt.state).toEqual(full.state);
    expect(rebuilt.end).toEqual(full.end);
    expect(rebuilt.eliminationOrder).toEqual(full.eliminationOrder);
    expect(rebuilt.autoEndGroups).toEqual(full.autoEndGroups);
    expect(rebuilt.over).toBe(full.over);
    expect(rebuilt.violations).toEqual(full.violations);
  });
});
