import type { SessionState } from "../domain/events/state";
import type { GameDefinition } from "../domain/games/schema";
import type { EffectiveGroup } from "../domain/ledger/effectiveLog";
import type { Player } from "../domain/types";
import type { Lang } from "../i18n/lang";
import { voiceText } from "../i18n/voiceText";

export interface SnapshotInput {
  readonly game: GameDefinition;
  readonly players: readonly Player[];
  readonly state: SessionState;
  readonly effective: readonly EffectiveGroup[];
  readonly transcript: string;
  /** The option the user tapped after askClarification. */
  readonly clarification?: string;
  /** The session's language (feature 014); absent = Spanish. */
  readonly lang?: Lang;
}

/**
 * The volatile user message (research R9): round, operating company, cash and holdings, trains
 * on sale, the recent entries, then the transcript. Everything stable lives in the system prompt.
 */
export function snapshotAndTranscript(input: SnapshotInput): string {
  return voiceText(input.lang ?? "es").snapshot(input);
}
