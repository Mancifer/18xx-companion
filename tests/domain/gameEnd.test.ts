import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { GameDefinition } from "../../src/domain/games/schema";
import { effectiveLog } from "../../src/domain/ledger/effectiveLog";
import { touchesOf, type GroupEntry, type LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import { gameEndStatus, outcomeOf } from "../../src/domain/mechanics/gameEnd";
import { makePlayers } from "../helpers/dispatch";
import { miniGame, miniPlayers } from "../helpers/miniGame";
import { ROTLA_NAMES, rotlaGame } from "../helpers/rotla";

/** The derived game-end fold (research R2, R7, R8; data-model §5). */

const at = (seq: number) => `2026-10-10T20:00:${String(seq).padStart(2, "0")}.000Z`;

function group(seq: number, action: Action, events: readonly PrimitiveEvent[] = []): GroupEntry {
  return { kind: "group", seq, id: `g${seq}`, at: at(seq), source: "touch", action, events, touches: touchesOf(events), warnings: [] };
}
const note = (seq: number, ...events: PrimitiveEvent[]) => group(seq, { type: "note", text: "x" }, events);
const endGame = (seq: number) => group(seq, { type: "endGame", triggers: [] }, [{ t: "note", text: "Fin de la partida" }]);
const reopen = (seq: number) => group(seq, { type: "reopenGame" }, [{ t: "note", text: "Partida reabierta" }]);
const revert = (seq: number, groupId: string): LogEntry => ({ kind: "revert", seq, at: at(seq), groupId });
const pay = (seq: number, amount = 10) => note(seq, { t: "moneyTransfer", from: "bank", to: "player:p1", amount });
const bankrupt = (seq: number, player: string, delta = 1) =>
  note(seq, { t: "counterChange", subject: `player:${player}`, key: "bankrupt", delta });

const mini = (log: readonly LogEntry[]) => replay(miniGame, miniPlayers, log);

// RotLA Short: the game is over after OR 4.2 with no Merger Round due.
const rotlaPlayers = makePlayers(ROTLA_NAMES.slice(0, 3));
const finalOR: PrimitiveEvent = { t: "turnAdvance", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null };
const backToSR4: PrimitiveEvent = { t: "turnAdvance", round: "SR", srNumber: 4, company: null };
const rotla = (log: readonly LogEntry[], game: GameDefinition = rotlaGame({ mode: "short" })) => replay(game, rotlaPlayers, log);

describe("manual end and reopening (FR-004, FR-005a/b)", () => {
  it("an endGame ends the game at its group with auto false; undoing it clears the end", () => {
    const log: LogEntry[] = [pay(1), endGame(2)];
    const r = mini(log);
    expect(r.end).toMatchObject({ groupId: "g2", seq: 2, at: at(2), auto: false, triggers: [] });
    expect(mini([...log, revert(3, "g2")]).end).toBeNull();
  });

  it("reopenGame while finished clears the end, and undoing the reopening restores the same end", () => {
    const log: LogEntry[] = [pay(1), endGame(2), reopen(3)];
    expect(mini(log).end).toBeNull();
    const restored = mini([...log, revert(4, "g3")]);
    expect(restored.end).toEqual(mini([pay(1), endGame(2)]).end);
  });

  it("reopenGame while open is a no-op", () => {
    expect(mini([pay(1), reopen(2)]).end).toBeNull();
  });

  it("an endGame while already finished moves the end to the new group", () => {
    const r = mini([pay(1), endGame(2), pay(3), endGame(4)]);
    expect(r.end?.groupId).toBe("g4");
  });

  it("end.state is the state right after the end group; later groups do not change it", () => {
    const ended = mini([pay(1, 10), endGame(2)]);
    const later = mini([pay(1, 10), endGame(2), pay(3, 25)]);
    expect(later.end?.state).toEqual(ended.state);
    expect(later.state).not.toEqual(ended.state);
  });

  it("laterEntries counts active groups after the end, and is 0 when open", () => {
    const log: LogEntry[] = [pay(1), endGame(2), pay(3), pay(4), pay(5)];
    expect(gameEndStatus(mini(log), effectiveLog(log))).toMatchObject({ laterEntries: 3 });
    const withUndo = [...log, revert(6, "g5")];
    expect(gameEndStatus(mini(withUndo), effectiveLog(withUndo)).laterEntries).toBe(2);
    const open: LogEntry[] = [pay(1), pay(2)];
    expect(gameEndStatus(mini(open), effectiveLog(open))).toEqual({ end: null, laterEntries: 0 });
  });

  it("a game with no autoEnd never ends on its own", () => {
    expect(mini([pay(1), pay(2)]).end).toBeNull();
    expect(mini([pay(1), pay(2)]).autoEndGroups).toEqual([]);
  });
});

describe("automatic end at the false→true transition (FR-001, FR-005c)", () => {
  it("the group where gameOver turns true ends the game with auto true and its triggers", () => {
    const r = rotla([pay(1), note(2, finalOR)]);
    expect(r.over).toBe(true);
    expect(r.end).toMatchObject({ groupId: "g2", auto: true, triggers: ["cyclesComplete"] });
    expect(r.autoEndGroups).toEqual(["g2"]);
  });

  it("after a reopening the game stays open while over stays true, and autoEndGroups keeps the group", () => {
    const r = rotla([pay(1), note(2, finalOR), reopen(3), pay(4)]);
    expect(r.over).toBe(true);
    expect(r.end).toBeNull();
    expect(r.autoEndGroups).toEqual(["g2"]);
  });

  it("a new false→true transition after a reopening ends the game again", () => {
    const r = rotla([pay(1), note(2, finalOR), reopen(3), note(4, backToSR4), note(5, finalOR)]);
    expect(r.end).toMatchObject({ groupId: "g5", auto: true });
    expect(r.autoEndGroups).toEqual(["g2", "g5"]);
  });

  it("undoing the group that reached the end leaves the game open, and drops it from autoEndGroups", () => {
    const log: LogEntry[] = [pay(1), note(2, finalOR)];
    const r = rotla([...log, revert(3, "g2")]);
    expect(r.end).toBeNull();
    expect(r.autoEndGroups).toEqual([]);
  });

  it("undoing the reached end after a reopening, then recording it again, ends at the new group", () => {
    const r = rotla([pay(1), note(2, finalOR), reopen(3), revert(4, "g2"), note(5, finalOR)]);
    expect(r.end).toMatchObject({ groupId: "g5", auto: true });
    expect(r.autoEndGroups).toEqual(["g5"]);
  });

  it("a RotLA log from before this feature (no end entries, no scoring block) is finished (R16)", () => {
    const legacy: Partial<GameDefinition> = { ...rotlaGame({ mode: "short" }) };
    delete legacy.scoring;
    const r = rotla([pay(1), note(2, finalOR), pay(3)], legacy as GameDefinition);
    expect(r.end).toMatchObject({ groupId: "g2", auto: true });
  });
});

describe("elimination order (R8)", () => {
  it("lists players whose bankrupt counter goes from 0 to above 0, in order, without duplicates", () => {
    const r = mini([bankrupt(1, "p2"), bankrupt(2, "p1"), bankrupt(3, "p2")]);
    expect(r.eliminationOrder).toEqual(["p2", "p1"]);
  });

  it("a reverted bankruptcy disappears", () => {
    expect(mini([bankrupt(1, "p2"), bankrupt(2, "p1"), revert(3, "g1")]).eliminationOrder).toEqual(["p1"]);
  });

  it("end.eliminationOrder is frozen at the end group; a later bankruptcy only changes the live order", () => {
    const r = mini([bankrupt(1, "p2"), endGame(2), bankrupt(3, "p1")]);
    expect(r.end?.eliminationOrder).toEqual(["p2"]);
    expect(r.eliminationOrder).toEqual(["p2", "p1"]);
  });
});

describe("outcomeOf (data-model §7)", () => {
  const status = (log: readonly LogEntry[]) => gameEndStatus(mini(log), effectiveLog(log));

  it("is null while the game is not finished", () => {
    expect(outcomeOf(miniGame, miniPlayers, status([pay(1)]))).toBeNull();
  });

  it("endedAt is the end group's time; winners are the rank-1 players of the frozen results", () => {
    expect(outcomeOf(miniGame, miniPlayers, status([pay(1), endGame(2)]))).toEqual({ endedAt: at(2), winners: ["p1"] });
  });

  it("a shared win lists every tied player, in players order", () => {
    expect(outcomeOf(miniGame, miniPlayers, status([endGame(1)]))?.winners).toEqual(miniPlayers.map((p) => p.id));
  });

  it("an eliminated player is never a winner", () => {
    expect(outcomeOf(miniGame, miniPlayers, status([bankrupt(1, "p1"), endGame(2)]))?.winners).toEqual(["p2"]);
  });

  it("entries after the end do not change it", () => {
    const later = [pay(1), endGame(2), note(3, { t: "moneyTransfer", from: "bank", to: "player:p2", amount: 100 })];
    expect(outcomeOf(miniGame, miniPlayers, status(later))).toEqual({ endedAt: at(2), winners: ["p1"] });
  });
});
