import { describe, expect, it } from "vitest";
import { cashOf, counterOf, presidentOf, unitsOf } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { GroupEntry, LogEntry } from "../../src/domain/ledger/entries";
import { replay } from "../../src/domain/ledger/replay";
import { mergePreview } from "../../src/domain/mechanics/custom/mergers";
import { floorToTrack, priceOf } from "../../src/domain/mechanics/market";
import { overLimitCompanies } from "../../src/domain/mechanics/phases";
import { displayName } from "../../src/domain/mechanics/traits";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { eventsOf } from "../helpers/flows";
import { ROTLA_NAMES, rotlaGame, seedCompany, type RotlaSeed } from "../helpers/rotla";

/** Merging two minors into a major in the Merger Round (US7, research R8, B p.18). */

const merge = (a: string, b: string, into: string, identity: "primary" | "alt" | null = null) => ({
  type: "mergeCompanies",
  a,
  b,
  into,
  identity,
});

/** A session whose raw setup events (createSession and seeds) are kept, so undo can be replayed. */
function recording(game: GameDefinition = rotlaGame()) {
  const s = TestSession.start(game, makePlayers(ROTLA_NAMES.slice(0, 3)));
  const setup: PrimitiveEvent[] = [...s.lastEvents];
  const apply = s.apply.bind(s);
  s.apply = (...events: PrimitiveEvent[]) => {
    setup.push(...events);
    return apply(...events);
  };
  return { s, setup };
}

/** A Merger Round in the given phase, with EXP at 80 and TUN at 70 seeded as given. */
function mergerRound(
  exp: Omit<RotlaSeed, "price">,
  tun: Omit<RotlaSeed, "price">,
  phase = "green",
  game?: GameDefinition,
) {
  const { s, setup } = recording(game);
  s.apply({ t: "turnAdvance", round: "MR", srNumber: 2, phase });
  seedCompany(s, "EXP", { price: 80, ...exp });
  seedCompany(s, "TUN", { price: 70, ...tun });
  return Object.assign(s, { setup });
}

/** The independent test: Ana 3 + 0, Bruno 2 + 3; TUN's own treasury holds 2. */
const independent = (game?: GameDefinition) =>
  mergerRound(
    { holders: { "player:p1": 3, "player:p2": 2 }, treasury: 200, trains: ["train:2:1"] },
    { holders: { "player:p2": 3, "company:TUN": 2 }, treasury: 110, trains: ["train:3:1"] },
    "green",
    game,
  );

const codes = (r: ReturnType<TestSession["tryDo"]>) => (r.kind === "ok" ? r.warnings.map((w) => w.code) : [r.kind]);

