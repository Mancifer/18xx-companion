import type { Interpreter, InterpreterOptions } from "../interpreter";
import { createInterpreter as createAnthropicInterpreter } from "./anthropic";
import { createGeminiInterpreter } from "./gemini";

/**
 * The voice providers (feature 005, data-model §3). Only this registry knows the list; adding a
 * provider is an entry here plus its adapter (contracts/voice-provider.md §6).
 */

export type ProviderId = "anthropic" | "gemini";

export interface VoiceProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** In "Clave de <shortLabel>" and "Añade tu clave de <shortLabel> en Ajustes". Where to get a key, and the notes, are in the Settings text (feature 014). */
  readonly shortLabel: string;
  readonly defaultModel: string;
  readonly keyPlaceholder: string;
  /** Used by the eval to infer the provider from a model id. */
  readonly modelPrefix: string;
  readonly createInterpreter: (apiKey: string, model: string, options?: InterpreterOptions) => Interpreter;
}

export const PROVIDERS: Readonly<Record<ProviderId, VoiceProvider>> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    shortLabel: "Anthropic",
    defaultModel: "claude-sonnet-5",
    keyPlaceholder: "sk-ant-…",
    modelPrefix: "claude-",
    createInterpreter: createAnthropicInterpreter,
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    defaultModel: "gemini-3.6-flash",
    keyPlaceholder: "AIza…",
    modelPrefix: "gemini-",
    createInterpreter: createGeminiInterpreter,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

export interface ProviderSettings {
  readonly provider: ProviderId;
  readonly apiKeys: Readonly<Partial<Record<ProviderId, string>>>;
  readonly models: Readonly<Record<ProviderId, string>>;
}

/** The selected provider's key and model; never another provider's key (spec edge case). */
export function activeCredentials(settings: ProviderSettings): { provider: ProviderId; apiKey?: string; model: string } {
  const { provider } = settings;
  const apiKey = settings.apiKeys[provider];
  return { provider, model: settings.models[provider] || PROVIDERS[provider].defaultModel, ...(apiKey ? { apiKey } : {}) };
}
