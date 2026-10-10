import { describe, expect, it } from "vitest";
import type { TestSession } from "../helpers/dispatch";
import { rotlaSession, seedCompany } from "../helpers/rotla";
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
