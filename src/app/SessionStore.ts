import { runPipeline } from "../domain/actions/pipeline";
import type { Warning } from "../domain/actions/schemas";
import type { SessionState } from "../domain/events/state";
import { effectiveLog, type EffectiveGroup } from "../domain/ledger/effectiveLog";
import type { EntrySource, GroupEntry, GroupId, LogEntry, UndoEntry } from "../domain/ledger/entries";
import { advance, type ReplayCursor } from "../domain/ledger/replay";
import { SNAPSHOT_EVERY, invalidatedBy, rebuild, toSnapshot, type Snapshot } from "../domain/ledger/snapshots";
import { isSetup, newestUndoable, undoRangeOf, type UndoRange } from "../domain/ledger/undo";
import { gameEndStatus, outcomeOf, sameOutcome, type GameEndStatus } from "../domain/mechanics/gameEnd";
import type { InvariantWarning } from "../domain/mechanics/invariants";
import type { SessionMeta } from "../domain/session";
import type { PlayerId } from "../domain/types";
import type { EntryWriter, SessionRepo } from "../persistence/sessionRepo";

export type { EntryWriter } from "../persistence/sessionRepo";

export interface StoreSnapshot {
  readonly meta: SessionMeta;
  readonly log: readonly LogEntry[];
  readonly effective: readonly EffectiveGroup[];
  readonly state: SessionState;
  /** Invariant violations at the current state (FR-015). Shown, never corrected. */
  readonly violations: readonly InvariantWarning[];
  /** Whether the game is finished, derived from the log (feature 007). */
  readonly gameEnd: GameEndStatus;
  /** Live elimination order (the frozen one is gameEnd.end.eliminationOrder). */
  readonly eliminationOrder: readonly PlayerId[];
  /** Every group that reached an automatic end, for History. */
  readonly autoEndGroups: readonly GroupId[];
}

export type StoreError =
  | { readonly ok: false; readonly error: "invalid"; readonly messageEs: string; readonly issues: readonly string[] }
  | { readonly ok: false; readonly error: "unavailable"; readonly messageEs: string }
  | { readonly ok: false; readonly error: "persist"; readonly messageEs: string }
  | { readonly ok: false; readonly error: "notFound"; readonly messageEs: string }
  /** Feature 010 (FR-003): more than one entry would be undone; call again with `confirmed: true`. */
  | { readonly ok: false; readonly error: "confirmRange"; readonly messageEs: string; readonly range: UndoRange };

export type DispatchResult =
  | { readonly ok: true; readonly group: GroupEntry; readonly warnings: readonly Warning[] }
  | StoreError;

/** Feature 010 (data-model §4): the undo entry written and the groups it undid, newest first. */
export type UndoResult = { readonly ok: true; readonly entry: UndoEntry; readonly undone: readonly EffectiveGroup[] } | StoreError;

export interface UndoOptions {
  /** Undo a range of more than one entry (FR-003). */
  readonly confirmed?: boolean;
}

export interface DispatchOptions {
  readonly source?: EntrySource;
  readonly transcript?: string;
}

export interface StoreOptions {
  readonly now?: () => string;
  /** A stored snapshot to start from instead of replaying the whole log. */
  readonly snapshot?: Snapshot;
}

/**
 * The only writer of session state (research R2). Every write goes through the pipeline, is
 * persisted, and only then becomes visible to subscribers (FR-090).
 */
export class SessionStore {
  private snapshot: StoreSnapshot;
  private cursor: ReplayCursor;
  private snapshots: Snapshot[];
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => string;

  constructor(
    private readonly writer: EntryWriter,
    meta: SessionMeta,
    log: readonly LogEntry[],
    options: StoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.snapshots = options.snapshot ? [options.snapshot] : [];
    this.cursor = this.rebuild(meta, log);
    this.snapshot = view(meta, log, this.cursor);
  }

