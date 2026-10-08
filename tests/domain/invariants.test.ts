import { describe, expect, it } from "vitest";
import { checkInvariants } from "../../src/domain/mechanics/invariants";
import { initialState } from "../../src/domain/events/state";
import { reduce, reduceAll } from "../../src/domain/events/reduce";
import type { GameDefinition } from "../../src/domain/games/schema";
import { miniGame, miniPlayers } from "../helpers/miniGame";

const withLoans: GameDefinition = {
  ...miniGame,
  initialTreasuries: [{ company: "BB", money: 200, assets: ["loan:1", "loan:2", "loan:3"] }],
  loans: {
    amount: 100,
    lender: "company:BB",
    supply: 3,
    interestPerOR: 0,
    repayable: false,
    voluntaryLimit: 5,
    availableFromPhase: "2",
    marketEffect: { first: 1, subsequentInOR: 1 },
  },
};

describe("money invariant", () => {
  it("holds at the start and after transfers", () => {
    const s = reduce(initialState(miniGame, miniPlayers), {
      t: "moneyTransfer",
      from: "bank",
      to: "player:p1",
      amount: 300,
    });
    expect(checkInvariants(miniGame, s)).toEqual([]);
  });

  it("counts initial treasuries outside the bank total (1848 BoE)", () => {
    const s = initialState(withLoans, miniPlayers);
    expect(checkInvariants(withLoans, s)).toEqual([]);
  });

  it("is broken when money appears from nowhere", () => {
    const s = initialState(miniGame, miniPlayers);
    const bad = { ...s, money: { ...s.money, "player:p1": 5 } };
    expect(checkInvariants(miniGame, bad).map((v) => v.kind)).toContain("money");
  });

  it("is skipped for an unlimited bank", () => {
    const unlimited: GameDefinition = { ...miniGame, bank: "unlimited" };
    const s = initialState(unlimited, miniPlayers);
    const bad = { ...s, money: { ...s.money, "player:p1": 5 } };
    expect(checkInvariants(unlimited, bad)).toEqual([]);
  });

  it("does not flag negative holder money (bank broken, short companies)", () => {
    const s = reduce(initialState(miniGame, miniPlayers), {
      t: "moneyTransfer",
      from: "player:p1",
      to: "bank",
      amount: 50,
    });
    expect(checkInvariants(miniGame, s)).toEqual([]);
  });

  it("flags money held by a holder that cannot hold money", () => {
    const s = reduce(initialState(miniGame, miniPlayers), {
      t: "moneyTransfer",
      from: "bank",
      to: "pool",
      amount: 10,
    });
    expect(checkInvariants(miniGame, s).map((v) => v.kind)).toContain("moneyHolder");
  });
});

describe("share invariant", () => {
  it("counts every holder, including removed", () => {
    const s = reduceAll(initialState(miniGame, miniPlayers), [
      { t: "shareTransfer", company: "AA", from: "ipo:AA", to: "player:p1", units: 2, presidency: true },
      { t: "shareTransfer", company: "AA", from: "ipo:AA", to: "removed", units: 3 },
    ]);
    expect(checkInvariants(miniGame, s)).toEqual([]);
  });

  it("is broken when units appear from nowhere", () => {
    const s = initialState(miniGame, miniPlayers);
    const bad = { ...s, holdings: { ...s.holdings, "player:p1": { AA: 1 } } };
    expect(checkInvariants(miniGame, bad).map((v) => v.kind)).toContain("shares");
  });

  it("flags negative units in the IPO or the pool", () => {
    const s = reduce(initialState(miniGame, miniPlayers), {
      t: "shareTransfer",
      company: "AA",
      from: "pool",
      to: "player:p1",
      units: 1,
    });
    expect(checkInvariants(miniGame, s).map((v) => v.kind)).toContain("negativeUnits");
  });
});

describe("asset invariant", () => {
  it("flags a non-train asset in the pool and any asset in an IPO", () => {
    const s = reduceAll(initialState(miniGame, miniPlayers), [
      { t: "assetTransfer", asset: "private:P1", from: "bank", to: "pool" },
      { t: "assetTransfer", asset: "train:2:1", from: "bank", to: "ipo:AA" },
    ]);
    const kinds = checkInvariants(miniGame, s).map((v) => v.kind);
    expect(kinds.filter((k) => k === "assetHolder")).toHaveLength(2);
  });

  it("conserves the loan supply", () => {
    let s = initialState(withLoans, miniPlayers);
    s = reduce(s, { t: "assetTransfer", asset: "loan:1", from: "company:BB", to: "company:AA" });
    s = reduce(s, { t: "assetTransfer", asset: "loan:2", from: "company:BB", to: "removed" });
    expect(checkInvariants(withLoans, s)).toEqual([]);
    const bad = { ...s, assets: { ...s.assets, "loan:9": "company:AA" as const } };
    expect(checkInvariants(withLoans, bad).map((v) => v.kind)).toContain("loanSupply");
  });
});
