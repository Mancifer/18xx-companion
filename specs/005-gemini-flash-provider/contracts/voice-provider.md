# Contract: Voice Provider Adapters

**Feature**: 005-gemini-flash-provider

Every provider adapter is a function `createInterpreter(apiKey, model) → Interpreter`, registered in `src/voice/providers/index.ts`. This file defines what an adapter MUST do. It is the constitution's "pluggable AI resolver" rules in testable form.

## 1. Inputs (identical for every provider)

| Input | Source | Rule |
|---|---|---|
| System instructions | `systemPromptEs(session)` | Same text for every provider |
| Tools | `buildToolSpecs(session)` | Same names, descriptions, schemas, entity enums and order |
| User turn | `snapshotAndTranscript(...)` | Same text for every provider; it is the only volatile part and comes last |
| Model | settings `models[provider]` | Free text, passed through |

An adapter MAY change only the wire format: field names, schema container, cache markers, tool-choice and thinking settings.

## 2. Outputs

- Resolves to a `ModelReply` ([data-model §2](../data-model.md#2-modelreply-neutral-model-response)).
- Text, thoughts and signatures are dropped. Tool calls keep the provider's order.
- Rejects with a `VoiceProviderError` (or, for Anthropic only, the SDK error it already throws), mapped as in [research R7](../research.md#r7-provider-errors).
- One request per call, plus at most one retry on 429, 5xx or a network error (FR-010). Timeout 8 s per attempt.
- Never logs the key, the request headers, or a full response body.

## 3. Anthropic adapter (existing behavior, re-shaped)

Request: unchanged (`messages.create` with `tools: toAnthropicTools(specs)`, `system` with `cache_control`, `tool_choice: auto`, `max_tokens: 1024`, effort `low` where supported, `timeout: 8000`, `maxRetries: 1`).

Response → `ModelReply`:
- `calls` = `tool_use` blocks → `{ name, input }`
- `stop`: `refusal` → refused, `max_tokens` → truncated, otherwise done
- `usage`: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, thinking 0

**Regression guarantee (SC-006)**: `toAnthropicTools(buildToolSpecs(s))` deep-equals today's `buildTools(s)` for every fixture session, and every existing recorded Claude response resolves to the same `VoiceResult` as before.

## 4. Gemini adapter (new)

### Request

```http
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
Content-Type: application/json
x-goog-api-key: <user key>
```

```jsonc
{
  "systemInstruction": { "parts": [{ "text": "<systemPromptEs(session)>" }] },
  "tools": [{ "functionDeclarations": [
    { "name": "runAndPayout", "description": "…", "parametersJsonSchema": { /* ToolSpec.schema */ } }
    // … same order as Anthropic
  ] }],
  "toolConfig": { "functionCallingConfig": { "mode": "ANY" } },
  "contents": [{ "role": "user", "parts": [{ "text": "<snapshot + transcript>" }] }],
  "generationConfig": {
    "maxOutputTokens": 1024,
    "thinkingConfig": { "thinkingLevel": "low" } // per-model table; omitted when unknown
  }
}
```

- Key order in the body: `systemInstruction`, `tools`, `toolConfig`, `contents`, `generationConfig`. `systemInstruction` and `tools` are serialized once per session and reused, so the implicit-cache prefix is byte-identical between commands (FR-011).
- `safetySettings` is not sent (defaults apply). Game transcripts are not expected to trigger them, and a block is handled as "refused".
- The model ID is URL-encoded into the path. The key is never put in the URL.

### Response → `ModelReply`

| Gemini field | `ModelReply` |
|---|---|
| `candidates[0].content.parts[].functionCall { name, args }` | `calls[]` in order; missing `args` → `{}` |
| `parts[].text`, `parts[].thought`, `thoughtSignature` | dropped |
| `candidates[0].finishReason` | `stop` per [research R6](../research.md#r6-one-response-format-for-both-providers) |
| no candidates, or `promptFeedback.blockReason` set | `stop: "refused"`, `calls: []` |
| `modelVersion` | `model` (falls back to the requested model) |
| `usageMetadata.promptTokenCount − cachedContentTokenCount` | `usage.input` |
| `usageMetadata.cachedContentTokenCount` | `usage.cacheRead` |
| `usageMetadata.candidatesTokenCount + thoughtsTokenCount` | `usage.output` |
| `usageMetadata.thoughtsTokenCount` | `usage.thinking` |
| — | `usage.cacheWrite = 0` |

Example (compound command, "compra un 4 y paga 290"):

```json
{
  "candidates": [{
    "content": { "role": "model", "parts": [
      { "functionCall": { "name": "buyTrain", "args": { "company": null, "trainType": "4", "variant": null, "from": "bank", "seller": null, "price": null, "tradeIn": null } } },
      { "functionCall": { "name": "runAndPayout", "args": { "company": null, "parts": [{ "part": "revenue", "amount": 290 }], "mode": "full" } } }
    ] },
    "finishReason": "STOP"
  }],
  "usageMetadata": { "promptTokenCount": 6300, "cachedContentTokenCount": 6100, "candidatesTokenCount": 60, "thoughtsTokenCount": 40, "totalTokenCount": 6400 },
  "modelVersion": "gemini-3.8-flash"
}
```

### Errors

| Condition | `kind` |
|---|---|
| HTTP 400 with `details[].reason = "API_KEY_INVALID"`, or HTTP 401 | `auth` |
| HTTP 403 | `permission` |
| HTTP 404, or 400 whose message names the model as unknown/unsupported | `model` |
| HTTP 429 | `rateLimit` (`retryAfterMs` from `RetryInfo.retryDelay`; `quota: "day"` when the violated quota id contains `PerDay`) |
| `AbortError` (8 s), HTTP 504 | `timeout` |
| `fetch` rejects with `TypeError` | `connection` |
| other non-2xx, or a body that is not JSON | `service` |

Retry once (after ≤ 1 s, or `retryAfterMs` when it is ≤ 1 s) on `rateLimit`, `service` with status ≥ 500, `timeout` from a 504, and `connection`. Never retry `auth`, `permission` or `model`.

## 5. Recorded-response fixtures (FR-016)

`tests/voice/recorded/gemini/<scenario>.json` holds raw `generateContent` bodies. Every Claude scenario in `tests/voice/recorded/` has a Gemini twin with the same name: amend, bad-input, buy-private, clarification, compound, confirm, max-tokens, next-company, no-tool, not-understood, payout, query, refusal (as `SAFETY`), undo, unknown-entity. Gemini-only scenarios: `blocked-prompt` (`promptFeedback.blockReason`), `malformed-call` (`MALFORMED_FUNCTION_CALL`), `no-args` (`functionCall` without `args`), `text-and-call` (a text part plus a call).

**Parity test**: for each shared scenario, `resolveResponse(geminiReply(gemini/<s>))` deep-equals `resolveResponse(anthropicReply(<s>))`.

## 6. Adding a provider later

1. Add an id to `ProviderId` and an entry to `PROVIDERS` (label, default model, key help, prefix, `createInterpreter`).
2. Write `to<Provider>Tools(specs)` and a `<provider>Reply(raw)` mapper.
3. Add recorded twins for §5's scenarios and prices to `eval/voice/prices.ts`.
4. Run the eval (constitution gate) before it shows in Settings.
