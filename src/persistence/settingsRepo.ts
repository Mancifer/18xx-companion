import { isLang, LANGUAGES, type Lang } from "../i18n/lang";
import { isProviderId, PROVIDER_IDS, PROVIDERS, type ProviderId } from "../voice/providers";
import type { CompanionDb } from "./db";

/** Device-local settings (data-model §13; feature 005 data-model §1). Never exported (FR-092). */
export interface Settings {
  readonly provider: ProviderId;
  readonly apiKeys: Readonly<Partial<Record<ProviderId, string>>>;
  readonly models: Readonly<Record<ProviderId, string>>;
  /** false → every provider's key is kept in memory only, for this page load (research R17). */
  readonly rememberKey: boolean;
  /** The language the user picked; absent = follow the device (feature 014, FR-002). */
  readonly language?: Lang;
  /** The speech-recognition region for each language (feature 014, FR-014a). */
  readonly voiceLocales: Readonly<Record<Lang, string>>;
  readonly lastSessionId?: string;
}

/**
 * A change to the settings. Keys and models merge per provider, so saving one provider's key
 * never touches another's; a blank (or undefined) key removes it, a blank model resets it to the
 * registry default. `lastSessionId: undefined` removes it.
 */
export interface SettingsPatch {
  readonly provider?: ProviderId;
  readonly apiKeys?: Readonly<Partial<Record<ProviderId, string | undefined>>>;
  readonly models?: Readonly<Partial<Record<ProviderId, string | undefined>>>;
  readonly rememberKey?: boolean;
  readonly language?: Lang;
  /** Merged per language, like apiKeys. */
  readonly voiceLocales?: Readonly<Partial<Record<Lang, string>>>;
  readonly lastSessionId?: string | undefined;
}

const defaultModels = (): Record<ProviderId, string> =>
  Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].defaultModel])) as Record<ProviderId, string>;

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  apiKeys: {},
  models: defaultModels(),
  rememberKey: true,
  voiceLocales: { en: "en-US", es: "es-ES" },
};

/**
 * Rows written before feature 005 (read as Claude's key and model) and before feature 014
 * (`voiceLocale`, read as the region of its language); deleted on the next save.
 */
const LEGACY = ["apiKey", "model", "voiceLocale"] as const;

/** A non-empty BCP 47 tag whose primary subtag is `lang` (data-model §2). */
const isLocaleOf = (lang: Lang, value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(value) && value.split("-")[0]?.toLowerCase() === lang;

function voiceLocalesOf(stored: unknown, legacy: unknown): Record<Lang, string> {
  const out: Record<Lang, string> = { ...DEFAULT_SETTINGS.voiceLocales };
  for (const { id } of LANGUAGES) {
    if (isLocaleOf(id, legacy)) out[id] = legacy;
  }
  if (stored && typeof stored === "object") {
    for (const { id } of LANGUAGES) {
      const value = (stored as Record<string, unknown>)[id];
      if (isLocaleOf(id, value)) out[id] = value;
    }
  }
  return out;
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value.trim() : undefined);

function keysOf(value: unknown): Partial<Record<ProviderId, string>> {
  const out: Partial<Record<ProviderId, string>> = {};
  if (!value || typeof value !== "object") return out;
  for (const [id, key] of Object.entries(value)) {
    const k = text(key);
    if (isProviderId(id) && k) out[id] = k;
  }
  return out;
}

function modelsOf(value: unknown): Record<ProviderId, string> {
  const out = defaultModels();
  if (!value || typeof value !== "object") return out;
  for (const [id, model] of Object.entries(value)) {
    const m = text(model);
    if (isProviderId(id) && m) out[id] = m;
  }
  return out;
}

export class SettingsRepo {
  /** Every provider's key while rememberKey is off; never stored. */
  private memoryKeys: Partial<Record<ProviderId, string>> | undefined;

  constructor(private readonly db: CompanionDb) {}

  private async stored(): Promise<Record<string, unknown>> {
    const rows = await this.db.getAll("settings");
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  /** Read-time migration and validation (FR-005). */
  private read(stored: Record<string, unknown>): Settings {
    const rememberKey = typeof stored["rememberKey"] === "boolean" ? stored["rememberKey"] : DEFAULT_SETTINGS.rememberKey;
    const legacyKey = text(stored["apiKey"]);
    const legacyModel = text(stored["model"]);
    const storedKeys = "apiKeys" in stored ? keysOf(stored["apiKeys"]) : legacyKey ? { anthropic: legacyKey } : {};
    const models = "models" in stored ? modelsOf(stored["models"]) : modelsOf(legacyModel ? { anthropic: legacyModel } : {});
    const lastSessionId = stored["lastSessionId"];
    return {
      provider: isProviderId(stored["provider"]) ? stored["provider"] : DEFAULT_SETTINGS.provider,
      apiKeys: rememberKey ? storedKeys : { ...this.memoryKeys },
      models,
      rememberKey,
      ...(isLang(stored["language"]) ? { language: stored["language"] } : {}),
      voiceLocales: voiceLocalesOf(stored["voiceLocales"], stored["voiceLocale"]),
      ...(typeof lastSessionId === "string" ? { lastSessionId } : {}),
    };
  }

  async get(): Promise<Settings> {
    return this.read(await this.stored());
  }

  async set(patch: SettingsPatch): Promise<Settings> {
    const stored = await this.stored();
    const current = this.read(stored);
    // A blank key drops out inside keysOf.
    const apiKeys = keysOf({ ...current.apiKeys, ...patch.apiKeys });
    // A blank model falls back to the registry default inside modelsOf.
    const models = modelsOf({ ...current.models, ...patch.models });
    const rememberKey = patch.rememberKey ?? current.rememberKey;
    const migrating = LEGACY.some((k) => k in stored);

    const tx = this.db.transaction("settings", "readwrite", { durability: "strict" });
    const put = (key: string, value: unknown) => tx.store.put({ key, value });
    if (migrating || "provider" in patch) await put("provider", patch.provider ?? current.provider);
    if (migrating || "models" in patch) await put("models", models);
    if ("rememberKey" in patch) await put("rememberKey", rememberKey);
    if (patch.language !== undefined) await put("language", patch.language);
    if (migrating || patch.voiceLocales !== undefined) {
      await put("voiceLocales", voiceLocalesOf({ ...current.voiceLocales, ...patch.voiceLocales }, undefined));
    }
    if ("lastSessionId" in patch) {
      if (patch.lastSessionId === undefined) await tx.store.delete("lastSessionId");
      else await put("lastSessionId", patch.lastSessionId);
    }
    if (!rememberKey) {
      // The keys never touch storage; drop any previously remembered copy.
      this.memoryKeys = apiKeys;
      await tx.store.delete("apiKeys");
    } else {
      this.memoryKeys = undefined;
      if (migrating || "apiKeys" in patch || "rememberKey" in patch) {
        if (Object.keys(apiKeys).length > 0) await put("apiKeys", apiKeys);
        else await tx.store.delete("apiKeys");
      }
    }
    for (const key of LEGACY) await tx.store.delete(key);
    await tx.done;
    return this.get();
  }
}
