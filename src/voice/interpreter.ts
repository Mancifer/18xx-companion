import type { ModelReply } from "./reply";
import type { VoiceSession } from "./tools";

/**
 * One call per command (research R8); the app confirms before anything runs, so there is no loop.
 * Every provider adapter resolves to the same neutral reply (feature 005, data-model §3).
 */
export type Interpreter = (session: VoiceSession, userMessage: string) => Promise<ModelReply>;

export { createInterpreter, supportsEffort } from "./providers/anthropic";
