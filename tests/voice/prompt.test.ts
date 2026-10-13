import { describe, expect, it } from "vitest";
import type { Action } from "../../src/domain/actions/schemas";
import { getBuiltInGame } from "../../src/domain/games";
import { effectiveLog } from "../../src/domain/ledger/effectiveLog";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { systemPromptEs } from "../../src/voice/prompt";
import { systemBlocks } from "../../src/voice/providers/anthropic";
import { snapshotAndTranscript } from "../../src/voice/snapshot";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { seedCompany } from "../helpers/seed";
import { rotlaSession } from "../helpers/rotla";

const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]).map((p) => (p.id === "p1" ? { ...p, aliases: ["la jefa"] } : p));
const game = getBuiltInGame("1830");

describe("systemPromptEs (cached prefix)", () => {
  it("depends only on the session definition and names players, companies and aliases", () => {
    const text = systemPromptEs({ game, players });
    expect(text).toBe(systemPromptEs({ game, players }));
    expect(text).toContain("1830");
    expect(text).toContain("Ana");
    expect(text).toContain("la jefa");
    expect(text).toContain("la pennsy");
    expect(text).toMatch(/herramienta/i);
  });

  it("is sent as one system block with an ephemeral cache breakpoint", () => {
    const blocks = systemBlocks({ game, players });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
  });

  it("explains undo, undo back to an entry and correction requests (feature 010)", () => {
    expect(systemPromptEs({ game, players })).toContain(
      "«deshacer» → undo (groupId null); «deshacé hasta X» → undo con el id de X; «no, eran 260» → amendLast. «sí» / «confirmar» con una propuesta en pantalla → confirmProposal.",
    );
  });
});

describe("snapshotAndTranscript (volatile user message)", () => {
  function snapshot(clarification?: string, notes = 6) {
    const s = TestSession.start(game, players);
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    s.do({ type: "startOR" });
    const group = (n: number, action: Action): LogEntry => ({
      kind: "group",
      seq: n,
      id: `g${n}`,
      at: "2026-10-08T20:00:00.000Z",
      source: "touch",
      action,
      events: [],
      touches: [],
      warnings: [],
    });
    // g1 is the setup group; notes are g2 onwards.
    const log: LogEntry[] = [
      group(1, { type: "createSession", players: [], walletMode: "appTruth" }),
      ...Array.from({ length: notes }, (_, i) => group(i + 2, { type: "note", text: `nota ${i + 2}` })),
    ];
    return snapshotAndTranscript({
      game,
      players,
      state: s.state,
      effective: effectiveLog(log),
      transcript: "240, paga",
      ...(clarification !== undefined ? { clarification } : {}),
    });
  }

  it("carries round, operating company, cash, holdings, trains on sale, the recent entries and the transcript", () => {
    const text = snapshot();
    expect(text).toContain("OR 1.1");
    expect(text).toMatch(/opera:? PRR/i);
    expect(text).toContain("Ana");
    expect(text).toContain("$600");
    expect(text).toContain("PRR 60%");
    expect(text).toMatch(/2 \(\$80/);
    expect(text).toContain("nota 7");
    expect(text).toContain("nota 2");
    expect(text).toContain("240, paga");
  });

  it("lists the last 15 entries with their ids, oldest to newest, setup excluded (feature 010)", () => {
    const text = snapshot(undefined, 20);
    expect(text).toContain("Últimas entradas (id entre corchetes, la más nueva al final):");
    expect(text).toContain("- [g21] Nota: nota 21");
    expect(text).toContain("- [g7] Nota: nota 7");
    expect(text).not.toContain("[g6]");
    expect(text.indexOf("[g7]")).toBeLessThan(text.indexOf("[g21]"));
    expect(text.match(/^- \[g\d+\] /gm)).toHaveLength(15);
    expect(snapshot()).not.toContain("[g1]");
  });

  it("appends the chosen clarification", () => {
    expect(snapshot("Anabel")).toContain("Anabel");
  });
});

describe("RotLA prompt and snapshot (US10, T087)", () => {
  const rotlaPlayers = players.slice(0, 3);

  it("the prompt explains auction launches only where launchCompany exists, and names second identities", () => {
    const rotla = systemPromptEs({ game: getBuiltInGame("rotla"), players: rotlaPlayers });
    expect(rotla).toContain("«abre X por N» = launchCompany en juegos con lanzamiento por subasta");
    expect(rotla).toContain("CON = Consortium (segunda identidad: Conglomerate");
    expect(systemPromptEs({ game, players })).not.toContain("launchCompany");
  });

  it("the snapshot has the cycle and round, each company's tier, and the minors still to launch", () => {
    const s = rotlaSession();
    s.do({ type: "launchCompany", player: "p1", company: "TUN", bid: 140, price: null });
    const text = snapshotAndTranscript({ game: s.game, players: s.players, state: s.state, effective: [], transcript: "x" });
    expect(text).toContain("Ronda: Ciclo 1 de 6 · RA.");
    expect(text).toContain("- TUN (minor): floated");
    expect(text).toMatch(/Minors sin abrir: ADP, AGR, .*EXP/);
    expect(text).not.toMatch(/Minors sin abrir:.*TUN/);
    expect(text).toContain("Corporaciones sin abrir: CON (Consortium / Conglomerate)");
  });

  it("the prompt makes the treasury the default buy source and «del banco» the pool (bug rotla-buy-default-treasury)", () => {
    const rotla = systemPromptEs({ game: getBuiltInGame("rotla"), players: rotlaPlayers });
    expect(rotla).toContain("buyShare sin origen dicho = source treasury");
    expect(rotla).toContain("«del banco» / «del pool» = source pool");
    const p1830 = systemPromptEs({ game, players });
    expect(p1830).toContain("buyShare sin origen dicho = source ipo");
    expect(p1830).not.toContain("source treasury");
  });

  it("the snapshot lists where each started company's shares are", () => {
    const s = rotlaSession();
    s.do({ type: "launchCompany", player: "p1", company: "TUN", bid: 140, price: null });
    const text = snapshotAndTranscript({ game: s.game, players: s.players, state: s.state, effective: [], transcript: "x" });
    expect(text).toMatch(/- TUN \(minor\): floated, .*acciones tesorería 3/);
    expect(text).not.toMatch(/- TUN .*IPO \d/);
  });

  it("the snapshot shows the Merger Round", () => {
    const s = rotlaSession();
    s.apply({ t: "turnAdvance", round: "MR", srNumber: 2 });
    const text = snapshotAndTranscript({ game: s.game, players: s.players, state: s.state, effective: [], transcript: "x" });
    expect(text).toContain("Ronda: Ciclo 2 de 6 · RF.");
  });

  it("1830's snapshot is unchanged in shape (no tiers, no cycles)", () => {
    const s = TestSession.start(game, players);
    const text = snapshotAndTranscript({ game, players, state: s.state, effective: [], transcript: "x" });
    expect(text).not.toContain("Ciclo");
    expect(text).not.toContain("sin abrir");
  });
});
