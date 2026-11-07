import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import type { Movement } from "../../src/domain/ledger/breakdown";
import { domainText } from "../../src/i18n";
import { stripMentions } from "../../src/i18n/mentions";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";

/** Feature 014 T017: English summaries, effects and History lines (research R12 glossary). */

const en = domainText("en");
const es = domainText("es");
const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);

describe("English summaries", () => {
  it("a payout with its price move", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", {
      cell: { row: 0, col: 6 },
      holders: { "player:p1": 6 },
    });
    const action: Action = { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 240 }], mode: "full" };
    s.do(action);
    expect(en.summary(action, s, s.lastEvents)).toBe("PRR pays $240 ($24/share) · PRR → $112");
    expect(es.summary(action, s, s.lastEvents)).toBe("PRR paga $240 ($24/acción) · PRR → $112");
  });

  it("withhold and half pay", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    expect(en.summary({ type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 180 }], mode: "withhold" }, s)).toBe(
      "PRR withholds $180",
    );
    expect(en.summary({ type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 180 }], mode: "half" }, s)).toBe(
      "PRR pays half of $180",
    );
  });

  it("the start of the OR shows the end of the SR and the sold-out move", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players).do({ type: "startSR" });
    seedCompany(s, "PRR", { cell: { row: 2, col: 6 }, holders: { "player:p1": 6, "player:p2": 4 } });
    const action: Action = { type: "startOR" };
    s.do(action);
    const line = en.summary(action, s, s.lastEvents);
    expect(line).toContain("The operating round starts");
    expect(line).toContain("end of the stock round");
    expect(line).toContain("PRR → $90");
  });

  it("a loan with its moves, in pounds with a comma separator", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1848"), players), "QR", { cell: { row: 1, col: 10 }, holders: { "player:p1": 6 } });
    s.apply({ t: "turnAdvance", phase: "3" });
    const action: Action = { type: "takeLoan", company: "QR", count: 1 };
    s.do(action);
    expect(en.summary(action, s, s.lastEvents)).toBe("QR takes 1 loan: +£100 · QR → £150 · BoE → £80");
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
    expect(en.summary(action, s, s.lastEvents)).toBe(
      "VR goes into receivership with the national bank · VR in receivership · out of the game: 1 × 2",
    );
  });

  it("money, shares and stock actions", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    expect(en.summary({ type: "transferMoney", from: "player:p1", to: "bank", amount: 1200 }, s)).toBe("Ana pays $1,200 to the bank");
    expect(en.summary({ type: "transferMoney", from: "bank", to: "player:p2", amount: 50 }, s)).toBe("The bank pays $50 to Bruno");
    expect(en.summary({ type: "transferShares", company: "PRR", from: "ipo:PRR", to: "player:p1", units: 2, presidency: true }, s)).toBe(
      "2 shares of PRR (presidency): the PRR IPO → Ana",
    );
    expect(en.summary({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "pool", count: 1 }, s)).toBe("Bruno buys 1 PRR from the pool");
    expect(en.summary({ type: "note", text: "mi nota" }, s)).toBe("Note: mi nota");
    expect(en.summary({ type: "endGame", triggers: ["bankBroken"] }, s)).toBe("Game over (bank broken)");
    expect(en.proposalSummary({ type: "endGame", triggers: [] }, s)).toBe("End the game (no end condition)");
  });

  it("History lines: movements and balances", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    const money: Movement = { kind: "money", amount: 240, from: "bank", to: "player:p1" };
    expect(en.movementLine(money, s)).toBe("$240: Bank → Ana");
    const shares: Movement = { kind: "shares", company: "PRR", units: 2, from: "ipo:PRR", to: "player:p1", presidency: true };
    expect(en.movementLine(shares, s)).toBe("2 PRR: IPO → Ana (presidency)");
    expect(en.balanceLine({ holder: "player:p1", before: 480, after: 1720, delta: 1240 }, s)).toBe("Ana: $480 → $1,720 (+$1,240)");
  });

  it("the undo toast", () => {
    const s = TestSession.start(getBuiltInGame("1830"), players);
    const g = { action: { type: "note", text: "x" } as Action, events: [] };
    expect(en.undone([g], s)).toBe("Undone: Note: x");
    expect(en.undone([g, g, g], s)).toBe("Undid 3 entries: from Note: x to Note: x");
  });

  it("with mention marks, the text without the marks equals the plain text", () => {
    const s = seedCompany(TestSession.start(getBuiltInGame("1830"), players), "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    const action: Action = { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 240 }], mode: "full" };
    s.do(action);
    const plain = en.summary(action, s, s.lastEvents);
    const marked = en.summary(action, { game: s.game, players: s.players, state: s.state, marks: true }, s.lastEvents);
    expect(marked).not.toBe(plain);
    expect(stripMentions(marked)).toBe(plain);
  });
});
