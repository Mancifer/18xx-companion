import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../../src/domain/games";
import { TestSession, makePlayers } from "../../helpers/dispatch";
import { seedCompany } from "../../helpers/seed";

/** FR-012 (T021): out-of-turn operating actions are applied with a warning, never blocked. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

function inOR() {
  const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
  seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, cash: 500, holders: { "player:p1": 6 }, trains: ["train:2:1"] });
  seedCompany(s, "NYC", { cell: { row: 0, col: 6 }, cash: 500, holders: { "player:p2": 6 }, trains: ["train:2:2"] });
  s.apply({ t: "assetTransfer", asset: "private:SV", from: "bank", to: "player:p3" });
  return s.do({ type: "startOR" });
}

const forNYC: Record<string, unknown> = {
  runAndPayout: { type: "runAndPayout", company: "NYC", parts: [{ part: "revenue", amount: 50 }], mode: "full" },
  buyTrain: { type: "buyTrain", company: "NYC", trainType: "2", variant: null, from: "bank", seller: null, price: null, tradeIn: null },
  payCost: { type: "payCost", company: "NYC", amount: 20, reason: null },
  bankPays: { type: "bankPays", company: "NYC", amount: 20, reason: "subvención" },
  buyPrivateByCompany: { type: "buyPrivateByCompany", company: "NYC", private: "SV", price: 20 },
  discardTrain: { type: "discardTrain", company: "NYC", train: "train:2:2" },
};

const outOfTurn = { code: "outOfTurn", messageEs: "NYC opera fuera de turno (le toca a PRR).", severity: "warn" };

describe("outOfTurn warning (FR-012)", () => {
  for (const [type, action] of Object.entries(forNYC)) {
    it(`${type} for a company that is not current is applied, with the warning`, () => {
      const s = inOR();
      expect(s.state.turn.currentCompany).toBe("PRR");
      s.do(action);
      expect(s.lastWarnings).toContainEqual(outOfTurn);
      expect(s.state.turn.currentCompany).toBe("PRR");
    });
  }

  it("takeLoan for a company that is not current (1848) is applied, with the warning", () => {
    const s = TestSession.start(getBuiltInGame("1848"), players).do({ type: "startSR" });
    seedCompany(s, "QR", { cell: { row: 1, col: 10 }, par: 100, holders: { "player:p1": 6 } });
    s.apply({ t: "turnAdvance", phase: "3" });
    s.do({ type: "startOR" });
    expect(s.state.turn.currentCompany).toBe("BOE");
    s.do({ type: "takeLoan", company: "QR", count: 1 });
    expect(s.lastWarnings.map((w) => w.code)).toContain("outOfTurn");
  });

  it("no warning for the current company", () => {
    const s = inOR().do({ type: "payCost", company: "PRR", amount: 20, reason: null });
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("outOfTurn");
  });

  it("no warning outside an OR", () => {
    const s = inOR().do({ type: "startSR" }).do({ type: "payCost", company: "NYC", amount: 20, reason: null });
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("outOfTurn");
  });

  it("no warning in an OR with no current company (the set is over)", () => {
    const s = inOR().do({ type: "nextCompany" }).do({ type: "nextCompany" });
    expect(s.state.turn.currentCompany).toBeUndefined();
    s.do({ type: "payCost", company: "NYC", amount: 20, reason: null });
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("outOfTurn");
  });

  it("after the turn editor makes NYC current (FR-013), NYC's actions have no warning", () => {
    const s = inOR().do({ type: "setTurn", round: null, srNumber: null, orSet: null, orIndex: null, orsInSet: null, company: "NYC" });
    expect(s.groups.at(-1)?.action.type).toBe("setTurn");
    s.do({ type: "payCost", company: "NYC", amount: 20, reason: null });
    expect(s.lastWarnings.map((w) => w.code)).not.toContain("outOfTurn");
  });
});
