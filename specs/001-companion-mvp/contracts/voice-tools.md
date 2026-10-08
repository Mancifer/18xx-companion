# Contract: Voice Interpreter (Claude Messages API)

Source: `src/voice/interpreter.ts`, `src/voice/tools.ts`, `src/voice/prompt.ts`.

## Request

```ts
client.messages.create({
  model: settings.model,                         // default chosen by the eval (research R9)
  max_tokens: 1024,
  tools: buildTools(session, state),             // strict, session-stable order and enums
  tool_choice: { type: "auto" },                 // forced choice is rejected on some models
  system: [{ type: "text", text: systemPromptEs(session), cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: snapshotAndTranscript(state, transcript, clarification?) }],
}, { timeout: 8000, maxRetries: 1 });
```

- **Client**: `new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true })`.
- **Prefix stability**: `tools` and `system` depend only on the session definition (game,
  players, companies, aliases, enabled mechanics), never on the volatile state. They are
  serialized with sorted keys. The snapshot goes in the user message.
- **Tool availability**: tools for actions unavailable in this *game* are omitted (they are
  stable for the session). Actions unavailable in the current *state* stay in the list, and the
  validator turns them into warnings.

## Tools

One strict tool per voice-reachable action in [actions.md](./actions.md): `runAndPayout`,
`buyTrain`, `payCost`, `bankPays`, `privateIncome`, `buyPrivateByCompany`, `takeLoan`,
`parCompany`, `buyShare`, `sellShares`, `swapCertificates`, `issueShares`,
`buyPrivate`, `exchangePrivate`, `stockBatch`, `startSR`, `endSR`, `startCR`, `endCR`,
`startOR`, `nextCompany`, `transferMoney`, `adjustMoney`, `setMarket`, `undo`, `amendLast`,
`confirmProposal`. Tools for actions the session's game does not offer are omitted (for example,
no loan tools for 1830, no CR tools outside 21Moon). For 21Moon, `runAndPayout` takes the two
parts ("local 120, puerto 240"). Meta tools:

```ts
askClarification { question: string; options: { label: string; value: string }[] }  // 2–6 options
query { kind: "cash" | "shares" | "price" | "treasury" | "trains" | "bank" | "president" | "turn",
        player: PlayerId | null, company: CompanyId | null }
notUnderstood { reason: string }
```

- Entity fields are enums: `player: "p1" | "p2" | …`, `company: "PRR" | …`, `trainType`.
- Optional fields are `nullable` and listed in `required` (strict-schema compatible).
- Each tool `description` is in Spanish and gives 2–3 example phrases.

## Response handling

| Response | App behavior |
|---|---|
| ≥ 1 action `tool_use` | Parse each with Zod, then validate. Build **one** proposal (compound commands are one group). Show the confirmation card (FR-060) |
| `askClarification` | Show the question and one button per option. The choice re-runs resolution with `clarification` appended |
| `query` | Answer from `state` (FR-073). Never use the model's text |
| `undo` / `amendLast` / `confirmProposal` | Ledger operation or confirmation of the pending card (FR-062, FR-074). Amend shows a card |
| `notUnderstood`, no tool call, Zod failure, `stop_reason` `refusal` / `max_tokens`, API error, timeout | "No entendí" with the transcript and a "Hacerlo a mano" link to the matching touch sheet (FR-075) |
| Missing key, offline, no SpeechRecognition | Mic disabled with the reason. Touch is unaffected |

The model's free text is ignored, apart from logging the transcript in development.

## Eval contract (`eval/voice/`)

`cases.jsonl`, one line per case:

```json
{ "id": "or-payout-01", "fixture": "1830-4p-or2", "transcript": "240, paga",
  "expect": [{ "action": "runAndPayout", "company": null, "revenue": 240, "mode": "full" }] }
```

`npm run eval:voice -- --model <id>` reports exact-match accuracy, per-tool accuracy, and
p50/p95 latency to `eval/voice/results/<date>-<model>.json`. Pass bar: ≥ 90% on the OR subset
(SC-003) and p95 < 3 s (SC-004).
