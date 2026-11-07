import { afterEach, describe, expect, it, vi } from "vitest";
import { openCompanionDb, type CompanionDb } from "../../src/persistence/db";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { freshDbName } from "../helpers/session";

/** Feature 015 T007 (data-model §1): the Whisper toggle, the Groq key and the dev check-clips flag. */

async function rows(db: CompanionDb): Promise<Record<string, unknown>> {
  return Object.fromEntries((await db.getAll("settings")).map((r) => [r.key, r.value]));
}

async function seeded(values: Record<string, unknown> = {}) {
  const name = freshDbName();
  const db = await openCompanionDb(name);
  const tx = db.transaction("settings", "readwrite");
  for (const [key, value] of Object.entries(values)) await tx.store.put({ key, value });
  await tx.done;
  return { db, repo: new SettingsRepo(db), name };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SettingsRepo: Whisper toggle (015 FR-003)", () => {
  it("defaults to off, with no Groq key", async () => {
    const { repo } = await seeded();
    const s = await repo.get();
    expect(s.whisper).toBe(false);
    expect(s.groqKey).toBeUndefined();
    expect(s.checkClips).toBe(false);
  });

  it("a non-boolean stored value reads as off", async () => {
    const { repo } = await seeded({ whisper: "yes" });
    expect((await repo.get()).whisper).toBe(false);
  });

  it("saving the Groq key never writes the toggle, and the toggle never writes the key", async () => {
    const { db, repo } = await seeded();
    await repo.set({ groqKey: "gsk_a" });
    expect(await rows(db)).not.toHaveProperty("whisper");
    expect((await repo.get()).whisper).toBe(false);
    await repo.set({ whisper: true });
    expect((await rows(db))["groqKey"]).toBe("gsk_a");
    await repo.set({ groqKey: "" });
    expect((await repo.get()).whisper).toBe(true);
  });

  it("with keys not remembered, the toggle is still stored and survives a reopen", async () => {
    const { repo, name } = await seeded({ rememberKey: false });
    await repo.set({ whisper: true, groqKey: "gsk_mem" });
    const reopened = new SettingsRepo(await openCompanionDb(name));
    const s = await reopened.get();
    expect(s.whisper).toBe(true);
    expect(s.groqKey).toBeUndefined();
  });
});

describe("SettingsRepo: Groq key (015 FR-002)", () => {
  it("is trimmed; blank removes it", async () => {
    const { db, repo } = await seeded();
    expect((await repo.set({ groqKey: "  gsk_x  " })).groqKey).toBe("gsk_x");
    expect((await rows(db))["groqKey"]).toBe("gsk_x");
    expect((await repo.set({ groqKey: "   " })).groqKey).toBeUndefined();
    expect(await rows(db)).not.toHaveProperty("groqKey");
    await repo.set({ groqKey: "gsk_y" });
    expect((await repo.set({ groqKey: undefined })).groqKey).toBeUndefined();
  });

  it("with rememberKey off it lives in memory only, and the stored copy is deleted", async () => {
    const { db, repo, name } = await seeded({ groqKey: "gsk_old" });
    const s = await repo.set({ rememberKey: false });
    expect(s.groqKey).toBe("gsk_old");
    expect(await rows(db)).not.toHaveProperty("groqKey");
    await repo.set({ groqKey: "gsk_new" });
    expect((await repo.get()).groqKey).toBe("gsk_new");
    expect(await rows(db)).not.toHaveProperty("groqKey");
    const reopened = new SettingsRepo(await openCompanionDb(name));
    expect((await reopened.get()).groqKey).toBeUndefined();
  });

  it("rememberKey back on stores the key held in memory", async () => {
    const { db, repo } = await seeded({ rememberKey: false });
    await repo.set({ groqKey: "gsk_mem" });
    await repo.set({ rememberKey: true });
    expect((await rows(db))["groqKey"]).toBe("gsk_mem");
  });

  it("never touches the AI provider settings", async () => {
    const { repo } = await seeded({ provider: "gemini", apiKeys: { anthropic: "sk-ant-x" }, models: { anthropic: "claude-x" } });
    const before = await repo.get();
    const after = await repo.set({ whisper: true, groqKey: "gsk_z", rememberKey: true });
    expect(after.provider).toBe(before.provider);
    expect(after.apiKeys).toEqual(before.apiKeys);
    expect(after.models).toEqual(before.models);
  });
});

describe("SettingsRepo: dev check clips (015 research R11)", () => {
  it("is stored and read in a dev build", async () => {
    const { repo } = await seeded();
    expect((await repo.set({ checkClips: true })).checkClips).toBe(true);
  });

  it("reads as off in a production build, whatever is stored", async () => {
    vi.stubEnv("DEV", false);
    const { repo } = await seeded({ checkClips: true });
    expect((await repo.get()).checkClips).toBe(false);
  });
});
