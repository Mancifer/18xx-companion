import type { GameDefinition } from "./games/schema";
import type { ChipSet, Player, PlayerId, WalletMode } from "./types";

/** A finished game's end time and rank-1 players (feature 007): a cache derived from the log. */
export interface SessionOutcome {
  readonly endedAt: string;
  readonly winners: readonly PlayerId[];
}

/** Session metadata (data-model §2). The log lives in the `entries` store. */
export interface SessionMeta {
  readonly id: string;
  readonly name: string;
  /** Frozen copy with session options applied (FR-005). */
  readonly game: GameDefinition;
  readonly options: Readonly<Record<string, string>>;
  readonly players: readonly Player[];
  readonly walletMode: WalletMode;
  /** Table configuration, not game state: edited outside the log (data-model §2). */
  readonly chipSet: ChipSet;
  /**
   * Chip value (as a string) → the bank count the user set (feature 008, R17). Absent or `{}` =
   * the suggestion. Counts are non-negative integers. Table configuration, never logged.
   */
  readonly bankPins?: Readonly<Record<string, number>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entryCount: number;
  /**
   * Derived cache for Home (data-model §7), never exported and never set by UI callers: absent =
   * written before feature 007 (Home backfills it), null = not finished.
   */
  readonly outcome?: SessionOutcome | null;
}
