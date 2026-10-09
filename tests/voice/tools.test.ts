import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import { buildTools } from "../../src/voice/tools";
import { makePlayers } from "../helpers/dispatch";

/** contracts/voice-tools.md: strict tools generated from the action schemas. */

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
const session = (id: string) => ({ game: getBuiltInGame(id), players });
const toolNamed = (id: string, name: string) => {
  const tool = buildTools(session(id)).find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool;
};
type Schema = Record<string, unknown>;
const props = (s: Schema) => s["properties"] as Record<string, Schema>;

/** Every enum reachable from a property (directly, through anyOf, or in array items). */
function enumOf(s: Schema | undefined): unknown[] {
  if (!s) return [];
  if (Array.isArray(s["enum"])) return s["enum"] as unknown[];
  if (Array.isArray(s["anyOf"])) return (s["anyOf"] as Schema[]).flatMap(enumOf);
  return [];
}

function walkObjects(s: unknown, visit: (o: Schema) => void) {
  if (!s || typeof s !== "object") return;
  const o = s as Schema;
  if (o["type"] === "object") visit(o);
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((x) => walkObjects(x, visit));
    else walkObjects(v, visit);
  }
}

describe("buildTools", () => {
  it("one strict tool per action; every object closed, every property required", () => {
    for (const id of ["1830", "1848", "21moon"]) {
      for (const tool of buildTools(session(id))) {
        expect(tool.strict).toBe(true);
        walkObjects(tool.input_schema, (o) => {
          expect(o["additionalProperties"]).toBe(false);
          expect([...((o["required"] as string[] | undefined) ?? [])].sort()).toEqual(Object.keys(props(o)).sort());
        });
      }
    }
  });

  it("optional fields are nullable and still required", () => {
    const run = toolNamed("1830", "runAndPayout").input_schema as Schema;
    expect((run["required"] as string[]).includes("company")).toBe(true);
    expect(JSON.stringify(props(run)["company"])).toContain('"null"');
    expect(JSON.stringify(props(run)["mode"])).toContain('"null"');
  });

  it("entity fields are enums of this session's ids", () => {
    const run = toolNamed("1830", "runAndPayout").input_schema as Schema;
    expect(enumOf(props(run)["company"])).toEqual(expect.arrayContaining(["PRR", "B&O", "Erie"]));
    const par = toolNamed("1830", "parCompany").input_schema as Schema;
    expect(enumOf(props(par)["player"])).toEqual(["p1", "p2", "p3", "p4"]);
    const train = toolNamed("1830", "buyTrain").input_schema as Schema;
    expect(enumOf(props(train)["trainType"])).toEqual(["2", "3", "4", "5", "6", "D"]);
    const priv = toolNamed("1830", "buyPrivate").input_schema as Schema;
    expect(enumOf(props(priv)["private"])).toEqual(["SV", "CS", "DH", "MH", "CA", "BO"]);
    const buy = toolNamed("1830", "buyShare").input_schema as Schema;
    expect(enumOf(props(buy)["buyer"])).toEqual(["player:p1", "player:p2", "player:p3", "player:p4"]);
    const buy21 = toolNamed("21moon", "buyShare").input_schema as Schema;
    expect(enumOf(props(buy21)["buyer"])).toContain("company:VH");
  });

  it("tools for actions the game does not offer are omitted", () => {
    const names1830 = buildTools(session("1830")).map((t) => t.name);
    expect(names1830).not.toContain("takeLoan");
    expect(names1830).not.toContain("nationalPayout");
    expect(names1830).not.toContain("issueShares");
    expect(names1830).not.toContain("startCR");
    expect(names1830).not.toContain("swapCertificates");
    const names1848 = buildTools(session("1848")).map((t) => t.name);
    expect(names1848).toContain("takeLoan");
    expect(names1848).toContain("nationalPayout");
    const names21 = buildTools(session("21moon")).map((t) => t.name);
    expect(names21).toContain("issueShares");
    expect(names21).toContain("swapCertificates");
  });

  it("21Moon runAndPayout takes the two revenue parts", () => {
    const run = toolNamed("21moon", "runAndPayout").input_schema as Schema;
    const parts = props(run)["parts"] as Schema;
    const item = parts["items"] as Schema;
    expect(enumOf(props(item)["part"])).toEqual(["local", "spacePort"]);
    const run1830 = toolNamed("1830", "runAndPayout").input_schema as Schema;
    expect(enumOf(props((props(run1830)["parts"] as Schema)["items"] as Schema)["part"])).toEqual(["revenue"]);
  });

  it("meta tools: clarification, query, not understood, ledger operations", () => {
    const names = buildTools(session("1830")).map((t) => t.name);
    for (const n of ["askClarification", "query", "notUnderstood", "undo", "amendLast", "confirmProposal"]) {
      expect(names).toContain(n);
    }
    const query = toolNamed("1830", "query").input_schema as Schema;
    expect(enumOf(props(query)["kind"])).toEqual(["cash", "shares", "price", "treasury", "trains", "bank", "president", "turn"]);
  });

  it("descriptions are in Spanish with example phrases", () => {
    const run = toolNamed("1830", "runAndPayout");
    expect(run.description).toMatch(/«.+»/);
  });

  it("uses only schema keywords strict mode accepts", () => {
    const json = JSON.stringify(buildTools(session("1848")));
    for (const keyword of ["oneOf", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "pattern", "$schema", "maxItems"]) {
      expect(json).not.toContain(`"${keyword}"`);
    }
  });

  it("serialization is byte-identical for the same session, with sorted keys", () => {
    const a = JSON.stringify(buildTools(session("1830")));
    const b = JSON.stringify(buildTools(session("1830")));
    expect(a).toBe(b);
    const first = buildTools(session("1830"))[0]!;
    expect(Object.keys(first)).toEqual([...Object.keys(first)].sort());
  });
});
