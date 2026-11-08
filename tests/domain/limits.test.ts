import { describe, expect, it } from "vitest";
import { certificateStatus } from "../../src/domain/actions/limits";
import { getBuiltInGame } from "../../src/domain/games";
import { makePlayers, TestSession } from "../helpers/dispatch";
import { rotlaSession, seedCompany } from "../helpers/rotla";
import { seedCompany as seed1830 } from "../helpers/seed";
import { buy, sell } from "../helpers/stock";

/** RotLA holding limits and stock warnings (US3, FR-025): exactly one warning, never a block. */

function onlyWarning(s: TestSession, action: unknown): string[] {
  const result = s.tryDo(action);
  expect(result.kind).toBe("ok");
  return result.kind === "ok" ? result.warnings.map((w) => w.code) : [];
}

const minor = (s: TestSession, id: string, holders: Record<string, number>, operated = true) =>
  seedCompany(s, id, { price: 80, holders, operated });

describe("RotLA limits (US3)", () => {
  it("one purchase of 2 shares warns maxSharesPerBuy", () => {
    const s = minor(rotlaSession(), "EXP", { "player:p1": 2, "company:EXP": 3 });
    expect(onlyWarning(s, buy("p2", "EXP", "treasury", 2))).toEqual(["maxSharesPerBuy"]);
  });

  it("a player above 60% warns companyLimit", () => {
    const s = minor(rotlaSession(), "EXP", { "player:p1": 3, "company:EXP": 2 });
    expect(onlyWarning(s, buy("p1", "EXP", "treasury"))).toEqual(["companyLimit"]);
  });

  it("the pool above 50% warns poolLimit", () => {
    const s = seedCompany(rotlaSession(), "CON", {
      price: 100,
      holders: { "player:p1": 3, "player:p2": 2, pool: 5 },
      operated: true,
    });
    expect(onlyWarning(s, sell("p2", "CON", 1))).toEqual(["poolLimit"]);
  });

  it("selling a company that has not operated warns notOperated", () => {
    const s = minor(rotlaSession(), "EXP", { "player:p1": 2, "player:p2": 1, "company:EXP": 2 }, false);
    expect(onlyWarning(s, sell("p2", "EXP", 1))).toEqual(["notOperated"]);
  });

  it("buying a company the player sold in this SR warns boughtAfterSelling", () => {
    const s = minor(rotlaSession(), "EXP", { "player:p1": 2, "player:p2": 1, "company:EXP": 2 });
    s.do(sell("p2", "EXP", 1));
    expect(onlyWarning(s, buy("p2", "EXP", "pool"))).toEqual(["boughtAfterSelling"]);
  });

  it("the certificate limit applies only with bankBreak", () => {
    const loaded = (options: Record<string, string>) => {
      const s = rotlaSession({ options });
      for (const id of ["CON", "UNI", "SYS", "INT"]) {
        seedCompany(s, id, { price: 100, holders: { "player:p1": 6, "player:p2": 4 }, operated: true });
      }
      return minor(s, "EXP", { "player:p2": 2, "company:EXP": 3 });
    };
    // Ana holds 4 × (president + 4) = 20 certificates.
    expect(onlyWarning(loaded({ bankBreak: "on" }), buy("p1", "EXP", "treasury"))).toEqual(["certificateLimit"]);
    expect(onlyWarning(loaded({}), buy("p1", "EXP", "treasury"))).toEqual([]);
  });
});

describe("certificateStatus (016 US2, data-model)", () => {
  const g1830 = getBuiltInGame("1830");
  const four = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
  const start = () => TestSession.start(g1830, four);
  // Row 0 counts toward the limit; row 2, col 1 is the 1830 yellow zone (§5.4).
  const plain = (i: number) => ({ row: 0, col: 6 + i });
  const yellow = { row: 2, col: 1 };

  it("a presidency (2 units) plus two shares: 40%, 3 certificates", () => {
    const s = seed1830(start(), "PRR", { cell: plain(0), holders: { "player:p1": 4 } });
    const status = certificateStatus(g1830, s.state, "p1", 4);
    expect(status.rows).toEqual([{ company: "PRR", units: 4, percent: 40, certificates: 3, president: true, counts: true }]);
    expect(status).toMatchObject({ total: 3, counted: 3, limit: 16, level: "under" });
  });

  it("a non-president holder counts one card per share", () => {
    const s = seed1830(start(), "PRR", { cell: plain(0), holders: { "player:p1": 2, "player:p2": 3 } });
    expect(certificateStatus(g1830, s.state, "p2", 4).rows).toEqual([
      { company: "PRR", units: 3, percent: 30, certificates: 3, president: false, counts: true },
    ]);
  });

  it("a yellow-zone company is listed but doesn't count toward the limit", () => {
    const s = start();
    seed1830(s, "PRR", { cell: plain(0), holders: { "player:p1": 4 } });
    seed1830(s, "NYC", { cell: yellow, holders: { "player:p2": 2, "player:p1": 3 } });
    const status = certificateStatus(g1830, s.state, "p1", 4);
    expect(status.rows.map((r) => [r.company, r.certificates, r.counts])).toEqual([
      ["PRR", 3, true],
      ["NYC", 3, false],
    ]);
    expect(status).toMatchObject({ total: 6, counted: 3 });
  });

  it("rows follow the game definition and skip companies not held", () => {
    const s = start();
    seed1830(s, "B&O", { cell: plain(0), holders: { "player:p1": 2 } });
    seed1830(s, "PRR", { cell: plain(1), holders: { "player:p1": 2 } });
    seed1830(s, "NYC", { cell: plain(2), holders: { "player:p2": 2 } });
    const order = g1830.companies.map((c) => c.id).filter((id) => id === "PRR" || id === "B&O");
    expect(certificateStatus(g1830, s.state, "p1", 4).rows.map((r) => r.company)).toEqual(order);
  });

  it("level: under, at and over the limit", () => {
    // 4 presidencies + 2 shares each = 12; then 4 or 5 more in a fifth company.
    const loaded = (extra: number) => {
      const s = start();
      ["PRR", "NYC", "CPR", "B&O"].forEach((c, i) => seed1830(s, c, { cell: plain(i), holders: { "player:p1": 4 } }));
      return seed1830(s, "C&O", { cell: { row: 1, col: 6 }, holders: { "player:p1": extra + 1 } });
    };
    expect(certificateStatus(g1830, loaded(3).state, "p1", 4)).toMatchObject({ counted: 15, level: "under" });
    expect(certificateStatus(g1830, loaded(4).state, "p1", 4)).toMatchObject({ counted: 16, level: "at" });
    expect(certificateStatus(g1830, loaded(5).state, "p1", 4)).toMatchObject({ counted: 17, level: "over" });
  });

  it("no limit for the player count (plain RotLA): no limit, level under", () => {
    const s = seedCompany(rotlaSession(), "CON", { price: 100, holders: { "player:p1": 6 }, operated: true });
    const status = certificateStatus(s.game, s.state, "p1", s.players.length);
    expect(status.limit).toBeUndefined();
    expect(status.level).toBe("under");
    expect(status.total).toBeGreaterThan(0);
  });

  it("a player without shares has no rows", () => {
    expect(certificateStatus(g1830, start().state, "p1", 4)).toMatchObject({ rows: [], total: 0, counted: 0, level: "under" });
  });
});
