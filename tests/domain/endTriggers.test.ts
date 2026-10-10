import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import { endTriggers, gameOver, scoringOf } from "../../src/domain/mechanics/endTriggers";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";
import { rotlaGame, rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";

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

/** A definition as stored by a session created before feature 007: no `scoring` block. */
function withoutScoring(game: GameDefinition, patch: Partial<GameDefinition> = {}): GameDefinition {
  const copy: Partial<GameDefinition> = { ...game, ...patch };
  delete copy.scoring;
  return copy as GameDefinition;
}

describe("scheduleComplete (21Moon, feature 007)", () => {
  // 21Moon's sequence: PRIVATES, then SR/CR/OR.1/OR.2 for sets 1–5, then OR5.3 at index 21.
  const afterOR = (index: number, scheduleIndex: number) =>
    start("21moon").apply({ t: "turnAdvance", round: "OR", srNumber: 5, orSet: 5, orIndex: index, orsInSet: 3, scheduleIndex, company: null });

  it("fires after OR 5.3, the last slot of the fixed schedule, once the OR set is complete", () => {
    const s = afterOR(3, 21);
    expect(types(s)).toContain("scheduleComplete");
    expect(endTriggers(s.game, s.state).find((t) => t.type === "scheduleComplete")?.messageEs).toBe(
      "Fin de la partida: se jugó la última ronda de operaciones.",
    );
  });

  it("does not fire after OR 5.2, nor while a company still operates in OR 5.3", () => {
    expect(types(afterOR(2, 20))).not.toContain("scheduleComplete");
    const operating = seedCompany(start("21moon"), "VH", { cell: { row: 4, col: 2 }, holders: { "player:p1": 2 } });
    operating.apply({ t: "turnAdvance", round: "OR", srNumber: 5, orSet: 5, orIndex: 3, orsInSet: 3, scheduleIndex: 21, company: "VH" });
    expect(types(operating)).not.toContain("scheduleComplete");
  });
});

describe("gameOver from scoring.autoEnd (feature 007, research R3)", () => {
  it("RotLA: unchanged after the last cycle's OR 2, and with Bank Break once the OR set is complete", () => {
    const s = rotlaSession({ options: { mode: "short" } });
    s.apply({ t: "turnAdvance", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null });
    expect(gameOver(s.game, s.state)).toBe(true);
    const b = rotlaSession({ options: { bankBreak: "on" } }).do({ type: "startOR" });
    b.apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: b.state.money["bank"] ?? 0 });
    expect(gameOver(b.game, b.state)).toBe(false);
    b.apply({ t: "turnAdvance", orIndex: 2, company: null });
    expect(gameOver(b.game, b.state)).toBe(true);
  });

  it("21Moon: over after OR 5.3, not after OR 5.2", () => {
    const at = (orIndex: number, scheduleIndex: number) =>
      start("21moon").apply({ t: "turnAdvance", round: "OR", srNumber: 5, orSet: 5, orIndex, orsInSet: 3, scheduleIndex, company: null });
    const done = at(3, 21);
    expect(gameOver(done.game, done.state)).toBe(true);
    const notYet = at(2, 20);
    expect(gameOver(notYet.game, notYet.state)).toBe(false);
  });

  it("1830 and 1848 are never over on their own, whatever fires", () => {
    const t = start("1830")
      .apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 9600 })
      .apply({ t: "counterChange", subject: "player:p2", key: "bankrupt", delta: 1 });
    expect(types(t)).toEqual(["bankBroken", "bankruptcy"]);
    expect(gameOver(t.game, t.state)).toBe(false);
    const u = seedCompany(start("1848"), "QR", { cell: { row: 0, col: 16 } }).apply({
      t: "moneyTransfer",
      from: "bank",
      to: "player:p1",
      amount: 7480,
    });
    expect(types(u)).toContain("topCell");
    expect(gameOver(u.game, u.state)).toBe(false);
  });

  it("a RotLA session from before this feature (no scoring block) still ends after the last cycle (R16)", () => {
    const s = rotlaSession({ options: { mode: "short" } });
    s.apply({ t: "turnAdvance", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null });
    expect(gameOver(withoutScoring(s.game), s.state)).toBe(true);
  });

  it("a 21Moon session from before this feature (no scheduleComplete trigger) is not over after OR 5.3", () => {
    const s = start("21moon").apply({ t: "turnAdvance", round: "OR", srNumber: 5, orSet: 5, orIndex: 3, orsInSet: 3, scheduleIndex: 21, company: null });
    const old = withoutScoring(s.game, { endTriggers: [{ type: "lastRound" }, { type: "bankruptcy" }] });
    expect(gameOver(old, s.state)).toBe(false);
  });
});

describe("scoringOf (research R16)", () => {
  const defaults = { autoEnd: [], bankruptPlayers: "eliminated", tieBreak: "shared" };

  it("returns game.scoring when present", () => {
    const g = rotlaGame();
    expect(scoringOf(g)).toEqual(g.scoring);
  });

  it("falls back to the built-in game with id basedOn ?? id", () => {
    const rotla = rotlaGame();
    expect(scoringOf(withoutScoring(rotla))).toEqual(rotla.scoring);
    expect(scoringOf(withoutScoring(rotla, { id: "custom-1", basedOn: "rotla" }))).toEqual(rotla.scoring);
    expect(scoringOf(withoutScoring(getBuiltInGame("1830")))).toEqual(getBuiltInGame("1830").scoring);
  });

  it("only otherwise uses the defaults, and an unknown id never throws", () => {
    expect(scoringOf(withoutScoring(rotlaGame(), { id: "hand-made" }))).toEqual(defaults);
    expect(scoringOf(withoutScoring(rotlaGame(), { id: "custom-2", basedOn: "unknown-game" }))).toEqual(defaults);
  });
});
