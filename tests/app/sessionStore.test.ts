import { describe, expect, it } from "vitest";
import { SessionStore, type EntryWriter } from "../../src/app/SessionStore";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { freshDbName, makeMeta } from "../helpers/session";

async function newStore() {
  const repo = new SessionRepo(await openCompanionDb(freshDbName()));
  const meta = makeMeta();
  await repo.createSession(meta);
  return { repo, meta, store: new SessionStore(repo, meta, []) };
}

describe("SessionStore.dispatch", () => {
  it("persists the entry before subscribers see the new state (FR-090)", async () => {
    const { repo, meta, store } = await newStore();
    let persistedWhenNotified = -1;
    store.subscribe(() => {
      persistedWhenNotified = store.getSnapshot().log.length;
    });
    const result = await store.dispatch({ type: "note", text: "hola" });
    expect(result.ok).toBe(true);
    expect(persistedWhenNotified).toBe(1);
    expect((await repo.loadSession(meta.id))?.entries).toHaveLength(1);
  });

  it("leaves state unchanged when persisting fails", async () => {
    const failing: EntryWriter = {
      appendEntry: () => Promise.reject(new Error("disk full")),
    };
    const store = new SessionStore(failing, makeMeta(), []);
    const before = store.getSnapshot();
    let notified = false;
    store.subscribe(() => (notified = true));
    const result = await store.dispatch({ type: "note", text: "hola" });
    expect(result.ok).toBe(false);
    expect(store.getSnapshot()).toBe(before);
    expect(notified).toBe(false);
  });

  it("rejects an invalid payload without writing", async () => {
    const { repo, meta, store } = await newStore();
    const result = await store.dispatch({ type: "note", text: 42 });
    expect(result.ok).toBe(false);
    expect((await repo.loadSession(meta.id))?.entries).toHaveLength(0);
  });

  it("assigns sequential seq numbers and group ids", async () => {
    const { store } = await newStore();
    await store.dispatch({ type: "note", text: "a" });
    await store.dispatch({ type: "note", text: "b" });
    const log = store.getSnapshot().log;
    expect(log.map((e) => e.seq)).toEqual([1, 2]);
    expect(log.map((e) => (e.kind === "group" ? e.id : null))).toEqual(["g1", "g2"]);
  });
});

describe("SessionStore.revert", () => {
  it("appends a revert entry for the last active group", async () => {
    const { store } = await newStore();
    await store.dispatch({ type: "note", text: "a" });
    await store.dispatch({ type: "note", text: "b" });
    const result = await store.revert();
    expect(result.ok).toBe(true);
    const log: readonly LogEntry[] = store.getSnapshot().log;
    expect(log[2]).toMatchObject({ kind: "revert", groupId: "g2" });
    expect(store.getSnapshot().effective.map((g) => g.id)).toEqual(["g1"]);
  });

  it("skips already reverted groups when undoing again", async () => {
    const { store } = await newStore();
    await store.dispatch({ type: "note", text: "a" });
    await store.dispatch({ type: "note", text: "b" });
    await store.revert();
    await store.revert();
    expect(store.getSnapshot().effective).toEqual([]);
  });

  it("reloads the same state from the repository", async () => {
    const { repo, meta, store } = await newStore();
    await store.dispatch({ type: "note", text: "a" });
    await store.revert();
    const reopened = await SessionStore.open(repo, meta.id);
    expect(reopened?.getSnapshot().state).toEqual(store.getSnapshot().state);
    expect(reopened?.getSnapshot().log).toEqual(store.getSnapshot().log);
  });
});
