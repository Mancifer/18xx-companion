import { describe, expect, it, vi } from "vitest";
import { SessionStore, type EntryWriter } from "../../src/app/SessionStore";
import type { ActionContext } from "../../src/domain/actions/context";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import type { LogEntry } from "../../src/domain/ledger/entries";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import { getBuiltInGame } from "../../src/domain/games";
import { checkInvariants } from "../../src/domain/mechanics/invariants";
import { makePlayers } from "../helpers/dispatch";
import { ROTLA_NAMES, rotlaGame } from "../helpers/rotla";
import { freshDbName, makeMeta } from "../helpers/session";

/** Every context the store hands to the pipeline (feature 007: it must carry gameEnd). */
const pipelineContexts = vi.hoisted(() => [] as ActionContext[]);
vi.mock("../../src/domain/actions/pipeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/domain/actions/pipeline")>();
  return {
    ...original,
    runPipeline: (ctx: ActionContext, input: unknown) => {
      pipelineContexts.push(ctx);
      return original.runPipeline(ctx, input);
    },
  };
});

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

describe("SessionStore: the derived game end (feature 007)", () => {
  const players = makePlayers(ROTLA_NAMES.slice(0, 3));
  // RotLA Short is over after OR 4.2 with no Merger Round due.
  const setLastOR = { type: "setTurn", round: "OR", srNumber: 4, orSet: 4, orIndex: 2, orsInSet: 2, company: null };

  async function rotlaStore() {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta({ game: rotlaGame({ mode: "short" }), players });
    await repo.createSession(meta);
    const store = new SessionStore(repo, meta, []);
    await store.dispatch({ type: "createSession", players, walletMode: "appTruth" });
    return { repo, meta, store };
  }

  it("StoreSnapshot exposes gameEnd, eliminationOrder and autoEndGroups", async () => {
    const { store } = await rotlaStore();
    expect(store.getSnapshot().gameEnd).toEqual({ end: null, laterEntries: 0 });
    expect(store.getSnapshot().eliminationOrder).toEqual([]);
    expect(store.getSnapshot().autoEndGroups).toEqual([]);

    const ended = await store.dispatch(setLastOR);
    expect(ended.ok).toBe(true);
    const { gameEnd, autoEndGroups } = store.getSnapshot();
    expect(gameEnd.end).toMatchObject({ groupId: "g2", auto: true, triggers: ["cyclesComplete"] });
    expect(autoEndGroups).toEqual(["g2"]);

    await store.dispatch({ type: "note", text: "después" });
    expect(store.getSnapshot().gameEnd.laterEntries).toBe(1);
    await store.dispatch({ type: "declareBankruptcy", player: "p2", company: null });
    expect(store.getSnapshot().eliminationOrder).toEqual(["p2"]);
    expect(store.getSnapshot().gameEnd.end?.eliminationOrder).toEqual([]);
  });

  it("the ActionContext passed to runPipeline carries gameEnd", async () => {
    const { store } = await rotlaStore();
    await store.dispatch(setLastOR);
    pipelineContexts.length = 0;
    await store.dispatch({ type: "note", text: "después" });
    expect(pipelineContexts.at(-1)?.gameEnd?.end?.groupId).toBe("g2");
  });

  it("an undo of the ending group clears the end; reopening the store from IndexedDB gives the same gameEnd", async () => {
    const { repo, meta, store } = await rotlaStore();
    await store.dispatch(setLastOR);
    await store.dispatch({ type: "note", text: "después" });
    const reopened = await SessionStore.open(repo, meta.id);
    expect(reopened?.getSnapshot().gameEnd).toEqual(store.getSnapshot().gameEnd);
    expect(reopened?.getSnapshot().autoEndGroups).toEqual(["g2"]);

    await store.revert("g2", { confirmed: true });
    expect(store.getSnapshot().gameEnd.end).toBeNull();
    const again = await SessionStore.open(repo, meta.id);
    expect(again?.getSnapshot().gameEnd).toEqual({ end: null, laterEntries: 0 });
  });
});

describe("SessionStore: the Home outcome cache (feature 007, data-model §7)", () => {
  /** A repo whose appendEntry calls are recorded with their meta patch. */
  async function recordingStore() {
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta();
    await repo.createSession(meta);
    const patches: unknown[] = [];
    const writer: EntryWriter = {
      appendEntry: (id, entry, metaPatch) => {
        patches.push(metaPatch);
        return repo.appendEntry(id, entry, metaPatch);
      },
    };
    return { repo, meta, patches, store: new SessionStore(writer, meta, [], { now: () => "2026-10-10T21:00:00.000Z" }) };
  }
  const pay = (to: string, amount: number) => ({ type: "transferMoney", from: "bank", to, amount });

  it("writes outcome with the entry that ends the game, null after its undo, nothing when it is unchanged", async () => {
    const { repo, meta, patches, store } = await recordingStore();
    await store.dispatch(pay("player:p1", 50));
    const ended = await store.dispatch({ type: "endGame", triggers: null });
    if (!ended.ok) throw new Error(ended.messageEs);
    expect(patches.at(-1)).toEqual({ outcome: { endedAt: ended.group.at, winners: ["p1"] } });
    expect((await repo.loadSession(meta.id))?.meta.outcome).toEqual({ endedAt: ended.group.at, winners: ["p1"] });
    expect(store.getSnapshot().meta.outcome).toEqual({ endedAt: ended.group.at, winners: ["p1"] });

    await store.dispatch({ type: "note", text: "después del final" });
    expect(patches.at(-1)).toBeUndefined();

    await store.revert(ended.group.id, { confirmed: true });
    expect(patches.at(-1)).toEqual({ outcome: null });
    expect((await repo.loadSession(meta.id))?.meta.outcome).toBeNull();
  });

  it("amending an entry before the end so that another player wins writes the new winners", async () => {
    const { repo, meta, patches, store } = await recordingStore();
    const paid = await store.dispatch(pay("player:p1", 50));
    if (!paid.ok) throw new Error(paid.messageEs);
    await store.dispatch({ type: "endGame", triggers: null });
    await store.amend(paid.group.id, pay("player:p2", 50), { confirmed: true });
    expect(patches.at(-1)).toMatchObject({ outcome: { winners: ["p2"] } });
    expect((await repo.loadSession(meta.id))?.meta.outcome?.winners).toEqual(["p2"]);
  });
});
