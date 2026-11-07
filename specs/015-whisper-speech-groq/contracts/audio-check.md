# Contract: Audio Check Set

**Feature**: [../spec.md](../spec.md) (FR-018, SC-002, SC-003) | **Research**: R11 | **Data model**: §7

## Commands

| Command | Does | Cost |
|---|---|---|
| `npm run eval:audio:collect -- <downloads folder>` | Moves `candidate-*.json` audio into `eval/audio/clips/` and each candidate's session export into `eval/audio/fixtures/` (loaded with the voice eval's fixture loader); appends manifest lines with new ids; derives `mentionsName`. Skips candidates without `audio`. | Free |
| `npm run eval:audio -- [--lang es\|en\|all] [--model <whisper id>] [--resolver <ai model id>] [--only id,id] [--groq-rpm N] [--rpm N] [--free] [--transcripts cached\|fresh]` | For each manifest line: transcribes the clip with Groq, then resolves the Whisper transcript (and `browserTranscript` when present) with the same resolver and grader as `eval:voice`. | Groq + AI provider calls |

Keys come from the environment, as with `eval:voice`: `GROQ_API_KEY` plus the resolver's key.
Missing keys stop the run before any request.

## Free-tier limits

The run is built to fit Groq's free tier. Per Whisper model, the rate-limits page lists 20
requests per minute, 2,000 per day, 7,200 audio seconds per hour and 28,800 per day, with every
request billed as at least 10 s. A full check set (about 60 clips) uses about 60 requests and 600
billed seconds, so only the per-minute limit binds.

- **Groq pacing**: `--groq-rpm` (default **18**) spaces Groq calls with the voice eval's
  `createPacer`, separately from the AI pacer. A clip whose transcript is cached doesn't wait.
- **AI pacing**: `--rpm` and `--free` mean exactly what they mean in `eval:voice` (Gemini's free
  tier defaults included). Two transcripts per clip (Whisper and browser) mean two AI calls.
- **Transcript cache**: `eval/audio/transcripts/` (ignored by git) holds one JSON per clip, keyed
  by clip file hash, model, language and hint. The default `--transcripts cached` reuses a hit and
  calls Groq only on a miss. A re-run that changes only `--resolver` or the grader therefore
  spends no Groq quota. `--transcripts fresh` ignores the cache, for example when measuring
  latency.
- **Retries**: on 429 the voice eval's `withBackoff` waits for `retry-after` (exponential
  otherwise, capped at 60 s) and retries. If it's still failing after its retries, or the 429
  says the daily quota is reached, the run stops, saves a **partial** report of the clips done,
  and the next run picks up from the cache.
- **Latency**: p50 and p90 time only the Groq request itself, never pacing or backoff waits.
  Cached transcripts have no latency and are left out of the latency columns. The report says how
  many latencies were measured.
- **Cost column**: with `--free`, Groq cost shows as `$0.00 (free tier)` plus the paid equivalent
  (billed seconds × the model's price), like `eval:voice`.
- **Budget**: with the defaults, a full fresh run takes about 4 minutes of Groq pacing (60 ÷ 18).
  Gemini free pacing (8 per minute × 2 transcripts per clip) dominates, at about 15 minutes.

The free-tier figures were read on 2026-11-07. The page doesn't say clearly whether its table is
the Free or Developer plan, so the defaults stay below it. `--groq-rpm` lowers them if Groq's
console shows smaller limits for the key.

## Report (stdout and `eval/audio/results/<stamp>.json`)

For each language, both engines on the clips that have both:

```text
lang  engine   correct   names-subset   p50 ms  p90 ms   groq s billed  cost
es    browser  18/25     9/14           —       —        —              —
es    whisper  22/25     13/14          640     910      250            $0.003
```

Plus Whisper-only rows on clips without a browser transcript, WER per clip (secondary), and the
list of failed ids with both transcripts.

## Gate (release of Whisper in a language)

Whisper may be offered in a language when that language's latest run meets all of these:
- **Accuracy**: on the clips that have both, Whisper's `correct` rate is at most **10 points** below
  the browser's (SC-002).
- **Names**: Whisper's `names-subset` rate is at most **15 points** below the browser's (SC-002).
  The margin is wider because the subset is small: one clip is about 5–6 points.
- **Speed**: Whisper p90 transcription ms + the resolver's p90 ≤ 4,000 ms on a typical connection
  (SC-003). It needs measured Groq latencies. A run whose transcripts all came from the cache
  shows speed as "not measured" and doesn't pass, so the speed result comes from a
  `--transcripts fresh` run.

The run also grades fairly:
- A cost's free-text `reason` is not graded. The manifest copies the card's whole action, while
  hand-written `eval:voice` cases leave that label out.
- A merger matches with its two companies in either order.

*Relaxed on 2026-11-07* from "Whisper ≥ browser, and +10 points on names". The first check set
showed desktop Chrome already at 88–94% on names, and Whisper's purpose is browsers without a
recognizer. The constants are `GATE_ACCURACY_MARGIN` and `GATE_NAMES_MARGIN` in `eval/audio/lib.ts`.

The speed check is a **proxy** for SC-003: it adds two p90s measured from a desktop connection in
Node, and leaves out the recorder's finalize time and a phone's upload. The manual check (T055)
therefore also records real release-to-card times on a phone. The dev log line
`voz: N ms hasta la tarjeta` is measured from the moment of release, transcription included.
SC-003 holds when 90% of those samples are under 4,000 ms.

When a language passes, add it to `VITE_WHISPER_LANGUAGES` in `.env.production` (comment with
the date and the result file), the same way feature 014 recorded `VITE_VOICE_LANGUAGES`. The run
file is recorded in the feature's `tasks.md` notes, like the voice eval runs.

## Clips policy

- `eval/audio/clips/`, `eval/audio/transcripts/` and `eval/audio/results/` are listed in
  `.gitignore`.
- `manifest.jsonl` holds no audio and may be committed.
- A clip enters git only if every speaker on it agrees (constitution, Principle VI).
