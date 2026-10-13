import { describe, expect, it, vi } from "vitest";
import { SessionStore, type EntryWriter } from "../../src/app/SessionStore";
import type { ActionContext } from "../../src/domain/actions/context";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import type { SessionState } from "../../src/domain/events/state";
import { groupHistory } from "../../src/domain/ledger/effectiveLog";
import { SNAPSHOT_EVERY } from "../../src/domain/ledger/snapshots";
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

describe("SessionStore.undoLast (feature 010, US1)", () => {
  async function notes(texts: string[]) {
    const ctx = await newStore();
    for (const text of texts) await ctx.store.dispatch({ type: "note", text });
    return ctx;
  }

  it("appends exactly one undo entry for the newest group and restores the state before it", async () => {
    const { store } = await notes(["a"]);
    const before = store.getSnapshot().state;
    await store.dispatch({ type: "transferMoney", from: "bank", to: "player:p1", amount: 30 });
    const result = await store.undoLast();
    if (!result.ok) throw new Error(result.messageEs);
    const { log, effective, state } = store.getSnapshot();
    expect(log).toHaveLength(3);
    expect(log[2]).toMatchObject({ kind: "undo", seq: 3, groupIds: ["g2"] });
    expect(result.entry).toEqual(log[2]);
    expect(result.undone.map((g) => g.id)).toEqual(["g2"]);
    expect(effective.map((g) => g.id)).toEqual(["g1"]);
    expect(state).toEqual(before);
  });

  it("undoes again from the newest still active group", async () => {
    const { store } = await notes(["a", "b"]);
    await store.undoLast();
    await store.undoLast();
    expect(store.getSnapshot().effective).toEqual([]);
  });

  it("with nothing but the setup group returns notFound", async () => {
    const { store } = await newStore();
    expect(await store.undoLast()).toMatchObject({ ok: false, error: "notFound", messageEs: "No hay nada que deshacer" });
    await store.dispatch({ type: "createSession", players: makeMeta().players, walletMode: "appTruth" });
    const log = store.getSnapshot().log;
    expect(await store.undoLast()).toMatchObject({ ok: false, error: "notFound", messageEs: "No hay nada que deshacer" });
    expect(store.getSnapshot().log).toBe(log);
  });

  it("a legacy amended newest group is undone as a whole", async () => {
    const { repo, meta, store } = await notes(["a", "b"]);
    await repo.appendEntry(meta.id, {
      kind: "amend",
      seq: 3,
      at: "2026-10-01T20:00:00.000Z",
      groupId: "g2",
      action: { type: "note", text: "b2" },
      events: [{ t: "note", text: "b2" }],
      touches: [],
    });
    expect(store.getSnapshot().log).toHaveLength(2);
    const reopened = (await SessionStore.open(repo, meta.id))!;
    const result = await reopened.undoLast();
    expect(result.ok).toBe(true);
    expect(reopened.getSnapshot().effective.map((g) => g.id)).toEqual(["g1"]);
    expect(groupHistory(reopened.getSnapshot().log).find((h) => h.group.id === "g2")?.status).toBe("reverted");
  });

  it("reloads the same state from the repository", async () => {
    const { repo, meta, store } = await notes(["a"]);
    await store.undoLast();
    const reopened = await SessionStore.open(repo, meta.id);
    expect(reopened?.getSnapshot().state).toEqual(store.getSnapshot().state);
    expect(reopened?.getSnapshot().log).toEqual(store.getSnapshot().log);
  });

  it("a persist failure leaves log, state and snapshots unchanged", async () => {
    const { store: seed } = await notes(["a", "b"]);
    const deleted: number[] = [];
    const failing: EntryWriter = {
      appendEntry: () => Promise.reject(new Error("disk full")),
      deleteSnapshotsFrom: (_id, seq) => {
        deleted.push(seq);
        return Promise.resolve();
      },
    };
    const store = new SessionStore(failing, makeMeta(), seed.getSnapshot().log);
    const before = store.getSnapshot();
    let notified = false;
    store.subscribe(() => (notified = true));
    expect(await store.undoLast()).toMatchObject({ ok: false, error: "persist" });
    expect(store.getSnapshot()).toBe(before);
    expect(notified).toBe(false);
    expect(deleted).toEqual([]);
  });

  it("drops snapshots from the undone group on, in memory and in IndexedDB", async () => {
    const { repo, meta, store } = await notes(Array.from({ length: SNAPSHOT_EVERY }, (_, i) => `n${i}`));
    expect((await repo.loadSession(meta.id))?.snapshot?.seq).toBe(SNAPSHOT_EVERY);
    await store.undoLast();
    // The delete is fire-and-forget after the entry commits.
    await vi.waitFor(async () => expect((await repo.loadSession(meta.id))?.snapshot).toBeUndefined());
    const reopened = await SessionStore.open(repo, meta.id);
    expect(reopened?.getSnapshot().state).toEqual(store.getSnapshot().state);
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
    expect((await store.undoLast()).ok).toBe(true);
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
    await store.undoLast();
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

    await store.undoLast();
    expect(store.getSnapshot().gameEnd.end?.groupId).toBe("g2");
    await store.undoLast();
    expect(store.getSnapshot().gameEnd.end).toBeNull();
    expect(store.getSnapshot().autoEndGroups).toEqual([]);
    expect(store.getSnapshot().meta.outcome).toBeNull();
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

    await store.undoLast();
    expect(patches.at(-1)).toBeUndefined();
    await store.undoLast();
    expect(patches.at(-1)).toEqual({ outcome: null });
    expect((await repo.loadSession(meta.id))?.meta.outcome).toBeNull();
  });
});

