import type { ModelReply } from "./reply";
import type { VoiceSession } from "./tools";

/**
 * One call per command (research R8); the app confirms before anything runs, so there is no loop.
 * Every provider adapter resolves to the same neutral reply (feature 005, data-model §3).
 */
export type Interpreter = (session: VoiceSession, userMessage: string) => Promise<ModelReply>;

/**
 * Explicit prompt-cache lifecycle events (feature 009, contracts/gemini-cache.md §4). They never
 * carry the key or the cache name; `reason` holds only the HTTP status and Google's codes.
 */
export type CacheEvent =
  | { readonly kind: "created"; readonly tokens: number; readonly expireTime: string; readonly at: number }
  | { readonly kind: "extended"; readonly expireTime: string; readonly at: number }
  | { readonly kind: "deleted"; readonly at: number }
  | { readonly kind: "failed"; readonly op: "create" | "extend" | "delete"; readonly status?: number; readonly reason: string; readonly at: number }
  | { readonly kind: "fallback"; readonly status: number; readonly at: number };

/** Optional per-interpreter settings (feature 009). Adapters that don't cache ignore them. */
export interface InterpreterOptions {
  /** Overrides EXPLICIT_CACHE_MODELS for this interpreter (eval: --cache on|off). */
  readonly cache?: boolean;
  /** Cache lifecycle events; never receives the key or the cache name. */
  readonly onCacheEvent?: (event: CacheEvent) => void;
  /** Injectable clock for tests; defaults to Date.now. */
  readonly now?: () => number;
}

export { createInterpreter, supportsEffort } from "./providers/anthropic";
