import type { SessionMeta } from "../../src/domain/session";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { Player } from "../../src/domain/types";
import { miniGame, miniPlayers } from "./miniGame";

/**
 * Feature 014: the device languages the app sees. tests/setup.ts resets them to Spanish before
 * every test, so a test that switches needs no cleanup of its own.
 */
export function setNavigatorLanguages(list: readonly string[]): void {
  Object.defineProperty(navigator, "languages", { value: [...list], configurable: true });
  Object.defineProperty(navigator, "language", { value: list[0] ?? "", configurable: true });
}

let counter = 0;

/** A unique IndexedDB name per test, so fake-indexeddb state never leaks between tests. */
export function freshDbName(): string {
  counter += 1;
  return `companion-test-${Date.now()}-${counter}`;
}

export function makeMeta(overrides: Partial<SessionMeta> & { game?: GameDefinition; players?: Player[] } = {}): SessionMeta {
  return {
    id: overrides.id ?? `s-${++counter}`,
    name: overrides.name ?? "Mini · test",
    game: overrides.game ?? miniGame,
    options: overrides.options ?? {},
    players: overrides.players ?? miniPlayers,
    walletMode: overrides.walletMode ?? "appTruth",
    chipSet: overrides.chipSet ?? { chips: [] },
    createdAt: overrides.createdAt ?? "2026-10-07T20:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-10-07T20:00:00.000Z",
    entryCount: overrides.entryCount ?? 0,
  };
}
