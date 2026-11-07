import { describe, expect, it } from "vitest";
import { getBuiltInGame } from "../../src/domain/games";
import type { Player } from "../../src/domain/types";
import { buildHint, estimateTokens, HINT_MAX_CHARS, HINT_MAX_TOKENS } from "../../src/voice/transcription/hint";
import { makePlayers } from "../helpers/dispatch";

/** Feature 015 T032 (FR-010, research R8, data-model §4): Whisper's vocabulary hint. */

const players = (...names: string[]): Player[] => makePlayers(names);
const withAliases = (list: Player[], aliases: Record<string, string[]>): Player[] =>
  list.map((p) => ({ ...p, aliases: aliases[p.name] ?? [] }));

describe("estimateTokens", () => {
  it("counts each symbol and digit as one token and each word as ceil(length / 3)", () => {
    // B & O , C & O , 2 , 3 , 4  → B,&,O,",",C,&,O,",",2,",",3,",",4 = 13
    expect(estimateTokens("B&O, C&O, 2, 3, 4")).toBe(13);
    expect(estimateTokens("Pennsylvania")).toBe(4);
    expect(estimateTokens("Ana")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("buildHint", () => {
  it("1830 in Spanish: lead-in, players, companies, trains, then the game words", () => {
    const hint = buildHint({ game: getBuiltInGame("1830"), players: players("Ana", "Bruno", "Carla"), lang: "es" }, "es");
    expect(hint).toMatchInlineSnapshot(`"Partida de 1830. Jugadores: Ana, Bruno, Carla. Compañías: PRR, NYC, CPR, B&O, C&O, Erie, NNH, B&M, Pennsylvania Railroad, New York Central, Canadian Pacific, Baltimore & Ohio, Chesapeake & Ohio, Erie Railroad, New York, New Haven & Hartford, Boston & Maine. Trenes: 2, 3, 4, 5, 6, D. Dividendos, retiene, compra, vende, paga, mitad."`);
  });

  it("1830 in English", () => {
    const hint = buildHint({ game: getBuiltInGame("1830"), players: players("Ana", "Bruno", "Carla"), lang: "en" }, "en");
    expect(hint).toMatchInlineSnapshot(`"1830 game. Players: Ana, Bruno, Carla. Companies: PRR, NYC, CPR, B&O, C&O, Erie, NNH, B&M, Pennsylvania Railroad, New York Central, Canadian Pacific, Baltimore & Ohio, Chesapeake & Ohio, Erie Railroad, New York, New Haven & Hartford, Boston & Maine. Trains: 2, 3, 4, 5, 6, D. Dividends, withholds, buys, sells, pays, half."`);
  });

  it("lists player aliases after every name, without case-insensitive duplicates", () => {
    const list = withAliases(players("Ana", "Bruno"), { Ana: ["Anita", "ana"], Bruno: ["Bruni"] });
    const hint = buildHint({ game: getBuiltInGame("1830"), players: list, lang: "es" }, "es");
    expect(hint).toContain("Jugadores: Ana, Bruno, Anita, Bruni.");
  });

  it.each(["1830", "1848", "21moon", "rotla"])("%s fits both budgets in both languages", (id) => {
    for (const lang of ["es", "en"] as const) {
      const hint = buildHint({ game: getBuiltInGame(id), players: players("Ana", "Bruno", "Carla", "Dani", "Eva"), lang }, lang);
      expect(hint.length).toBeLessThanOrEqual(HINT_MAX_CHARS);
      expect(estimateTokens(hint)).toBeLessThanOrEqual(HINT_MAX_TOKENS);
      expect(hint).toContain("Ana");
    }
  });

  it("with too much to say, it drops whole terms from the end: game words first, never a name", () => {
    const names = ["Alejandro", "Bernardita", "Constantino", "Dolores", "Esmeralda", "Florencio", "Guillermina", "Hermenegildo"];
    const list = withAliases(
      players(...names),
      Object.fromEntries(names.map((n) => [n, [`${n} el grande`, `${n} la máquina`]])),
    );
    const hint = buildHint({ game: getBuiltInGame("rotla"), players: list, lang: "es" }, "es");
    expect(hint.length).toBeLessThanOrEqual(HINT_MAX_CHARS);
    expect(estimateTokens(hint)).toBeLessThanOrEqual(HINT_MAX_TOKENS);
    for (const n of names) expect(hint).toContain(n);
    expect(hint).not.toContain("Dividendos");
    // Never a cut term: every comma-separated item is a whole alias or name.
    expect(hint).not.toMatch(/el gran[^d]|la máquin[^a]/);
  });

  it("uses company short and full names, never the resolver's phonetic aliases", () => {
    const hint = buildHint({ game: getBuiltInGame("1830"), players: players("Ana"), lang: "es" }, "es");
    expect(hint).toContain("PRR");
    expect(hint).not.toContain("pe erre erre");
    expect(hint).not.toContain("be y o");
  });

  it("is deterministic", () => {
    const session = { game: getBuiltInGame("1848"), players: players("Ana", "Bruno"), lang: "es" as const };
    expect(buildHint(session, "es")).toBe(buildHint(session, "es"));
  });
});
