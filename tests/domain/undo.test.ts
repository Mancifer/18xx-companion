import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { isSetup, newestUndoable, undoRangeOf } from "../../src/domain/ledger/undo";

/** Feature 010, data-model §3: the range an undo back to a group covers. */

const AT = "2026-10-12T20:00:00.000Z";

function group(seq: number, action: Action = { type: "note", text: `n${seq}` }): GroupEntry {
  return { kind: "group", seq, id: `g${seq}`, at: AT, source: "touch", action, events: [], touches: [], warnings: [] };
}

const setup = group(1, { type: "createSession", players: [], walletMode: "appTruth" } as unknown as Action);

describe("undoRangeOf", () => {
  const log: LogEntry[] = [setup, group(2), group(3), group(4), group(5)];

  it("is undefined for an unknown, a reverted or the setup group", () => {
    expect(undoRangeOf(log, "nope")).toBeUndefined();
    expect(undoRangeOf([...log, { kind: "undo", seq: 6, at: AT, groupIds: ["g5"] }], "g5")).toBeUndefined();
    expect(undoRangeOf(log, "g1")).toBeUndefined();
  });

  it("the newest group alone is a range of one", () => {
    const range = undoRangeOf(log, "g5");
    expect(range?.count).toBe(1);
    expect(range?.oldest.id).toBe("g5");
    expect(range?.newest.id).toBe("g5");
    expect(range?.targetId).toBe("g5");
  });

  it("an older group covers it and every later effective group, newest first", () => {
    const range = undoRangeOf(log, "g3");
    expect(range?.groups.map((g) => g.id)).toEqual(["g5", "g4", "g3"]);
    expect(range?.count).toBe(3);
    expect(range?.oldest.id).toBe("g3");
    expect(range?.newest.id).toBe("g5");
  });

  it("skips groups a legacy revert already undid out of order; amended groups count", () => {
    const legacy: LogEntry[] = [
      ...log,
      { kind: "revert", seq: 6, at: AT, groupId: "g4" },
      { kind: "amend", seq: 7, at: AT, groupId: "g5", action: { type: "note", text: "fix" }, events: [], touches: [] },
    ];
    const range = undoRangeOf(legacy, "g3");
    expect(range?.groups.map((g) => g.id)).toEqual(["g5", "g3"]);
    expect(range?.newest.action).toEqual({ type: "note", text: "fix" });
  });
});

describe("newestUndoable and isSetup", () => {
  it("finds the newest effective non-setup group", () => {
    expect(newestUndoable([setup, group(2), group(3)])?.id).toBe("g3");
    expect(newestUndoable([setup, group(2), group(3), { kind: "undo", seq: 4, at: AT, groupIds: ["g3"] }])?.id).toBe("g2");
    expect(newestUndoable([setup])).toBeUndefined();
  });

  it("isSetup is true only for createSession", () => {
    expect(isSetup(setup)).toBe(true);
    expect(isSetup(group(2))).toBe(false);
  });
});
