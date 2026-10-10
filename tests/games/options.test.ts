import { describe, expect, it } from "vitest";
import { applyOptions, getBuiltInGame, mergePatch, optionWarnings, resolveOptions } from "../../src/domain/games";
import type { CompanyDef, GameDefinition } from "../../src/domain/games/schema";
import { miniGame } from "../helpers/miniGame";

/** Options as merge patches, company add/remove and subsets (data-model §1 "Applying options"). */

const gamma: CompanyDef = { ...miniGame.companies[0]!, id: "CC", shortName: "CC", name: "Gamma", aliases: [] };

const withOptions = (options: unknown[]): GameDefinition => ({ ...miniGame, options } as unknown as GameDefinition);

describe("mergePatch (RFC 7386)", () => {
  it("merges objects, replaces arrays and scalars, and deletes on null", () => {
    const target = { a: 1, b: { c: 2, d: [1, 2] }, e: "x" };
    expect(mergePatch(target, { a: 3, b: { d: [9], f: true }, e: null })).toEqual({ a: 3, b: { c: 2, d: [9], f: true } });
  });

  it("a non-object patch replaces the target", () => {
    expect(mergePatch({ a: 1 }, 5)).toBe(5);
    expect(mergePatch({ a: 1 }, [1])).toEqual([1]);
  });

  it("does not mutate the target", () => {
    const target = { a: { b: 1 } };
    mergePatch(target, { a: { b: 2 } });
    expect(target).toEqual({ a: { b: 1 } });
  });
});

describe("applyOptions with patches", () => {
  it("applies removeCompanies, then addCompanies, then patch, then addCustomRules", () => {
    const def = withOptions([
      {
        id: "mode",
        label: "Modo",
        default: "big",
        choices: [
          {
            value: "big",
            label: "Grande",
            removeCompanies: ["BB"],
            addCompanies: [gamma],
            // The patch sees the companies after add/remove: it replaces the whole array.
            patch: { bank: "unlimited", startingCash: { "3": 250 } },
            addCustomRules: [{ id: "forcedWithhold", config: {} }],
          },
        ],
      },
    ]);
    const out = applyOptions(def, {});
    expect(out.companies.map((c) => c.id)).toEqual(["AA", "CC"]);
    expect(out.bank).toBe("unlimited");
    expect(out.startingCash).toEqual({ "2": 300, "3": 250 });
    expect(out.customRules.map((r) => r.id)).toEqual(["forcedWithhold"]);
  });

  it("applies options in definition order: a later patch wins", () => {
    const def = withOptions([
      { id: "a", label: "A", default: "x", choices: [{ value: "x", label: "X", patch: { startingCash: { "2": 111 } } }] },
      { id: "b", label: "B", default: "y", choices: [{ value: "y", label: "Y", patch: { startingCash: { "2": 222 } } }] },
    ]);
    expect(applyOptions(def, {}).startingCash["2"]).toBe(222);
  });

  it("a companySubset value lists the companies kept; 'all' removes nothing", () => {
    const def = withOptions([
      {
        id: "inPlay",
        label: "En juego",
        default: "all",
        kind: "companySubset",
        from: ["AA", "BB"],
        choices: [{ value: "all", label: "Todas" }],
      },
    ]);
    expect(applyOptions(def, {}).companies.map((c) => c.id)).toEqual(["AA", "BB"]);
    expect(applyOptions(def, { inPlay: "BB" }).companies.map((c) => c.id)).toEqual(["BB"]);
    expect(resolveOptions(def, { inPlay: "BB" })).toEqual({ inPlay: "BB" });
    expect(resolveOptions(def, {})).toEqual({ inPlay: "all" });
  });

  it("a companySubset only removes eligible companies", () => {
    const def = withOptions([
      { id: "inPlay", label: "En juego", default: "all", kind: "companySubset", from: ["AA"], choices: [{ value: "all", label: "Todas" }] },
    ]);
    expect(applyOptions(def, { inPlay: "" }).companies.map((c) => c.id)).toEqual(["BB"]);
  });

  it("a patch that breaks the definition throws with the errors listed", () => {
    const def = withOptions([
      { id: "bad", label: "Bad", default: "x", choices: [{ value: "x", label: "X", patch: { trains: [] } }] },
    ]);
    expect(() => applyOptions(def, {})).toThrow(/trains/);
  });
});

