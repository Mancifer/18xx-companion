import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import { groupHistory } from "../../src/domain/ledger/effectiveLog";
import { touchesOf, type GroupEntry, type LogEntry } from "../../src/domain/ledger/entries";
import { roundSections } from "../../src/domain/ledger/rounds";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedEvents } from "../helpers/seed";
import { rotlaGame, seedCompany as seedRotla } from "../helpers/rotla";

/** Feature 011, US4: History's round sections (data-model §2, research R7). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

/** Records each action as a log group, like the store does; `undo` appends an undo entry. */
class LogBuilder {
  readonly s: TestSession;
  readonly log: LogEntry[] = [];

  constructor(game: GameDefinition, ps = players) {
    this.s = new TestSession(game, ps);
    this.do({ type: "createSession", players: ps, walletMode: "appTruth" });
  }

  do(action: { type: string } & Record<string, unknown>): this {
    this.s.do(action);
    const group: GroupEntry = {
      kind: "group",
      seq: this.log.length + 1,
      id: `g${this.log.length + 1}`,
      at: "2026-10-12T20:00:00.000Z",
      source: "touch",
      action: action as GroupEntry["action"],
      events: this.s.lastEvents,
      touches: touchesOf(this.s.lastEvents),
      warnings: [...this.s.lastWarnings],
    };
    this.log.push(group);
    return this;
  }

  undo(groupId: string): this {
    this.log.push({ kind: "undo", seq: this.log.length + 1, at: "2026-10-12T20:00:00.000Z", groupIds: [groupId] });
    return this;
  }

  sections() {
    return roundSections(this.s.game, groupHistory(this.log));
  }
}

const note = (text: string) => ({ type: "note", text });

function g1830(): LogBuilder {
  const b = new LogBuilder(getBuiltInGame("1830"));
  b.s.apply(...seedEvents("PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } }));
  return b;
}

describe("roundSections", () => {
  it("1830: setup, SR 1, OR 1.1, OR 1.2 (opened by a nextCompany), SR 2", () => {
    const b = g1830()
      .do({ type: "startSR" })
      .do(note("a"))
      .do({ type: "setPhase", phase: "3" })
      .do({ type: "startOR" })
      .do({ type: "nextCompany" })
      .do({ type: "nextCompany" })
      .do({ type: "startSR" });
    const sections = b.sections();
    expect(sections.map((x) => [x.key, x.title, x.icon, x.startGroupId, x.groupIds, x.finished])).toEqual([
      ["SETUP", "Preparación", "⚙", undefined, ["g1"], true],
      ["SR:1", "Ronda de acciones 1", "💼", "g2", ["g2", "g3", "g4"], true],
      ["OR:1.1", "Ronda de operaciones 1.1", "🚂", "g5", ["g5"], true],
      ["OR:1.2", "Ronda de operaciones 1.2", "🚂", "g6", ["g6", "g7"], true],
      ["SR:2", "Ronda de acciones 2", "💼", "g8", ["g8"], false],
    ]);
    expect(sections.map((x) => x.round)).toEqual(["SETUP", "SR", "OR", "OR", "SR"]);
  });

  it("an undone round start opens nothing: it stays in the earlier section (FR-021)", () => {
    const b = g1830().do({ type: "startSR" }).do({ type: "startOR" }).undo("g3").do(note("after"));
    expect(b.sections().map((x) => [x.key, x.groupIds])).toEqual([
      ["SETUP", ["g1"]],
      ["SR:1", ["g2", "g3", "g5"]],
    ]);
  });

  it("an undone first entry after setup stays in the first round, not in Preparación", () => {
    const sections = g1830().do(note("a")).undo("g2").sections();
    expect(sections.map((x) => [x.key, x.title, x.groupIds])).toEqual([
      ["SETUP", "Preparación", ["g1"]],
      ["PRIVATES", "Privadas", ["g2"]],
    ]);
  });

  it("a round whose only entry is its start still has a section, in progress", () => {
    const sections = g1830().do({ type: "startSR" }).do({ type: "startOR" }).sections();
    expect(sections.at(-1)).toMatchObject({ key: "OR:1.1", groupIds: ["g3"], finished: false });
  });

  it("going back to an earlier round with setTurn forms a separate section", () => {
    const setTurn = { type: "setTurn", round: "SR", srNumber: 1, orSet: null, orIndex: null, orsInSet: null, company: null };
    const sections = g1830().do({ type: "startSR" }).do({ type: "startOR" }).do(setTurn).sections();
    expect(sections.map((x) => x.key)).toEqual(["SETUP", "SR:1", "OR:1.1", "SR:1"]);
  });

  it("RotLA: cycle titles for the SR, the ORs and the merger round", () => {
    const b = new LogBuilder(rotlaGame(), players.slice(0, 3));
    seedRotla(b.s, "CON", { price: 100, holders: { "player:p1": 10 } });
    const toMR = { type: "setTurn", round: "MR", srNumber: 1, orSet: null, orIndex: null, orsInSet: null, company: null };
    // A RotLA session opens in SR 1.
    b.do(note("sr")).do({ type: "startOR" }).do({ type: "nextCompany" }).do(toMR);
    expect(b.sections().map((x) => [x.title, x.icon])).toEqual([
      ["Preparación", "⚙"],
      ["Ciclo 1 · Ronda de acciones", "💼"],
      ["Ciclo 1 · Ronda de operaciones 1/2", "🚂"],
      ["Ciclo 1 · Ronda de operaciones 2/2", "🚂"],
      ["Ciclo 1 · Ronda de fusiones", "🔀"],
    ]);
  });

  it("21Moon: the corporate round", () => {
    const b = new LogBuilder(getBuiltInGame("21moon")).do({ type: "startSR" }).do({ type: "startCR" });
    expect(b.sections().at(-1)).toMatchObject({ key: "CR:1", title: "Ronda corporativa 1", icon: "🏛" });
  });

  it("every group is in exactly one section, in seq order", () => {
    const b = g1830()
      .do({ type: "startSR" })
      .do({ type: "startOR" })
      .undo("g3")
      .do({ type: "startOR" })
      .do({ type: "nextCompany" })
      .do({ type: "startSR" })
      .do(note("x"));
    const ids = b.sections().flatMap((x) => x.groupIds);
    const groups = b.log.filter((e) => e.kind === "group").map((e) => e.id);
    expect(ids).toEqual(groups);
  });
});
