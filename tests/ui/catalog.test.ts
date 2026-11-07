import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { MessageContext, MessageParamsRecord } from "../../src/i18n/contract/domain";
import { DOMAIN_TEXT, UI_TEXT } from "../../src/i18n";
import { games as enGames } from "../../src/i18n/en/games";
import { messages as enMessages } from "../../src/i18n/en/messages";
import { games as esGames } from "../../src/i18n/es/games";
import { messages as esMessages } from "../../src/i18n/es/messages";
import { makePlayers } from "../helpers/dispatch";
import { sample } from "../helpers/messageSamples";

/**
 * Feature 014 T045 (SC-004, FR-012): every catalog is complete in both languages. No text is
 * empty, and no English text is a copy of the Spanish, apart from words both languages share.
 */

/** Words and labels that read the same in English and Spanish. */
const SAME_IN_BOTH = new Set([
  "IPO",
  "OR",
  "SR",
  "CR",
  "MR",
  "Pool",
  "pool",
  "Landmarks",
  "No",
  "OK",
  "1830 Classic",
  "Minor",
  "Minors",
  "Total",
  "Extra",
  " cert.",
]);

interface Finding {
  readonly path: string;
  readonly problem: string;
}

/** Walks two catalogs side by side: the same keys, no empty text, no untranslated copy. */
function compare(es: unknown, en: unknown, path: string, out: Finding[]): void {
  if (typeof es === "string" || typeof en === "string") {
    // Pieces around a badge ("Quiebra de ", "") may be empty or punctuation in either language.
    const piece = /\.\d+$/.test(path);
    if (typeof es !== "string" || typeof en !== "string") out.push({ path, problem: "missing in one language" });
    else if (piece || !/\p{L}/u.test(es + en)) return;
    else if (es.trim() === "" && en.trim() !== "") out.push({ path, problem: "empty Spanish" });
    else if (en.trim() === "" && es.trim() !== "") out.push({ path, problem: "empty English" });
    else if (en === es && es.trim() !== "" && !SAME_IN_BOTH.has(es)) out.push({ path, problem: `English equals Spanish: "${es}"` });
    return;
  }
  if (typeof es === "function" || typeof en === "function") {
    if (typeof es !== typeof en) out.push({ path, problem: "missing in one language" });
    // Text built from arguments is checked through its callers' tests.
    return;
  }
  if (es && en && typeof es === "object" && typeof en === "object") {
    const keys = new Set([...Object.keys(es), ...Object.keys(en)]);
    for (const key of keys) {
      if (key === "lang") continue;
      // Each language lists its own speech regions (FR-014a).
      if (`${path}.${key}` === "ui.settings.regions") continue;
      compare((es as Record<string, unknown>)[key], (en as Record<string, unknown>)[key], `${path}.${key}`, out);
    }
    return;
  }
  if (es !== en) out.push({ path, problem: "missing in one language" });
}

const ctx: MessageContext = { game: getBuiltInGame("1830"), players: makePlayers(["Ana", "Bruno", "Carla", "Dani"]) };

describe("catalogs (feature 014 T045)", () => {
  it("the UI text is complete in English and Spanish", () => {
    const out: Finding[] = [];
    compare(UI_TEXT.es, UI_TEXT.en, "ui", out);
    expect(out).toEqual([]);
  });

  it("the domain text is complete in English and Spanish", () => {
    const out: Finding[] = [];
    compare(DOMAIN_TEXT.es, DOMAIN_TEXT.en, "domain", out);
    expect(out).toEqual([]);
  });

  it("every message has its own English text", () => {
    const out: Finding[] = [];
    const codes = new Set([...Object.keys(esMessages), ...Object.keys(enMessages)]);
    for (const code of codes) {
      const es = (esMessages as unknown as Record<string, ((p: MessageParamsRecord, c: MessageContext) => string) | undefined>)[code];
      const en = (enMessages as unknown as Record<string, ((p: MessageParamsRecord, c: MessageContext) => string) | undefined>)[code];
      if (!es || !en) {
        out.push({ path: code, problem: "missing in one language" });
        continue;
      }
      compare(es(sample(code), ctx), en(sample(code), ctx), `messages.${code}`, out);
    }
    expect(out).toEqual([]);
  });

  it("every game text pack is complete in English and Spanish", () => {
    const out: Finding[] = [];
    compare(esGames, enGames, "games", out);
    expect(out).toEqual([]);
  });
});
