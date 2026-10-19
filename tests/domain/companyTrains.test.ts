import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import { companyTrains, trainsLineEs } from "../../src/domain/i18n/es";
import { countedTrains, trainLimitFor } from "../../src/domain/mechanics/phases";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { rotlaSession, seedCompany as seedRotla } from "../helpers/rotla";
import { seedCompany } from "../helpers/seed";

/** Feature 013, US2: one card per train (data-model.md "Train card"). */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const g1830 = getBuiltInGame("1830");
const prr = (trains: readonly string[], game: GameDefinition = g1830) =>
  seedCompany(TestSession.start(game, players), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 }, trains });

describe("companyTrains", () => {
  it("sorts by the definition's order, then the train number, labelled with displayName", () => {
    const s = prr(["train:4:1", "train:2:2", "train:3:1", "train:2:1"]);
    const { cards } = companyTrains(s.game, s.state, "PRR");
    expect(cards.map((c) => c.asset)).toEqual(["train:2:1", "train:2:2", "train:3:1", "train:4:1"]);
    const label = (type: string) => g1830.trains.find((t) => t.type === type)?.displayName ?? type;
    expect(cards.map((c) => c.label)).toEqual([label("2"), label("2"), label("3"), label("4")]);
    expect(cards.every((c) => !c.rusted)).toBe(true);
  });

  it("marks a rusted train that Resourceful keeps", () => {
    const s = rotlaSession();
    seedRotla(s, "RES", { price: 80, holders: { "player:p1": 5 }, treasury: 2000, trains: ["train:2:1", "train:2:2"] });
    seedRotla(s, "CON", { price: 100, holders: { "player:p3": 10 }, treasury: 2000 });
    s.do({ type: "buyTrain", company: "CON", trainType: "4", variant: null, from: "bank", seller: null, price: null, tradeIn: null });
    const { cards, count } = companyTrains(s.game, s.state, "RES");
    expect(cards.map((c) => [c.asset, c.rusted])).toEqual([
      ["train:2:1", true],
      ["train:2:2", true],
    ]);
    expect(count).toBe(0);
  });

  it("count, limit and over follow countedTrains and trainLimitFor", () => {
    const s = prr(["train:2:1", "train:3:1", "train:3:2"]);
    expect(companyTrains(s.game, s.state, "PRR")).toMatchObject({
      count: countedTrains(s.game, s.state, "PRR").length,
      limit: trainLimitFor(s.game, s.state, "PRR"),
      over: false,
    });
    s.apply({ t: "turnAdvance", phase: "5" });
    expect(companyTrains(s.game, s.state, "PRR")).toMatchObject({ count: 3, limit: 2, over: true });
  });

  it("no trains: no cards", () => {
    const s = prr([]);
    expect(companyTrains(s.game, s.state, "PRR")).toMatchObject({ cards: [], count: 0, over: false });
  });

  it("trainsLineEs keeps its text", () => {
    const rusted = prr(["train:2:1", "train:3:1"]);
    rusted.apply({ t: "counterChange", subject: "company:PRR", key: "rusted:train:2:1", delta: 1 });
    expect(trainsLineEs(rusted.game, rusted.state, "PRR").text).toBe("Trenes 1/4 · 2 (oxidado), 3");
    const over = prr(["train:2:1", "train:3:1", "train:3:2"]);
    over.apply({ t: "turnAdvance", phase: "5" });
    expect(trainsLineEs(over.game, over.state, "PRR")).toEqual({ text: "Trenes 3/2 · 2, 3, 3 · sobre el límite", warn: true });
    expect(trainsLineEs(g1830, prr([]).state, "PRR")).toEqual({ text: "Sin trenes", warn: true });
  });
});
