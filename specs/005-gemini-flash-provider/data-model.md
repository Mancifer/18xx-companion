# Data Model: Gemini Flash as a Voice Provider

**Feature**: 005-gemini-flash-provider | **Date**: 2026-10-10

No event, action or game-definition shape changes. The ledger, the pipeline and session files are untouched. The changes are device settings, the voice layer's internal types, and the eval's result format.

---

## 1. Settings (device-local)

`src/persistence/settingsRepo.ts`. Stored as key/value rows in the existing `settings` store. Never exported (the exporter does not read `settings`).

```ts
type ProviderId = "anthropic" | "gemini";

interface Settings {
  readonly provider: ProviderId;                               // NEW, default "anthropic"
  readonly apiKeys: Readonly<Partial<Record<ProviderId, string>>>; // NEW, replaces apiKey
  readonly models: Readonly<Record<ProviderId, string>>;      // NEW, replaces model
  readonly rememberKey: boolean;   // unchanged; now applies to every provider's key
  readonly voiceLocale: string;    // unchanged
  readonly lastSessionId?: string; // unchanged
}
```

**Defaults**: `provider: "anthropic"`, `apiKeys: {}`, `models: { anthropic: "claude-sonnet-5", gemini: "gemini-3.6-flash" }` (from the provider registry, §3; Gemini's default chosen by the 2026-10-10 eval, research R1).

**Stored rows**: `provider`, `apiKeys`, `models`, `rememberKey`, `voiceLocale`, `lastSessionId`.

**Read-time migration (FR-005)**:

| Stored | Read as |
|---|---|
| legacy `apiKey: "sk-ant-…"`, no `apiKeys` | `apiKeys: { anthropic: "sk-ant-…" }` |
| legacy `model: "claude-x"`, no `models` | `models: { anthropic: "claude-x", gemini: <default> }` |
| no `provider` | `provider: "anthropic"` |
| `models` missing a provider | that provider's registry default |

On the first `set()` after a migrated read, the new rows are written and the legacy `apiKey`/`model` rows are deleted, in the same transaction.

**Validation rules**:
- `provider` must be a registered id. An unknown stored value reads as `"anthropic"`.
- A blank key (after trimming) removes that provider's entry. A blank model resets it to the registry default.
- `rememberKey: false` → no `apiKeys` row is stored. The keys live in the repo's memory for this page load only, and any previously stored `apiKeys` row is deleted.
- Saving the key for one provider never touches the other provider's key (US3-1).

**Derived value**: `activeCredentials(settings) → { provider, apiKey?, model }` gives the selected provider's key and model. When the selected provider has no key, voice is unavailable with "Añade tu clave de <Proveedor> en Ajustes". The app never falls back to the other provider's key (spec edge case).

## 2. ModelReply (neutral model response)

`src/voice/reply.ts`. What both adapters return and what `resolveResponse` and the eval grader read.

```ts
interface ToolCall {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>; // Gemini's missing args → {}
}

type ReplyStop = "done" | "truncated" | "refused" | "malformed" | "other";

interface TokenUsage {
  readonly input: number;       // uncached input tokens
  readonly output: number;      // includes thinking tokens (billed as output)
  readonly cacheRead: number;
  readonly cacheWrite: number;  // 0 for Gemini implicit caching
  readonly thinking: number;    // subset of output; 0 for Claude without thinking
}

interface ModelReply {
  readonly provider: ProviderId;
  readonly model: string;       // as reported by the provider, or as requested
  readonly calls: readonly ToolCall[]; // in the order returned
  readonly stop: ReplyStop;
  readonly rawStop: string;     // provider's own reason, for eval reports only
  readonly usage?: TokenUsage;
}
```

**Mapping rules**: [research R6](research.md#r6-one-response-format-for-both-providers) (stop reasons) and [R10](research.md#r10-price-table) (tokens). Text parts are dropped by the adapters, so free text cannot reach state (FR-008).

**Resolution order in `resolveResponse(reply, ctx, transcript)`** (unchanged logic, new input):
1. `stop = "refused"` → notUnderstood "La orden fue rechazada."
2. `stop = "truncated"` → notUnderstood "La respuesta quedó incompleta."
3. `stop = "malformed"` → notUnderstood "La orden llegó incompleta." (**new branch**, Gemini only in practice)
4. No calls → notUnderstood "No reconocí ninguna orden."
5. Meta tools (askClarification, query, notUnderstood, undo, confirmProposal, amendLast), then actions through `ActionSchema` and `runPipeline`, exactly as today.

## 3. Voice provider (registry)

`src/voice/providers/index.ts`.

```ts
interface VoiceProvider {
  readonly id: ProviderId;
  readonly label: string;          // "Anthropic Claude" | "Google Gemini"
  readonly defaultModel: string;   // "claude-sonnet-5" | "gemini-3.6-flash"
  readonly keyPlaceholder: string; // "sk-ant-…" | "AIza…"
  readonly keyHelpEs: string;      // where to get a key
  readonly notesEs: readonly string[]; // privacy and limits notes (Gemini only)
  readonly modelPrefix: string;    // "claude-" | "gemini-": used by the eval to infer the provider
  readonly createInterpreter: (apiKey: string, model: string) => Interpreter;
}

const PROVIDERS: Readonly<Record<ProviderId, VoiceProvider>>;
```

**Interpreter (changed signature)**:

```ts
type Interpreter = (session: VoiceSession, userMessage: string) => Promise<ModelReply>;
```

Throws `VoiceProviderError` (§4) or, for Claude, the SDK's own errors. `resolveError` accepts both.

**Prefix memoization**: each interpreter rebuilds its tools and system prompt only when the `session` object changes, as today. A provider switch creates a new interpreter, while a command already in flight keeps the interpreter it started with (spec edge case: switching mid-command).

## 4. VoiceProviderError

`src/voice/errors.ts`.

```ts
type ProviderErrorKind = "auth" | "permission" | "model" | "rateLimit" | "timeout" | "connection" | "service";

class VoiceProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status?: number;       // HTTP status
  readonly retryAfterMs?: number; // from Retry-After / RetryInfo; eval backoff only
  readonly quota?: "minute" | "day"; // from 429 details when present; eval stop rule only
}
```

The `message` never contains the key or the full request. Mapping to Spanish messages: [research R7](research.md#r7-provider-errors).

## 5. Tool spec (neutral tool definition)

`src/voice/tools.ts`.

```ts
interface ToolSpec {
  readonly name: string;                  // action type or meta tool
  readonly description: string;           // shared Spanish description
  readonly schema: Readonly<Record<string, unknown>>; // sanitized JSON Schema, enums of this session's ids, sorted keys
}

buildToolSpecs(session): ToolSpec[]                   // today's buildTools minus the wire format
toAnthropicTools(specs): Anthropic.Tool[]             // + input_schema, strict: true (byte-identical to today)
toGeminiTools(specs): [{ functionDeclarations: { name, description, parametersJsonSchema }[] }]
```

Order: `ACTION_TOOLS` order filtered by the game, then `META_TOOLS`. The same for both providers (FR-006, FR-011).

## 6. Price entry

`eval/voice/prices.ts`. Eval only, never shipped in the app bundle.

```ts
interface PricePeriod {
  readonly from?: string;      // ISO date; omitted = always
  readonly input: number;      // $ per million tokens
  readonly output: number;
  readonly cacheRead: number | null;
  readonly cacheWrite: number | null;
}

const PRICES: Readonly<Record<string, readonly PricePeriod[]>>;

priceFor(model, date): PricePeriod | undefined // latest period with from <= date
costOf(usage: TokenUsage, price: PricePeriod): number
```

**Rules**: A model not in the table → `undefined` → cost `null` (FR-014). A null `cacheRead` price with `cacheRead > 0` tokens is charged at the input price, and the report flags it (`priceNotes`).

## 7. Eval run result

`eval/voice/results/<date>-<model>[-partial].json`. Shape in [contracts/eval-report.md](contracts/eval-report.md).

Changes from today's format:

| Field | Change |
|---|---|
| `summary.provider` | NEW |
| `summary.freeTier` | NEW: true when run with `--free` |
| `summary.tokens` | `{ input, output, cacheRead, cacheWrite, thinking }`, neutral (was Anthropic names) |
| `summary.costUsd` | 0 when `freeTier`; `null` when the price is unknown |
| `summary.paidEquivalentUsd`, `summary.paidPerCaseUsd` | NEW: paid-price estimate, even for free runs; `null` if the price is unknown |
| `summary.costPerCaseUsd` | unchanged meaning |
| `summary.rateLimitRetries` | NEW: how many 429/503 retries the pacing needed |
| `summary.stops` | NEW: count per `ReplyStop` (malformed/refused rates per provider) |
| `summary.gates` | `"cache reads > 0"` is a gate for Anthropic only; reported for Gemini |
| `records[].usage` | `TokenUsage` (neutral) |
| `records[].stop` | NEW: `ReplyStop` plus `rawStop` |
| `records[].error` | may be `"rateLimited"` after exhausted retries |

Older result files stay readable for their `overall`/`byCategory`, which is all the SC-006 baseline comparison needs.

## 8. State transitions

**Voice availability** (`voiceAvailability`):

```text
no speech API ──────────────► unavailable "Este navegador no reconoce la voz"
offline ────────────────────► unavailable "Sin conexión: la voz no está disponible"
selected provider has no key ► unavailable "Añade tu clave de <Proveedor> en Ajustes"
otherwise ──────────────────► available (interpreter = PROVIDERS[provider].createInterpreter(key, model))
```

**Provider switch**: Settings save → `SETTINGS_CHANGED` → `useVoice` reloads settings → new interpreter memo → new controller. A command in flight resolves with the interpreter it captured.
