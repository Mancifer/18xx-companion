import { describe, expect, it } from "vitest";
import { builtInGames, getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { GameTextPack } from "../../src/i18n/contract/games";
import { games as enPacks } from "../../src/i18n/en/games";
import { games as esPacks } from "../../src/i18n/es/games";
import { gameText } from "../../src/i18n/gameText";

/** Feature 014 T020 (data-model §6): every built-in game's display text, in both languages. */

/** Every display text a definition holds, keyed as its pack keys it. */
function definitionTexts(game: GameDefinition): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of game.options) {
    out.set(`options.${o.id}.label`, o.label);
    // 21Moon's late company choices are company ids: proper nouns, no translation.
    if (o.choices.some((c) => c.label !== c.value)) for (const c of o.choices) out.set(`options.${o.id}.choices.${c.value}`, c.label);
  }
  for (const r of game.revenueParts) out.set(`revenueParts.${r.id}`, r.label);
  for (const p of game.phases) if (p.color) out.set(`phases.${p.id}`, p.color);
  for (const rule of game.customRules) {
    const question = rule.config["question"];
    if (typeof question === "string") out.set(`rules.${rule.id}.question`, question);
  }
  const walk = (node: unknown, slot?: string): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, slot);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o["labelEs"] === "string" && typeof o["id"] === "string") out.set(`payments.${o["id"]}`, o["labelEs"]);
    const at = typeof o["at"] === "string" ? o["at"] : slot;
    if (o["type"] === "note" && typeof o["text"] === "string" && at) out.set(`notes.${at}`, o["text"]);
    for (const v of Object.values(o)) walk(v, at);
  };
  walk(game);
  return out;
}

function packTexts(pack: GameTextPack | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, o] of Object.entries(pack?.options ?? {})) {
    out.set(`options.${id}.label`, o.label);
    for (const [value, label] of Object.entries(o.choices ?? {})) out.set(`options.${id}.choices.${value}`, label);
  }
  for (const [group, record] of [
    ["revenueParts", pack?.revenueParts],
    ["payments", pack?.payments],
    ["notes", pack?.notes],
    ["phases", pack?.phases],
  ] as const) {
    for (const [id, text] of Object.entries(record ?? {})) out.set(`${group}.${id}`, text);
  }
  for (const [rule, fields] of Object.entries(pack?.rules ?? {})) for (const [field, text] of Object.entries(fields)) out.set(`rules.${rule}.${field}`, text);
  return out;
}

describe("game text packs", () => {
  for (const game of builtInGames) {
    it(`${game.id}: every display text has Spanish (verbatim) and English, with no orphan entries`, () => {
      const def = definitionTexts(game);
      const es = packTexts(esPacks[game.id]);
      const en = packTexts(enPacks[game.id]);
      expect(Object.fromEntries(es)).toEqual(Object.fromEntries(def));
      expect([...en.keys()].sort()).toEqual([...def.keys()].sort());
      for (const [key, text] of en) expect(text, key).not.toBe("");
    });
  }

  it("looks text up by id in each language", () => {
    const rotla = getBuiltInGame("rotla");
    expect(gameText(rotla, "en").option("mode")).toBe("Mode");
    expect(gameText(rotla, "es").option("mode")).toBe("Modo");
    expect(gameText(rotla, "en").choice("hostileMergers", "on")).toBe("Yes");
    expect(gameText(rotla, "en").payment("tunneling", "Montaña")).toBe("Mountain");
    expect(gameText(rotla, "en").phase("green")).toBe("Green");
    expect(gameText(getBuiltInGame("1848"), "en").ruleText("manualFloatCondition", "question")).toBe("Is there a Sydney–Adelaide link?");
    const moon = getBuiltInGame("21moon");
    expect(gameText(moon, "en").revenuePart("spacePort")).toBe("Space port");
    expect(gameText(moon, "en").noteFromStored("El puerto espacial vale 30")).toBe("The space port is worth 30");
    expect(gameText(moon, "en").noteFromStored("otra cosa")).toBeUndefined();
  });

  it("a session's old copy of a definition still gets the current wording", () => {
    const base = getBuiltInGame("1830");
    const old = { ...base, revenueParts: [{ id: "revenue", label: "Recaudación", to: "choice" as const }] };
    expect(gameText(old, "en").revenuePart("revenue")).toBe("Revenue");
  });

  it("a custom game shows its own text in both languages", () => {
    const base = getBuiltInGame("1830");
    const custom: GameDefinition = { ...base, id: "my-game", revenueParts: [{ id: "revenue", label: "Plata", to: "choice" }] };
    expect(gameText(custom, "en").revenuePart("revenue")).toBe("Plata");
    expect(gameText(custom, "es").revenuePart("revenue")).toBe("Plata");
    expect(gameText(custom, "en").option("ruleset")).toBe("Reglas");
    expect(gameText(custom, "en").payment("unknown", "Algo")).toBe("Algo");
  });
});
