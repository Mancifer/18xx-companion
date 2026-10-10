import { applyOptions, resolveOptions } from "../domain/games";
import type { GameDefinition } from "../domain/games/schema";
import { replay } from "../domain/ledger/replay";
import { outcomeOf } from "../domain/mechanics/gameEnd";
import type { SessionMeta } from "../domain/session";
import type { ChipSet, Player, WalletMode } from "../domain/types";
import type { SessionRepo } from "../persistence/sessionRepo";
import type { SettingsRepo } from "../persistence/settingsRepo";
import { SessionStore } from "./SessionStore";

export interface NewSessionInput {
  /** The chosen definition (built-in or custom), before options are applied. */
  readonly game: GameDefinition;
  readonly options: Readonly<Record<string, string>>;
  readonly players: readonly Player[];
  readonly walletMode: WalletMode;
  readonly chipSet?: ChipSet;
  readonly name?: string;
}

/** "1830 · 07/10 20:15" */
export function defaultSessionName(game: GameDefinition, at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${game.name} · ${two(at.getDate())}/${two(at.getMonth() + 1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/**
 * Creates and persists a session with its frozen definition (FR-005), records createSession
 * as the first group, and remembers it as the last session (FR-006).
 */
export async function startSession(
  repo: SessionRepo,
  settings: SettingsRepo,
  input: NewSessionInput,
  now: Date = new Date(),
): Promise<SessionStore> {
  const options = resolveOptions(input.game, input.options);
  const game = applyOptions(input.game, options);
  const at = now.toISOString();
  const meta: SessionMeta = {
    id: crypto.randomUUID(),
    name: input.name?.trim() || defaultSessionName(game, now),
    game,
    options,
    players: input.players,
    walletMode: input.walletMode,
    chipSet: input.chipSet ?? { chips: game.chipPreset },
    createdAt: at,
    updatedAt: at,
    entryCount: 0,
  };
  await repo.createSession(meta);
  const store = new SessionStore(repo, meta, []);
  const result = await store.dispatch(
    { type: "createSession", players: input.players, walletMode: input.walletMode },
    { source: "system" },
  );
  if (!result.ok) {
    await repo.deleteSession(meta.id);
    throw new Error(result.messageEs);
  }
  await settings.set({ lastSessionId: meta.id });
  return store;
}

/**
 * Removes a session with its whole log and snapshots (one strict transaction), then forgets it
 * as the last session if it was. Rejects, with the pointer untouched, when the delete fails.
 */
export async function deleteSession(repo: SessionRepo, settings: SettingsRepo, id: string): Promise<void> {
  await repo.deleteSession(id);
  if ((await settings.get()).lastSessionId === id) await settings.set({ lastSessionId: undefined });
}

/**
 * The Home outcome for a session saved before feature 007 (no `outcome` key): replays its log once
 * and stores the result. Any failure leaves the row as it was and returns the meta unchanged.
 */
export async function backfillOutcome(repo: SessionRepo, meta: SessionMeta): Promise<SessionMeta> {
  try {
    const loaded = await repo.loadSession(meta.id);
    if (!loaded) return meta;
    const result = replay(loaded.meta.game, loaded.meta.players, loaded.entries);
    return await repo.updateMeta(meta.id, { outcome: outcomeOf(loaded.meta.game, loaded.meta.players, result) });
  } catch {
    return meta;
  }
}
