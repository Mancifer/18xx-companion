import Anthropic from "@anthropic-ai/sdk";
import type { Interpreter } from "../interpreter";
import { systemPromptEs } from "../prompt";
import type { ModelReply, ReplyStop } from "../reply";
import { buildToolSpecs, toAnthropicTools, type VoiceSession } from "../tools";

/** Effort is accepted from the 4.6 generation on; older models (Haiku 4.5, Sonnet 4.5) reject it. */
export function supportsEffort(model: string): boolean {
  return !/haiku-4|sonnet-4-5|opus-4-[015]/.test(model);
}

/** One system block with the cache breakpoint at its end (research R9). */
export function systemBlocks(session: VoiceSession): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: systemPromptEs(session), cache_control: { type: "ephemeral" } }];
}

const STOPS: Readonly<Record<string, ReplyStop>> = {
  refusal: "refused",
  max_tokens: "truncated",
  end_turn: "done",
  tool_use: "done",
  stop_sequence: "done",
};

/** Message → ModelReply (contracts/voice-provider.md §3): tool calls only, text dropped. */
export function anthropicReply(message: Anthropic.Message, requestedModel: string): ModelReply {
  const rawStop = message.stop_reason ?? "";
  const usage = message.usage as Anthropic.Usage | undefined;
  return {
    provider: "anthropic",
    model: message.model || requestedModel,
    calls: message.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ name: b.name, input: (b.input ?? {}) as Record<string, unknown> })),
    stop: STOPS[rawStop] ?? "other",
    rawStop,
    ...(usage
      ? {
          usage: {
            input: usage.input_tokens,
            output: usage.output_tokens,
            cacheRead: usage.cache_read_input_tokens ?? 0,
            cacheWrite: usage.cache_creation_input_tokens ?? 0,
            thinking: 0,
          },
        }
      : {}),
  };
}

/**
 * The browser client with the user's own key (research R8, R17: `dangerouslyAllowBrowser` is the
 * supported way, the key never leaves the device except to the API, and is never logged).
 * Tools and system depend only on the session and are memoized, so the cached prefix is stable.
 * SDK errors pass through unchanged; resolveError maps them.
 */
export function createInterpreter(apiKey: string, model: string): Interpreter {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let lastSession: VoiceSession | undefined;
  let prefix: { tools: Anthropic.Tool[]; system: Anthropic.TextBlockParam[] } | undefined;
  return async (session, userMessage) => {
    if (session !== lastSession || !prefix) {
      lastSession = session;
      prefix = { tools: toAnthropicTools(buildToolSpecs(session)), system: systemBlocks(session) };
    }
    const message = await client.messages.create(
      {
        model,
        max_tokens: 1024,
        tools: prefix.tools,
        tool_choice: { type: "auto" },
        system: prefix.system,
        ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
        messages: [{ role: "user", content: userMessage }],
      },
      { timeout: 8000, maxRetries: 1 },
    );
    return anthropicReply(message, model);
  };
}
