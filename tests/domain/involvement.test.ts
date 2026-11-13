import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { EntryBreakdown } from "../../src/domain/ledger/breakdown";
import { groupHistory } from "../../src/domain/ledger/effectiveLog";
import type { LogEntry } from "../../src/domain/ledger/entries";
import {
  filterSections,
  focusBreakdown,
  involvedGroupIds,
  involves,
  type HistorySubject,
} from "../../src/domain/ledger/involvement";
import type { RoundSection } from "../../src/domain/ledger/rounds";

/** Feature 017 (research R1, contracts/domain.md): which entries a filtered History lists. */

const PRR: HistorySubject = { kind: "company", id: "PRR" };
const ANA: HistorySubject = { kind: "player", id: "p1" };
const cell = { row: 0, col: 1 };

const one = (subject: HistorySubject, e: PrimitiveEvent) => involves(subject, [e]);

describe("involves: a company (US1, FR-004)", () => {
  it("money into or out of its treasury", () => {
    expect(one(PRR, { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 10 })).toBe(true);
    expect(one(PRR, { t: "moneyTransfer", from: "company:PRR", to: "player:p1", amount: 10 })).toBe(true);
    expect(one(PRR, { t: "moneyTransfer", from: "bank", to: "company:NYC", amount: 10 })).toBe(false);
  });

  it("any transfer of its shares, between any holders (a pool buy moves no PRR money)", () => {
    expect(one(PRR, { t: "shareTransfer", company: "PRR", from: "pool", to: "player:p2", units: 1 })).toBe(true);
    expect(one(PRR, { t: "shareTransfer", company: "NYC", from: "pool", to: "player:p2", units: 1 })).toBe(false);
  });

  it("another company's shares in or out of its treasury", () => {
    expect(one(PRR, { t: "shareTransfer", company: "NYC", from: "ipo:NYC", to: "company:PRR", units: 1 })).toBe(true);
  });

  it("trains and privates it gains or loses", () => {
    expect(one(PRR, { t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:PRR" })).toBe(true);
    expect(one(PRR, { t: "assetTransfer", asset: "train:2:1", from: "company:PRR", to: "removed" })).toBe(true);
    expect(one(PRR, { t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:NYC" })).toBe(false);
  });

  it("its price and its status", () => {
    expect(one(PRR, { t: "marketMove", company: "PRR", to: cell, reason: "payout" })).toBe(true);
    expect(one(PRR, { t: "companyStatus", company: "PRR", status: "floated" })).toBe(true);
    expect(one(PRR, { t: "marketMove", company: "NYC", to: cell, reason: "payout" })).toBe(false);
    expect(one(PRR, { t: "companyStatus", company: "NYC", status: "closed" })).toBe(false);
  });

  it("a counter kept for it", () => {
    expect(one(PRR, { t: "counterChange", subject: "company:PRR", key: "runs", delta: 1 })).toBe(true);
    expect(one(PRR, { t: "counterChange", subject: "player:p1", key: "debt", delta: 1 })).toBe(false);
  });

  it("the turn passing to it", () => {
    expect(one(PRR, { t: "turnAdvance", company: "PRR" })).toBe(true);
    expect(one(PRR, { t: "turnAdvance", company: "NYC" })).toBe(false);
    expect(one(PRR, { t: "turnAdvance", round: "SR", srNumber: 2 })).toBe(false);
  });

  it("never a note, even one that names it", () => {
    expect(one(PRR, { t: "note", text: "PRR" })).toBe(false);
  });

  it("not another company's payout to the same shareholders", () => {
    const nycPayout: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 60 },
      { t: "marketMove", company: "NYC", to: cell, reason: "payout" },
      { t: "counterChange", subject: "company:NYC", key: "runs", delta: 1 },
    ];
    expect(involves(PRR, nycPayout)).toBe(false);
  });
});

// --- Groups and sections ------------------------------------------------------------------------

const note: Action = { type: "note", text: "x" };
const group = (seq: number, events: PrimitiveEvent[]): LogEntry => ({
  kind: "group",
  seq,
  id: `g${seq}`,
  at: "2026-11-09T20:00:00.000Z",
  source: "touch",
  action: note,
  events,
  touches: [],
  warnings: [],
});
const toPrr: PrimitiveEvent = { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 10 };
const toNyc: PrimitiveEvent = { t: "moneyTransfer", from: "bank", to: "company:NYC", amount: 10 };

describe("involvedGroupIds (FR-005)", () => {
  it("lists active and undone groups that involve the subject, and no others", () => {
    const log: LogEntry[] = [group(1, [toPrr]), group(2, [toNyc]), group(3, [toPrr]), { kind: "undo", seq: 4, at: "", groupIds: ["g3"] }];
    expect([...involvedGroupIds(groupHistory(log), PRR)].sort()).toEqual(["g1", "g3"]);
  });

  it("matches a legacy amended group on any of its versions", () => {
    const log: LogEntry[] = [
      group(1, [toNyc]),
      { kind: "amend", seq: 2, at: "", groupId: "g1", action: note, events: [toPrr], touches: [] },
      group(3, [toPrr]),
      { kind: "amend", seq: 4, at: "", groupId: "g3", action: note, events: [toNyc], touches: [] },
    ];
    expect([...involvedGroupIds(groupHistory(log), PRR)].sort()).toEqual(["g1", "g3"]);
  });
});

describe("filterSections (FR-005)", () => {
  const section = (key: string, groupIds: string[], finished = true): RoundSection => ({
    key,
    round: "OR",
    title: key,
    icon: "🚂",
    startGroupId: groupIds[0],
    groupIds,
    finished,
  });

  it("keeps order and titles, drops empty sections, never adds ids", () => {
    const sections = [section("SR:1", ["g1", "g2"]), section("OR:1.1", ["g3"]), section("SR:2", ["g4", "g5"], false)];
    const filtered = filterSections(sections, new Set(["g2", "g5", "g9"]));
    expect(filtered.map((s) => [s.key, s.title, s.groupIds, s.finished])).toEqual([
      ["SR:1", "SR:1", ["g2"], true],
      ["SR:2", "SR:2", ["g5"], false],
    ]);
  });
});

// --- Breakdown focus ----------------------------------------------------------------------------

describe("focusBreakdown (FR-006)", () => {
  const breakdown: EntryBreakdown = {
    groupId: "g1",
    status: "active",
    movements: [
      { kind: "money", from: "bank", to: "player:p2", amount: 30 },
      { kind: "money", from: "bank", to: "company:PRR", amount: 50 },
      { kind: "price", company: "NYC", from: 67, to: 71, reason: "payout" },
      { kind: "price", company: "PRR", from: 67, to: 71, reason: "payout" },
      { kind: "counter", subject: "company:PRR", key: "runs", delta: 1 },
    ],
    balances: [
      { holder: "player:p2", before: 100, after: 130, delta: 30 },
      { holder: "company:PRR", before: 0, after: 50, delta: 50 },
    ],
  };

  it("puts the subject's lines first, in their order, marked; keeps every line", () => {
    const focused = focusBreakdown(breakdown, PRR);
    expect(focused.movements.map((m) => [m.kind, m.mine])).toEqual([
      ["money", true],
      ["price", true],
      ["counter", true],
      ["money", false],
      ["price", false],
    ]);
    expect(focused.movements[1]).toMatchObject({ company: "PRR" });
    expect(focused.movements[4]).toMatchObject({ company: "NYC" });
    expect(focused.balances.map((b) => [b.holder, b.mine])).toEqual([
      ["company:PRR", true],
      ["player:p2", false],
    ]);
    expect(focused.movements).toHaveLength(breakdown.movements.length);
  });
});

describe("involves: a player (US3, FR-003)", () => {
  it("money they receive or pay", () => {
    expect(one(ANA, { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 10 })).toBe(true);
    expect(one(ANA, { t: "moneyTransfer", from: "player:p1", to: "company:PRR", amount: 10 })).toBe(true);
    expect(one(ANA, { t: "moneyTransfer", from: "bank", to: "player:p2", amount: 10 })).toBe(false);
  });

  it("shares and presidencies they gain or lose", () => {
    expect(one(ANA, { t: "shareTransfer", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true })).toBe(true);
    expect(one(ANA, { t: "shareTransfer", company: "PRR", from: "player:p1", to: "pool", units: 1 })).toBe(true);
    expect(one(ANA, { t: "shareTransfer", company: "PRR", from: "pool", to: "player:p2", units: 1 })).toBe(false);
  });

  it("privates they gain or lose, and their counters", () => {
    expect(one(ANA, { t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p1" })).toBe(true);
    expect(one(ANA, { t: "counterChange", subject: "player:p1", key: "debt", delta: 1 })).toBe(true);
  });

  it("never prices, statuses, turns or notes", () => {
    expect(one(ANA, { t: "marketMove", company: "PRR", to: cell, reason: "payout" })).toBe(false);
    expect(one(ANA, { t: "companyStatus", company: "PRR", status: "floated" })).toBe(false);
    expect(one(ANA, { t: "turnAdvance", company: "PRR" })).toBe(false);
    expect(one(ANA, { t: "note", text: "Ana" })).toBe(false);
  });

  it("not a payout of a company they hold no shares in, nor their company's train bought with its own money", () => {
    expect(involves(ANA, [{ t: "moneyTransfer", from: "bank", to: "player:p2", amount: 60 }])).toBe(false);
    expect(
      involves(ANA, [
        { t: "moneyTransfer", from: "company:PRR", to: "bank", amount: 80 },
        { t: "assetTransfer", asset: "train:2:1", from: "bank", to: "company:PRR" },
      ]),
    ).toBe(false);
  });

  it("focus: their balance line (before → after) comes first", () => {
    const focused = focusBreakdown(
      {
        groupId: "g1",
        status: "active",
        movements: [{ kind: "money", from: "bank", to: "player:p1", amount: 40 }],
        balances: [
          { holder: "bank", before: null, after: null, delta: -40 },
          { holder: "player:p1", before: 200, after: 240, delta: 40 },
        ],
      },
      ANA,
    );
    expect(focused.balances[0]).toMatchObject({ holder: "player:p1", before: 200, after: 240, mine: true });
    expect(focused.movements[0]?.mine).toBe(true);
  });
});
