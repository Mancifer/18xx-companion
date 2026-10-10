import { describe, expect, it, vi } from "vitest";
import { deleteSession } from "../../src/app/sessions";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { freshDbName, makeMeta } from "../helpers/session";

/** Feature 006, contracts/home-delete-ui.md §1. */

async function setup() {
  const db = await openCompanionDb(freshDbName());
  const repo = new SessionRepo(db);
  const settings = new SettingsRepo(db);
  const a = makeMeta({ name: "A" });
  const b = makeMeta({ name: "B" });
  await repo.createSession(a);
  await repo.createSession(b);
  return { repo, settings, a, b };
}

describe("deleteSession", () => {
  it("removes a session that is not the pointer and leaves the pointer alone", async () => {
    const { repo, settings, a, b } = await setup();
    await settings.set({ lastSessionId: b.id });

    await deleteSession(repo, settings, a.id);

    expect((await repo.listSessions()).map((m) => m.id)).toEqual([b.id]);
    expect((await settings.get()).lastSessionId).toBe(b.id);
  });

  it("clears the pointer when it names the deleted session (FR-007)", async () => {
    const { repo, settings, a } = await setup();
    await settings.set({ lastSessionId: a.id });

    await deleteSession(repo, settings, a.id);

    expect(await repo.loadSession(a.id)).toBeUndefined();
    expect((await settings.get()).lastSessionId).toBeUndefined();
  });

  it("resolves for a missing id", async () => {
    const { repo, settings, a } = await setup();
    await settings.set({ lastSessionId: a.id });

    await expect(deleteSession(repo, settings, "missing-id")).resolves.toBeUndefined();

    expect(await repo.listSessions()).toHaveLength(2);
    expect((await settings.get()).lastSessionId).toBe(a.id);
  });

  it("rejects without touching the pointer when the repo delete fails (FR-006)", async () => {
    const { settings, a } = await setup();
    await settings.set({ lastSessionId: a.id });
    const set = vi.spyOn(settings, "set");
    const failing = { deleteSession: () => Promise.reject(new Error("boom")) } as unknown as SessionRepo;

    await expect(deleteSession(failing, settings, a.id)).rejects.toThrow("boom");

    expect(set).not.toHaveBeenCalled();
    expect((await settings.get()).lastSessionId).toBe(a.id);
  });
});
