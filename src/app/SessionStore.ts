import { runPipeline } from "../domain/actions/pipeline";
import type { Warning } from "../domain/actions/schemas";
import type { SessionState } from "../domain/events/state";
import { buildAmend } from "../domain/ledger/amend";
import { dependentsOf } from "../domain/ledger/dependencies";
import { effectiveLog, type EffectiveGroup } from "../domain/ledger/effectiveLog";
import type { AmendEntry, EntrySource, GroupEntry, GroupId, LogEntry, RevertEntry } from "../domain/ledger/entries";
import { advance, type ReplayCursor } from "../domain/ledger/replay";
import { SNAPSHOT_EVERY, invalidatedBy, rebuild, toSnapshot, type Snapshot } from "../domain/ledger/snapshots";
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
  /** FR-014: later entries depend on this one; call again with `confirmed: true`. */
  | {
      readonly ok: false;
      readonly error: "dependents";
      readonly messageEs: string;
      readonly dependents: readonly EffectiveGroup[];
    };

export type DispatchResult =
  | { readonly ok: true; readonly group: GroupEntry; readonly warnings: readonly Warning[] }
  | StoreError;

export type RevertResult = { readonly ok: true; readonly entry: RevertEntry } | StoreError;
export type AmendStoreResult = { readonly ok: true; readonly entry: AmendEntry } | StoreError;

export interface DispatchOptions {
  readonly source?: EntrySource;
  readonly transcript?: string;
}

export interface ConfirmOptions {
  /** Apply even though later entries depend on the target (FR-014). */
  readonly confirmed?: boolean;
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

  /** Undo (FR-012, FR-013): appends a revert entry for the given group, or the last active one. */
  revert(groupId?: string, options: ConfirmOptions = {}): Promise<RevertResult> {
    return this.enqueue(() => this.doRevert(groupId, options));
  }

  /** Correct a past group (FR-013, US2-2). Defaults to the last active group. */
  amend(groupId: string | undefined, action: unknown, options: ConfirmOptions = {}): Promise<AmendStoreResult> {
    return this.enqueue(() => this.doAmend(groupId, action, options));
  }

  /**
   * Table configuration that is not game state (the chip set, the name): saved to the session
   * metadata, never to the log (data-model §2).
   */
  updateMeta(patch: Pick<Partial<SessionMeta>, "chipSet" | "name">): Promise<{ ok: true } | StoreError> {
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

  /** Later active groups that depend on this one (FR-014), without changing anything. */
  dependentsOf(groupId: string, extraKeys: readonly string[] = []): readonly EffectiveGroup[] {
    return dependentsOf(this.snapshot.log, groupId, extraKeys);
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

  private async doRevert(groupId: string | undefined, options: ConfirmOptions): Promise<RevertResult> {
    const { effective, log } = this.snapshot;
    const target = groupId ?? effective[effective.length - 1]?.id;
    if (!target || !effective.some((g) => g.id === target)) {
      return { ok: false, error: "notFound", messageEs: "No hay nada que deshacer" };
    }
    const blocked = this.needsConfirmation(target, [], options);
    if (blocked) return blocked;
    const entry: RevertEntry = { kind: "revert", seq: nextSeq(log), at: this.now(), groupId: target };
    const failed = await this.persist(entry);
    return failed ?? { ok: true, entry };
  }

  private async doAmend(groupId: string | undefined, action: unknown, options: ConfirmOptions): Promise<AmendStoreResult> {
    const { meta, effective, log } = this.snapshot;
    const target = groupId ?? effective[effective.length - 1]?.id;
    if (!target) return { ok: false, error: "notFound", messageEs: "No hay nada que corregir" };
    const built = buildAmend(meta.game, meta.players, log, target, action, { seq: nextSeq(log), at: this.now() });
    if (!built.ok) {
      return built.issues
        ? { ok: false, error: "invalid", messageEs: built.reasonEs, issues: built.issues }
        : { ok: false, error: "unavailable", messageEs: built.reasonEs };
    }
    const blocked = this.needsConfirmation(target, built.entry.touches, options);
    if (blocked) return blocked;
    const failed = await this.persist(built.entry);
    return failed ?? { ok: true, entry: built.entry };
  }

  private needsConfirmation(groupId: string, extraKeys: readonly string[], options: ConfirmOptions): StoreError | undefined {
    if (options.confirmed) return undefined;
    const dependents = this.dependentsOf(groupId, extraKeys);
    if (dependents.length === 0) return undefined;
    return {
      ok: false,
      error: "dependents",
      messageEs: `Hay ${dependents.length} ${dependents.length === 1 ? "entrada posterior que depende" : "entradas posteriores que dependen"} de esta`,
      dependents,
    };
  }

  /**
   * Persist first; only a committed entry changes state and notifies. The next cursor is computed
   * before the write so the Home outcome (feature 007) goes into the entry's own transaction.
   */
  private async persist(entry: LogEntry): Promise<StoreError | undefined> {
    const { meta, log } = this.snapshot;
    const nextLog = [...log, entry];
    // A new group only appends: apply it to the current cursor. A revert or amend changes
    // history: replay from the last snapshot it leaves valid.
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