describe("RotLA options other than mode and expansion (US1)", () => {
  const rotla = getBuiltInGame("rotla");
  const minors = (g: GameDefinition) => g.companies.filter((c) => c.tier === "minor").map((c) => c.id);

  it("minorsInPlay leaves only the listed minors (US1-4)", () => {
    const six = "AGR,EXP,TUN,RES,SUB,NPT";
    expect(minors(applyOptions(rotla, { minorsInPlay: six })).sort()).toEqual(six.split(",").sort());
    // Majors are not eligible, so they stay.
    expect(applyOptions(rotla, { minorsInPlay: six }).companies.filter((c) => c.tier === "major")).toHaveLength(6);
  });

  it("a minors count different from the mode's size is a warning only", () => {
    const options = { mode: "long", minorsInPlay: "AGR,EXP,TUN,RES,SUB,NPT" };
    expect(optionWarnings(rotla, options, 4).map((w) => w.code)).toEqual(["minorsInPlay"]);
    expect(() => applyOptions(rotla, options)).not.toThrow();
    expect(optionWarnings(rotla, { mode: "short" }, 4)).toEqual([]);
  });

  it("stockDrops: perShare drops once per share", () => {
    expect(applyOptions(rotla, {}).market.moves.sell.per).toBe("sale");
    expect(applyOptions(rotla, { stockDrops: "perShare" }).market.moves.sell.per).toBe("share");
  });

  it("bankBreak: on sets the bank, certificate limits and end triggers", () => {
    const g = applyOptions(rotla, { bankBreak: "on" });
    expect(g.bank).toEqual({ total: 8000 });
    expect(g.limits.certificates).toEqual({ "3": 16, "4": 12, "5": 10 });
    expect(g.endTriggers.map((t) => t.type).sort()).toEqual(["bankBroken", "bankruptcy", "cyclesComplete"]);
    expect(applyOptions(rotla, {}).bank).toBe("unlimited");
  });

  it("hostileMergers: on leaves the definition unchanged", () => {
    expect(applyOptions(rotla, { hostileMergers: "on" })).toEqual(applyOptions(rotla, { hostileMergers: "off" }));
  });

  it("headquarters: on adds the Sede payment to every major", () => {
    const g = applyOptions(rotla, { headquarters: "on" });
    for (const c of g.companies.filter((x) => x.tier === "major")) {
      expect(c.traits?.payments).toEqual([{ id: "headquarters", labelEs: "Sede", amount: 0, direction: "bankPays" }]);
    }
    expect(g.companies.find((c) => c.id === "TUN")?.traits?.payments?.map((p) => p.id)).toEqual(["tunneling"]);
    expect(applyOptions(rotla, {}).companies.find((c) => c.id === "CON")?.traits).toBeUndefined();
  });
});

describe("existing games are unchanged by applyOptions", () => {
  it.each([
    ["1830", {}],
    ["1830", { ruleset: "base" }],
    ["1830", { ruleset: "classic" }],
    ["1848", {}],
    ["21moon", { lateCompany: "KR" }],
    ["21moon", { lateCompany: "SWP" }],
  ] as const)("%s %j", (id, options) => {
    const g = getBuiltInGame(id);
    const out = applyOptions(g, options);
    // Same as before: only availableFrom (21Moon) and the chosen customRules differ.
    expect({ ...out, companies: undefined, customRules: undefined }).toEqual({ ...g, companies: undefined, customRules: undefined });
    expect(out.companies.map((c) => c.id)).toEqual(g.companies.map((c) => c.id));
    if (id === "21moon") {
      const late = (options as { lateCompany: string }).lateCompany;
      expect(out.companies.find((c) => c.id === late)?.availableFrom).toBe("SR3");
      expect(out.companies.filter((c) => c.availableFrom !== undefined)).toHaveLength(1);
    }
  });
});