  static async open(repo: SessionRepo, id: string, options: Omit<StoreOptions, "snapshot"> = {}): Promise<SessionStore | undefined> {
    const loaded = await repo.loadSession(id);
    if (!loaded) return undefined;
    return new SessionStore(repo, loaded.meta, loaded.entries, {
      ...options,
      ...(loaded.snapshot ? { snapshot: loaded.snapshot } : {}),
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): StoreSnapshot => this.snapshot;

  /** Validates, expands and appends one group. Writes are serialized. */
  dispatch(action: unknown, options: DispatchOptions = {}): Promise<DispatchResult> {
    return this.enqueue(() => this.doDispatch(action, options));
  }

  /**
   * Undoes the newest effective non-setup group, with no confirmation (feature 010, FR-004).
   * Undo only ever runs newest first, so no later group can keep events computed from a state
   * that no longer exists.
   */
  undoLast(): Promise<UndoResult> {
    return this.enqueue(() => {
      const target = newestUndoable(this.snapshot.log);
      if (!target) return Promise.resolve({ ok: false, error: "notFound", messageEs: "No hay nada que deshacer" } as const);
      return this.writeUndo([target]);
    });
  }

  /**
   * Undoes the entry and every later active one (feature 010, contracts/undo-store.md). A range
   * of more than one comes back as "confirmRange" unless `confirmed`; nothing is written then.
   */
  undoTo(groupId: string, options: UndoOptions = {}): Promise<UndoResult> {
    return this.enqueue(() => {
      const { log } = this.snapshot;
      const range = undoRangeOf(log, groupId);
      if (!range) return Promise.resolve(this.notUndoable(groupId));
      if (range.count > 1 && !options.confirmed) {
        return Promise.resolve({ ok: false, error: "confirmRange", messageEs: `Se van a deshacer ${range.count} entradas`, range } as const);
      }
      return this.writeUndo(range.groups);
    });
  }

  /**
   * Table configuration that is not game state (the chip set, the bank pins, the name): saved to
   * the session metadata, never to the log (data-model §2).
   */
  updateMeta(patch: Pick<Partial<SessionMeta>, "chipSet" | "name" | "bankPins">): Promise<{ ok: true } | StoreError> {
    return this.enqueue(async () => {
      const { meta } = this.snapshot;
      try {
        await this.writer.updateMeta?.(meta.id, patch);
      } catch {
        return { ok: false, error: "persist", messageEs: "No se pudo guardar. Inténtalo de nuevo." } as const;
      }
      this.snapshot = { ...this.snapshot, meta: { ...meta, ...patch } };
      for (const listener of this.listeners) listener();
      return { ok: true } as const;
    });
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async doDispatch(action: unknown, options: DispatchOptions): Promise<DispatchResult> {
    const { meta, state, log, gameEnd } = this.snapshot;
    const result = runPipeline({ game: meta.game, players: meta.players, state, gameEnd }, action);
    if (result.kind === "invalid") {
      return { ok: false, error: "invalid", messageEs: "Acción no válida", issues: result.issues };
    }
    if (result.kind === "unavailable") {
      return { ok: false, error: "unavailable", messageEs: result.reasonEs };
    }
    const seq = nextSeq(log);
    const group: GroupEntry = {
      kind: "group",
      seq,
      id: `g${seq}`,
      at: this.now(),
      source: options.source ?? "touch",
      action: result.action,
      events: result.events,
      touches: result.touches,
      ...(options.transcript !== undefined ? { transcript: options.transcript } : {}),
      warnings: result.warnings,
    };
    const failed = await this.persist(group);
    return failed ?? { ok: true, group, warnings: result.warnings };
  }

  private notUndoable(groupId: string): StoreError {
    const group = this.snapshot.log.find((e) => e.kind === "group" && e.id === groupId);
    const messageEs =
      group?.kind !== "group"
        ? "Esa entrada no existe"
        : isSetup(group)
          ? "Esa entrada no se puede deshacer"
          : "Esa entrada ya está deshecha";
    return { ok: false, error: "notFound", messageEs };
  }

  /** One entry per undo intent (R1): `groups` newest first. */
  private async writeUndo(groups: readonly EffectiveGroup[]): Promise<UndoResult> {
    const entry: UndoEntry = { kind: "undo", seq: nextSeq(this.snapshot.log), at: this.now(), groupIds: groups.map((g) => g.id) };
    const failed = await this.persist(entry);
    return failed ?? { ok: true, entry, undone: groups };
  }

  /**
   * Persist first; only a committed entry changes state and notifies. The next cursor is computed
   * before the write so the Home outcome (feature 007) goes into the entry's own transaction.
   */
  private async persist(entry: LogEntry): Promise<StoreError | undefined> {
    const { meta, log } = this.snapshot;
    const nextLog = [...log, entry];
    // A new group only appends: apply it to the current cursor. An undo changes history: replay
    // from the last snapshot it leaves valid.
    const stale = entry.kind === "group" ? [] : this.snapshots.filter((s) => invalidatedBy(log, entry, s));
    const cursor =
      entry.kind === "group"
        ? advance(meta.game, this.cursor, entry)
        : rebuild(meta.game, meta.players, nextLog, this.snapshots.filter((s) => !stale.includes(s)));
    const outcome = outcomeOf(meta.game, meta.players, cursor);
    const metaPatch = sameOutcome(meta.outcome, outcome) ? undefined : { outcome };
    try {
      await this.writer.appendEntry(meta.id, entry, metaPatch);
    } catch {
      return { ok: false, error: "persist", messageEs: "No se pudo guardar. Inténtalo de nuevo." };
    }
    const nextMeta = { ...meta, ...metaPatch, updatedAt: entry.at, entryCount: meta.entryCount + 1 };

    if (entry.kind === "group") {
      const count = effectiveLog(nextLog).length;
      if (count % SNAPSHOT_EVERY === 0) {
        const snap = toSnapshot(cursor, entry.seq, count);
        this.snapshots.push(snap);
        void this.writer.putSnapshot?.(meta.id, snap).catch(() => undefined);
      }
    } else if (stale.length > 0) {
      this.snapshots = this.snapshots.filter((s) => !stale.includes(s));
      const from = Math.min(...stale.map((s) => s.seq));
      void this.writer.deleteSnapshotsFrom?.(meta.id, from).catch(() => undefined);
    }

    this.cursor = cursor;
    this.snapshot = view(nextMeta, nextLog, cursor);
    for (const listener of this.listeners) listener();
    return undefined;
  }

  private rebuild(meta: SessionMeta, log: readonly LogEntry[]): ReplayCursor {
    return rebuild(meta.game, meta.players, log, this.snapshots);
  }
}

function nextSeq(log: readonly LogEntry[]): number {
  return log.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
}

function view(meta: SessionMeta, log: readonly LogEntry[], cursor: ReplayCursor): StoreSnapshot {
  const effective = effectiveLog(log);
  return {
    meta,
    log,
    effective,
    state: cursor.state,
    violations: cursor.violations,
    gameEnd: gameEndStatus(cursor, effective),
    eliminationOrder: cursor.eliminationOrder,
    autoEndGroups: cursor.autoEndGroups,
  };
}
