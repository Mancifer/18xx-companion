import { describe, expect, it } from "vitest";
import { SessionStore } from "../../src/app/SessionStore";
import { startSession } from "../../src/app/sessions";
import { getBuiltInGame } from "../../src/domain/games";
import { canonicalJson, stateHash } from "../../src/persistence/canonical";
import { openCompanionDb } from "../../src/persistence/db";
import { buildExport, exportFileName, importSession, parseImport } from "../../src/persistence/exportImport";
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
  await store.amend(pay.group.id, { type: "transferMoney", from: "player:p3", to: "bank", amount: 45 }, { confirmed: true });
  await store.dispatch({ type: "note", text: "deshacer esto" });
  await store.revert();
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
    expect(exp).toMatchObject({ format: "18xx-companion/session", version: 1, appVersion: "0.1.0" });
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
  it("round-trips state, log (with reverts and amends) and turn into a fresh profile", async () => {
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

  it("a version newer than 1 is refused", async () => {
    const { repo, store } = await midGame();
    const exp = await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "0.1.0", now });
    const parsed = await parseImport({ ...exp, version: 2 });
    expect(parsed.ok).toBe(false);
  });

  it("something that is not an export is refused with a reason", async () => {
    const parsed = await parseImport({ hello: "world" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errorEs).toMatch(/no es una partida/i);
  });
});

describe("canonical JSON", () => {
  it("sorts keys and drops undefined, so equal states hash equally", async () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe('{"a":{"c":[2,1]},"b":1}');
    expect(await stateHash({ b: 1, a: 2 } as never)).toBe(await stateHash({ a: 2, b: 1 } as never));
  });
});
