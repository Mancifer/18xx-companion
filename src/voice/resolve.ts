import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ActionContext } from "../domain/actions/context";
import { runPipeline } from "../domain/actions/pipeline";
import { ActionSchema, type Action, type Warning } from "../domain/actions/schemas";
import type { PrimitiveEvent } from "../domain/events/types";
import { summaryEs } from "../domain/i18n/es";
import type { EffectiveGroup } from "../domain/ledger/effectiveLog";
import { bankFlows, type MoneyFlow } from "../domain/ledger/flows";
import { answerQuery, QUERY_KINDS, type QueryAnswer } from "../domain/queries";

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
      readonly summaryEs: string;
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
  | { readonly kind: "confirm"; readonly transcript: string }
  | { readonly kind: "amend"; readonly transcript: string; readonly groupId: string; readonly action: Action; readonly summaryEs: string }
  | { readonly kind: "notUnderstood"; readonly transcript: string; readonly reasonEs: string; readonly hint?: string };

const notUnderstood = (transcript: string, reasonEs: string, hint?: string): VoiceResult => ({
  kind: "notUnderstood",
  transcript,
  reasonEs,
  ...(hint !== undefined ? { hint } : {}),
});

const ClarificationInput = z.object({
  question: z.string().min(1),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).min(2).max(6),
});
const QueryInput = z.object({
  kind: z.enum(QUERY_KINDS as unknown as [string, ...string[]]),
  player: z.string().nullable(),
  company: z.string().nullable(),
});
const AmendInput = z.object({ part: z.string().nullable(), value: z.number().int() });
const NUMERIC_KEYS = ["amount", "price", "count", "units", "setTo", "delta", "extra"];

/** "no, eran 260": the corrected number replaces the main amount of the last entry. */
export function correctNumber(action: Action, value: number, part: string | null): Action | undefined {
  if (action.type === "runAndPayout") {
    const index = part === null ? 0 : action.parts.findIndex((p) => p.part === part);
    if (index < 0 || !action.parts[index]) return undefined;
    return { ...action, parts: action.parts.map((p, i) => (i === index ? { ...p, amount: value } : p)) };
  }
  const record = action as unknown as Record<string, unknown>;
  const key = NUMERIC_KEYS.find((k) => typeof record[k] === "number");
  if (!key) return undefined;
  const parsed = ActionSchema.safeParse({ ...record, [key]: value });
  return parsed.success ? parsed.data : undefined;
}

export function resolveResponse(message: Anthropic.Message, ctx: ResolveContext, transcript: string): VoiceResult {
  if (message.stop_reason === "refusal") return notUnderstood(transcript, "La orden fue rechazada.");
  if (message.stop_reason === "max_tokens") return notUnderstood(transcript, "La respuesta quedó incompleta.");
  const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (calls.length === 0) return notUnderstood(transcript, "No reconocí ninguna orden.");

  const meta = (name: string) => calls.find((c) => c.name === name);
  const clarify = meta("askClarification");
  if (clarify) {
    const input = ClarificationInput.safeParse(clarify.input);
    if (!input.success) return notUnderstood(transcript, "La pregunta no se pudo mostrar.");
    return { kind: "clarification", transcript, ...input.data };
  }
  const query = meta("query");
  if (query) {
    const input = QueryInput.safeParse(query.input);
    if (!input.success) return notUnderstood(transcript, "No entendí la pregunta.");
    return { kind: "query", transcript, answer: answerQuery(ctx, input.data as never) };
  }
  const nope = meta("notUnderstood");
  if (nope) {
    const reason = (nope.input as { reason?: unknown }).reason;
    return notUnderstood(transcript, typeof reason === "string" && reason ? reason : "No es una orden del juego.");
  }
  if (meta("undo")) return { kind: "undo", transcript };
  if (meta("confirmProposal")) return { kind: "confirm", transcript };
  const amend = meta("amendLast");
  if (amend) {
    const input = AmendInput.safeParse(amend.input);
    const last = [...ctx.effective].reverse().find((g) => g.action.type !== "createSession");
    if (!input.success || !last) return notUnderstood(transcript, "No hay nada que corregir.");
    const action = correctNumber(last.action, input.data.value, input.data.part);
    if (!action) return notUnderstood(transcript, "No sé qué cantidad corregir.");
    return { kind: "amend", transcript, groupId: last.id, action, summaryEs: summaryEs(action, ctx) };
  }

  const actions: Action[] = [];
  for (const call of calls) {
    const parsed = ActionSchema.safeParse({ ...(call.input as Record<string, unknown>), type: call.name });
    if (!parsed.success) return notUnderstood(transcript, "La orden llegó incompleta.", call.name);
    actions.push(parsed.data);
  }
  const action: Action = actions.length === 1 && actions[0] ? actions[0] : { type: "compound", actions: actions };
  const result = runPipeline(ctx, action);
  const hint = actions[0]?.type;
  if (result.kind === "invalid") return notUnderstood(transcript, "La orden nombra algo que no existe.", hint);
  if (result.kind === "unavailable") return notUnderstood(transcript, result.reasonEs, hint);
  return {
    kind: "proposal",
    transcript,
    actions,
    action: result.action,
    events: result.events,
    warnings: result.warnings,
    summaryEs: summaryEs(result.action, ctx, result.events),
    flows: bankFlows(result.events),
  };
}

/** API and network failures (research R8): all of them degrade to "No entendí" with a reason. */
export function resolveError(error: unknown, transcript: string): VoiceResult {
  if (error instanceof Anthropic.AuthenticationError) return notUnderstood(transcript, "La clave de la API no es válida.");
  if (error instanceof Anthropic.PermissionDeniedError) return notUnderstood(transcript, "La clave no tiene permiso para este modelo.");
  if (error instanceof Anthropic.RateLimitError) return notUnderstood(transcript, "Se alcanzó el límite de uso; prueba en un momento.");
  if (error instanceof Anthropic.APIConnectionTimeoutError) return notUnderstood(transcript, "La respuesta tardó demasiado.");
  if (error instanceof Anthropic.APIConnectionError) return notUnderstood(transcript, "Sin conexión con el servicio de voz.");
  if (error instanceof Anthropic.APIError) return notUnderstood(transcript, "Error del servicio de voz.");
  return notUnderstood(transcript, "No entendí: error inesperado.");
}
