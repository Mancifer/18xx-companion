import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { GameDefinition } from "../domain/games/schema";
import type { LogEntry } from "../domain/ledger/entries";
import type { Snapshot } from "../domain/ledger/snapshots";
import type { SessionMeta } from "../domain/session";

/** IndexedDB layout (research R6). */
export interface CompanionDB extends DBSchema {
  sessions: { key: string; value: SessionMeta };
  entries: {
    key: [string, number];
    value: { sessionId: string; seq: number; entry: LogEntry };
    indexes: { bySession: string };
  };
  snapshots: {
    key: [string, number];
    value: { sessionId: string; seq: number; snapshot: Snapshot };
    indexes: { bySession: string };
  };
  settings: { key: string; value: { key: string; value: unknown } };
  games: { key: string; value: GameDefinition };
}

export type CompanionDb = IDBPDatabase<CompanionDB>;

export const DB_NAME = "companion";

export function openCompanionDb(name: string = DB_NAME): Promise<CompanionDb> {
  return openDB<CompanionDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore("sessions", { keyPath: "id" });
      const entries = db.createObjectStore("entries", { keyPath: ["sessionId", "seq"] });
      entries.createIndex("bySession", "sessionId");
      const snapshots = db.createObjectStore("snapshots", { keyPath: ["sessionId", "seq"] });
      snapshots.createIndex("bySession", "sessionId");
      db.createObjectStore("settings", { keyPath: "key" });
      db.createObjectStore("games", { keyPath: "id" });
    },
  });
}
