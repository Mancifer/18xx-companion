import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { operatingOrder } from "../../src/domain/mechanics/operatingOrder";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";

/** FR-051: operating order from orOrder. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = (id: string) => TestSession.start(getBuiltInGame(id), players);

describe("operatingOrder", () => {
  it("only floated and receivership companies, by price descending", () => {
    const s = start("1830");
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 } }); // 100
    seedCompany(s, "NYC", { cell: { row: 0, col: 8 } }); // 126
    seedCompany(s, "CPR", { cell: { row: 1, col: 4 }, status: "receivership" }); // 76
    seedCompany(s, "B&O", { cell: { row: 0, col: 9 }, status: "parred" }); // 142, not floated
    expect(operatingOrder(s.game, s.state)).toEqual(["NYC", "PRR", "CPR"]);
  });

  it("1830 ties: top of the stack, then the rightmost column, then the highest row (§7.0)", () => {
    const s = start("1830");
    seedCompany(s, "PRR", { cell: { row: 1, col: 7 } }); // 100, arrives first
    seedCompany(s, "NYC", { cell: { row: 1, col: 7 } }); // 100, underneath
    seedCompany(s, "CPR", { cell: { row: 2, col: 8 } }); // 100, further right
    seedCompany(s, "B&O", { cell: { row: 0, col: 6 } }); // 100, top row
    expect(operatingOrder(s.game, s.state)).toEqual(["CPR", "PRR", "NYC", "B&O"]);
  });

  it("1848: the BoE operates first (orOrder.before)", () => {
    const s = start("1848");
    seedCompany(s, "QR", { cell: { row: 0, col: 10 } });
    seedCompany(s, "VR", { cell: { row: 1, col: 5 } });
    expect(operatingOrder(s.game, s.state)).toEqual(["BOE", "QR", "VR"]);
  });

  it("21Moon ties: the rightmost column first, then the top of the stack (§5.2)", () => {
    const s = start("21moon");
    seedCompany(s, "VH", { cell: { row: 3, col: 4 } }); // 100
    seedCompany(s, "SSF", { cell: { row: 2, col: 3 } }); // 100, further left
    seedCompany(s, "LG", { cell: { row: 3, col: 4 } }); // 100, underneath VH
    expect(operatingOrder(s.game, s.state)).toEqual(["VH", "LG", "SSF"]);
  });

  it("dynamic: the next company is chosen from current prices after each turn", () => {
    const s = start("1830");
    seedCompany(s, "PRR", { cell: { row: 0, col: 8 }, holders: { "player:p1": 6 } }); // 126
    seedCompany(s, "NYC", { cell: { row: 0, col: 7 }, holders: { "player:p2": 6 } }); // 112
    seedCompany(s, "CPR", { cell: { row: 0, col: 6 }, holders: { "player:p3": 6 } }); // 100
    s.do({ type: "startOR" });
    expect(s.state.turn.currentCompany).toBe("PRR");
    // NYC withholds out of turn order is irrelevant; CPR pays and jumps above NYC before NYC's turn.
    s.apply({ t: "marketMove", company: "CPR", to: { row: 0, col: 9 }, reason: "manual" }); // 142
    s.do({ type: "nextCompany" });
    expect(s.state.turn.currentCompany).toBe("CPR");
  });
});

describe("RotLA: a restack during the OR (stackTop, dynamic)", () => {
  it("changes the remaining order, and companies that already operated are not offered again", () => {
    const s = rotlaSession();
    for (const id of ["CON", "UNI", "SYS"]) seedRotla(s, id, { price: 100, holders: { "player:p1": 10 } });
    s.do({ type: "startOR" });
    expect(s.state.turn.operatingOrder).toEqual(["CON", "UNI", "SYS"]);
    expect(s.state.turn.currentCompany).toBe("CON");
    // UNI pays below its price out of turn: it drops to the bottom of the 100s.
    s.do({ type: "runAndPayout", company: "UNI", parts: [{ part: "revenue", amount: 60 }], mode: "full" });
    expect(operatingOrder(s.game, s.state)).toEqual(["CON", "SYS", "UNI"]);
    s.do({ type: "runAndPayout", company: "CON", parts: [{ part: "revenue", amount: 60 }], mode: "full" });
    s.do({ type: "nextCompany" });
    expect(s.state.turn.currentCompany).toBe("SYS");
    s.do({ type: "runAndPayout", company: null, parts: [{ part: "revenue", amount: 60 }], mode: "full" });
    s.do({ type: "nextCompany" });
    // Everyone has operated: the next OR of the set starts, from CON again.
    expect(s.state.turn.orIndex).toBe(2);
    expect(s.state.turn.operatingOrder).toEqual(["UNI", "CON", "SYS"]);
  });
});
