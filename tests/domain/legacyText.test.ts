import { describe, expect, it } from "vitest";
import type { Warning } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import { domainText } from "../../src/i18n";
import type { MessageContext } from "../../src/i18n/contract/domain";
import { renderWarning } from "../../src/i18n/render";
import { makePlayers } from "../helpers/dispatch";

/**
 * Feature 014 T054 (data-model §4, §5): text saved by older versions still reads in the current
 * language when it can be rebuilt, and shows as stored when it can't. User text never changes.
 */

const ctx: MessageContext = { game: getBuiltInGame("rotla"), players: makePlayers(["Ana", "Bruno", "Carla"]) };
const warning = (w: Partial<Warning> & Pick<Warning, "code" | "messageEs">): Warning => ({ severity: "warn", ...w });

describe("stored warnings (data-model §4)", () => {
  it("a code that needs params, saved without them (before 0.2.0), shows its stored Spanish", () => {
    const w = warning({ code: "end.cyclesComplete", messageEs: "Fin de la partida: se completaron los 6 ciclos." });
    expect(renderWarning(w, ctx, "en")).toBe("Fin de la partida: se completaron los 6 ciclos.");
  });

  it("the same code with params reads in English", () => {
    const w = warning({ code: "end.cyclesComplete", messageEs: "Fin de la partida: se completaron los 6 ciclos.", params: { cycles: 6 } });
    expect(renderWarning(w, ctx, "en")).not.toBe(w.messageEs);
    expect(renderWarning(w, ctx, "en")).toMatch(/6/);
    expect(renderWarning(w, ctx, "es")).toBe(w.messageEs);
  });

  it("a code with no params reads in English even when saved without params", () => {
    const w = warning({ code: "end.bankBroken", messageEs: "Banca quebrada: se termina el set de rondas de operaciones." });
    expect(renderWarning(w, ctx, "en")).not.toBe(w.messageEs);
    expect(renderWarning(w, ctx, "en")).toMatch(/bank/i);
  });

  it("a code this version doesn't know (from a newer one) shows the stored text, never the code", () => {
    const w = warning({ code: "future.somethingNew", messageEs: "Algo nuevo.", params: { n: 1 } });
    expect(renderWarning(w, ctx, "en")).toBe("Algo nuevo.");
  });
});

describe("system entries and user text (data-model §5, FR-007)", () => {
  const en = domainText("en");
  const sctx = { game: ctx.game, players: ctx.players };

  it("the end and the reopening of a game read in the current language", () => {
    expect(en.summary({ type: "endGame", triggers: null }, sctx)).toMatch(/^Game over/);
    expect(en.summary({ type: "reopenGame" }, sctx)).toBe("Game reopened");
    expect(domainText("es").summary({ type: "endGame", triggers: null }, sctx)).toMatch(/^Fin de la partida/);
  });

  it("a user's note shows as typed, even when it looks like a system text", () => {
    expect(en.summary({ type: "note", text: "Fin de la partida?" }, sctx)).toBe("Note: Fin de la partida?");
    expect(en.summary({ type: "note", text: "Mi nota" }, sctx)).toBe("Note: Mi nota");
  });

  it("system note texts have their own wording in each language", () => {
    expect(en.systemNotes).toEqual({ gameOver: "Game over", gameReopened: "Game reopened" });
    expect(domainText("es").systemNotes).toEqual({ gameOver: "Fin de la partida", gameReopened: "Partida reabierta" });
  });
});
