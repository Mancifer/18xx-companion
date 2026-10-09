import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { netMoney } from "../helpers/flows";

/** Private trading between players (bug private-company-ownership; 1830 §4.1, 1848 §4.1). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const buyPrivate = (buyer: string, id: string, price: number) => ({ type: "buyPrivate", buyer, private: id, price, par: null });
const start = (id: string) => TestSession.start(getBuiltInGame(id), players);
const toSR = (s: TestSession, srNumber: number) =>
  s.apply({ t: "turnAdvance", round: "SR", srNumber, company: null });

describe.each([
  ["1848", "P1", 30],
  ["21moon", "P1", 30],
])("%s: players never trade privates", (game, priv, cost) => {
  it.each([["PRIVATES", 0], ["SR", 1], ["SR", 2], ["SR", 5]] as const)("a second buyer is refused (%s %i)", (round, sr) => {
    const s = start(game).do(buyPrivate("p1", priv, cost));
    if (round === "SR") toSR(s, sr);
    const before = s.state;
    const result = s.tryDo(buyPrivate("p2", priv, cost + 20));
    expect(result.kind).toBe("unavailable");
    expect(result.kind === "unavailable" && result.reasonEs).toMatch(/ya es de Ana; en .+ las privadas no se traspasan/);
    expect(s.state).toBe(before);
    expect(s.state.assets[`private:${priv}`]).toBe("player:p1");
  });
});

describe("1830: player-to-player sales only in a stock round after the first", () => {
  it.each([["PRIVATES", 0], ["SR", 1]] as const)("a second buyer is refused (%s %i)", (round, sr) => {
    const s = start("1830").do(buyPrivate("p1", "SV", 20));
    if (round === "SR") toSR(s, sr);
    const result = s.tryDo(buyPrivate("p2", "SV", 40));
    expect(result.kind).toBe("unavailable");
    expect(result.kind === "unavailable" && result.reasonEs).toMatch(/ya es de Ana; solo se traspasa/);
    expect(s.state.assets["private:SV"]).toBe("player:p1");
  });

  it("is refused during an operating round", () => {
    const s = start("1830").do(buyPrivate("p1", "SV", 20));
    s.apply({ t: "turnAdvance", round: "OR", company: null });
    expect(s.tryDo(buyPrivate("p2", "SV", 40)).kind).toBe("unavailable");
  });

  it("works in SR2, with the money going to the seller", () => {
    const s = start("1830").do(buyPrivate("p1", "SV", 20));
    toSR(s, 2).do(buyPrivate("p2", "SV", 40));
    expect(s.state.assets["private:SV"]).toBe("player:p2");
    expect(netMoney(s.lastEvents)).toEqual({ "player:p2": -40, "player:p1": 40 });
  });
});

describe("unchanged refusals and bank sales", () => {
  it.each([["1830", "SV", 20], ["1848", "P1", 30], ["21moon", "P1", 30]] as const)(
    "%s: buying from the bank works in the PRIVATES round and in SR1",
    (game, priv, cost) => {
      start(game).do(buyPrivate("p1", priv, cost));
      const s = toSR(start(game), 1).do(buyPrivate("p1", priv, cost));
      expect(s.state.assets[`private:${priv}`]).toBe("player:p1");
    },
  );

  it("the owner is told it is already theirs", () => {
    const s = start("1848").do(buyPrivate("p1", "P1", 30));
    expect(s.tryDo(buyPrivate("p1", "P1", 30))).toEqual({ kind: "unavailable", reasonEs: "Ya es suya" });
  });

  it("a closed private stays refused", () => {
    const s = start("1848").apply({ t: "assetTransfer", asset: "private:P1", from: "bank", to: "removed" });
    expect(s.tryDo(buyPrivate("p1", "P1", 30))).toEqual({ kind: "unavailable", reasonEs: "Esa privada está cerrada" });
  });

  it("a game without privateTrading defaults to player sales in SR2+", () => {
    const { privateTrading: _, ...game } = getBuiltInGame("1830");
    const s = TestSession.start(game, players).do(buyPrivate("p1", "SV", 20));
    expect(s.tryDo(buyPrivate("p2", "SV", 40)).kind).toBe("unavailable");
    toSR(s, 2).do(buyPrivate("p2", "SV", 40));
    expect(s.state.assets["private:SV"]).toBe("player:p2");
  });
});