describe("mergeCompanies", () => {
  it("Bruno presides, Ana holds 3, the price is 70 at the bottom, and everything moves to the major", () => {
    const s = independent();
    seedCompany(s, "SYS", { price: 70, holders: { "player:p3": 10 } });
    s.do(merge("EXP", "TUN", "UNI"));
    const e = s.lastEvents;

    // Every holder's minor units leave the game; the same number of major units leave UNI's IPO.
    const toRemoved = eventsOf(e, "shareTransfer").filter((t) => t.to === "removed");
    expect(toRemoved.map((t) => [t.company, t.from, t.units])).toEqual([
      ["EXP", "player:p1", 3],
      ["EXP", "player:p2", 2],
      ["TUN", "player:p2", 3],
      ["TUN", "company:TUN", 2],
    ]);
    expect(unitsOf(s.state, "removed", "EXP")).toBe(5);
    expect(unitsOf(s.state, "removed", "TUN")).toBe(5);
    expect(unitsOf(s.state, "player:p2", "UNI")).toBe(5);
    expect(unitsOf(s.state, "player:p1", "UNI")).toBe(3);
    expect(unitsOf(s.state, "company:UNI", "UNI")).toBe(2);
    expect(unitsOf(s.state, "ipo:UNI", "UNI")).toBe(0);
    expect(presidentOf(s.state, "UNI")).toBe("p2");

    expect(cashOf(s.state, "company:UNI")).toBe(310);
    expect(cashOf(s.state, "company:EXP")).toBe(0);
    expect(s.state.assets["train:2:1"]).toBe("company:UNI");
    expect(s.state.assets["train:3:1"]).toBe("company:UNI");

    expect(eventsOf(e, "marketMove")).toEqual([{ t: "marketMove", company: "UNI", to: floorToTrack(s.game, 75), reason: "merge" }]);
    expect(priceOf(s.game, s.state, "UNI")).toBe(70);
    // At the bottom of the 70s: SYS was there first.
    expect(s.state.companies["UNI"]!.stackOrder).toBeGreaterThan(s.state.companies["SYS"]!.stackOrder);

    expect(s.state.companies["UNI"]!.status).toBe("floated");
    expect(s.state.companies["EXP"]!.status).toBe("closed");
    expect(s.state.companies["TUN"]!.status).toBe("closed");
    expect(counterOf(s.state, "company:UNI", "mergedFrom:EXP")).toBe(1);
    expect(counterOf(s.state, "company:UNI", "mergedFrom:TUN")).toBe(1);
    expect(s.violations()).toEqual([]);
    expect(s.lastWarnings).toEqual([]);
  });

  it("the same president for both minors gets 2 + 8 units", () => {
    const s = mergerRound({ holders: { "player:p1": 5 } }, { holders: { "player:p1": 5 } });
    s.do(merge("EXP", "TUN", "CON"));
    expect(unitsOf(s.state, "player:p1", "CON")).toBe(10);
    expect(presidentOf(s.state, "CON")).toBe("p1");
    expect(s.violations()).toEqual([]);
  });

  it("a 5–5 tie goes to the president of the minor first in the operating order, with an info warning", () => {
    const s = mergerRound({ holders: { "player:p1": 3, "player:p2": 2 } }, { holders: { "player:p2": 3, "player:p1": 2 } });
    s.do(merge("TUN", "EXP", "CON"));
    expect(presidentOf(s.state, "CON")).toBe("p1");
    expect(s.lastWarnings).toEqual([
      { code: "presidencyTie", messageEs: "Empate a 5: preside Ana (presidencia de EXP, que opera antes).", severity: "info" },
    ]);
  });

  it("identity alt sets the identity counter, and the display name is the alt name", () => {
    const s = independent().do(merge("EXP", "TUN", "CON", "alt"));
    expect(counterOf(s.state, "company:CON", "identity")).toBe(1);
    expect(displayName(s.game, s.state, "CON")).toBe("Conglomerate");
    expect(displayName(s.game, s.state, "UNI")).toBe("Union");
  });

  it("rusted: and permanent: counters move from the minor to the major", () => {
    const s = independent();
    s.apply(
      { t: "counterChange", subject: "company:EXP", key: "rusted:train:2:1", delta: 1 },
      { t: "counterChange", subject: "company:TUN", key: "permanent:train:3:1", delta: 1 },
    );
    s.do(merge("EXP", "TUN", "UNI"));
    expect(counterOf(s.state, "company:EXP", "rusted:train:2:1")).toBe(0);
    expect(counterOf(s.state, "company:UNI", "rusted:train:2:1")).toBe(1);
    expect(counterOf(s.state, "company:TUN", "permanent:train:3:1")).toBe(0);
    expect(counterOf(s.state, "company:UNI", "permanent:train:3:1")).toBe(1);
  });

  it("undo restores the exact state before the merger", () => {
    const s = independent();
    const AT = "2026-10-09T20:00:00.000Z";
    const group = (seq: number, events: readonly PrimitiveEvent[]): GroupEntry => ({
      kind: "group",
      seq,
      id: `g${seq}`,
      at: AT,
      source: "touch",
      action: { type: "note", text: `g${seq}` },
      events,
      touches: [],
      warnings: [],
    });
    const before: LogEntry[] = [group(1, s.setup)];
    expect(replay(s.game, s.players, before).state).toEqual(s.state);
    s.do(merge("EXP", "TUN", "UNI"));
    const undone = replay(s.game, s.players, [...before, group(2, s.lastEvents), { kind: "revert", seq: 3, at: AT, groupId: "g2" }]);
    expect(undone.state).toEqual(replay(s.game, s.players, before).state);
  });

  it("5 trains in green4 warns about the limit, and the major is over its limit", () => {
    const s = mergerRound(
      { holders: { "player:p1": 5 }, trains: ["train:3:1", "train:3:2", "train:4:1"] },
      { holders: { "player:p2": 5 }, trains: ["train:3:3", "train:4:2"] },
      "green4",
    );
    expect(codes(s.tryDo(merge("EXP", "TUN", "UNI")))).toContain("trainLimit");
    s.do(merge("EXP", "TUN", "UNI"));
    expect(overLimitCompanies(s.game, s.state)).toEqual([{ company: "UNI", count: 5, limit: 3 }]);
  });

  it("warns outside a Merger Round", () => {
    const s = independent();
    s.apply({ t: "turnAdvance", round: "OR" });
    expect(codes(s.tryDo(merge("EXP", "TUN", "UNI")))).toEqual(["notMergerRound"]);
  });

  it("warns when the alt identity is asked of a major that has none", () => {
    const base = rotlaGame();
    const game = { ...base, companies: base.companies.map((c) => (c.id === "UNI" ? { ...c, altName: undefined } : c)) };
    const s = independent(game);
    expect(codes(s.tryDo(merge("EXP", "TUN", "UNI", "alt")))).toEqual(["unknownIdentity"]);
  });

  it("is unavailable unless a and b are distinct floated minors and into is an unstarted major", () => {
    const s = independent();
    seedCompany(s, "SYS", { price: 100, holders: { "player:p3": 10 } });
    expect(s.tryDo(merge("EXP", "ADP", "UNI")).kind).toBe("unavailable");
    expect(s.tryDo(merge("EXP", "EXP", "UNI")).kind).toBe("unavailable");
    expect(s.tryDo(merge("EXP", "SYS", "UNI")).kind).toBe("unavailable");
    expect(s.tryDo(merge("EXP", "TUN", "SYS")).kind).toBe("unavailable");
    expect(s.tryDo(merge("EXP", "TUN", "TUN")).kind).toBe("unavailable");
  });
});

describe("mergePreview", () => {
  it("matches the expansion", () => {
    const s = independent();
    expect(mergePreview(s.game, s.players, s.state, "EXP", "TUN")).toEqual({
      president: "p2",
      tie: false,
      holdings: [
        ["player:p1", 3],
        ["player:p2", 5],
        ["treasury", 2],
      ],
      price: 70,
      treasury: 310,
      trains: ["train:2:1", "train:3:1"],
      overLimit: false,
    });
  });
});
