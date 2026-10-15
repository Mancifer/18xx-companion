import type { Action } from "../actions/schemas";
import { advanceTurn } from "../events/reduce";
import { cashOf, initialState, isPlayerBankrupt, type SessionState } from "../events/state";
import type { GameDefinition } from "../games/schema";
import type { Player, PlayerId } from "../types";
import type { EffectiveGroup } from "./effectiveLog";
import type { GroupId } from "./entries";

/**
 * The current operating phase and what each player settles with the bank at its end (feature 012,
 * data-model §1–§3). Derived, never stored.
 */

export interface OrRef {
  readonly orSet: number;
  readonly orIndex: number;
}

export interface SettlementMovement {
  readonly groupId: GroupId;
  readonly seq: number;
  /** The OR at the group's first counted money event for this player (research R4). */
  readonly or: OrRef;
  readonly action: Action;
  /** The player's signed net in this group, after the phase start. Never 0. */
  readonly amount: number;
}

export interface PlayerSettlement {
  readonly player: PlayerId;
  /** Bankrupt now (research R5): nothing to settle. */
  readonly out: boolean;
  readonly startCash: number;
  readonly cash: number;
  /** Cash now minus cash at the phase start: > 0 taken from the bank, < 0 paid to it. */
  readonly delta: number;
  /** In log order; they add up to `delta`. */
  readonly movements: readonly SettlementMovement[];
}

export interface OperatingPhase {
  /** The group whose turnAdvance opened the phase. */
  readonly startGroupId: GroupId;
  readonly firstOR: OrRef;
  /** The phase's last OR is over and the next round has not started (FR-010). */
  readonly over: boolean;
  /** Every player, in seat order. */
  readonly players: readonly PlayerSettlement[];
}

/**
 * Folds the turn over the effective log event by event (research R1): the first `turnAdvance` into
 * an OR from another round opens the phase, any other round closes it. Each player's money after
 * the opening event is summed per group (R2); the start cash is the cash now minus that sum.
 * Null when no phase is current.
 */
export function operatingPhase(
  game: GameDefinition,
  players: readonly Player[],
  effective: readonly EffectiveGroup[],
  state: SessionState,
): OperatingPhase | null {
  let turnState = initialState(game, []);
  let open: { startGroupId: GroupId; firstOR: OrRef } | null = null;
  let movements = new Map<string, SettlementMovement[]>();

  for (const group of [...effective].sort((a, b) => a.seq - b.seq)) {
    const nets = new Map<string, { amount: number; or: OrRef }>();
    for (const e of group.events) {
      if (e.t === "turnAdvance") {
        const wasOR = turnState.turn.round === "OR";
        turnState = advanceTurn(turnState, e);
        if (e.round === undefined) continue;
        if (e.round !== "OR") {
          open = null;
          movements = new Map();
          nets.clear();
        } else if (!wasOR) {
          open = { startGroupId: group.id, firstOR: orOf(turnState) };
          movements = new Map();
          nets.clear();
        }
        continue;
      }
      if (!open || e.t !== "moneyTransfer" || e.from === e.to) continue;
      for (const [holder, sign] of [
        [e.from, -1],
        [e.to, 1],
      ] as const) {
        if (!holder.startsWith("player:")) continue;
        const net = nets.get(holder) ?? { amount: 0, or: orOf(turnState) };
        net.amount += sign * e.amount;
        nets.set(holder, net);
      }
    }
    for (const [holder, net] of nets) {
      if (net.amount === 0) continue;
      const list = movements.get(holder) ?? [];
      list.push({ groupId: group.id, seq: group.seq, or: net.or, action: group.action, amount: net.amount });
      movements.set(holder, list);
    }
  }

  if (!open) return null;
  const turn = state.turn;
  return {
    startGroupId: open.startGroupId,
    firstOR: open.firstOR,
    over: turn.round === "OR" && turn.currentCompany === undefined && turn.orIndex >= turn.orsInSet,
    players: [...players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => {
        const ref = `player:${p.id}`;
        const list = movements.get(ref) ?? [];
        const delta = list.reduce((sum, m) => sum + m.amount, 0);
        const cash = cashOf(state, ref as `player:${string}`);
        return { player: p.id, out: isPlayerBankrupt(state, p.id), startCash: cash - delta, cash, delta, movements: list };
      }),
  };
}

function orOf(s: SessionState): OrRef {
  return { orSet: s.turn.orSet, orIndex: s.turn.orIndex };
}
