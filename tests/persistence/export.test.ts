import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { startSession } from "../../src/app/sessions";
import { getBuiltInGame } from "../../src/domain/games";
import { groupHistory } from "../../src/domain/ledger/effectiveLog";
import { canonicalJson, stateHash } from "../../src/persistence/canonical";
import { openCompanionDb } from "../../src/persistence/db";
import { buildExport, EXPORT_VERSION, exportFileName, importSession, parseImport } from "../../src/persistence/exportImport";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName } from "../helpers/session";

/** US8, contracts/export-format.md. */

const KEY = "sk-ant-api03-SECRET-KEY-DO-NOT-LEAK";
const GEMINI_KEY = "AIzaSy-GEMINI-SECRET-DO-NOT-LEAK";

async function midGame() {
  const db = await openCompanionDb(freshDbName());
  const repo = new SessionRepo(db);
  const settings = new SettingsRepo(db);
  await settings.set({ apiKeys: { anthropic: KEY, gemini: GEMINI_KEY }, rememberKey: true });
  const store = await startSession(repo, settings, {
    game: getBuiltInGame("1830"),
    options: {},
    players: makePlayers(["Ana", "Bruno", "Carla", "Dani"]),
    walletMode: "appTruth",
  });
  await store.dispatch({ type: "startSR" });
  await store.dispatch({ type: "parCompany", player: "p1", company: "PRR", price: 100 });
  await store.dispatch({ type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 4 });
  const pay = await store.dispatch({ type: "transferMoney", from: "player:p3", to: "bank", amount: 40 });
  if (!pay.ok) throw new Error(pay.messageEs);
  await store.dispatch({ type: "note", text: "deshacer esto" });
  await store.undoLast();
  await store.dispatch({ type: "endSR" });
  await store.dispatch({ type: "startOR" });
  return { db, repo, settings, store };
}

const now = new Date(2026, 9, 8, 21, 5);

describe("export (FR-091, FR-092)", () => {
  it("US8-2: never contains the AI key or a field named like apiKey", async () => {
    const { repo, store } = await midGame();
    const json = JSON.stringify(await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now }));
    expect(json).not.toContain(KEY);
    expect(json).not.toContain("sk-ant");
    expect(json).not.toContain(GEMINI_KEY);
    expect(json).not.toContain("AIza");
    expect(json.toLowerCase()).not.toMatch(/api_?key/);
  });

  it("has the contract's shape and a state hash of the replayed state", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    expect(exp).toMatchObject({ format: "18xx-companion/session", version: 2, appVersion: "0.1.0" });
    expect(exp.session.game.id).toBe("1830");
    expect(exp.entries).toHaveLength(store.getSnapshot().log.length);
    expect(exp.stateHash).toBe(await stateHash(store.getSnapshot().state));
  });

  it("file name: 18xx-<game>-<yyyyMMdd-HHmm>.json", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    expect(exportFileName(exp)).toBe("18xx-1830-20261008-2105.json");
  });
});

