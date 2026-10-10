import type { ProviderId } from "./providers";

/**
 * The neutral model response (feature 005, data-model §2): what every provider adapter returns
 * and what resolveResponse and the eval grader read. Adapters drop text and thoughts, so free
 * text can never reach state (FR-008).
 */

export interface ToolCall {
  readonly name: string;
  /** Gemini's missing `args` become {}. */
  readonly input: Readonly<Record<string, unknown>>;
}

export type ReplyStop = "done" | "truncated" | "refused" | "malformed" | "other";

export interface TokenUsage {
  /** Uncached input tokens. */
  readonly input: number;
  /** Includes thinking tokens (billed as output). */
  readonly output: number;
  readonly cacheRead: number;
  /** 0 for Gemini implicit caching. */
  readonly cacheWrite: number;
  /** A subset of output; 0 for Claude without thinking. */
  readonly thinking: number;
}

export interface ModelReply {
  readonly provider: ProviderId;
  /** As reported by the provider, or as requested. */
  readonly model: string;
  /** In the order the provider returned them. */
  readonly calls: readonly ToolCall[];
  readonly stop: ReplyStop;
  /** The provider's own reason, for eval reports only. */
  readonly rawStop: string;
  readonly usage?: TokenUsage;
}
