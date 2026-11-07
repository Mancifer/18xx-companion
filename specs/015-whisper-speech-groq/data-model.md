# Data Model: Whisper Speech Recognition (Groq)

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Nothing in the session ledger changes. No event, action schema, export field or game-definition
field is added. Everything below is a device setting, transient in-memory data, or dev/eval data.

---

## 1. Settings (IndexedDB `settings` store, device-local, never exported)

Two new rows, read and validated like the others in `SettingsRepo.read`:

| Row key | Type | Default | Rules |
|---|---|---|---|
| `whisper` | `boolean` | `false` | The opt-in toggle (FR-003). Always stored, whatever `rememberKey` is. A non-boolean stored value reads as `false`. Never changed by a key edit. |
| `groqKey` | `string` | absent | Trimmed; blank = removed. Follows `rememberKey` exactly like `apiKeys`: with `rememberKey: false` it lives in the repo's memory only and the row is deleted (FR-002). |
| `checkClips` | `boolean` | `false` | **Dev builds only** (research R11). Read as `false` in production builds whatever is stored. |

`Settings` gains `whisper: boolean`, `groqKey?: string`, `checkClips: boolean`.
`SettingsPatch` gains `whisper?`, `groqKey?: string | undefined` (blank or undefined removes it),
`checkClips?`.

Invariants:
- `apiKeys`, `provider`, `models` and `activeCredentials` are unchanged; Groq is not a `ProviderId`.
- Setting `groqKey` never writes `whisper`, and setting `whisper` never writes `groqKey`.
- The `rememberKey: false → true` and `true → false` transitions handle `groqKey` in the same
  transaction as `apiKeys`.

No migration: older versions ignore unknown rows, and this version reads their absence as the
defaults.

---

## 2. Speech engine (in memory)

```text
SpeechEngineId = "browser" | "whisper"

whisperOffered(lang) = lang ∈ whisperLanguages()        // FR-018 gate
activeEngine(settings, lang) = settings.whisper && whisperOffered(lang) ? "whisper" : "browser"
```

The engine is picked when the mic is pressed (research R9). Changing the toggle mid-command
doesn't affect the command in flight.

### Whisper language gate (FR-018)

`whisperLanguages(raw = import.meta.env.VITE_WHISPER_LANGUAGES)` in `src/i18n/lang.ts`, next to
`voiceLanguages()`:
- **Production**: a comma-separated list; unknown entries and languages not in
  `voiceLanguages()` are dropped. Unlike voice, **no language is always on**: absent or empty
  means none. `.env.production` sets `VITE_WHISPER_LANGUAGES=` (empty) until T054 records a
  passing gate for a language.
- **Development builds** (`import.meta.env.DEV`): every voice language, so check clips can be
  recorded and Whisper tried before the gate.

In a language where Whisper isn't offered:
- the Settings toggle, its help and billing note are **hidden**; the Groq key field stays, so a
  key isn't lost;
- a stored `whisper: true` is kept but has no effect, so the browser engine is used;
- nothing goes to Groq.

### Availability (`voiceAvailability`, research R10)

The checks run in order; the first failure is the reason shown on the mic and in Settings:

"Whisper on" below means `settings.whisper && whisperOffered(lang)`.

| # | Check | Reason (message code) |
|---|---|---|
| 1 | Voice offered in the display language | (unchanged: mic hidden) |
| 2a | Whisper on → `MediaRecorder`, `getUserMedia` and a supported type exist | `voice.noRecorder` |
| 2b | Whisper off → the browser recognizer exists | `voice.noSpeech`; `voice.noSpeechTryWhisper` only when 2a would pass **and** `whisperOffered(lang)` |
| 3 | Online | `voice.offline` |
| 4 | Whisper on → `groqKey` set | `voice.noGroqKey` |
| 5 | The AI provider key is set | `voice.noKey` (unchanged) |

---

## 3. Recording (in memory, one per mic hold)

| Field | Type | Notes |
|---|---|---|
| `mimeType` | `string` | The type chosen at start (research R3). |
| `extension` | `"webm" \| "ogg" \| "mp4"` | Derived from `mimeType`; used in the upload file name. |
| `chunks` | `Blob[]` | From `dataavailable`; joined into one `Blob` on stop. |
| `startedAt` / `stoppedAt` | `number` (ms) | Duration for the speech gate. |
| `levels` | `number[]` | RMS per ~50 ms frame; used by the gate and the level cue. |
| `cut` | `boolean` | True when the 30 s limit stopped it (FR-008). |

### States

```text
idle ──press──▶ acquiring ──recorder started──▶ recording ──release / 30 s──▶ stopped
  ▲                │                                │                              │
  │      release before start / error        cancel / hidden                       │
  └────────────────┴────────────────────────────────┴──────── tracks stopped ◀─────┘
```

- `acquiring`: waiting for `getUserMedia` (and possibly the permission prompt). The UI is not yet
  "listening".
- In every exit path, all `MediaStreamTrack`s are stopped and the `AudioContext` is closed before
  the next state (FR-013).
- The `Blob` is dropped once the transcription settles or is cancelled. Nothing references it
  afterwards (FR-012). The one exception, allowed by constitution VII, is development builds with
  `checkClips` on: the last clip is held until the next press, so "Guardar para eval" can save it
  (§7). That code sits behind `import.meta.env.DEV` and isn't in production builds.

