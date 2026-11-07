import type { SessionState } from "../events/state";
import type { PrimitiveEvent } from "../events/types";
import type { GameDefinition } from "../games/schema";
import type { GameEndStatus } from "../mechanics/gameEnd";
import type { Player } from "../types";
import { message, type Message, type MessageCode, type MessageContext, type MessageParams } from "../../i18n/contract/domain";
import { spanishText } from "../../i18n/render";
import type { Action, ActionOf, ActionType, Warning } from "./schemas";

/** Everything an expander, validator or availability check may read. Pure data. */
export interface ActionContext {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
  readonly state: SessionState;
  /** Whether the game is finished (feature 007). The store fills it; absent = not finished. */
  readonly gameEnd?: GameEndStatus;
}

/** Why an action isn't offered, as a message rendered in the display language (feature 014). */
export type AvailabilityResult = { readonly ok: true } | { readonly ok: false; readonly reason: Message };

export const AVAILABLE: AvailabilityResult = { ok: true };

/** Feature 014: not offered, with a coded reason. */
export function unavailable<C extends MessageCode>(code: C, params: MessageParams<C>): AvailabilityResult {
  return { ok: false, reason: message(code, params) };
}


export interface ActionHandler<T extends ActionType> {
  /**
   * Whether this game offers the action at all, from its definition only (a core action gated by
   * data). Absent means always. Voice tools of actions a game does not offer are not sent.
   */
  readonly offered?: (game: GameDefinition) => boolean;
  /** Fills defaults from state into the stored action (endGame: the fired end conditions). */
  readonly normalize?: (ctx: ActionContext, action: ActionOf<T>) => ActionOf<T>;
  /** Whether the action is offered at all (game and state). With a payload, also checks it. */
  readonly available?: (ctx: ActionContext, action?: ActionOf<T>) => AvailabilityResult;
  /** Likely rule breaks. Warnings never block (FR-025). */
  readonly validate?: (ctx: ActionContext, action: ActionOf<T>) => Warning[];
  /** Pure and deterministic given (ctx, action). */
  readonly expand: (ctx: ActionContext, action: ActionOf<T>) => PrimitiveEvent[];
}

export type HandlerMap = { readonly [K in ActionType]?: ActionHandler<K> };

export interface TriggerContext extends ActionContext {
  /** The state before the action. `state` is the interim state after the events so far. */
  readonly stateBefore: SessionState;
  readonly action: Action;
  readonly events: readonly PrimitiveEvent[];
}

/**
 * A post-expansion rule that runs inside the same group (float, presidency, phase change, cell
 * triggers, debt repayment). It must be idempotent: once its events are applied it returns [].
 */
export type Trigger = (ctx: TriggerContext) => PrimitiveEvent[];

/**
 * Feature 014 (data-model §4): a stored warning keeps its code and params, so it can be shown in
 * any language, and its Spanish text, so older app versions can still import the file.
 */
export function warning<C extends MessageCode>(
  ctx: MessageContext,
  code: C,
  params: MessageParams<C>,
  severity: Warning["severity"] = "warn",
): Warning {
  const m = message(code, params);
  return { code, messageEs: spanishText(m, ctx), severity, params: m.params ?? {} };
}

