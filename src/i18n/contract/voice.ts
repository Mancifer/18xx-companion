import type { ActionContext } from "../../domain/actions/context";
import type { Query } from "../../domain/queries";
import type { SnapshotInput } from "../../voice/snapshot";
import type { VoiceSession } from "../../voice/tools";
import type { Lang } from "../lang";

/**
 * Feature 014 (research R2, contracts/voice.md): what every language provides for voice. Tool
 * names, parameters and enums are the same in every language; only these texts change.
 */

/** What a state question is answered from. */
export type QueryContext = Pick<ActionContext, "game" | "players" | "state">;

export interface VoiceText {
  readonly lang: Lang;
  /** The stable system prompt: instructions, then the game, player and company lines. */
  readonly systemPrompt: (session: VoiceSession) => string;
  /** By tool name; a tool with no entry is described by its name. */
  readonly toolDescriptions: Readonly<Record<string, string>>;
  /** The volatile user message: the state snapshot, the recent entries and the transcript. */
  readonly snapshot: (input: SnapshotInput) => string;
  /** A state question's answer, from the app's data (FR-073). */
  readonly queryAnswer: (ctx: QueryContext, query: Query) => string;
}
