import type { CompanionDb } from "./db";

/** Device-local settings (data-model §13). Never exported (FR-092). */
export interface Settings {
  readonly apiKey?: string;
  /** false → the key is kept in memory only, for this page load (research R17). */
  readonly rememberKey: boolean;
  readonly voiceLocale: string;
  readonly model: string;
  readonly lastSessionId?: string;
}

export const DEFAULT_MODEL = "claude-sonnet-5";

export const DEFAULT_SETTINGS: Settings = {
  rememberKey: true,
  voiceLocale: "es-ES",
  model: DEFAULT_MODEL,
};

const KEYS = ["apiKey", "rememberKey", "voiceLocale", "model", "lastSessionId"] as const;

export class SettingsRepo {
  private memoryKey: string | undefined;

  constructor(private readonly db: CompanionDb) {}

  async get(): Promise<Settings> {
    const rows = await this.db.getAll("settings");
    const stored: Record<string, unknown> = {};
    for (const row of rows) stored[row.key] = row.value;
    const merged = { ...DEFAULT_SETTINGS, ...stored };
    if (!merged.rememberKey) {
      const { apiKey: _ignored, ...rest } = merged;
      return this.memoryKey !== undefined ? { ...rest, apiKey: this.memoryKey } : rest;
    }
    return merged;
  }

  /** An `undefined` value removes that setting (e.g. clearing the key). */
  async set(patch: { readonly [K in keyof Settings]?: Settings[K] | undefined }): Promise<Settings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    const tx = this.db.transaction("settings", "readwrite", { durability: "strict" });
    for (const key of KEYS) {
      if (!(key in patch)) continue;
      if (key === "apiKey" && !next.rememberKey) continue;
      const value = next[key];
      if (value === undefined) await tx.store.delete(key);
      else await tx.store.put({ key, value });
    }
    if (!next.rememberKey) {
      // The key never touches storage; drop any previously remembered copy.
      this.memoryKey = next.apiKey;
      await tx.store.delete("apiKey");
    } else {
      this.memoryKey = undefined;
    }
    await tx.done;
    return this.get();
  }
}
