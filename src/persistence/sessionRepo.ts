import type { LogEntry } from "../domain/ledger/entries";
import type { Snapshot } from "../domain/ledger/snapshots";
import type { SessionMeta, SessionOutcome } from "../domain/session";

/** Derived meta written with an entry, in its transaction (feature 007). */
export interface MetaPatch {
  readonly outcome: SessionOutcome | null;
}
import type { CompanionDb } from "./db";

/** The store's write port (tests can fake it). Snapshot methods are optional: an optimization. */
export interface EntryWriter {
  appendEntry(sessionId: string, entry: LogEntry, metaPatch?: MetaPatch): Promise<void>;
  putSnapshot?(sessionId: string, snapshot: Snapshot): Promise<void>;
  deleteSnapshotsFrom?(sessionId: string, seq: number): Promise<void>;
  /** Table configuration outside the log (name, chip set, data-model §2). */
  updateMeta?(sessionId: string, patch: Partial<Omit<SessionMeta, "id">>): Promise<SessionMeta>;
}

export interface LoadedSession {
  readonly meta: SessionMeta;
  readonly entries: LogEntry[];
  /** The latest stored snapshot, if any. */
  readonly snapshot?: Snapshot;
}

const STRICT = { durability: "strict" } as const;

export class SessionRepo implements EntryWriter {
  constructor(private readonly db: CompanionDb) {}

  async createSession(meta: SessionMeta): Promise<void> {
    await this.db.put("sessions", meta);
  }

  /**
   * Writes the entry and the session's updatedAt/entryCount in one strict transaction, and
   * resolves only once it has committed (FR-090, research R6). A meta patch (the Home outcome)
   * goes into the same transaction, so the cache never disagrees with the log.
   */
  async appendEntry(sessionId: string, entry: LogEntry, metaPatch?: MetaPatch): Promise<void> {
    const tx = this.db.transaction(["entries", "sessions"], "readwrite", STRICT);
    // A failed request aborts the transaction; the caller gets that request's error, so the
    // abort itself must not surface as an unhandled rejection.
    tx.done.catch(() => undefined);
    const meta = await tx.objectStore("sessions").get(sessionId);
    if (!meta) throw new Error(`Unknown session ${sessionId}`);
    await tx.objectStore("entries").add({ sessionId, seq: entry.seq, entry });
    await tx.objectStore("sessions").put({
      ...meta,
      ...metaPatch,
      updatedAt: entry.at,
      entryCount: meta.entryCount + 1,
    });
    await tx.done;
  }

  /** Writes an imported session and its whole log in one strict transaction (US8). */
  async importSession(meta: SessionMeta, entries: readonly LogEntry[]): Promise<void> {
    const tx = this.db.transaction(["sessions", "entries"], "readwrite", STRICT);
    await tx.objectStore("sessions").put(meta);
    for (const entry of entries) await tx.objectStore("entries").put({ sessionId: meta.id, seq: entry.seq, entry });
    await tx.done;
  }

  async loadSession(id: string): Promise<LoadedSession | undefined> {
    const meta = await this.db.get("sessions", id);
    if (!meta) return undefined;
    const rows = await this.db.getAllFromIndex("entries", "bySession", id);
    const snapshots = await this.db.getAllFromIndex("snapshots", "bySession", id);
    const latest = snapshots.sort((a, b) => b.seq - a.seq)[0];
    return {
      meta,
      entries: rows.sort((a, b) => a.seq - b.seq).map((r) => r.entry),
      ...(latest ? { snapshot: latest.snapshot } : {}),
    };
  }

  async putSnapshot(sessionId: string, snapshot: Snapshot): Promise<void> {
    await this.db.put("snapshots", { sessionId, seq: snapshot.seq, snapshot });
  }

  /** Drops snapshots at or after seq (a revert or amend made them stale). */
  async deleteSnapshotsFrom(sessionId: string, seq: number): Promise<void> {
    const tx = this.db.transaction("snapshots", "readwrite", STRICT);
    const range = IDBKeyRange.bound([sessionId, seq], [sessionId, Number.MAX_SAFE_INTEGER]);
    await tx.store.delete(range);
    await tx.done;
  }

  async listSessions(): Promise<SessionMeta[]> {
    const all = await this.db.getAll("sessions");
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async updateMeta(id: string, patch: Partial<Omit<SessionMeta, "id">>): Promise<SessionMeta> {
    const tx = this.db.transaction("sessions", "readwrite", STRICT);
    const meta = await tx.store.get(id);
    if (!meta) throw new Error(`Unknown session ${id}`);
    const next = { ...meta, ...patch };
    await tx.store.put(next);
    await tx.done;
    return next;
  }

  async deleteSession(id: string): Promise<void> {
    const tx = this.db.transaction(["sessions", "entries", "snapshots"], "readwrite", STRICT);
    await tx.objectStore("sessions").delete(id);
    for (const store of ["entries", "snapshots"] as const) {
      const keys = await tx.objectStore(store).index("bySession").getAllKeys(id);
      for (const key of keys) await tx.objectStore(store).delete(key);
    }
    await tx.done;
  }
}
