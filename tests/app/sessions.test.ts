import { describe, expect, it, vi } from "vitest";
import { backfillOutcome, deleteSession } from "../../src/app/sessions";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { GroupEntry } from "../../src/domain/ledger/entries";
import type { SessionMeta } from "../../src/domain/session";
import { TestSession, makePlayers } from "../helpers/dispatch";
import { ROTLA_NAMES, rotlaGame } from "../helpers/rotla";
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

describe("backfillOutcome (feature 007, contracts/domain.md §6)", () => {
  const players = makePlayers(ROTLA_NAMES.slice(0, 3));
  /** A RotLA Short session stored before feature 007: no scoring block, no outcome key (R16). */
  function legacy(finish: boolean): { meta: SessionMeta; entries: GroupEntry[] } {
    const copy: Partial<GameDefinition> = { ...rotlaGame({ mode: "short" }) };
    delete copy.scoring;
    const game = copy as GameDefinition;
    const s = TestSession.start(game, players).do({ type: "transferMoney", from: "bank", to: "player:p2", amount: 50 });
    if (finish) s.do({ type: "setTurn", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null });
    const entries = s.groups.map((g, i): GroupEntry => ({ kind: "group", ...g, at: `2026-10-0${i + 1}T20:00:00.000Z`, warnings: [] }));
    const meta = makeMeta({ game, players, entryCount: entries.length });
    expect("outcome" in meta).toBe(false);
    return { meta, entries };
  }

  it("a finished legacy session gets its outcome from a replay, written with updateMeta", async () => {
    const { repo } = await setup();
    const { meta, entries } = legacy(true);
    await repo.importSession(meta, entries);
    const updated = await backfillOutcome(repo, meta);
    expect(updated.outcome).toEqual({ endedAt: entries.at(-1)!.at, winners: ["p2"] });
    expect((await repo.loadSession(meta.id))?.meta.outcome).toEqual(updated.outcome);
  });

  it("an unfinished session gets outcome null", async () => {
    const { repo } = await setup();
    const { meta, entries } = legacy(false);
    await repo.importSession(meta, entries);
    expect((await backfillOutcome(repo, meta)).outcome).toBeNull();
    expect((await repo.loadSession(meta.id))?.meta.outcome).toBeNull();
  });

  it("a load failure leaves the row unchanged and does not throw", async () => {
    const { repo } = await setup();
    const { meta, entries } = legacy(true);
    await repo.importSession(meta, entries);
    const failing = Object.assign(Object.create(repo) as SessionRepo, { loadSession: () => Promise.reject(new Error("boom")) });
    await expect(backfillOutcome(failing, meta)).resolves.toBe(meta);
    expect("outcome" in ((await repo.loadSession(meta.id))?.meta ?? {})).toBe(false);
  });
});
