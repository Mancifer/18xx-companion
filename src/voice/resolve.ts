import { message, type Message, type MessageContext } from "../i18n/contract/domain";
import type { VoiceMessages } from "../i18n/contract/messages/voice";
import { renderMessage, renderPlain, textMessage } from "../i18n/render";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ActionContext } from "../domain/actions/context";
import { runPipeline } from "../domain/actions/pipeline";
import { ActionSchema, type Action, type Warning } from "../domain/actions/schemas";
import type { PrimitiveEvent } from "../domain/events/types";
import type { EffectiveGroup } from "../domain/ledger/effectiveLog";
import type { GroupId } from "../domain/ledger/entries";
import { moneyFlows, type MoneyFlow } from "../domain/ledger/flows";
import { isSetup, undoRangeIn, type UndoRange } from "../domain/ledger/undo";
import { QUERY_KINDS } from "../domain/queries";
import { answerQuery, type QueryAnswer } from "./answer";
import { VoiceProviderError, type ProviderErrorKind } from "./errors";
import type { ModelReply } from "./reply";
import { voiceAction } from "./tools";

/**
 * Model response → what the app shows (contracts/voice-tools.md "Response handling",
 * data-model §14). Everything is validated with the same schemas and pipeline as touch; every
 * failure ends in "No entendí" with the transcript and a touch alternative (constitution IV).
 */

export interface ResolveContext extends ActionContext {
  readonly effective: readonly EffectiveGroup[];
}

export type VoiceResult =
  | {
      readonly kind: "proposal";
      readonly transcript: string;
      /** The actions in the order spoken; `action` is the one to dispatch (compound if several). */
      readonly actions: readonly Action[];
      readonly action: Action;
      readonly events: readonly PrimitiveEvent[];
      readonly warnings: readonly Warning[];
      /** The card writes the summary in the display language (feature 014). */
      readonly flows: readonly MoneyFlow[];
    }
  | {
      readonly kind: "clarification";
      readonly transcript: string;
      readonly question: string;
      readonly options: readonly { readonly label: string; readonly value: string }[];
    }
  | { readonly kind: "query"; readonly transcript: string; readonly answer: QueryAnswer }
  | { readonly kind: "undo"; readonly transcript: string }
  /** Undo back to an older entry: shown in UndoRangeSheet before anything changes (feature 010). */
  | { readonly kind: "undoTo"; readonly transcript: string; readonly groupId: GroupId; readonly range: UndoRange }
  | { readonly kind: "confirm"; readonly transcript: string }
  /**
   * `reason` is shown in the display language (feature 014); `reasonEs` is its Spanish text, for
   * logs and the eval. `hint` is the action type, for "Hacerlo a mano".
   */
  | {
      readonly kind: "notUnderstood";
      readonly transcript: string;
      readonly reason: Message;
      readonly reasonEs: string;
      readonly hint?: string;
    };

/** "No entendí" with a reason; `ctx` names what the reason mentions (unavailable actions). */
export function notUnderstood(transcript: string, reason: Message, ctx?: MessageContext, hint?: string): VoiceResult {
  return {
    kind: "notUnderstood",
    transcript,
    reason,
    reasonEs: ctx ? renderMessage(reason, ctx, "es") : renderPlain(reason, "es"),
    ...(hint !== undefined ? { hint } : {}),
  };
}

/** The voice codes whose text needs no params. */
type PlainVoiceCode = Exclude<keyof VoiceMessages, "voice.provider" | "voice.noKey">;
const say = (code: PlainVoiceCode): Message => message(code, {});

const ClarificationInput = z.object({
  question: z.string().min(1),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).min(2).max(6),
});
const QueryInput = z.object({
  kind: z.enum(QUERY_KINDS as unknown as [string, ...string[]]),
  player: z.string().nullable(),
  company: z.string().nullable(),
});

