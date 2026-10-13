import { describe, expect, it } from "vitest";
import { runPipeline } from "../../../src/domain/actions/pipeline";
import { getBuiltInGame } from "../../../src/domain/games";
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
});
