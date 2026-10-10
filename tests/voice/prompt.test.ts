import { describe, expect, it } from "vitest";
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
});

describe("snapshotAndTranscript (volatile user message)", () => {
  function snapshot(clarification?: string) {
    const s = TestSession.start(game, players);
    seedCompany(s, "PRR", { cell: { row: 0, col: 6 }, holders: { "player:p1": 6 } });
    s.do({ type: "startOR" });
    const log: LogEntry[] = [1, 2, 3, 4, 5, 6].map((n) => ({
      kind: "group",
      seq: n,
      id: `g${n}`,
      at: "2026-10-08T20:00:00.000Z",
      source: "touch",
      action: { type: "note", text: `nota ${n}` },
      events: [],
      touches: [],
      warnings: [],
    }));
    return snapshotAndTranscript({
      game,
      players,
      state: s.state,
      effective: effectiveLog(log),
      transcript: "240, paga",
      ...(clarification !== undefined ? { clarification } : {}),
    });
  }

  it("carries round, operating company, cash, holdings, trains on sale, the last 5 groups and the transcript", () => {
    const text = snapshot();
    expect(text).toContain("OR 1.1");
    expect(text).toMatch(/opera:? PRR/i);
    expect(text).toContain("Ana");
    expect(text).toContain("$600");
    expect(text).toContain("PRR 60%");
    expect(text).toMatch(/2 \(\$80/);
    expect(text).toContain("nota 6");
    expect(text).toContain("nota 2");
    expect(text).not.toContain("nota 1");
    expect(text).toContain("240, paga");
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
