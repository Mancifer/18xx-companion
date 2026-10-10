import { describe, expect, it } from "vitest";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import type { GroupEntry } from "../../src/domain/ledger/entries";
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
