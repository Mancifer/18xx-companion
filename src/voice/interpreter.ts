import Anthropic from "@anthropic-ai/sdk";
import { systemBlocks } from "./prompt";
import { buildTools, type VoiceSession } from "./tools";

/** One call per command (research R8); the app confirms before anything runs, so there is no loop. */
export type Interpreter = (session: VoiceSession, userMessage: string) => Promise<Anthropic.Message>;

/** Effort is accepted from the 4.6 generation on; older models (Haiku 4.5, Sonnet 4.5) reject it. */
export function supportsEffort(model: string): boolean {
  return !/haiku-4|sonnet-4-5|opus-4-[015]/.test(model);
}

/**
 * The browser client with the user's own key (research R8, R17: `dangerouslyAllowBrowser` is the
 * supported way, the key never leaves the device except to the API, and is never logged).
 * Tools and system depend only on the session and are memoized, so the cached prefix is stable.
 */
export function createInterpreter(apiKey: string, model: string): Interpreter {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let lastSession: VoiceSession | undefined;
  let prefix: { tools: Anthropic.Tool[]; system: Anthropic.TextBlockParam[] } | undefined;
  return (session, userMessage) => {
    if (session !== lastSession || !prefix) {
      lastSession = session;
      prefix = { tools: buildTools(session), system: systemBlocks(session) };
    }
    return client.messages.create(
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
  };
}
