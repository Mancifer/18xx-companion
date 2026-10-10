import { describe, expect, it } from "vitest";
import { startSession } from "../../src/app/sessions";
import { getBuiltInGame } from "../../src/domain/games";
import { openCompanionDb, type CompanionDb } from "../../src/persistence/db";
import { buildExport, importSession, parseImport } from "../../src/persistence/exportImport";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import type { GroupEntry } from "../../src/domain/ledger/entries";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName, makeMeta } from "../helpers/session";

function note(seq: number): GroupEntry {
  return {
    kind: "group",
    seq,
    id: `g${seq}`,
    at: "2026-10-07T20:00:00.000Z",
    source: "touch",
    action: { type: "note", text: `n${seq}` },
    events: [{ t: "note", text: `n${seq}` }],
    touches: [],
    warnings: [],
  };
}

describe("SessionRepo", () => {
  it("persists entries and loads them in seq order", async () => {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta();
    await repo.createSession(meta);
    await repo.appendEntry(meta.id, note(2));
    await repo.appendEntry(meta.id, note(1));
    await repo.appendEntry(meta.id, note(3));
    const loaded = await repo.loadSession(meta.id);
    expect(loaded?.entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(loaded?.meta.entryCount).toBe(3);
  });

  it("resolves appendEntry only after the write is readable", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const meta = makeMeta();
    await repo.createSession(meta);
    await repo.appendEntry(meta.id, note(1));
    const stored = await db.get("entries", [meta.id, 1]);
    expect(stored?.entry).toEqual(note(1));
  });

  it("does not mix entries of two sessions", async () => {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const a = makeMeta();
    const b = makeMeta();
    await repo.createSession(a);
    await repo.createSession(b);
    await repo.appendEntry(a.id, note(1));
    await repo.appendEntry(b.id, note(1));
    await repo.appendEntry(b.id, note(2));
    expect((await repo.loadSession(a.id))?.entries).toHaveLength(1);
    expect((await repo.loadSession(b.id))?.entries).toHaveLength(2);
    expect((await repo.listSessions()).map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("keeps settings in their own store, away from sessions", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const settings = new SettingsRepo(db);
    const meta = makeMeta();
    await repo.createSession(meta);
    await settings.set({ apiKeys: { anthropic: "sk-ant-secret" }, rememberKey: true });
    const loaded = await repo.loadSession(meta.id);
    expect(JSON.stringify(loaded)).not.toContain("sk-ant-secret");
    expect((await settings.get()).apiKeys.anthropic).toBe("sk-ant-secret");
  });
});

/** A started 1830 session with a few notes and a stored snapshot, so every store has rows. */
async function seeded(repo: SessionRepo, settings: SettingsRepo, name: string) {
  const store = await startSession(repo, settings, {
    game: getBuiltInGame("1830"),
    options: {},
    players: makePlayers(["Ana", "Bruno", "Carla"]),
    walletMode: "appTruth",
    name,
  });
  for (const text of ["uno", "dos", "tres"]) {
    const result = await store.dispatch({ type: "note", text });
    if (!result.ok) throw new Error(result.messageEs);
  }
  const { meta, state, log } = store.getSnapshot();
  const last = log[log.length - 1]!;
  await repo.putSnapshot(meta.id, { seq: last.seq, groupCount: log.length, state, firstSeen: {}, over: false, end: null, eliminationOrder: [], autoEndGroups: [] });
  return meta.id;
}

async function rowsOf(db: CompanionDb, id: string) {
  return {
    entries: await db.getAllKeysFromIndex("entries", "bySession", id),
    snapshots: await db.getAllKeysFromIndex("snapshots", "bySession", id),
  };
}

describe("appendEntry with a meta patch (feature 007, contracts/domain.md §6)", () => {
  const outcome = { endedAt: "2026-10-07T20:00:00.000Z", winners: ["p1"] };

  it("merges the patch into the meta row in the entry's transaction", async () => {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta();
    await repo.createSession(meta);
    await repo.appendEntry(meta.id, note(1), { outcome });
    const loaded = await repo.loadSession(meta.id);
    expect(loaded?.meta).toMatchObject({ outcome, entryCount: 1 });
    expect(loaded?.entries).toHaveLength(1);
  });

  it("an aborted transaction writes neither the entry nor the patch", async () => {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta();
    await repo.createSession(meta);
    await repo.appendEntry(meta.id, note(1));
    // The same seq again: the entries store refuses the key and the transaction aborts.
    await expect(repo.appendEntry(meta.id, note(1), { outcome })).rejects.toBeDefined();
    const loaded = await repo.loadSession(meta.id);
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.meta.entryCount).toBe(1);
    expect("outcome" in (loaded?.meta ?? {})).toBe(false);
  });

  it("without a patch the meta row keeps its outcome as it was", async () => {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta();
    await repo.createSession(meta);
    await repo.appendEntry(meta.id, note(1));
    expect("outcome" in ((await repo.loadSession(meta.id))?.meta ?? {})).toBe(false);
    await repo.appendEntry(meta.id, note(2), { outcome });
    await repo.appendEntry(meta.id, note(3));
    expect((await repo.loadSession(meta.id))?.meta.outcome).toEqual(outcome);
  });
});

describe("deleteSession (feature 006)", () => {
  it("removes the session's meta, entries and snapshots", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const a = await seeded(repo, new SettingsRepo(db), "A");
    const before = await rowsOf(db, a);
    expect(before.entries.length).toBeGreaterThan(1);
    expect(before.snapshots.length).toBe(1);

    await repo.deleteSession(a);

    expect(await repo.loadSession(a)).toBeUndefined();
    expect((await repo.listSessions()).map((m) => m.id)).not.toContain(a);
    expect(await rowsOf(db, a)).toEqual({ entries: [], snapshots: [] });
  });

  it("leaves other sessions identical (FR-005)", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const settings = new SettingsRepo(db);
    const a = await seeded(repo, settings, "A");
    const b = await seeded(repo, settings, "B");
    const bBefore = await repo.loadSession(b);
    const bRows = await rowsOf(db, b);

    await repo.deleteSession(a);

    expect(await repo.loadSession(b)).toEqual(bBefore);
    expect(await rowsOf(db, b)).toEqual(bRows);
    expect((await repo.listSessions()).map((m) => m.id)).toEqual([b]);
  });

  it("is a no-op for a missing id", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const a = await seeded(repo, new SettingsRepo(db), "A");
    const before = await repo.loadSession(a);

    await expect(repo.deleteSession("missing-id")).resolves.toBeUndefined();

    expect(await repo.loadSession(a)).toEqual(before);
    expect(await repo.listSessions()).toHaveLength(1);
  });

  it("a deleted session's export re-imports as new, with the same state (SC-005, US3-2)", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const a = await seeded(repo, new SettingsRepo(db), "A");
    const original = (await repo.loadSession(a))!;
    const file = await buildExport(repo, a, { appVersion: "0.1.0" });

    await repo.deleteSession(a);

    const parsed = await parseImport(JSON.parse(JSON.stringify(file)));
    if (!parsed.ok) throw new Error(parsed.errorEs);
    expect(parsed.hashMatches).toBe(true);
    // Home's "not on this device" path: no existing row, so a plain import.
    expect(await repo.loadSession(parsed.file.session.id)).toBeUndefined();
    const meta = await importSession(repo, parsed, { mode: "replace" });
    const restored = (await repo.loadSession(meta.id))!;
    expect(meta.id).toBe(a);
    expect(restored.meta.name).toBe(original.meta.name);
    expect(restored.meta.entryCount).toBe(original.meta.entryCount);
    expect(restored.meta.players).toEqual(original.meta.players);
    expect(restored.entries).toEqual(original.entries);
  });
});

describe("SettingsRepo", () => {
  it("has defaults", async () => {
    const settings = new SettingsRepo(await openCompanionDb(freshDbName()));
    expect(await settings.get()).toMatchObject({
      rememberKey: true,
      voiceLocale: "es-ES",
      provider: "anthropic",
      models: { anthropic: "claude-sonnet-5" },
    });
  });

  it("keeps the key in memory only when rememberKey is false", async () => {
    const name = freshDbName();
    const settings = new SettingsRepo(await openCompanionDb(name));
    await settings.set({ rememberKey: false, apiKeys: { anthropic: "sk-ant-memory" } });
    expect((await settings.get()).apiKeys.anthropic).toBe("sk-ant-memory");
    const reopened = new SettingsRepo(await openCompanionDb(name));
    expect((await reopened.get()).apiKeys.anthropic).toBeUndefined();
  });
});
