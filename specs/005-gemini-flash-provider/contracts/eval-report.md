# Contract: Voice Eval CLI and Report

**Feature**: 005-gemini-flash-provider

## CLI

```text
npm run eval:voice -- [--model <id>] [--provider anthropic|gemini] [--runs N] [--only id,id]
                      [--rpm N] [--free]
```

| Option | Default | Meaning |
|---|---|---|
| `--model` | the provider's default model | Model ID sent as-is |
| `--provider` | inferred from the model prefix (`claude-` → anthropic, `gemini-` → gemini); anthropic if no model is given | Which adapter to use |
| `--runs` | 1 | Repetitions of the full case set |
| `--only` | all | Case ids; result file gets `-partial` |
| `--rpm` | none (anthropic), 8 (gemini) | Maximum requests per minute, spaced evenly |
| `--free` | off | Free-tier run: `costUsd = 0`; `paidEquivalentUsd` still computed |

Keys: `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`, for the chosen provider only. A missing key exits 1 with a message naming the variable. A model whose prefix contradicts `--provider` exits 1.

**Unchanged**: the same `cases.jsonl` (78 cases), the same fixtures, `gradeResponse` (now on `ModelReply`), cases grouped by fixture so the cache stays warm, and the same interpreter path the app uses.

**Rate limiting**: a 429/503 is retried with exponential backoff (2 s, 4 s, 8 s, … capped at 60 s, or the server's `retryDelay` if longer), up to 6 attempts, and not graded. After that the case is recorded as `error: "rateLimited"`. A daily-quota 429 stops the run and writes what it has as `-partial`.

## Console output

Per case, unchanged (`ok` / `FAIL` / `ERR`, latency, transcript). A retry line is printed as `wait`. Summary:

```text
== gemini / gemini-3.8-flash (free tier): 78 cases × 1 runs
overall  87.2%   OR subset  91.0%   tuning  88.0%   held-out  84.6%
  payout          95.0%
  …
latency p50 1180 ms, p95 2210 ms     stops: done 75, malformed 2, refused 0, truncated 1
tokens in 41 200, out 9 800 (thinking 4 100), cache read 402 000, cache write 0
cost $0.00 (free tier) · paid equivalent $0.094 ($0.0012 per command)
rate-limit retries: 3
gates: OR subset >= 90% ✓ · no category < 80% ✓ · p95 API latency < 2.5 s ✓ · cache reads > 0 (info) ✓
```

## Result file

`eval/voice/results/<YYYY-MM-DD>-<model>[-partial].json`:

```jsonc
{
  "summary": {
    "provider": "gemini",
    "model": "gemini-3.8-flash",
    "freeTier": true,
    "cases": 78,
    "runs": 1,
    "overall": 0.872, "orSubset": 0.91, "tuning": 0.88, "heldout": 0.846,
    "byCategory": { "payout": 0.95, "…": 0.0 },
    "latencyMs": { "p50": 1180, "p95": 2210 },
    "cacheReadRate": 0.93,
    "tokens": { "input": 41200, "output": 9800, "cacheRead": 402000, "cacheWrite": 0, "thinking": 4100 },
    "costUsd": 0,
    "costPerCaseUsd": 0,
    "paidEquivalentUsd": 0.094,
    "paidPerCaseUsd": 0.0012,
    "priceNotes": [],
    "stops": { "done": 75, "truncated": 1, "refused": 0, "malformed": 2, "other": 0 },
    "rateLimitRetries": 3,
    "gates": { "OR subset >= 90%": true, "no category < 80%": true, "p95 API latency < 2.5 s": true }
  },
  "records": [
    {
      "caseId": "or-012", "run": 1, "fixture": "1830-or", "category": "compound", "heldout": false,
      "pass": true, "got": "buyTrain{…} + runAndPayout{…}",
      "latencyMs": 1210,
      "stop": "done", "rawStop": "STOP",
      "usage": { "input": 210, "output": 120, "cacheRead": 6100, "cacheWrite": 0, "thinking": 50 }
    }
  ]
}
```

**Invariants**:
- The same keys for both providers. Fields that don't apply hold `0` or `null`, never missing (SC-005).
- `costUsd` is `null` exactly when the price is unknown and `freeTier` is false. `paidEquivalentUsd` is `null` exactly when the price is unknown.
- For Anthropic, `paidEquivalentUsd === costUsd`.
- Gate keys: Anthropic has the 4 existing gates. Gemini has the first 3, with the cache gate moved to an info line ([research R5](../research.md#r5-prompt-caching-on-gemini)).

## Comparing providers

`npm run eval:voice:compare -- <result-a.json> <result-b.json>` prints accuracy (overall and per category), p50/p95, stop counts, and paid cost per command, side by side, with the difference (SC-005). It is a read-only script, `eval/voice/compare.ts`.
