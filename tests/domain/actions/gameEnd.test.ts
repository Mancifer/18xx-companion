import { describe, expect, it } from "vitest";
import { runPipeline } from "../../../src/domain/actions/pipeline";
import { getBuiltInGame } from "../../../src/domain/games";
import { buildAmend } from "../../../src/domain/ledger/amend";
import type { GroupEntry, LogEntry } from "../../../src/domain/ledger/entries";
import type { GameEndStatus } from "../../../src/domain/mechanics/gameEnd";
import { checkInvariants } from "../../../src/domain/mechanics/invariants";
import { TestSession, makePlayers } from "../../helpers/dispatch";

/** endGame and reopenGame (feature 007, contracts/domain.md §1). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const g1830 = getBuiltInGame("1830");
const start = () => TestSession.start(g1830, players);
const endGame = { type: "endGame", triggers: null };
const AT = "2026-10-10T20:00:00.000Z";

/** A finished status as the store would pass it in the context. */
function finished(s: TestSession): GameEndStatus {
  return {
    end: { groupId: "g9", seq: 9, at: AT, auto: false, triggers: [], state: s.state, eliminationOrder: [] },
    laterEntries: 0,
  };
}

function asLog(s: TestSession): LogEntry[] {
  return s.groups.map((g): GroupEntry => ({ kind: "group", ...g, warnings: [] }));
}

describe("endGame", () => {
  it("with no end condition fired: one note and the noEndCondition info warning", () => {
    const s = start().do(endGame);
    expect(s.lastEvents).toEqual([{ t: "note", text: "Fin de la partida" }]);
    expect(s.lastWarnings).toEqual([
      { code: "noEndCondition", messageEs: "Todavía no se cumplió ninguna condición de fin de partida.", severity: "info" },
    ]);
    expect(s.groups.at(-1)?.action).toEqual({ type: "endGame", triggers: [] });
  });

  it("with conditions fired and triggers null, the stored action lists them in definition order", () => {
    const s = start()
      .apply({ t: "counterChange", subject: "player:p2", key: "bankrupt", delta: 1 })
      .apply({ t: "moneyTransfer", from: "bank", to: "player:p1", amount: 9600 })
      .do(endGame);
    expect(s.groups.at(-1)?.action).toEqual({ type: "endGame", triggers: ["bankBroken", "bankruptcy"] });
    expect(s.lastWarnings).toEqual([]);
  });

  it("while already finished it is accepted, with the alreadyEnded info warning", () => {
    const s = start();
    const result = runPipeline({ game: g1830, players, state: s.state, gameEnd: finished(s) }, endGame);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.warnings.map((w) => [w.code, w.severity])).toContainEqual(["alreadyEnded", "info"]);
  });

  it("moves no money or shares and leaves the invariants untouched (FR-005)", () => {
    const s = start();
    const before = s.state;
    s.do(endGame);
    expect(s.state.money).toEqual(before.money);
    expect(s.state.holdings).toEqual(before.holdings);
    expect(checkInvariants(g1830, s.state)).toEqual([]);
  });

  it("an endGame group cannot be amended: undo it instead", () => {
    const s = start().do(endGame);
    const log = asLog(s);
    const result = buildAmend(g1830, players, log, "g2", endGame, { seq: 3, at: AT });
    expect(result).toEqual({ ok: false, reasonEs: "No hay nada que corregir: deshazlo" });
  });
});

describe("reopenGame", () => {
  const reopen = { type: "reopenGame" };

  it("while finished: one note, and the game is open (the fold drops the end)", () => {
    const s = start();
    const result = runPipeline({ game: g1830, players, state: s.state, gameEnd: finished(s) }, reopen);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.events).toEqual([{ t: "note", text: "Partida reabierta" }]);
    expect(result.warnings).toEqual([]);
  });

  it("while open it is unavailable", () => {
    expect(start().tryDo(reopen)).toEqual({ kind: "unavailable", reasonEs: "La partida no está terminada" });
  });

  it("moves no money or shares", () => {
    const s = start();
    const result = runPipeline({ game: g1830, players, state: s.state, gameEnd: finished(s) }, reopen);
    expect(result.kind === "ok" && result.events.every((e) => e.t === "note")).toBe(true);
  });

  it("a reopenGame group cannot be amended: undo it instead", () => {
    const s = start();
    const log: LogEntry[] = [
      ...asLog(s),
      { kind: "group", seq: 2, id: "g2", at: AT, source: "touch", action: { type: "endGame", triggers: [] }, events: [{ t: "note", text: "Fin de la partida" }], touches: [], warnings: [] },
      { kind: "group", seq: 3, id: "g3", at: AT, source: "touch", action: { type: "reopenGame" }, events: [{ t: "note", text: "Partida reabierta" }], touches: [], warnings: [] },
    ];
    expect(buildAmend(g1830, players, log, "g3", reopen, { seq: 4, at: AT })).toEqual({ ok: false, reasonEs: "No hay nada que corregir: deshazlo" });
  });
});
