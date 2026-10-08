import type { GameDefinition } from "./games/schema";
import type { ChipSet, Player, WalletMode } from "./types";

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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entryCount: number;
}
