import type { z } from "zod";
import type { HandlerMap, Trigger } from "../../actions/context";

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
}
