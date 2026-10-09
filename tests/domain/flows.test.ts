import { describe, expect, it } from "vitest";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { bankFlows } from "../../src/domain/ledger/flows";

/** FR-081: the money that goes into and out of the bank in one group, per counterparty. */

describe("bankFlows", () => {
  it("a payout is one outflow per recipient", () => {
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 144 },
      { t: "moneyTransfer", from: "bank", to: "player:p2", amount: 48 },
      { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 48 },
      { t: "marketMove", company: "PRR", to: { row: 0, col: 7 }, reason: "payout" },
    ];
    expect(bankFlows(events)).toEqual([
      { counterparty: "player:p1", direction: "fromBank", amount: 144 },
      { counterparty: "player:p2", direction: "fromBank", amount: 48 },
      { counterparty: "company:PRR", direction: "fromBank", amount: 48 },
    ]);
  });

  it("transfers between players and companies are not bank flows", () => {
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "player:p1", to: "company:PRR", amount: 100 },
      { t: "moneyTransfer", from: "company:PRR", to: "bank", amount: 300 },
    ];
    expect(bankFlows(events)).toEqual([{ counterparty: "company:PRR", direction: "toBank", amount: 300 }]);
  });

  it("nets each counterparty within the group", () => {
    const events: PrimitiveEvent[] = [
      { t: "moneyTransfer", from: "bank", to: "company:PRR", amount: 120 },
      { t: "moneyTransfer", from: "company:PRR", to: "bank", amount: 100 },
      { t: "moneyTransfer", from: "player:p1", to: "bank", amount: 50 },
      { t: "moneyTransfer", from: "bank", to: "player:p1", amount: 50 },
    ];
    expect(bankFlows(events)).toEqual([{ counterparty: "company:PRR", direction: "fromBank", amount: 20 }]);
  });
});