describe("SessionStore.undoTo (feature 010, US2, contracts/undo-store.md)", () => {
  /** createSession (g1) then notes g2… */
  async function played(count: number) {
    const ctx = await newStore();
    await ctx.store.dispatch({ type: "createSession", players: makeMeta().players, walletMode: "appTruth" });
    const states = new Map<string, SessionState>();
    for (let i = 0; i < count; i++) {
      const before = ctx.store.getSnapshot().state;
      const r = await ctx.store.dispatch({ type: "transferMoney", from: "bank", to: "player:p1", amount: 10 + i });
      if (!r.ok) throw new Error(r.messageEs);
      states.set(r.group.id, before);
    }
    return { ...ctx, states };
  }

  it("refuses an unknown, an undone or the setup entry without writing", async () => {
    const { store } = await played(3);
    expect(await store.undoTo("g99")).toMatchObject({ ok: false, error: "notFound", messageEs: "Esa entrada no existe" });
    expect(await store.undoTo("g1")).toMatchObject({ ok: false, error: "notFound", messageEs: "Esa entrada no se puede deshacer" });
    await store.undoLast();
    const log = store.getSnapshot().log;
    expect(await store.undoTo("g4")).toMatchObject({ ok: false, error: "notFound", messageEs: "Esa entrada ya está deshecha" });
    expect(store.getSnapshot().log).toBe(log);
  });

  it("a range of more than one asks for confirmation and writes nothing (FR-003)", async () => {
    const { repo, meta, store } = await played(5);
    const log = store.getSnapshot().log;
    const result = await store.undoTo("g3");
    expect(result).toMatchObject({ ok: false, error: "confirmRange", messageEs: "Se van a deshacer 4 entradas" });
    if (result.ok || result.error !== "confirmRange") throw new Error("expected confirmRange");
    expect(result.range.count).toBe(4);
    expect(result.range.oldest.id).toBe("g3");
    expect(result.range.newest.id).toBe("g6");
    expect(store.getSnapshot().log).toBe(log);
    expect((await repo.loadSession(meta.id))?.entries).toHaveLength(log.length);
  });

  it("confirmed: one undo entry with the range newest first, and the state before the target", async () => {
    const { store, states } = await played(5);
    const result = await store.undoTo("g3", { confirmed: true });
    if (!result.ok) throw new Error(result.messageEs);
    const { log, effective, state } = store.getSnapshot();
    expect(log.filter((e) => e.kind === "undo")).toEqual([result.entry]);
    expect(result.entry.groupIds).toEqual(["g6", "g5", "g4", "g3"]);
    expect(result.undone.map((g) => g.id)).toEqual(["g6", "g5", "g4", "g3"]);
    expect(effective.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(state).toEqual(states.get("g3"));
  });

  it("undoTo the newest entry is a plain undo, with no confirmation (FR-004)", async () => {
    const { store, states } = await played(3);
    const result = await store.undoTo("g4");
    if (!result.ok) throw new Error(result.messageEs);
    expect(result.entry.groupIds).toEqual(["g4"]);
    expect(store.getSnapshot().state).toEqual(states.get("g4"));
  });

  it("1830: sell, start the OR and pay out, then undo back to the sell: the price is the pre-sell price (R3)", async () => {
    const players = makePlayers(["Ana", "Bruno", "Carla", "Dani"]);
    const repo = new SessionRepo(await openCompanionDb(freshDbName()));
    const meta = makeMeta({ game: getBuiltInGame("1830"), players });
    await repo.createSession(meta);
    const store = new SessionStore(repo, meta, []);
    for (const action of [
      { type: "createSession", players, walletMode: "appTruth" },
      { type: "startSR" },
      { type: "parCompany", player: "p1", company: "PRR", price: 100 },
      { type: "buyShare", buyer: "player:p2", company: "PRR", source: "ipo", count: 4 },
    ]) {
      const r = await store.dispatch(action);
      if (!r.ok) throw new Error(`${action.type}: ${r.messageEs}`);
    }
    const before = store.getSnapshot().state;
    const sold = await store.dispatch({ type: "sellShares", seller: "player:p2", company: "PRR", count: 1 });
    if (!sold.ok) throw new Error(sold.messageEs);
    expect(store.getSnapshot().state.companies["PRR"]!.position).not.toEqual(before.companies["PRR"]!.position);
    for (const action of [
      { type: "endSR" },
      { type: "startOR" },
      { type: "runAndPayout", company: "PRR", parts: [{ part: "revenue", amount: 100 }], mode: "full" },
    ]) {
      const r = await store.dispatch(action);
      if (!r.ok) throw new Error(`${action.type}: ${r.messageEs}`);
    }
    const result = await store.undoTo(sold.group.id, { confirmed: true });
    expect(result.ok).toBe(true);
    expect(store.getSnapshot().state.companies["PRR"]!.position).toEqual(before.companies["PRR"]!.position);
    expect(store.getSnapshot().state).toEqual(before);
  });
});
