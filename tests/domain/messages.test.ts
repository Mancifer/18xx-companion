import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { Warning } from "../../src/domain/actions/schemas";
import type { MessageContext } from "../../src/i18n/contract/domain";
import { messages as en } from "../../src/i18n/en/messages";
import { messages as es } from "../../src/i18n/es/messages";
import { renderMessage, renderWarning } from "../../src/i18n/render";
import { makePlayers } from "../helpers/dispatch";
import { sample } from "../helpers/messageSamples";

/** Feature 014 T019 (data-model §4): every domain message, in both languages. */

const ctx: MessageContext = { game: getBuiltInGame("1830"), players: makePlayers(["Ana", "Bruno", "Carla", "Dani"]) };


const codes = Object.keys(es).sort();

describe("domain messages", () => {
  it("both languages have exactly the same codes", () => {
    expect(Object.keys(en).sort()).toEqual(codes);
    expect(codes.length).toBeGreaterThan(150);
  });

  for (const code of codes) {
    it(`${code} renders in both languages`, () => {
      for (const lang of ["es", "en"] as const) {
        const text = renderMessage({ code, params: sample(code) }, ctx, lang);
        expect(text.trim(), lang).not.toBe("");
        expect(text, lang).not.toMatch(/undefined|NaN|\{|\}|(player|company|ipo):\S|\[object/);
      }
    });
  }

  it("English differs from Spanish for every code", () => {
    const same = codes.filter(
      (code) => renderMessage({ code, params: sample(code) }, ctx, "en") === renderMessage({ code, params: sample(code) }, ctx, "es"),
    );
    expect(same).toEqual([]);
  });

  it("money follows each language's separator", () => {
    expect(renderMessage({ code: "insufficientCash", params: { have: 1200 } }, ctx, "es")).toBe("Solo tiene $1.200; quedará en negativo.");
    expect(renderMessage({ code: "insufficientCash", params: { have: 1200 } }, ctx, "en")).toBe("Only has $1,200; will go negative.");
  });

  it("names come from the session: players, holders and companies", () => {
    expect(renderMessage({ code: "eliminatedPlayer", params: { player: "p2" } }, ctx, "en")).toBe("Bruno is no longer in the game (bankrupt).");
    expect(renderMessage({ code: "private.noTrading", params: { private: "SV", owner: "player:p1" } }, ctx, "es")).toBe(
      "La SV ya es de Ana; en 1830 las privadas no se traspasan",
    );
  });

  it("a wrapping message renders its inner reason in the same language", () => {
    const inner = { code: "buy.noneLeft", params: { source: "pool" } };
    expect(renderMessage({ code: "compound.stepUnavailable", params: { index: 2 }, inner }, ctx, "es")).toBe("Acción 2: No quedan acciones en el pool");
    expect(renderMessage({ code: "compound.stepUnavailable", params: { index: 2 }, inner }, ctx, "en")).toBe("Action 2: No shares left in the pool");
  });
});

describe("stored warnings (data-model §4)", () => {
  const stored = (w: Partial<Warning>): Warning => ({ code: "trainLimit", messageEs: "texto guardado", severity: "warn", ...w });

  it("with params, a known code is rebuilt in the display language", () => {
    const w = stored({ params: { count: 5, limit: 4 } });
    expect(renderWarning(w, ctx, "en")).toBe("With this train it would have 5; the limit is 4.");
    expect(renderWarning(w, ctx, "es")).toBe("Con este tren tendría 5; el límite es 4.");
  });

  it("without params (saved before 0.2.0), the stored Spanish text is shown", () => {
    expect(renderWarning(stored({}), ctx, "en")).toBe("texto guardado");
  });

  it("an unknown code (a newer app's) shows the stored text, never the code", () => {
    expect(renderWarning(stored({ code: "fromTheFuture", params: {} }), ctx, "en")).toBe("texto guardado");
  });
});