### Speech gate (FR-009)

`hasSpeech(recording)` is true when duration ≥ 400 ms and at least 250 ms of frames are above a
threshold set relative to the recording's quietest 10% of frames. Only then is it uploaded.

---

## 4. Vocabulary hint (derived per command, never stored)

```text
buildHint(session: VoiceSession, lang: Lang) → string   // ≤ 400 chars and ≤ 180 estimated tokens
```

**As built**: a lead-in with the game name, then sections for players, companies, trains and game
words, each a comma list.

Terms are chosen in **priority** order until a term would break a budget:
1. player names;
2. company short names;
3. train names;
4. player aliases;
5. company full names and alt names;
6. the language's game words.

The output stays grouped by section. Terms are de-duplicated case-insensitively, whole terms only,
and the result is deterministic.

**Company aliases are left out on purpose.** They are phonetic forms written for the AI resolver
("pe erre erre", "be y o"), and Whisper copies the prompt's spelling. Player aliases are real
nicknames, so they stay.

**Budgets** (`HINT_MAX_CHARS = 400`, `HINT_MAX_TOKENS = 180`): the token estimate is
conservative for name lists. Each word counts `ceil(length / 3)` tokens, each run of digits 1 per
digit, and each other non-letter character (`&`, `,`, `.`) 1 token. That keeps a margin under
Groq's 224-token limit even for symbol-heavy names like "B&O" or "C&O".

---

## 5. Transcription result

```text
TranscriptionResult =
  | { kind: "text"; text: string; ms: number }       // ms: request time, for the dev log and eval
  | { kind: "empty"; reason: "short" | "silence" | "noSpeech" | "hallucination" }
  | { kind: "error"; error: TranscriptionError }
```

- **`TranscriptionError`** extends `Error`: `kind: ProviderErrorKind | "audio"`, plus optional
  `status` and `retryAfterMs`. Its message never contains the key, the audio or the request.
- **Groq response** (`verbose_json`), validated with zod, with unknown fields allowed:
  `{ text: string, segments?: { text: string, no_speech_prob: number, avg_logprob: number }[] }`.
- **Segment filter**: a segment is dropped when `no_speech_prob > 0.6 && avg_logprob < -1.0`. The
  joined text is then checked against the language's hallucination list (research R6).

---

## 6. Voice phase (controller state, extended)

```text
VoicePhase =
  | { phase: "idle" }
  | { phase: "listening"; interim: string; level?: number }    // level: 0–1, Whisper only
  | { phase: "transcribing" }                                  // NEW
  | { phase: "interpreting"; transcript: string }
  | { phase: "result"; result: VoiceResult; clarification?: string; hint?: "cut" | "empty" }
```

Transitions added by this feature:

| From | Event | To |
|---|---|---|
| `listening` | release, Whisper engine | `transcribing` |
| `listening` | 30 s limit | `transcribing` (with `hint: "cut"` carried to the result) |
| `transcribing` | text | the existing path: "sí" shortcut or `interpreting` |
| `transcribing` | empty | the previous card if any, else `idle`, with a brief "didn't hear anything" hint |
| `transcribing` | error | `result` with a not-understood result carrying `voice.transcription { kind }` |
| `transcribing` | cancel / hidden | `idle` (request aborted; late results dropped by generation id) |

With the browser engine, the phases are exactly as today (release → `interpreting`).

---

## 7. Audio check set (dev and eval only, research R11)

**Candidate download** (dev build, from "Guardar para eval"): today's candidate JSON, plus
`audio: string` (the clip's file name), `engine: "browser" | "whisper"` and `lang: Lang`. The
existing `transcript` field holds the browser's live transcript for `engine: "browser"`, and
Whisper's transcript for `engine: "whisper"`.

**Manifest** `eval/audio/manifest.jsonl`, one line per clip:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `es-a001`, `en-a001`… |
| `lang` | `"es" \| "en"` | |
| `audio` | `string` | Path under `eval/audio/clips/` (ignored by git). |
| `fixture` | `string` | Fixture file name, in the voice eval's fixture format. |
| `browserTranscript` | `string?` | Present only for clips recorded with the browser engine. |
| `expect` | voice eval `expect` shape | Same schema and grader as `eval/voice/cases.jsonl`. |
| `mentionsName` | `boolean` | Derived on collect: the expected action names a player or company (SC-002 subset). |

**Transcript cache** `eval/audio/transcripts/<key>.json` (ignored by git): one entry per Whisper
transcription.
- **Key**: SHA-256 of the clip bytes + model + language + hint.
- **Value**: `{ result: TranscriptionResult, ms, billedSeconds, at }`.
- **Rules**: written only for `text` or `empty` results, never for errors. Read under the default
  `--transcripts cached` (contracts/audio-check.md, "Free-tier limits").

**Results** `eval/audio/results/<stamp>.json` (ignored by git), per language and engine:
- correct / total;
- correct / total on the `mentionsName` subset;
- Whisper transcription latency p50 and p90;
- end-to-end release-to-card estimate;
- Groq billed seconds and cost;
- WER against the browser transcript (secondary).
