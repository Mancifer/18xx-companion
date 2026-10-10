import { runPipeline } from "../../src/domain/actions/pipeline";
import { reduceAll } from "../../src/domain/events/reduce";
import { initialState, type SessionState } from "../../src/domain/events/state";
import type { PrimitiveEvent } from "../../src/domain/events/types";
import type { Warning } from "../../src/domain/actions/schemas";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { EffectiveGroup } from "../../src/domain/ledger/effectiveLog";
import { checkInvariants } from "../../src/domain/mechanics/invariants";
import type { Player } from "../../src/domain/types";

/**
 * A pure in-memory session for domain tests: runs actions through the real pipeline and keeps
 * the reduced state. Throws on invalid or unavailable actions so tests fail loudly.
 */
export class TestSession {
  state: SessionState;
  lastEvents: readonly PrimitiveEvent[] = [];
  lastWarnings: readonly Warning[] = [];
  /** Every applied action as an effective group, in order (for queries over the log). */
  groups: EffectiveGroup[] = [];

  constructor(
    readonly game: GameDefinition,
    readonly players: readonly Player[],
  ) {
    this.state = initialState(game, players);
  }

  /** Dispatches createSession for the given players. */
  static start(game: GameDefinition, players: readonly Player[], walletMode: "appTruth" | "bankOnly" = "appTruth") {
    const s = new TestSession(game, players);
    s.do({ type: "createSession", players, walletMode });
    return s;
  }

  do(action: unknown): this {
    const result = runPipeline({ game: this.game, players: this.players, state: this.state }, action);
    if (result.kind !== "ok") {
      throw new Error(
        `${(action as { type?: string }).type ?? "?"}: ${result.kind === "invalid" ? result.issues.join("; ") : result.reasonEs}`,
      );
    }
    this.lastEvents = result.events;
    this.lastWarnings = result.warnings;
    const seq = this.groups.length + 1;
    this.groups.push({ id: `g${seq}`, seq, at: "2026-10-10T20:00:00.000Z", source: "touch", action: result.action, events: result.events, touches: result.touches });
    this.state = reduceAll(this.state, result.events);
    return this;
  }

  /** Applies raw events, for test setup that has no action yet. */
  apply(...events: PrimitiveEvent[]): this {
    this.state = reduceAll(this.state, events);
    return this;
  }

  tryDo(action: unknown) {
    return runPipeline({ game: this.game, players: this.players, state: this.state }, action);
  }

  violations() {
    return checkInvariants(this.game, this.state);
  }
}

export function makePlayers(names: readonly string[]): Player[] {
  const colors = ["#e53935", "#1e88e5", "#43a047", "#fdd835", "#8e24aa", "#fb8c00", "#6d4c41"];
  return names.map((name, i) => ({
    id: `p${i + 1}`,
    name,
    aliases: [],
    color: colors[i % colors.length] ?? "#888888",
    seat: i + 1,
  }));
}
