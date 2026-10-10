import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFixture } from "../../eval/voice/load";
import { applyOptions, getBuiltInGame } from "../../src/domain/games";
import { systemPromptEs } from "../../src/voice/prompt";
import {
  ACTION_TOOLS,
  buildToolSpecs,
  buildTools,
  GEMINI_SCHEMA_KEYWORDS,
  META_TOOLS,
  toAnthropicTools,
  toGeminiTools,
  voiceAction,
} from "../../src/voice/tools";
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

describe("RotLA tools (US10, T086)", () => {
  const rotla = { game: getBuiltInGame("rotla"), players: players.slice(0, 3) };
  const names = (s: { game: ReturnType<typeof getBuiltInGame>; players: typeof players }) => buildTools(s).map((t) => t.name);
  const rotlaTool = (name: string) => buildTools(rotla).find((t) => t.name === name)!.input_schema as Schema;

  it("offers the new actions, with Spanish examples", () => {
    const list = names(rotla);
    for (const n of ["launchCompany", "mergeCompanies", "startMR", "issueShares", "redeemShare", "forcedTrainPurchase", "namedPayment"]) {
      expect(list).toContain(n);
    }
    expect(list).not.toContain("parCompany");
    expect(list).not.toContain("takeLoan");
    const launch = buildTools(rotla).find((t) => t.name === "launchCompany")!;
    expect(launch.description).toContain("«Ana abre Tunneling por 140»");
  });

  it("merger fields are enums of minors and majors; payments of the game's abilities", () => {
    const merge = rotlaTool("mergeCompanies");
    expect(enumOf(props(merge)["a"])).toContain("TUN");
    expect(enumOf(props(merge)["a"])).not.toContain("CON");
    expect(enumOf(props(merge)["into"])).toEqual(["CON", "UNI", "SYS", "INT", "FED", "EXM"]);
    expect(enumOf(props(rotlaTool("namedPayment"))["payment"])).toEqual(["expansiveToken", "tunneling"]);
  });

  it("1830, 1848 and 21Moon keep exactly their tool lists", () => {
    const common = ["runAndPayout", "buyTrain", "payCost", "bankPays", "privateIncome", "buyPrivateByCompany"];
    const tail = ["transferMoney", "adjustMoney", "setMarket", "askClarification", "query", "notUnderstood", "undo", "amendLast", "confirmProposal"];
    expect(names(session("1830"))).toEqual([
      ...common,
      ...["parCompany", "buyShare", "sellShares", "buyPrivate", "exchangePrivate", "stockBatch", "startSR", "endSR", "startOR", "nextCompany"],
      "endGame",
      ...tail,
    ]);
    expect(names(session("1848"))).toEqual([
      ...common,
      ...["takeLoan", "nationalPayout", "parCompany", "buyShare", "sellShares", "buyPrivate", "exchangePrivate", "stockBatch"],
      ...["startSR", "endSR", "startOR", "nextCompany"],
      "endGame",
      ...tail,
    ]);
    expect(names(session("21moon"))).toEqual([
      ...common,
      ...["parCompany", "buyShare", "sellShares", "swapCertificates", "issueShares", "buyPrivate", "exchangePrivate", "stockBatch"],
      ...["startSR", "endSR", "startCR", "endCR", "startOR", "nextCompany"],
      "endGame",
      ...tail,
    ]);
  });

  it("Landmarks tools come only with the expansion", () => {
    const landmarkTools = ["rockFormation", "cliffSale", "canyonTrain"];
    for (const n of landmarkTools) expect(names(rotla)).not.toContain(n);
    const withExpansion = { game: applyOptions(getBuiltInGame("rotla"), { expansion: "landmarks" }), players: players.slice(0, 3) };
    for (const n of landmarkTools) expect(names(withExpansion)).toContain(n);
    const cliff = buildTools(withExpansion).find((t) => t.name === "cliffSale")!.input_schema as Schema;
    expect(enumOf(props(cliff)["train"])).toEqual(["2", "3", "4", "5", "6", "7", "M2"]);
  });
});

describe("endGame tool (feature 007, contracts/ui.md §5)", () => {
  it("is offered in every game, with no input fields and a Spanish description", () => {
    expect(ACTION_TOOLS).toContain("endGame");
    for (const id of ["1830", "1848", "21moon", "rotla"]) {
      const tool = buildTools(session(id)).find((t) => t.name === "endGame")!;
      expect(tool.description).toBe("Terminar la partida (fin del juego). Sin argumentos.");
      expect(props(tool.input_schema as Schema)).toEqual({});
      expect((tool.input_schema as Schema)["required"]).toEqual([]);
    }
  });

  it("the call resolves to { type: endGame, triggers: null }", () => {
    expect(voiceAction("endGame", {})).toEqual({ type: "endGame", triggers: null });
  });

  it("reopenGame is not a voice tool", () => {
    expect(ACTION_TOOLS).not.toContain("reopenGame");
    for (const id of ["1830", "rotla"]) expect(buildTools(session(id)).map((t) => t.name)).not.toContain("reopenGame");
  });
});

