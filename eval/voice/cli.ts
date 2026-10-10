import { parseArgs } from "node:util";
import { VoiceProviderError } from "../../src/voice/errors";
import { isProviderId, PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../src/voice/providers";

/**
 * The eval's pure CLI helpers (feature 005, contracts/eval-report.md "CLI", research R9): options,
 * free-tier pacing and the 429/503 backoff. run.ts wires them to the network.
 */

export interface EvalOptions {
  readonly provider: ProviderId;
  readonly model: string;
  readonly runs: number;
  /** Case ids; the result file gets -partial. */
  readonly only?: readonly string[];
  /** Maximum requests per minute, spaced evenly. */
  readonly rpm?: number;
  readonly free: boolean;
  readonly apiKey: string;
}

export const KEY_VARIABLES: Readonly<Record<ProviderId, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

/** Google publishes free-tier limits only in AI Studio; 8 stays under them **(verify)**. */
const DEFAULT_RPM: Readonly<Partial<Record<ProviderId, number>>> = { gemini: 8 };

const providerOfModel = (model: string) => PROVIDER_IDS.find((id) => model.startsWith(PROVIDERS[id].modelPrefix));

/** Throws an Error naming the problem; run.ts prints it and exits 1. */
export function parseEvalArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): EvalOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      model: { type: "string" },
      provider: { type: "string" },
      runs: { type: "string", default: "1" },
      only: { type: "string" },
      rpm: { type: "string" },
      free: { type: "boolean", default: false },
    },
  });
  if (values.provider !== undefined && !isProviderId(values.provider)) {
    throw new Error(`--provider must be one of ${PROVIDER_IDS.join(", ")}, got ${values.provider}`);
  }
  const inferred = values.model === undefined ? undefined : providerOfModel(values.model);
  if (values.model !== undefined && values.provider === undefined && !inferred) {
    throw new Error(`Cannot infer the provider of ${values.model}; pass --provider ${PROVIDER_IDS.join("|")}`);
  }
  const provider: ProviderId = values.provider ?? inferred ?? "anthropic";
  const model = values.model ?? PROVIDERS[provider].defaultModel;
  if (inferred && inferred !== provider) throw new Error(`The model ${model} belongs to ${inferred}, not to --provider ${provider}`);

  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);
  const rpm = values.rpm === undefined ? DEFAULT_RPM[provider] : Number(values.rpm);
  if (rpm !== undefined && !(rpm > 0)) throw new Error(`--rpm must be a positive number, got ${values.rpm}`);

  const variable = KEY_VARIABLES[provider];
  const apiKey = env[variable];
  if (!apiKey) throw new Error(`Set ${variable} to run the eval on ${PROVIDERS[provider].label}.`);

  const only = values.only?.split(",").map((s) => s.trim()).filter((s) => s !== "");
  return { provider, model, runs, ...(only ? { only } : {}), ...(rpm !== undefined ? { rpm } : {}), free: values.free, apiKey };
}

export const MAX_ATTEMPTS = 6;

/** Wait before retry number `retry` (1-based): 2 s, 4 s, 8 s … capped at 60 s, or the server's delay if longer. */
export function backoffDelay(retry: number, retryAfterMs?: number): number {
  return Math.max(Math.min(2000 * 2 ** (retry - 1), 60_000), retryAfterMs ?? 0);
}

export type BackoffResult<T> =
  | { readonly kind: "ok"; readonly value: T; readonly retries: number }
  | { readonly kind: "rateLimited"; readonly retries: number }
  | { readonly kind: "dailyQuota"; readonly retries: number };

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
};

/**
 * Retries 429 and 503 (from either provider) with backoff, up to MAX_ATTEMPTS; these waits are
 * not graded. A daily-quota 429 stops at once. Any other error passes through.
 */
export async function withBackoff<T>(
  call: () => Promise<T>,
  { sleep, onWait }: { readonly sleep: (ms: number) => Promise<void>; readonly onWait?: (ms: number, retry: number, error: unknown) => void },
): Promise<BackoffResult<T>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { kind: "ok", value: await call(), retries: attempt - 1 };
    } catch (error) {
      if (error instanceof VoiceProviderError && error.kind === "rateLimit" && error.quota === "day") {
        return { kind: "dailyQuota", retries: attempt - 1 };
      }
      const status = statusOf(error);
      const limited = (error instanceof VoiceProviderError && error.kind === "rateLimit") || status === 429 || status === 503;
      if (!limited) throw error;
      if (attempt >= MAX_ATTEMPTS) return { kind: "rateLimited", retries: attempt - 1 };
      const ms = backoffDelay(attempt, error instanceof VoiceProviderError ? error.retryAfterMs : undefined);
      onWait?.(ms, attempt, error);
      await sleep(ms);
    }
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Spaces calls at 60000 / rpm ms; with no rpm it never waits. */
export function createPacer(rpm: number | undefined): () => Promise<void> {
  let next = 0;
  return async () => {
    if (!rpm) return;
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + 60_000 / rpm;
    if (at > now) await sleep(at - now);
  };
}
