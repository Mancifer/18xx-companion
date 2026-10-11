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
  /** In "Clave de <shortLabel>" and "Añade tu clave de <shortLabel> en Ajustes". */
  readonly shortLabel: string;
  readonly defaultModel: string;
  readonly keyPlaceholder: string;
  /** Where to get a key. */
  readonly keyHelpEs: string;
  /** Privacy and limits notes shown when this provider is selected. */
  readonly notesEs: readonly string[];
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
    keyHelpEs: "Créala en console.anthropic.com, en un espacio de trabajo con límite de gasto mensual.",
    notesEs: [],
    modelPrefix: "claude-",
    createInterpreter: createAnthropicInterpreter,
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    defaultModel: "gemini-3.6-flash",
    keyPlaceholder: "AIza…",
    keyHelpEs: "Consigue una clave gratis en Google AI Studio (aistudio.google.com) → «Get API key».",
    notesEs: [
      "En el plan gratuito, Google puede usar las órdenes y respuestas para mejorar sus productos. Se envían el estado de la partida y la transcripción, no datos personales. Usa el plan de pago si te importa.",
      "El plan gratuito tiene límites por minuto y por día. Si se alcanzan, la voz se pausa y el modo táctil sigue funcionando.",
    ],
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
