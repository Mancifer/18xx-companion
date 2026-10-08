import { describe, expect, it } from "vitest";
import { applyOptions, getBuiltInGame } from "../../../src/domain/games";
import { cashOf, unitsOf } from "../../../src/domain/events/state";
import { TestSession, makePlayers } from "../../helpers/dispatch";

const start = () => TestSession.start(applyOptions(getBuiltInGame("1830"), {}), makePlayers(["Ana", "Bruno", "Carla", "Dani"]));

describe("transferMoney", () => {
  it("emits exactly one moneyTransfer (US1-2)", () => {
    const s = start().do({ type: "transferMoney", from: "player:p1", to: "bank", amount: 100 });
    expect(s.lastEvents).toEqual([{ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 100 }]);
    expect(cashOf(s.state, "player:p1")).toBe(500);
    expect(cashOf(s.state, "bank")).toBe(9700);
    expect(s.violations()).toEqual([]);
  });

  it("rejects money to or from holders that cannot hold money", () => {
    const s = start();
    expect(s.tryDo({ type: "transferMoney", from: "pool", to: "bank", amount: 10 }).kind).toBe("invalid");
    expect(s.tryDo({ type: "transferMoney", from: "bank", to: "ipo:PRR", amount: 10 }).kind).toBe("invalid");
    expect(s.tryDo({ type: "transferMoney", from: "bank", to: "removed", amount: 10 }).kind).toBe("invalid");
  });

  it("rejects non-positive or fractional amounts", () => {
    const s = start();
    expect(s.tryDo({ type: "transferMoney", from: "bank", to: "player:p1", amount: 0 }).kind).toBe("invalid");
    expect(s.tryDo({ type: "transferMoney", from: "bank", to: "player:p1", amount: 2.5 }).kind).toBe("invalid");
  });

  it("allows paying more than a player has, with a warning (FR-025)", () => {
    const s = start().do({ type: "transferMoney", from: "player:p1", to: "bank", amount: 700 });
    expect(cashOf(s.state, "player:p1")).toBe(-100);
    expect(s.lastWarnings.map((w) => w.code)).toContain("insufficientCash");
  });

  it("warns when the bank would go below zero", () => {
    const s = start().do({ type: "transferMoney", from: "bank", to: "player:p1", amount: 9700 });
    expect(s.lastWarnings.map((w) => w.code)).toContain("bankBroken");
  });

  it("rejects an unknown player", () => {
    expect(start().tryDo({ type: "transferMoney", from: "player:p9", to: "bank", amount: 10 }).kind).toBe("invalid");
  });
});

describe("adjustMoney", () => {
  it("applies a delta as one bank↔holder transfer", () => {
    const s = start().do({ type: "adjustMoney", holder: "player:p2", delta: -50, setTo: null });
    expect(s.lastEvents).toEqual([{ t: "moneyTransfer", from: "player:p2", to: "bank", amount: 50 }]);
  });

  it("sets a value as one transfer for the difference", () => {
    const s = start().do({ type: "adjustMoney", holder: "player:p2", delta: null, setTo: 750 });
    expect(s.lastEvents).toEqual([{ t: "moneyTransfer", from: "bank", to: "player:p2", amount: 150 }]);
    expect(cashOf(s.state, "player:p2")).toBe(750);
  });

  it("emits nothing when there is no difference", () => {
    const s = start().do({ type: "adjustMoney", holder: "player:p2", delta: null, setTo: 600 });
    expect(s.lastEvents).toEqual([]);
  });

  it("needs exactly one of delta or setTo", () => {
    const s = start();
    expect(s.tryDo({ type: "adjustMoney", holder: "player:p2", delta: null, setTo: null }).kind).toBe("invalid");
    expect(s.tryDo({ type: "adjustMoney", holder: "player:p2", delta: 5, setTo: 5 }).kind).toBe("invalid");
  });
});

describe("transferShares", () => {
  it("emits one shareTransfer", () => {
    const s = start().do({
      type: "transferShares",
      company: "PRR",
      from: "ipo:PRR",
      to: "player:p1",
      units: 2,
      presidency: true,
    });
    expect(s.lastEvents).toEqual([
      { t: "shareTransfer", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true },
    ]);
    expect(unitsOf(s.state, "player:p1", "PRR")).toBe(2);
  });

  it("rejects the bank as a share holder and an unknown company", () => {
    const s = start();
    expect(
      s.tryDo({ type: "transferShares", company: "PRR", from: "bank", to: "player:p1", units: 1, presidency: null }).kind,
    ).toBe("invalid");
    expect(
      s.tryDo({ type: "transferShares", company: "XYZ", from: "ipo:XYZ", to: "player:p1", units: 1, presidency: null })
        .kind,
    ).toBe("invalid");
  });
});

describe("note", () => {
  it("records text", () => {
    expect(start().do({ type: "note", text: "pausa" }).lastEvents).toEqual([{ t: "note", text: "pausa" }]);
  });
});
