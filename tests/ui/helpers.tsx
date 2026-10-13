import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { startSession } from "../../src/app/sessions";
import type { VoiceDeps } from "../../src/app/useVoice";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { LogEntry } from "../../src/domain/ledger/entries";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { App } from "../../src/ui/App";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName } from "../helpers/session";

export interface SeedOptions {
  readonly game?: GameDefinition | string;
  readonly players?: readonly string[];
  readonly options?: Readonly<Record<string, string>>;
  /** Actions dispatched (as touch) before the app opens. */
  readonly actions?: readonly unknown[];
  /** Raw entries appended after the actions, e.g. legacy revert/amend entries (feature 010). */
  readonly entries?: (log: readonly LogEntry[]) => readonly LogEntry[];
  readonly settings?: Parameters<SettingsRepo["set"]>[0];
  readonly voiceDeps?: VoiceDeps;
}

/**
 * Seeds a session in a fresh fake IndexedDB, renders the real App on it and opens the Table
 * through "Continuar", the way a user resumes a game.
 */
export async function openSeededTable(seed: SeedOptions = {}) {
  const dbName = freshDbName();
  const db = await openCompanionDb(dbName);
  const sessions = new SessionRepo(db);
  const settings = new SettingsRepo(db);
  const game = typeof seed.game === "string" ? getBuiltInGame(seed.game) : (seed.game ?? getBuiltInGame("1830"));
  const store = await startSession(sessions, settings, {
    game,
    options: seed.options ?? {},
    players: makePlayers(seed.players ?? ["Ana", "Bruno", "Carla", "Dani"]),
    walletMode: "appTruth",
  });
  for (const action of seed.actions ?? []) {
    const result = await store.dispatch(action);
    if (!result.ok) throw new Error(`seed ${JSON.stringify(action)}: ${result.messageEs}`);
  }
  for (const entry of seed.entries?.(store.getSnapshot().log) ?? []) await sessions.appendEntry(store.getSnapshot().meta.id, entry);
  if (seed.settings) await settings.set(seed.settings);
  db.close();

  const user = userEvent.setup();
  const view = render(seed.voiceDeps ? <App dbName={dbName} voiceDeps={seed.voiceDeps} /> : <App dbName={dbName} />);
  await user.click(await screen.findByRole("button", { name: /^Continuar/ }));
  await screen.findByRole("button", { name: "Menú" });
  return { user, view, dbName, meta: store.getSnapshot().meta };
}

export function cashText(playerId: string): string {
  return screen.getByTestId(`cash-${playerId}`).textContent;
}

export async function openMenuItem(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole("button", { name: "Menú" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: item }));
}