/** Reads only the neutral reply's stop and calls, so every provider shares one path (FR-007). */
export function resolveResponse(reply: ModelReply, ctx: ResolveContext, transcript: string): VoiceResult {
  if (reply.stop === "refused") return notUnderstood(transcript, say("voice.refused"));
  if (reply.stop === "truncated") return notUnderstood(transcript, say("voice.truncated"));
  if (reply.stop === "malformed") return notUnderstood(transcript, say("voice.incomplete"));
  const { calls } = reply;
  if (calls.length === 0) return notUnderstood(transcript, say("voice.noOrder"));

  const meta = (name: string) => calls.find((c) => c.name === name);
  const clarify = meta("askClarification");
  if (clarify) {
    const input = ClarificationInput.safeParse(clarify.input);
    if (!input.success) return notUnderstood(transcript, say("voice.badQuestion"));
    return { kind: "clarification", transcript, ...input.data };
  }
  const query = meta("query");
  if (query) {
    const input = QueryInput.safeParse(query.input);
    if (!input.success) return notUnderstood(transcript, say("voice.badQuery"));
    return { kind: "query", transcript, answer: answerQuery(ctx, input.data as never) };
  }
  const nope = meta("notUnderstood");
  if (nope) {
    const reason = (nope.input as { reason?: unknown }).reason;
    // The model's own reason is shown as it wrote it, in the session's language.
    return notUnderstood(transcript, typeof reason === "string" && reason ? textMessage(reason) : say("voice.notGame"));
  }
  const undo = meta("undo");
  if (undo) return resolveUndo(undo.input["groupId"], ctx, transcript);
  if (meta("confirmProposal")) return { kind: "confirm", transcript };
  if (meta("amendLast")) return notUnderstood(transcript, say("voice.correctByUndo"));

  const actions: Action[] = [];
  for (const call of calls) {
    const parsed = ActionSchema.safeParse(voiceAction(call.name, call.input));
    if (!parsed.success) return notUnderstood(transcript, say("voice.incomplete"), undefined, call.name);
    actions.push(parsed.data);
  }
  const action: Action = actions.length === 1 && actions[0] ? actions[0] : { type: "compound", actions: actions };
  const result = runPipeline(ctx, action);
  const hint = actions[0]?.type;
  if (result.kind === "invalid") return notUnderstood(transcript, say("voice.unknownEntity"), undefined, hint);
  if (result.kind === "unavailable") return notUnderstood(transcript, result.reason, ctx, hint);
  return {
    kind: "proposal",
    transcript,
    actions,
    action: result.action,
    events: result.events,
    warnings: result.warnings,
    flows: moneyFlows(result.events),
  };
}

/**
 * `undo` with no target or the newest entry is a plain undo; an older entry is an undo back to
 * it. The id is never trusted: it must name an active, non-setup entry (contracts/voice-undo.md).
 */
function resolveUndo(groupId: unknown, ctx: ResolveContext, transcript: string): VoiceResult {
  const newest = [...ctx.effective].reverse().find((g) => !isSetup(g));
  if (groupId === null || groupId === undefined || groupId === newest?.id) return { kind: "undo", transcript };
  const range = typeof groupId === "string" ? undoRangeIn(ctx.effective, groupId) : undefined;
  if (!range) return notUnderstood(transcript, say("voice.noEntry"));
  return { kind: "undoTo", transcript, groupId: range.targetId, range };
}

/**
 * API and network failures (research R8; feature 005 R7): all of them degrade to "No entendí"
 * with a reason. Provider errors map by kind; the Anthropic SDK's own errors by class.
 */
export function resolveError(error: unknown, transcript: string): VoiceResult {
  const provider = (kind: ProviderErrorKind) => notUnderstood(transcript, message("voice.provider", { kind }));
  if (error instanceof VoiceProviderError) return provider(error.kind);
  if (error instanceof Anthropic.AuthenticationError) return provider("auth");
  if (error instanceof Anthropic.PermissionDeniedError) return provider("permission");
  if (error instanceof Anthropic.NotFoundError) return provider("model");
  if (error instanceof Anthropic.RateLimitError) return provider("rateLimit");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return provider("timeout");
  if (error instanceof Anthropic.APIConnectionError) return provider("connection");
  if (error instanceof Anthropic.APIError) return provider("service");
  return notUnderstood(transcript, say("voice.unexpected"));
}
