import { describe, expect, it } from "vitest";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { moneyFlows } from "../../src/domain/ledger/flows";

/** FR-081: the money that changes hands in one group, netted per pair of holders. */

describe("moneyFlows", () => {
  it("a payout is one outflow per recipient", () => {
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 144 },
      { t: "moneyTransfer", from: "bank", to: "player:p2", amount: 48 },
      { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 48 },
      { t: "marketMove", company: "PRR", to: { row: 0, col: 7 }, reason: "payout" },
    ];
    expect(moneyFlows(events)).toEqual([
      { from: "bank", to: "player:p1", amount: 144 },
      { from: "bank", to: "player:p2", amount: 48 },
      { from: "bank", to: "company:PRR", amount: 48 },
    ]);
  });

  it("transfers that do not involve the bank are flows too", () => {
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "player:p1", to: "company:PRR", amount: 100 },
      { t: "moneyTransfer", from: "company:PRR", to: "bank", amount: 300 },
      { t: "moneyTransfer", from: "company:PRR", to: "company:NYC", amount: 50 },
    ];
    expect(moneyFlows(events)).toEqual([
      { from: "player:p1", to: "company:PRR", amount: 100 },
      { from: "company:PRR", to: "bank", amount: 300 },
      { from: "company:PRR", to: "company:NYC", amount: 50 },
    ]);
  });

  it("nets each pair within the group, in either direction", () => {
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 120 },
      { t: "moneyTransfer", from: "company:PRR", to: "bank", amount: 100 },
      { t: "moneyTransfer", from: "player:p1", to: "bank", amount: 50 },
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 50 },
      { t: "moneyTransfer", from: "player:p1", to: "player:p2", amount: 30 },
      { t: "moneyTransfer", from: "player:p2", to: "player:p1", amount: 100 },
    ];
    expect(moneyFlows(events)).toEqual([
      { from: "bank", to: "company:PRR", amount: 20 },
      { from: "player:p2", to: "player:p1", amount: 70 },
    ]);
  });

  it("ignores self-transfers", () => {
    expect(moneyFlows([{ t: "moneyTransfer", from: "player:p1", to: "player:p1", amount: 10 }])).toEqual([]);
  });
});
