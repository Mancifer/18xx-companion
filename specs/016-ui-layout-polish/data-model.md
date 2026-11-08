# Data Model: UI Layout Polish (016)

No stored data changes: no new events, no session or settings fields. The only new shapes are
derived, read-only views computed from existing state.

## CertificateStatus (derived, `src/domain/actions/limits.ts`)

Computed from `GameDefinition`, `SessionState`, a player id and the player count.

| Field | Type | Meaning |
|---|---|---|
| `rows` | `HoldingRow[]` | One per company the player holds (`units > 0`), in game-definition order. |
| `total` | integer ≥ 0 | All certificates held (same as `certificateCount`). |
| `counted` | integer ≥ 0 | Certificates that count toward the limit (excludes zone-exempt companies). |
| `limit` | integer > 0, optional | `game.limits.certificates[playerCount]`; absent when the game defines none. |
| `level` | `"under" \| "at" \| "over"` | `counted` vs `limit`; `"under"` when no limit. |

### HoldingRow

| Field | Type | Meaning |
|---|---|---|
| `company` | `CompanyId` | The company. |
| `units` | integer > 0 | Share units held. |
| `percent` | number | `units × 100 / shareCount`. |
| `certificates` | integer > 0 | Cards held: `1 + max(0, units − presidencyUnits)` if president, else `units`. |
| `president` | boolean | The player holds the presidency. |
| `counts` | boolean | False when the company's market zone exempts it from the limit (1830 yellow/orange/brown). |

**Rules**
- `total = Σ rows.certificates`; `counted = Σ rows.certificates where counts`.
- `level = "over"` iff `limit` defined and `counted > limit`; `"at"` iff `counted === limit`.
- `holdingWarnings` uses `counted` and `limit` from this function: its certificate-limit warning
  fires exactly when `level === "over"` after the action (behavior unchanged).

## VoiceSetupIssue (derived, `src/app/useVoice.ts`)

`voiceSetupIssue(availability: VoiceAvailability): Message | undefined`

- Returns the reason when it is a setup issue: `voice.noSpeech`, `voice.noSpeechTryWhisper`,
  `voice.noRecorder`, `voice.noKey`, `voice.noGroqKey`.
- Returns `undefined` when voice is available or the reason is transient (`voice.offline`).
- Drives: Table renders the mic and voice panel iff `voiceEnabled(lang) && !voiceSetupIssue(a)`;
  Home shows its notice iff `voiceEnabled(lang) && voiceSetupIssue(a)`.