/**
 * T001: the offline Claude baseline (feature 005, SC-006). Taken on the pre-005 code; never
 * regenerate these files during the feature: tools and system prompt must stay byte-identical.
 */
const FIXTURE_DIR = "eval/voice/fixtures";
const FIXTURE_IDS = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

describe("Claude baseline snapshots (T001)", () => {
  it.each(FIXTURE_IDS)("%s: tools and system prompt", async (id) => {
    const { session } = loadFixture(FIXTURE_DIR, id);
    await expect(JSON.stringify(buildTools(session))).toMatchFileSnapshot(`./__snapshots__/tools-${id}.json`);
    await expect(systemPromptEs(session)).toMatchFileSnapshot(`./__snapshots__/prompt-${id}.txt`);
  });
});

describe("neutral tool specs (005 T006)", () => {
  it.each(FIXTURE_IDS)("%s: toAnthropicTools(buildToolSpecs) is byte-identical to the baseline", async (id) => {
    const { session } = loadFixture(FIXTURE_DIR, id);
    await expect(JSON.stringify(toAnthropicTools(buildToolSpecs(session)))).toMatchFileSnapshot(`./__snapshots__/tools-${id}.json`);
  });

  it.each(FIXTURE_IDS)("%s: specs are { name, description, schema } in ACTION_TOOLS order, then META_TOOLS", (id) => {
    const { session } = loadFixture(FIXTURE_DIR, id);
    const specs = buildToolSpecs(session);
    for (const spec of specs) expect(Object.keys(spec).sort()).toEqual(["description", "name", "schema"]);
    const names = specs.map((s) => s.name);
    const actions = names.slice(0, names.length - META_TOOLS.length);
    expect(names.slice(actions.length)).toEqual([...META_TOOLS]);
    expect(actions).toEqual(ACTION_TOOLS.filter((t) => actions.includes(t)));
  });
});

/**
 * 005 T020: Gemini declarations carry the same tools as Claude's, as `parametersJsonSchema`,
 * with only allowlisted keywords. The allowlist was accepted by every 2026-10-10 eval call.
 */
const ALLOWED = ["type", "properties", "required", "enum", "anyOf", "items", "description", "additionalProperties", "minimum", "maximum", "const", "minItems"];

/** Every keyword of a schema node (property names under `properties` are not keywords). */
function keywordsOf(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keywordsOf(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      if (k === "properties") Object.values(v as Schema).forEach((p) => keywordsOf(p, out));
      else keywordsOf(v, out);
    }
  }
  return out;
}

describe("Gemini tools (005 T020)", () => {
  it("the adapter's allowlist is the one this test checks", () => {
    expect([...GEMINI_SCHEMA_KEYWORDS].sort()).toEqual([...ALLOWED].sort());
  });

  it.each(FIXTURE_IDS)("%s: one functionDeclarations entry with Claude's names, order, descriptions and enums", (id) => {
    const { session } = loadFixture(FIXTURE_DIR, id);
    const gemini = toGeminiTools(buildToolSpecs(session));
    const claude = buildTools(session);
    expect(gemini).toHaveLength(1);
    const declarations = gemini[0].functionDeclarations;
    expect(declarations.map((d) => d.name)).toEqual(claude.map((t) => t.name));
    expect(declarations.map((d) => d.description)).toEqual(claude.map((t) => t.description));
    declarations.forEach((d, i) => {
      expect(Object.keys(d).sort()).toEqual(["description", "name", "parametersJsonSchema"]);
      const schema = d.parametersJsonSchema as Schema;
      const claudeSchema = claude[i]!.input_schema as Schema;
      for (const key of Object.keys(props(claudeSchema))) {
        expect(enumOf(props(schema)[key]), `${d.name}.${key}`).toEqual(enumOf(props(claudeSchema)[key]));
      }
      for (const k of keywordsOf(schema)) expect(ALLOWED, `${d.name} uses ${k}`).toContain(k);
    });
  });

  it("drops keywords outside the allowlist", () => {
    const [tools] = toGeminiTools([{ name: "x", description: "d", schema: { type: "object", properties: { a: { type: "string", format: "date", pattern: "x" } }, $defs: {} } }]);
    expect(tools.functionDeclarations[0]!.parametersJsonSchema).toEqual({ type: "object", properties: { a: { type: "string" } } });
  });
});
