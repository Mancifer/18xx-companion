import { describe, expect, it } from "vitest";
import { mergerRoundDue } from "../../src/domain/mechanics/schedule";
import { rotlaSession, seedCompany } from "../helpers/rotla";

/** Cycles: SR n, OR n.1, OR n.2, MR n when due (US7, US8, research R7, B p.18–19). */

/** A RotLA session at the start of OR n.2 of cycle 1, with two minors and a major in play. */
function atOR2(phase = "yellow") {
  const s = rotlaSession();
  seedCompany(s, "EXP", { price: 80, holders: { "player:p1": 5 } });
  seedCompany(s, "TUN", { price: 90, holders: { "player:p2": 5 } });
  seedCompany(s, "CON", { price: 100, holders: { "player:p3": 10 } });
  s.do({ type: "startOR" }).do({ type: "startOR" });
  s.apply({ t: "turnAdvance", phase });
  return s;
}

describe("mergerRoundDue", () => {
  it("is false after OR 2 in yellow and true from green on", () => {
    expect(mergerRoundDue(atOR2("yellow").game, atOR2("yellow").state)).toBe(false);
    for (const phase of ["green", "green4", "purple", "grey"]) {
      const s = atOR2(phase);
      expect(s.state.turn).toMatchObject({ round: "OR", orIndex: 2, orsInSet: 2 });
      expect(mergerRoundDue(s.game, s.state)).toBe(true);
    }
  });

  it("is false during OR 1 even in green", () => {
    const s = rotlaSession().do({ type: "startOR" });
    s.apply({ t: "turnAdvance", phase: "green" });
    expect(mergerRoundDue(s.game, s.state)).toBe(false);
  });

  it("US7-6: yellow at the end of OR 2 gives no Merger Round; the export starts green; the next OR 2 has one", () => {
    const s = rotlaSession();
    // Every 2 has already been bought or exported: the top of the stack is a 3.
    for (let n = 1; n <= 7; n++) s.apply({ t: "assetTransfer", asset: `train:2:${n}`, from: "bank", to: "removed" });
    s.do({ type: "startOR" }).do({ type: "startOR" });
    expect(mergerRoundDue(s.game, s.state)).toBe(false);
    s.do({ type: "startSR" });
    expect(s.state.turn.phase).toBe("green");
    expect(s.state.assets["train:3:1"]).toBe("removed");
    s.do({ type: "startOR" }).do({ type: "startOR" });
    expect(mergerRoundDue(s.game, s.state)).toBe(true);
  });
});

describe("startMR", () => {
  it("is unavailable when no Merger Round is due", () => {
    expect(atOR2("yellow").tryDo({ type: "startMR" }).kind).toBe("unavailable");
  });

  it("ends the OR (nothing to do) and starts the MR with the minors in operating order", () => {
    const s = atOR2("green").do({ type: "startMR" });
    expect(s.lastEvents).toEqual([
      { t: "turnAdvance", round: "MR", scheduleIndex: 3, company: null, operatingOrder: ["TUN", "EXP"] },
    ]);
    expect(s.state.turn.round).toBe("MR");
    expect(s.state.turn.srNumber).toBe(1);
  });
});
