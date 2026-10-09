import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import { summaryEs } from "../../src/domain/i18n/es";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

describe("Spanish summaries (US3)", () => {
  it("a payout with its price move", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6 },
    });
    const action: Action = { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 240 }], mode: "full" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("PRR paga $240 ($24/acción) · PRR → $112");
  });

  it("a loan with its moves", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1848"), players), "QR", {
      cell: { row: 1, col: 10 },
      holders: { "player:p1": 6 },
    });
    s.apply({ t: "turnAdvance", phase: "3" });
    const action: Action = { type: "takeLoan", company: "QR", count: 1 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("QR pide 1 préstamo: +£100 · QR → £150 · BoE → £80");
  });

  it("a takeover lists its effects", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1848"), players), "VR", {
      cell: { row: 2, col: 3 },
      par: 70,
      holders: { "player:p1": 6 },
      trains: ["train:2:1"],
    });
    const action: Action = { type: "enterReceivership", company: "VR" };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe(
      "VR pasa a administración del banco nacional · VR en administración · fuera del juego: 1 × 2",
    );
  });

  it("21Moon two-part revenue", () => {
    const game = getBuiltInGame("21moon");
    const action: Action = {
      type: "runAndPayout",
      company: "VH",
      parts: [
        { part: "local", amount: 60 },
        { part: "spacePort", amount: 40 },
      ],
      mode: null,
    };
    expect(summaryEs(action, { game, players })).toBe("VH: base local ₡60, puerto espacial ₡40");
  });
});

describe("Spanish summaries (US4)", () => {
  const g1830 = getBuiltInGame("1830");

  it("par", () => {
    const s = TestSession.start(g1830, players);
    const action: Action = { type: "parCompany", player: "p1", company: "NYC", price: 82 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Ana abre la NYC a $82");
  });

  it("a sale with its price move and a presidency change", () => {
    const s = seedCompany(TestSession.start(g1830, players), "Erie", {
      cell: { row: 1, col: 6 },
      holders: { "player:p3": 4, "player:p2": 3 },
    });
    const action: Action = { type: "sellShares", seller: "player:p3", company: "Erie", count: 2 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe(
      "Carla vende 2 Erie · Erie → $76 · Presidencia de la Erie: Carla → Bruno",
    );
  });

  it("a float with capital pending (quickstart 13)", () => {
    const s = TestSession.start(g1830, players)
      .do({ type: "parCompany", player: "p1", company: "PRR", price: 100 })
      .do({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 3 });
    const action: Action = { type: "buyShare", buyer: "player:p3", company: "PRR", source: "ipo", count: 1 };
    s.do(action);
    expect(summaryEs(action, s, s.lastEvents)).toBe("Carla compra 1 PRR de la IPO · PRR flota (capital al final de la ronda)");
  });
});
