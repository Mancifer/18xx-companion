import { describe, expect, it } from "vitest";
import { cashOf } from "../../src/domain/events/state";
import { getBuiltInGame } from "../../src/domain/games";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { buy, endSR, par, sell, startSR } from "../helpers/stock";

/** FR-023: full (onFloat / endOfSR) and incremental capitalization; float counting. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const start = (id: string) => TestSession.start(getBuiltInGame(id), players).do(startSR);

describe("full capitalization", () => {
  it("1848 onFloat: 10 × par is paid the moment 60% has left the IPO (§5.2.2)", () => {
    const s = start("1848").do(par("p1", "QR", 80)).do(buy("p2", "QR", "ipo", 2)).do(buy("p3", "QR", "ipo", 1));
    expect(s.state.companies["QR"]!.status).toBe("parred");
    expect(cashOf(s.state, "company:QR")).toBe(0);
    s.do(buy("p4", "QR"));
    expect(s.state.companies["QR"]!.status).toBe("floated");
    expect(cashOf(s.state, "company:QR")).toBe(800);
    expect(s.violations()).toEqual([]);
  });

  it("1830 endOfSR: floated at 60% with capital pending, paid at the end of the SR (§6.3, quickstart 13)", () => {
    const s = start("1830").do(par("p1", "PRR", 100)).do(buy("p2", "PRR", "ipo", 2)).do(buy("p3", "PRR", "ipo", 2));
    expect(s.state.companies["PRR"]).toMatchObject({ status: "floated", capitalPending: true });
    expect(cashOf(s.state, "company:PRR")).toBe(0);
    s.do(endSR);
    expect(s.state.companies["PRR"]).toMatchObject({ status: "floated", capitalPending: false });
    expect(cashOf(s.state, "company:PRR")).toBe(1000);
    expect(s.violations()).toEqual([]);
  });

  it("capital is paid only once", () => {
    const s = start("1830").do(par("p1", "PRR", 100)).do(buy("p2", "PRR", "ipo", 4)).do(endSR);
    s.do(startSR).do(buy("p3", "PRR")).do(endSR);
    expect(cashOf(s.state, "company:PRR")).toBe(1000);
  });
});

describe("incremental capitalization (21Moon §9.2)", () => {
  it("par and each IPO purchase pay the company at the market price", () => {
    const s = start("21moon").do(par("p1", "VH", 70));
    expect(cashOf(s.state, "company:VH")).toBe(140);
    s.do(buy("p2", "VH")).do(buy("p3", "VH")).do(buy("p4", "VH"));
    expect(cashOf(s.state, "company:VH")).toBe(350);
    expect(s.state.companies["VH"]!.status).toBe("floated");
  });

  it("pool purchases pay the Bank", () => {
    const s = start("21moon").do(par("p1", "VH", 70)).do(buy("p2", "VH")).do(sell("p2", "VH", 1));
    const before = cashOf(s.state, "company:VH");
    s.do(buy("p3", "VH", "pool"));
    expect(cashOf(s.state, "company:VH")).toBe(before);
  });
});

describe("float counting (floatCounts: soldFromIpo)", () => {
  it("shares later sold to the pool still count as having left the IPO", () => {
    const s = start("1848").do(par("p1", "QR", 70)).do(buy("p2", "QR", "ipo", 3)).do(sell("p2", "QR", 2));
    expect(s.state.companies["QR"]!.status).toBe("parred");
    s.do(buy("p3", "QR"));
    expect(s.state.companies["QR"]!.status).toBe("floated");
  });

  it("shares granted by a private count (1830 CA grants 10% PRR)", () => {
    const s = start("1830");
    s.apply({ t: "turnAdvance", round: "PRIVATES" });
    s.do({ type: "buyPrivate", buyer: "p2", private: "CA", price: 160, par: null });
    s.do(startSR).do(par("p1", "PRR", 100)).do(buy("p3", "PRR", "ipo", 3));
    expect(s.state.companies["PRR"]!.status).toBe("floated");
  });
});

describe("manualFloatCondition (1848 COM)", () => {
  it("60% is not enough until the table confirms the Sydney–Adelaide link", () => {
    const s = start("1848").do(par("p1", "COM", 70)).do(buy("p2", "COM", "ipo", 4));
    expect(s.state.companies["COM"]!.status).toBe("parred");
    s.do({ type: "confirmFloatCondition", company: "COM" });
    expect(s.state.companies["COM"]).toMatchObject({ status: "floated", floatConfirmed: true });
    expect(cashOf(s.state, "company:COM")).toBe(700);
  });

  it("confirming first floats it as soon as 60% is sold", () => {
    const s = start("1848").do(par("p1", "COM", 70)).do({ type: "confirmFloatCondition", company: "COM" });
    expect(s.state.companies["COM"]!.status).toBe("parred");
    s.do(buy("p2", "COM", "ipo", 4));
    expect(s.state.companies["COM"]!.status).toBe("floated");
  });

  it("the condition is dropped at phase 6", () => {
    const s = start("1848");
    s.apply({ t: "turnAdvance", phase: "6" });
    s.do(par("p1", "COM", 70)).do(buy("p2", "COM", "ipo", 4));
    expect(s.state.companies["COM"]!.status).toBe("floated");
  });

  it("confirmFloatCondition is only offered for the configured company", () => {
    const s = start("1848");
    expect(s.tryDo({ type: "confirmFloatCondition", company: "QR" }).kind).toBe("unavailable");
    expect(TestSession.start(getBuiltInGame("1830"), players).tryDo({ type: "confirmFloatCondition", company: "PRR" }).kind).toBe(
      "unavailable",
    );
  });
});
