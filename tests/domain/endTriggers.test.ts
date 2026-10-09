import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { endTriggers } from "../../src/domain/mechanics/endTriggers";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

/** End-of-game triggers: warnings only, recomputed from state, never stored (data-model §9). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = (id: string) => TestSession.start(getBuiltInGame(id), players);
const types = (s: TestSession) => endTriggers(s.game, s.state).map((t) => t.type);

describe("endTriggers", () => {
  it("none at the start", () => {
    expect(types(start("1830"))).toEqual([]);
    expect(types(start("1848"))).toEqual([]);
    expect(types(start("21moon"))).toEqual([]);
  });

  it("bank broken (≤ 0)", () => {
    const s = start("1830").apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 9600 });
    expect(types(s)).toEqual(["bankBroken"]);
  });

  it("1848: a price on the top cell", () => {
    const s = seedCompany(start("1848"), "QR", { cell: { row: 0, col: 16 } });
    expect(types(s)).toContain("topCell");
  });

  it("1848: 16 or more loans issued", () => {
    const s = start("1848");
    for (let n = 1; n <= 16; n++) s.apply({ t: "assetTransfer", asset: `loan:${n}`, from: "company:BOE", to: "company:QR" });
    expect(types(s)).toContain("loansIssued");
  });

  it("1848: 5 receiverships (the Bank's takeover counter)", () => {
    const s = start("1848").apply({ t: "counterChange", subject: "bank", key: "nationalTakeovers", delta: 5 });
    expect(types(s)).toContain("takeovers");
  });

  it("21Moon: the last scheduled round", () => {
    const s = start("21moon").apply({ t: "turnAdvance", round: "OR", orSet: 5, orIndex: 3, scheduleIndex: 21 });
    expect(types(s)).toContain("lastRound");
  });

  it("a bankrupt player or company", () => {
    const s = start("1830").apply({ t: "counterChange", subject: "player:p2", key: "bankrupt", delta: 1 });
    expect(types(s)).toContain("bankruptcy");
  });

  it("only the triggers the game lists (no top cell in 1830)", () => {
    const s = start("1830").apply({ t: "counterChange", subject: "bank", key: "nationalTakeovers", delta: 5 });
    expect(types(s)).toEqual([]);
  });

  it("each trigger has a Spanish message", () => {
    const s = start("1830").apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 9600 });
    expect(endTriggers(s.game, s.state)[0]?.messageEs).toMatch(/banca/i);
  });
});
