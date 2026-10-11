# Contract: Voice Eval CLI and Report — Caching Additions

**Feature**: 009-voice-prompt-caching | Extends [005 contracts/eval-report.md](../../005-gemini-flash-provider/contracts/eval-report.md)

## CLI

```text
npm run eval:voice -- [existing options] [--cache on|off]
```

| Option | Default | Meaning |
|---|---|---|
| `--cache` | follows `EXPLICIT_CACHE_MODELS` (off today) | Passed as `options.cache` to every interpreter. `on` with `--provider anthropic` is an error (exit 1). |

The result file is `eval/voice/results/<date>-<model>[-cache][-partial].json`. Caches the run creates are deleted when the run ends, also on a daily-quota stop.

## Console summary (new lines)

```text
cache: 10 created (63 400 tokens written), 0 fallbacks, 0 create failures
tokens in 21 900, out 2 900 (thinking 0), cache read 412 000, cache write 63 400   (cache reads  96.3% of calls)
cost $0.0712 · storage $0.0021 · total $0.0733 ($0.00088 per command)
  at 2027-01-01 prices: total $0.1466 ($0.00177 per command)
```

## Summary JSON (new or changed fields)

| Field | Type | Meaning |
|---|---|---|
| `cache` | `"on" \| "off"` | What the run used |
| `cacheEvents` | `{ created, extended, deleted, fallbacks, failures }` counts | From `onCacheEvent` |
| `tokens.cacheWrite` | number | Sum of `created.tokens` (it was 0 for Gemini before) |
| `storageUsd` | number \| null | Σ over caches of tokens × hours(created → last use + TTL) × `cacheStorage` |
| `totalUsd`, `totalPerCaseUsd` | number \| null | Token cost + writes + storage |
| `at2027` | `{ totalUsd, totalPerCaseUsd }` \| null | The same totals priced at the 2027-01-01 period |
| `latencyMs.firstP95` | number \| null | p95 over each fixture's first call (`prefixFirst`), the uncached command that runs while the create is in flight (FR-006) |

The existing fields keep their meaning. `cacheReadRate` still excludes each fixture's first call. For Gemini with `cache: "on"`, the gate `cache reads ≥ 90%` is added (SC-001).

## compare

The existing `npm run eval:voice:compare -- <a.json> <b.json>` gains rows. It prints:
- overall and per-category accuracy side by side, with each case's pass/fail delta;
- p50/p95 latency, plus first-call p95 (computed from `records` for older files);
- cache-read rate;
- total per command at both dated prices.

It also flags any category that dropped by more than one case (SC-003), and p95 that is more than 10% worse (SC-004).