describe("import (US8-1)", () => {
  it("round-trips state, log (with undo entries) and turn into a fresh profile", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const parsed = await parseImport(JSON.parse(JSON.stringify(exp)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    expect(parsed.hashMatches).toBe(true);
    expect(parsed.warningEs).toBeUndefined();

    const fresh = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = await importSession(fresh, parsed, { mode: "replace" });
    const reopened = await SessionStore.open(fresh, meta.id);
    expect(reopened?.getSnapshot().state).toEqual(store.getSnapshot().state);
    expect(reopened?.getSnapshot().log).toEqual(store.getSnapshot().log);
    expect(reopened?.getSnapshot().state.turn).toEqual(store.getSnapshot().state.turn);
    expect(reopened?.getSnapshot().meta.chipSet).toEqual(store.getSnapshot().meta.chipSet);
  });

  it("a tampered state hash still imports, with a warning (the log is authoritative)", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const parsed = await parseImport({ ...exp, stateHash: "0".repeat(64) });
    if (!parsed.ok) throw new Error(parsed.errorEs);
    expect(parsed.hashMatches).toBe(false);
    expect(parsed.warningEs).toBe("el estado reproducido no coincide");
  });

  it("an id that already exists can be replaced or imported as a copy", async () => {
    const { repo, store } = await midGame();
    const id = store.getSnapshot().meta.id;
    const parsed = await parseImport(await buildExport(repo, id, { appVersion: "0.1.0", now }));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    expect(await repo.loadSession(id)).toBeDefined();

    const copy = await importSession(repo, parsed, { mode: "copy" });
    expect(copy.id).not.toBe(id);
    expect((await repo.listSessions()).map((s) => s.id).sort()).toEqual([id, copy.id].sort());

    const replaced = await importSession(repo, parsed, { mode: "replace" });
    expect(replaced.id).toBe(id);
    expect((await repo.loadSession(id))?.entries).toHaveLength(store.getSnapshot().log.length);
  });

  it("a version newer than 2 is refused with the update message", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const parsed = await parseImport({ ...exp, version: 3 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errorEs).toBe("El archivo es de una versión más nueva de la app (3). Actualiza la app.");
  });

  it("something that is not an export is refused with a reason", async () => {
    const parsed = await parseImport({ hello: "world" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errorEs).toMatch(/no es una partida/i);
  });
});

describe("the outcome on export and import (feature 007, FR-018, SC-005)", () => {
  it("a finished session's file has no outcome; importing it writes the same outcome", async () => {
    const { repo, store } = await midGame();
    await store.dispatch({ type: "transferMoney", from: "bank", to: "player:p4", amount: 100 });
    const ended = await store.dispatch({ type: "endGame", triggers: null });
    if (!ended.ok) throw new Error(ended.messageEs);
    const { meta } = store.getSnapshot();
    expect(meta.outcome).toEqual({ endedAt: ended.group.at, winners: ["p4"] });

    const file = await buildExport(repo, meta.id, { appVersion: "test", now });
    expect(file.version).toBe(EXPORT_VERSION);
    expect(JSON.stringify(file)).not.toContain("outcome");

    const fresh = new SessionRepo(await openCompanionDb(freshDbName()));
    const parsed = await parseImport(JSON.parse(JSON.stringify(file)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    const imported = await importSession(fresh, parsed, { mode: "replace" });
    expect(imported.outcome).toEqual(meta.outcome);
    expect((await fresh.loadSession(meta.id))?.meta.outcome).toEqual(meta.outcome);
  });

  it("an unfinished session imports with outcome null", async () => {
    const { repo, store } = await midGame();
    const file = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "test", now });
    const parsed = await parseImport(JSON.parse(JSON.stringify(file)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    const imported = await importSession(new SessionRepo(await openCompanionDb(freshDbName())), parsed, { mode: "copy" });
    expect(imported.outcome).toBeNull();
  });
});

describe("canonical JSON", () => {
  it("sorts keys and drops undefined, so equal states hash equally", async () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe('{"a":{"c":[2,1]},"b":1}');
    expect(await stateHash({ b: 1, a: 2 } as never)).toBe(await stateHash({ a: 2, b: 1 } as never));
  });
});

describe("chips with labels from older versions (feature 008, SC-005)", () => {
  it("an export whose chips carry a label still imports, values and colors unchanged, and the label is written back", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const labelled = [
      { value: 500, color: "#6a1b9a", label: "500" },
      { value: 1, color: "#c62828", label: "5" },
    ];
    const file = JSON.parse(JSON.stringify(exp)) as typeof exp;
    const old = { ...file, session: { ...file.session, chipSet: { chips: labelled } } };
    const parsed = await parseImport(old);
    if (!parsed.ok) throw new Error(parsed.errorEs);

    const fresh = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = await importSession(fresh, parsed, { mode: "replace" });
    expect(meta.chipSet.chips.map((c) => [c.value, c.color])).toEqual([
      [500, "#6a1b9a"],
      [1, "#c62828"],
    ]);
    const again = await buildExport(fresh, meta.id, { appVersion: "0.1.0", now });
    expect(again.session.chipSet.chips).toEqual(labelled);
  });
});

describe("bank pins on export and import (feature 008, FR-022d)", () => {
  it("survive an export → import", async () => {
    const { repo, store } = await midGame();
    await store.updateMeta({ bankPins: { "500": 6 } });
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    expect(exp.session.bankPins).toEqual({ "500": 6 });
    const parsed = await parseImport(JSON.parse(JSON.stringify(exp)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    const fresh = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = await importSession(fresh, parsed, { mode: "replace" });
    expect((await fresh.loadSession(meta.id))?.meta.bankPins).toEqual({ "500": 6 });
  });

  it("an export without bankPins imports with no pins", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    expect("bankPins" in exp.session).toBe(false);
    const parsed = await parseImport(JSON.parse(JSON.stringify(exp)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    const meta = await importSession(new SessionRepo(await openCompanionDb(freshDbName())), parsed, { mode: "copy" });
    expect(meta.bankPins).toBeUndefined();
    expect("bankPins" in meta).toBe(false);
  });
});

describe("export format v2: undo entries (feature 010, FR-019)", () => {
  async function withUndo() {
    const game = await midGame();
    const { repo, store } = game;
    const { meta, log, effective } = store.getSnapshot();
    const last = effective.slice(-2).map((g) => g.id).reverse();
    const seq = Math.max(...log.map((e) => e.seq)) + 1;
    await repo.appendEntry(meta.id, { kind: "undo", seq, at: "2026-10-12T21:14:03.000Z", groupIds: last });
    const reopened = await SessionStore.open(repo, meta.id);
    if (!reopened) throw new Error("missing");
    return { ...game, store: reopened };
  }

  it("EXPORT_VERSION is 2", () => {
    expect(EXPORT_VERSION).toBe(2);
  });

  it("a session with undo entries round-trips: entries, statuses and state hash", async () => {
    const { repo, store } = await withUndo();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    expect(exp.entries.some((e) => e.kind === "undo")).toBe(true);
    const parsed = await parseImport(JSON.parse(JSON.stringify(exp)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    expect(parsed.hashMatches).toBe(true);
    const fresh = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = await importSession(fresh, parsed, { mode: "replace" });
    const reopened = await SessionStore.open(fresh, meta.id);
    const before = store.getSnapshot();
    const after = reopened!.getSnapshot();
    expect(after.log).toEqual(before.log);
    expect(groupHistory(after.log).map((h) => h.status)).toEqual(groupHistory(before.log).map((h) => h.status));
    expect(await stateHash(after.state)).toBe(await stateHash(before.state));
  });

  it("a version-1 file imports unchanged, with legacy revert and amend entries", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const log = store.getSnapshot().log;
    const seq = Math.max(...log.map((e) => e.seq));
    const note = log.find((e) => e.kind === "group" && e.action.type === "note");
    if (!note || note.kind !== "group") throw new Error("missing note");
    const legacy = [
      ...exp.entries,
      { kind: "amend", seq: seq + 1, at: "2026-10-01T20:00:00.000Z", groupId: note.id, action: { type: "note", text: "corregida" }, events: [{ t: "note", text: "corregida" }], touches: [] },
      { kind: "revert", seq: seq + 2, at: "2026-10-01T20:00:00.000Z", groupId: note.id },
    ];
    const v1 = { ...(JSON.parse(JSON.stringify(exp)) as object), version: 1, entries: legacy };
    const parsed = await parseImport(v1);
    if (!parsed.ok) throw new Error(parsed.errorEs);
    expect(parsed.file.version).toBe(2);
    expect(parsed.file.entries).toEqual(legacy);
  });

  it("an undo entry with no groupIds is refused", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const bad = { ...exp, entries: [...exp.entries, { kind: "undo", seq: 999, at: "2026-10-12T21:14:03.000Z", groupIds: [] }] };
    const parsed = await parseImport(JSON.parse(JSON.stringify(bad)));
    expect(parsed.ok).toBe(false);
  });
});
