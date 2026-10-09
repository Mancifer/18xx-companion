import type { z } from "zod";
import type { ActionContext, HandlerMap, Trigger } from "../../actions/context";
import type { Warning } from "../../actions/schemas";
import type { PrimitiveEvent } from "../../events/types";
import type { CompanyId, HolderRef } from "../../types";

export const MECHANIC_IDS = [
  "loans",
  "nationalBank",
  "nationalTakeover",
  "bankDebt",
  "forcedWithhold",
  "corporateBankruptcy",
  "manualFloatCondition",
  "privateGrants",
  "corporateRound",
] as const;

export type MechanicId = (typeof MECHANIC_IDS)[number];

/** What a mechanic adds to an expansion: events and the warnings that explain them. */
export interface HookResult {
  readonly events: readonly PrimitiveEvent[];
  readonly warnings: readonly Warning[];
}

/**
 * Expansion hooks that core actions consult (research R16 extension points). Each is optional;
 * the first enabled mechanic that answers wins.
 */
export interface MechanicHooks {
  /** A run must be withheld (receivership). Returns the reason, or undefined. */
  readonly forceWithhold?: (ctx: ActionContext, company: CompanyId) => string | undefined;
  /**
   * A company is short of cash for a train from the bank or the pool (a forced purchase). The
   * events run before the company pays.
   */
  readonly trainShortfall?: (ctx: ActionContext, company: CompanyId, shortfall: number) => HookResult | undefined;
  /** A company enters receivership by hand (enterReceivership). */
  readonly enterReceivership?: (ctx: ActionContext, company: CompanyId) => PrimitiveEvent[] | undefined;
  /** Float needs more than the percentage (a condition the app cannot see). */
  readonly floatBlocked?: (ctx: Pick<ActionContext, "game" | "state">, company: CompanyId) => boolean;
  /** A player bought a private: what comes with it (grants). `par` is the owner's choice, if any. */
  readonly privateBought?: (ctx: ActionContext, privateId: string, buyer: HolderRef, par: number | null) => HookResult | undefined;
}

/**
 * A named, reusable rule module enabled by a game definition's `customRules` (FR-113, research
 * R16). It plugs into the documented extension points and never branches on a game id.
 */
export interface Mechanic<C> {
  readonly id: MechanicId;
  readonly configSchema: z.ZodType<C>;
  /** Actions this mechanic owns. They are unavailable in games that do not enable it. */
  readonly handlers?: HandlerMap;
  /** Post-expansion triggers, run only when the mechanic is enabled. */
  readonly triggers?: readonly Trigger[];
  readonly hooks?: MechanicHooks;
}
