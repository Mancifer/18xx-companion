import { describe, expect, it } from "vitest";
import { startSession } from "../../src/app/sessions";
import { getBuiltInGame } from "../../src/domain/games";
import { openCompanionDb } from "../../src/persistence/db";
import { buildExport } from "../../src/persistence/exportImport";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName } from "../helpers/session";

/** Feature 014 data-model §2: the language and per-language voice regions. */

async function fresh() {
  const db = await openCompanionDb(freshDbName());
  return { db, repo: new SettingsRepo(db) };
}

async function withRows(rows: Record<string, unknown>) {
  const { db, repo } = await fresh();
  const tx = db.transaction("settings", "readwrite");
  for (const [key, value] of Object.entries(rows)) await tx.store.put({ key, value });
  await tx.done;
  return { db, repo };
}

async function rowKeys(db: Awaited<ReturnType<typeof openCompanionDb>>) {
  return (await db.getAll("settings")).map((r) => r.key).sort();
}

describe("Settings: language (FR-002, FR-004)", () => {
  it("a fresh device has no saved language and the default regions", async () => {
    const { repo } = await fresh();
    const s = await repo.get();
    expect(s.language).toBeUndefined();
    expect(s.voiceLocales).toEqual({ en: "en-US", es: "es-ES" });
  });

  it("saves the chosen language", async () => {
    const { db, repo } = await fresh();
    await repo.set({ language: "es" });
    expect((await new SettingsRepo(db).get()).language).toBe("es");
    await repo.set({ language: "en" });
    expect((await repo.get()).language).toBe("en");
  });

  it("an invalid stored language reads as not chosen", async () => {
    const { repo } = await withRows({ language: "fr" });
    expect((await repo.get()).language).toBeUndefined();
  });
});

describe("Settings: voice regions per language (FR-014a)", () => {
  it("moves the legacy Spanish region to the Spanish entry, and drops the legacy row on save", async () => {
    const { db, repo } = await withRows({ voiceLocale: "es-UY" });
    expect((await repo.get()).voiceLocales).toEqual({ en: "en-US", es: "es-UY" });
    await repo.set({ language: "es" });
    expect(await rowKeys(db)).not.toContain("voiceLocale");
    expect((await repo.get()).voiceLocales).toEqual({ en: "en-US", es: "es-UY" });
  });

  it("moves a legacy English region to the English entry", async () => {
    const { repo } = await withRows({ voiceLocale: "en-GB" });
    expect((await repo.get()).voiceLocales).toEqual({ en: "en-GB", es: "es-ES" });
  });

  it("merges regions per language", async () => {
    const { repo } = await fresh();
    await repo.set({ voiceLocales: { es: "es-AR" } });
    await repo.set({ voiceLocales: { en: "en-AU" } });
    expect((await repo.get()).voiceLocales).toEqual({ en: "en-AU", es: "es-AR" });
  });

  it("a region of the wrong language, or blank, falls back to that language's default", async () => {
    const { repo } = await withRows({ voiceLocales: { es: "en-US", en: "" } });
    expect((await repo.get()).voiceLocales).toEqual({ en: "en-US", es: "es-ES" });
  });

  it("keeps a valid region that is not in the list", async () => {
    const { repo } = await withRows({ voiceLocales: { es: "es-VE" } });
    expect((await repo.get()).voiceLocales.es).toBe("es-VE");
  });
});

describe("Settings: never exported (FR-015)", () => {
  it("a session export holds neither the language nor the regions", async () => {
    const db = await openCompanionDb(freshDbName());
    const repo = new SessionRepo(db);
    const settings = new SettingsRepo(db);
    await settings.set({ language: "en", voiceLocales: { en: "en-GB", es: "es-UY" } });
    const store = await startSession(repo, settings, {
      game: getBuiltInGame("1830"),
      options: {},
      players: makePlayers(["Ana", "Bruno", "Carla", "Dani"]),
      walletMode: "appTruth",
    });
    const file = JSON.stringify(await buildExport(repo, store.getSnapshot().meta.id, { appVersion: "test" }));
    for (const needle of ['"language"', "voiceLocales", "en-GB", "es-UY"]) expect(file).not.toContain(needle);
  });
});
