import { reduce } from "../events/reduce";
import { cashOf, initialState, type SessionState } from "../events/state";
import type { CompanyStatus, EventOf, MarketMoveReason, PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import { priceAt } from "../mechanics/market";
import { parseHolder, type AssetId, type CompanyId, type HolderRef, type Player } from "../types";
import { effectiveLog, groupHistory, type EffectiveGroup, type GroupStatus } from "./effectiveLog";
import type { GroupId, LogEntry } from "./entries";

/**
 * Where an entry's money went (feature 010, data-model §5, research R5): derived on demand from
 * the stored events and a replay of the entry's own timeline, never stored. Works for undone
 * entries and for sessions saved before this feature.
 */
export interface EntryBreakdown {
  readonly groupId: GroupId;
  readonly status: GroupStatus;
  /** In event order. */
  readonly movements: readonly Movement[];
  /** Holders whose cash changed: players by seat, companies in definition order, then the bank, the pool and the rest. */
  readonly balances: readonly BalanceChange[];
}

export type Movement =
  /** Same-direction repeats between the same pair are summed; opposite directions never net. */
  | { readonly kind: "money"; readonly from: HolderRef; readonly to: HolderRef; readonly amount: number }
  | {
      readonly kind: "shares";
      readonly company: CompanyId;
      readonly from: HolderRef;
      readonly to: HolderRef;
      readonly units: number;
      readonly presidency: boolean;
    }
  /** Trains and privates. */
  | { readonly kind: "asset"; readonly asset: AssetId; readonly from: HolderRef; readonly to: HolderRef }
  | {
      readonly kind: "price";
      readonly company: CompanyId;
      /** null: no price (not on the market, or a cell without one). */
      readonly from: number | null;
      readonly to: number | null;
      readonly reason: MarketMoveReason;
      /** The cell is in the receivership zone or is the closing cell. */
      readonly zone?: "receivership" | "closed";
    }
  | { readonly kind: "status"; readonly company: CompanyId; readonly from: CompanyStatus; readonly to: CompanyStatus }
  | { readonly kind: "counter"; readonly subject: HolderRef; readonly key: string; readonly delta: number }
  /** Round, phase and turn markers, worded as effectsEs does. */
  | { readonly kind: "turn"; readonly event: EventOf<"turnAdvance"> };

export interface BalanceChange {
  readonly holder: HolderRef;
  /** null: the bank of an unlimited-bank game, shown as the amount only (FR-011). */
  readonly before: number | null;
  readonly after: number | null;
  readonly delta: number;
}

/**
 * The effective log the group belonged to: the current one for an effective group; for an undone
 * one, the effective log just before the entry that undid it. Under in-order undo that is exactly
 * the game the group was applied in.
 */
export function timelineOf(log: readonly LogEntry[], groupId: GroupId): readonly EffectiveGroup[] | undefined {
  const history = groupHistory(log).find((h) => h.group.id === groupId);
  if (!history) return undefined;
  const undoneBy = history.undoneBy;
  return undoneBy === undefined ? effectiveLog(log) : effectiveLog(log.filter((e) => e.seq < undoneBy));
}

export function entryBreakdown(
  game: GameDefinition,
  players: readonly Player[],
  log: readonly LogEntry[],
  groupId: GroupId,
): EntryBreakdown | undefined {
  const history = groupHistory(log).find((h) => h.group.id === groupId);
  const timeline = timelineOf(log, groupId);
  const group = timeline?.find((g) => g.id === groupId);
  if (!history || !timeline || !group) return undefined;

  let before = initialState(game, players);
  for (const g of timeline) {
    if (g.seq >= group.seq) break;
    for (const e of g.events) before = reduce(before, e);
  }

  const movements: Movement[] = [];
  const moneyAt = new Map<string, number>();
  let state = before;
  for (const e of group.events) {
    const line = movementOf(game, state, e);
    if (line?.kind === "money") {
      const key = `${line.from}|${line.to}`;
      const index = moneyAt.get(key);
      const existing = index !== undefined ? movements[index] : undefined;
      if (index !== undefined && existing?.kind === "money") movements[index] = { ...existing, amount: existing.amount + line.amount };
      else {
        moneyAt.set(key, movements.length);
        movements.push(line);
      }
    } else if (line) {
      movements.push(line);
    }
    state = reduce(state, e);
  }

  return { groupId, status: history.status, movements, balances: balancesOf(game, players, before, state) };
}

/** One primitive event as a movement; notes have none. `state` is the state just before it. */
function movementOf(game: GameDefinition, state: SessionState, e: PrimitiveEvent): Movement | undefined {
  switch (e.t) {
    case "moneyTransfer":
      return { kind: "money", from: e.from, to: e.to, amount: e.amount };
    case "shareTransfer":
      return { kind: "shares", company: e.company, from: e.from, to: e.to, units: e.units, presidency: e.presidency === true };
    case "assetTransfer":
      return { kind: "asset", asset: e.asset, from: e.from, to: e.to };
    case "marketMove": {
      const from = priceAt(game, e.company, state.companies[e.company]?.position) ?? null;
      const to = priceAt(game, e.company, e.to) ?? null;
      const tags = "index" in e.to ? [] : (game.market.cells[e.to.row]?.[e.to.col]?.tags ?? []);
      const zone = tags.includes("receivership") ? "receivership" : tags.includes("closed") ? "closed" : undefined;
      return { kind: "price", company: e.company, from, to, reason: e.reason, ...(zone ? { zone } : {}) };
    }
    case "companyStatus": {
      const from = state.companies[e.company]?.status ?? "unstarted";
      return from === e.status ? undefined : { kind: "status", company: e.company, from, to: e.status };
    }
    case "counterChange":
      return { kind: "counter", subject: e.subject, key: e.key, delta: e.delta };
    case "turnAdvance":
      return { kind: "turn", event: e };
    case "note":
      return undefined;
  }
}

/** Every holder whose cash differs, in the order History lists them. */
function balancesOf(game: GameDefinition, players: readonly Player[], before: SessionState, after: SessionState): BalanceChange[] {
  const holders = new Set([...Object.keys(before.money), ...Object.keys(after.money)] as HolderRef[]);
  const unlimited = game.bank === "unlimited";
  const changes: BalanceChange[] = [];
  for (const holder of holders) {
    const b = cashOf(before, holder);
    const a = cashOf(after, holder);
    if (a === b) continue;
    const amountOnly = unlimited && holder === "bank";
    changes.push({ holder, before: amountOnly ? null : b, after: amountOnly ? null : a, delta: a - b });
  }
  const seats = new Map(players.map((p) => [p.id, p.seat]));
  const companies = new Map(game.companies.map((c, i) => [c.id, i]));
  const rank = (holder: HolderRef): [number, number, string] => {
    const h = parseHolder(holder);
    switch (h.kind) {
      case "player":
        return [0, seats.get(h.id) ?? Number.MAX_SAFE_INTEGER, holder];
      case "company":
        return [1, companies.get(h.id) ?? Number.MAX_SAFE_INTEGER, holder];
      case "bank":
        return [2, 0, holder];
      case "pool":
        return [3, 0, holder];
      default:
        return [4, 0, holder];
    }
  };
  return changes.sort((x, y) => {
    const [a1, a2, a3] = rank(x.holder);
    const [b1, b2, b3] = rank(y.holder);
    return a1 - b1 || a2 - b2 || a3.localeCompare(b3);
  });
}
