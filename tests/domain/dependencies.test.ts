import { describe, expect, it } from "vitest";
import { dependentsOf } from "../../src/domain/ledger/dependencies";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";

const AT = "2026-10-07T20:00:00.000Z";
const group = (seq: number, touches: string[]): GroupEntry => ({
  kind: "group",
  seq,
  id: `g${seq}`,
  at: AT,
  source: "touch",
  action: { type: "note", text: "x" },
  events: [],
  touches,
  warnings: [],
});

describe("dependentsOf (FR-014)", () => {
  const log: LogEntry[] = [
    group(1, ["money:bank", "money:player:p1"]),
    group(2, ["money:player:p2", "money:bank"]),
    group(3, ["shares:PRR"]),
    group(4, ["money:player:p1", "money:company:PRR"]),
    group(5, ["turn"]),
  ];

  it("lists later active groups that touch what the group changed", () => {
    expect(dependentsOf(log, "g1").map((g) => g.id)).toEqual(["g2", "g4"]);
  });

  it("does not list independent groups", () => {
    expect(dependentsOf(log, "g3")).toEqual([]);
    expect(dependentsOf(log, "g5")).toEqual([]);
  });

  it("ignores reverted later groups", () => {
    const withRevert: LogEntry[] = [...log, { kind: "revert", seq: 6, at: AT, groupId: "g4" }];
    expect(dependentsOf(withRevert, "g1").map((g) => g.id)).toEqual(["g2"]);
  });

  it("includes keys that only the amended version would touch", () => {
    expect(dependentsOf(log, "g3", ["shares:PRR", "money:company:PRR"]).map((g) => g.id)).toEqual(["g4"]);
  });

  it("the last group has no dependents", () => {
    expect(dependentsOf(log, "g5")).toEqual([]);
  });
});
