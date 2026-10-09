import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { answerQuery } from "../../src/domain/queries";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

/** FR-073: questions are answered from the app's own state, never from model text. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

function table() {
  const s = TestSession.start(getBuiltInGame("1830"), players);
  seedCompany(s, "Erie", { cell: { row: 0, col: 7 }, cash: 230, holders: { "player:p3": 4, "player:p2": 3 }, trains: ["train:2:1", "train:3:1"] });
  s.apply({ t: "moneyTransfer", from: "player:p1", to: "bank", amount: 80 });
  return s;
}
const ask = (s: TestSession, kind: string, player: string | null = null, company: string | null = null) =>
  answerQuery(s, { kind: kind as never, player, company }).textEs;

describe("answerQuery", () => {
  it("cash of a player, or of a company", () => {
    const s = table();
    expect(ask(s, "cash", "p1")).toBe("Ana tiene $520");
    expect(ask(s, "cash", null, "Erie")).toBe("Erie tiene $230 en caja");
  });

  it("shares", () => {
    const s = table();
    expect(ask(s, "shares", "p3", "Erie")).toBe("Carla tiene 4 acciones de Erie (40%)");
    expect(ask(s, "shares", "p3")).toBe("Carla tiene: Erie 40%");
    expect(ask(s, "shares", null, "Erie")).toBe("Erie: Carla 40%, Bruno 30%, IPO 30%");
  });

  it("price, treasury, trains and president", () => {
    const s = table();
    expect(ask(s, "price", null, "Erie")).toBe("Erie está a $112");
    expect(ask(s, "treasury", null, "Erie")).toBe("Erie tiene $230 en caja");
    expect(ask(s, "trains", null, "Erie")).toBe("Erie tiene trenes: 2, 3");
    expect(ask(s, "president", null, "Erie")).toBe("Preside Erie: Carla");
  });

  it("trains on sale when no company is named", () => {
    expect(ask(table(), "trains")).toMatch(/^En el banco: 2 \(5 a \$80\)/);
  });

  it("bank and turn", () => {
    const s = table();
    expect(ask(s, "bank")).toBe("El banco tiene $9.450");
    expect(ask(s, "turn")).toBe("Privadas · fase 2");
  });

  it("asks back when the entity is missing", () => {
    expect(ask(table(), "price")).toBe("¿De qué compañía?");
  });
});
