import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { endTriggers, gameOver } from "../../src/domain/mechanics/endTriggers";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";

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

describe("cyclesComplete (RotLA, US8)", () => {
  const short = () => rotlaSession({ options: { mode: "short" } });
  const at = (s: TestSession, turn: Record<string, unknown>) => s.apply({ t: "turnAdvance", company: null, ...turn });

  it("fires after OR 4.2 of a Short game in yellow (no Merger Round due)", () => {
    const s = at(short(), { round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2 });
    expect(types(s)).toEqual(["cyclesComplete"]);
    expect(endTriggers(s.game, s.state)[0]?.messageEs).toBe("Fin de la partida: se completaron los 4 ciclos.");
  });

  it("waits for MR 4 when one is due, and fires in it", () => {
    const s = at(short(), { round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, phase: "green" });
    expect(types(s)).toEqual([]);
    at(s, { round: "MR" });
    expect(types(s)).toEqual(["cyclesComplete"]);
  });

  it("not before: SR 4, OR 4.1, OR 4.2 still operating, or an earlier cycle", () => {
    expect(types(at(short(), { round: "SR", srNumber: 4 }))).toEqual([]);
    expect(types(at(short(), { round: "OR", srNumber: 4, orSet: 4, orIndex: 1, orsInSet: 2 }))).toEqual([]);
    expect(types(at(short(), { round: "OR", srNumber: 3, orSet: 3, orIndex: 2, orsInSet: 2 }))).toEqual([]);
    const operating = short();
    seedRotla(operating, "EXP", { price: 80, holders: { "player:p1": 5 } });
    at(operating, { round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: "EXP" });
    expect(types(operating)).toEqual([]);
  });

  it("Long games end after 6 cycles", () => {
    expect(types(at(rotlaSession(), { round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2 }))).toEqual([]);
    expect(types(at(rotlaSession(), { round: "OR", srNumber: 6, orSet: 6, orIndex: 2, orsInSet: 2 }))).toEqual(["cyclesComplete"]);
  });
});

describe("Bank Break (RotLA, US8)", () => {
  it("the bank reaching 0 during an OR announces the end after the current set", () => {
    const s = rotlaSession({ options: { bankBreak: "on" } }).do({ type: "startOR" });
    s.apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: s.state.money["bank"] ?? 0 });
    expect(types(s)).toEqual(["bankBroken"]);
    expect(gameOver(s.game, s.state)).toBe(false);
    s.apply({ t: "turnAdvance", orIndex: 2, company: null });
    expect(gameOver(s.game, s.state)).toBe(true);
  });

  it("gameOver follows cyclesComplete too, and never ends 1830", () => {
    const s = rotlaSession({ options: { mode: "short" } });
    s.apply({ t: "turnAdvance", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null });
    expect(gameOver(s.game, s.state)).toBe(true);
    const t = start("1830").apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 9600 });
    expect(gameOver(t.game, t.state)).toBe(false);
  });
});
