import { describe, expect, it } from "vitest";
import { SessionStore, type EntryWriter } from "../../src/app/SessionStore";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import type { LogEntry } from "../../src/domain/ledger/entries";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { getBuiltInGame } from "../../src/domain/games";
import { checkInvariants } from "../../src/domain/mechanics/invariants";
import { makePlayers } from "../helpers/dispatch";
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

describe("SessionStore: the end step inside startOR (feature 003, US3)", () => {
  const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
  const buy = (player: string, company: string, count: number) => ({
    type: "buyShare",
    buyer: `player:${player}`,
    company,
    source: "ipo",
    count,
  });

  /** 1830 SR: NYC floated (capital pending) and PRR sold out to players at $76. */
  async function srStore() {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta({ game: getBuiltInGame("1830"), players });
    await repo.createSession(meta);
    const store = new SessionStore(repo, meta, []);
    for (const action of [
      { type: "createSession", players, walletMode: "appTruth" },
      { type: "startSR" },
      { type: "parCompany", player: "p1", company: "NYC", price: 82 },
      buy("p2", "NYC", 2),
      buy("p3", "NYC", 2),
      { type: "parCompany", player: "p1", company: "PRR", price: 76 },
      buy("p2", "PRR", 4),
      buy("p3", "PRR", 4),
    ]) {
      const result = await store.dispatch(action);
      if (!result.ok) throw new Error(`${action.type}: ${result.messageEs}`);
    }
    return store;
  }
  const last = (store: SessionStore) => store.getSnapshot().effective.at(-1)!;
  const nycCapital = (events: readonly PrimitiveEvent[]) =>
    events.filter((e) => e.t === "moneyTransfer" && e.to === "company:NYC");
  const soldOut = (events: readonly PrimitiveEvent[]) =>
    events.filter((e) => e.t === "marketMove" && e.reason === "soldOut");

  it("startOR is one group with the capital and the sold-out move", async () => {
    const store = await srStore();
    const before = store.getSnapshot().effective.length;
    expect((await store.dispatch({ type: "startOR" })).ok).toBe(true);
    expect(store.getSnapshot().effective).toHaveLength(before + 1);
    const group = last(store);
    expect(group.action.type).toBe("startOR");
    expect(nycCapital(group.events)).toHaveLength(1);
    expect(soldOut(group.events)).toEqual([{ t: "marketMove", company: "PRR", to: { row: 2, col: 6 }, reason: "soldOut" }]);
  });

  it("one undo goes back to the SR with capital pending and the price unmoved; startOR again applies it once", async () => {
    const store = await srStore();
    const before = store.getSnapshot().state;
    await store.dispatch({ type: "startOR" });
    expect((await store.revert()).ok).toBe(true);
    const { state } = store.getSnapshot();
    expect(state).toEqual(before);
    expect(state.turn.round).toBe("SR");
    expect(state.companies["NYC"]!.capitalPending).toBe(true);
    expect(state.companies["PRR"]!.position).toEqual({ row: 3, col: 6 });
    expect("roundEnded" in state.turn).toBe(false);
    expect(checkInvariants(store.getSnapshot().meta.game, state)).toEqual([]);

    await store.dispatch({ type: "startOR" });
    expect(nycCapital(last(store).events)).toHaveLength(1);
    expect(soldOut(last(store).events)).toHaveLength(1);
  });

  it("with endSR first, undoing startOR keeps the SR ended and a new startOR does not apply it again", async () => {
    const store = await srStore();
    await store.dispatch({ type: "endSR" });
    await store.dispatch({ type: "startOR" });
    await store.revert();
    const { state } = store.getSnapshot();
    expect(state.turn.round).toBe("SR");
    expect(state.turn.roundEnded).toBe(true);
    await store.dispatch({ type: "startOR" });
    expect(nycCapital(last(store).events)).toEqual([]);
    expect(soldOut(last(store).events)).toEqual([]);
  });
});
