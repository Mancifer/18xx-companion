import { describe, expect, it } from "vitest";
import { openCompanionDb, type CompanionDb } from "../../src/persistence/db";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { PROVIDER_IDS, PROVIDERS } from "../../src/voice/providers";
import { freshDbName } from "../helpers/session";

/** Feature 005 T014: per-provider keys and models, read-time migration, memory-only keys (data-model §1). */

async function rows(db: CompanionDb): Promise<Record<string, unknown>> {
  return Object.fromEntries((await db.getAll("settings")).map((r) => [r.key, r.value]));
}

async function seeded(values: Record<string, unknown>) {
  const name = freshDbName();
  const db = await openCompanionDb(name);
  const tx = db.transaction("settings", "readwrite");
  for (const [key, value] of Object.entries(values)) await tx.store.put({ key, value });
  await tx.done;
  return { db, repo: new SettingsRepo(db), name };
}

const defaults = () => Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].defaultModel]));

describe("SettingsRepo (005)", () => {
  it("defaults: Claude selected, no keys, every model at its registry default", async () => {
    const repo = new SettingsRepo(await openCompanionDb(freshDbName()));
    expect(await repo.get()).toEqual({ provider: "anthropic", apiKeys: {}, models: defaults(), rememberKey: true, voiceLocale: "es-ES" });
  });

  it("FR-005: legacy apiKey/model rows read as Claude's key and model", async () => {
    const { repo } = await seeded({ apiKey: "sk-ant-x", model: "claude-x", rememberKey: true });
    const s = await repo.get();
    expect(s.provider).toBe("anthropic");
    expect(s.apiKeys).toEqual({ anthropic: "sk-ant-x" });
    expect(s.models).toEqual({ ...defaults(), anthropic: "claude-x" });
  });

  it("an unknown stored provider reads as anthropic; models missing a provider read its default", async () => {
    const { repo } = await seeded({ provider: "openai", models: { anthropic: "claude-y" } });
    const s = await repo.get();
    expect(s.provider).toBe("anthropic");
    expect(s.models).toEqual({ ...defaults(), anthropic: "claude-y" });
  });

  it("the first set() after a migrated read writes the new rows and deletes the legacy ones", async () => {
    const { db, repo } = await seeded({ apiKey: "sk-ant-x", model: "claude-x", rememberKey: true });
    await repo.set({ voiceLocale: "es-AR" });
    const stored = await rows(db);
    expect(stored).not.toHaveProperty("apiKey");
    expect(stored).not.toHaveProperty("model");
    expect(stored).toMatchObject({
      provider: "anthropic",
      apiKeys: { anthropic: "sk-ant-x" },
      models: { anthropic: "claude-x" },
      voiceLocale: "es-AR",
    });
  });

  it("a blank key removes that provider's entry; a blank model resets it to the default", async () => {
    const { repo } = await seeded({ apiKeys: { anthropic: "sk-ant-x" }, models: { anthropic: "claude-x" } });
    const s = await repo.set({ apiKeys: { anthropic: "   " }, models: { anthropic: " " } });
    expect(s.apiKeys).toEqual({});
    expect(s.models.anthropic).toBe(PROVIDERS.anthropic.defaultModel);
  });

  it("keys and models are trimmed", async () => {
    const repo = new SettingsRepo(await openCompanionDb(freshDbName()));
    const s = await repo.set({ apiKeys: { anthropic: " sk-ant-z " }, models: { anthropic: " claude-z " } });
    expect(s.apiKeys).toEqual({ anthropic: "sk-ant-z" });
    expect(s.models.anthropic).toBe("claude-z");
  });

  it("rememberKey false: no apiKeys row, keys stay in memory for this page load, a stored row is deleted", async () => {
    const { db, repo, name } = await seeded({ apiKeys: { anthropic: "sk-ant-old" }, rememberKey: true });
    const s = await repo.set({ rememberKey: false });
    expect(s.apiKeys).toEqual({ anthropic: "sk-ant-old" });
    expect(await rows(db)).not.toHaveProperty("apiKeys");
    await repo.set({ apiKeys: { anthropic: "sk-ant-new" } });
    expect((await repo.get()).apiKeys).toEqual({ anthropic: "sk-ant-new" });
    expect(await rows(db)).not.toHaveProperty("apiKeys");
    const reopened = new SettingsRepo(await openCompanionDb(name));
    expect((await reopened.get()).apiKeys).toEqual({});
  });

  it("rememberKey back on stores the keys held in memory", async () => {
    const { db, repo } = await seeded({ rememberKey: false });
    await repo.set({ apiKeys: { anthropic: "sk-ant-mem" } });
    await repo.set({ rememberKey: true });
    expect((await rows(db))["apiKeys"]).toEqual({ anthropic: "sk-ant-mem" });
  });

  it("legacy rows with rememberKey false: the stored legacy key is not used", async () => {
    const { repo } = await seeded({ apiKey: "sk-ant-x", rememberKey: false });
    expect((await repo.get()).apiKeys).toEqual({});
  });

  it("US3-1: saving one provider's key or model never changes another's", async () => {
    const { repo } = await seeded({ apiKeys: { anthropic: "sk-ant-x" }, models: { anthropic: "claude-x" } });
    const s = await repo.set({ provider: "gemini", apiKeys: { gemini: "AIza-g" }, models: { gemini: "gemini-3.6-flash" } });
    expect(s.provider).toBe("gemini");
    expect(s.apiKeys).toEqual({ anthropic: "sk-ant-x", gemini: "AIza-g" });
    expect(s.models).toEqual({ anthropic: "claude-x", gemini: "gemini-3.6-flash" });
    expect((await repo.set({ apiKeys: { gemini: "" } })).apiKeys).toEqual({ anthropic: "sk-ant-x" });
  });

  it("legacy rows give Gemini its default model and no key", async () => {
    const { repo } = await seeded({ apiKey: "sk-ant-x", model: "claude-x" });
    const s = await repo.get();
    expect(s.models.gemini).toBe(PROVIDERS.gemini.defaultModel);
    expect(s.apiKeys.gemini).toBeUndefined();
  });

  it("memory-only mode covers every provider's key", async () => {
    const { db, repo } = await seeded({ rememberKey: false });
    await repo.set({ apiKeys: { anthropic: "sk-ant-m", gemini: "AIza-m" } });
    expect((await repo.get()).apiKeys).toEqual({ anthropic: "sk-ant-m", gemini: "AIza-m" });
    expect(JSON.stringify(await rows(db))).not.toMatch(/sk-ant-m|AIza-m/);
  });

  it("lastSessionId is set and removed with undefined", async () => {
    const repo = new SettingsRepo(await openCompanionDb(freshDbName()));
    expect((await repo.set({ lastSessionId: "s1" })).lastSessionId).toBe("s1");
    expect(await repo.set({ lastSessionId: undefined })).not.toHaveProperty("lastSessionId");
  });
});
