import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { startSession } from "../../src/app/sessions";
import type { VoiceDeps } from "../../src/app/useVoice";
import { getBuiltInGame } from "../../src/domain/games";
import type { GameDefinition } from "../../src/domain/games/schema";
import type { LogEntry } from "../../src/domain/ledger/entries";
import type { WalletMode } from "../../src/domain/types";
import { openCompanionDb } from "../../src/persistence/db";
import { SessionRepo } from "../../src/persistence/sessionRepo";
import { SettingsRepo } from "../../src/persistence/settingsRepo";
import { App } from "../../src/ui/App";
import { makePlayers } from "../helpers/dispatch";
import { freshDbName } from "../helpers/session";
import { UI_TEXT } from "../../src/i18n";
import { detectLanguage, navigatorLanguages } from "../../src/i18n/lang";

export interface SeedOptions {
  readonly game?: GameDefinition | string;
  readonly players?: readonly string[];
  readonly options?: Readonly<Record<string, string>>;
  /** Actions dispatched (as touch) before the app opens. */
  readonly actions?: readonly unknown[];
  /** Raw entries appended after the actions, e.g. legacy revert/amend entries (feature 010). */
  readonly entries?: (log: readonly LogEntry[]) => readonly LogEntry[];
  readonly settings?: Parameters<SettingsRepo["set"]>[0];
  /** Defaults to "appTruth" (the app holds the money). */
  readonly walletMode?: WalletMode;
  readonly voiceDeps?: VoiceDeps;
  /** Rendered inside the App's providers (feature 014: a harness that switches the language). */
  readonly overlay?: ReactNode;
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
    walletMode: seed.walletMode ?? "appTruth",
  });
  for (const action of seed.actions ?? []) {
    const result = await store.dispatch(action);
    if (!result.ok) throw new Error(`seed ${JSON.stringify(action)}: ${result.messageEs}`);
  }
  for (const entry of seed.entries?.(store.getSnapshot().log) ?? []) await sessions.appendEntry(store.getSnapshot().meta.id, entry);
  if (seed.settings) await settings.set(seed.settings);
  db.close();

  const user = userEvent.setup();
  const view = render(
    <App dbName={dbName} {...(seed.voiceDeps ? { voiceDeps: seed.voiceDeps } : {})} {...(seed.overlay ? { overlay: seed.overlay } : {})} />,
  );
  // Feature 014: the app opens in the saved language, else the device's (Spanish under the test pin).
  const text = UI_TEXT[seed.settings?.language ?? detectLanguage(navigatorLanguages())];
  await user.click(await screen.findByRole("button", { name: new RegExp(`^${text.home.continue}`) }));
  await screen.findByRole("button", { name: text.table.topBar.menu });
  return { user, view, dbName, meta: store.getSnapshot().meta };
}

export function cashText(playerId: string): string {
  return screen.getByTestId(`cash-${playerId}`).textContent;
}

export async function openMenuItem(user: ReturnType<typeof userEvent.setup>, item: string) {
  await user.click(screen.getByRole("button", { name: /^(Menú|Menu)$/ }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: item }));
}

/**
 * A text matcher for a whole line that may hold company badges (feature 013): the innermost
 * element whose full text matches, where `getByText`'s default only reads an element's own text.
 */
export function byLine(text: string | RegExp) {
  const matches = (el: Element) => {
    const content = el.textContent.replace(/\s+/g, " ").trim();
    return typeof text === "string" ? content === text : text.test(content);
  };
  return (_content: string, el: Element | null) => el !== null && matches(el) && ![...el.children].some(matches);
}
