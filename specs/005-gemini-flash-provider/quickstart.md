# Quickstart: Validating Gemini Flash as a Voice Provider

**Feature**: 005-gemini-flash-provider

## Prerequisites

- Node.js 22, `npm install` done.
- For live checks: a free Gemini key from Google AI Studio (aistudio.google.com → Get API key). For the comparison, an Anthropic key from a workspace with a spend limit.
- Check the key's free-tier limits on AI Studio's rate-limit page, and set `--rpm` below them.

## 1. Offline checks (no keys, run in CI)

```bash
npm run typecheck && npm run lint && npm test
```

Expected:

| Test file | Proves |
|---|---|
| `tests/voice/tools.test.ts` | `toAnthropicTools(buildToolSpecs(s))` equals the old `buildTools(s)` for every fixture (SC-006); Gemini declarations have the same names, order, descriptions and enums, and only allowed schema keywords (FR-006) |
| `tests/voice/gemini.test.ts` | Request body: key in the header, not the URL; stable prefix first; mode `ANY`; thinking level per model. Response mapping per [contracts/voice-provider.md §4](contracts/voice-provider.md#4-gemini-adapter-new). HTTP/abort/network → error kinds. One retry only (FR-010) |
| `tests/voice/resolve.test.ts` | Every recorded scenario, for both providers; Gemini twins resolve to the same `VoiceResult` as Claude's (FR-007, FR-016); malformed/blocked → "No entendí" with no state change (SC-004) |
| `tests/persistence/settingsRepo.test.ts` (new) | Legacy rows migrate to Claude (FR-005); per-provider keys are independent; "no recordar" stores neither key (FR-002) |
| `tests/ui/settings.test.tsx` | [contracts/settings-ui.md](contracts/settings-ui.md) tests 1–5 |
| `tests/ui/voice.test.tsx` | Gemini selected without a Gemini key → mic unavailable, no fallback to the Claude key; switching provider mid-command keeps the original interpreter |
| `tests/eval/voice.test.ts` | Price lookup by date; unknown model → `null`; `--free` → cost 0 plus paid equivalent; Gemini token normalization; report shape identical for both providers (FR-013, FR-014, SC-005) |
| `tests/security.test.ts` | No log line touches `apiKeys` or `x-goog-api-key`; the export never contains a key |

## 2. Live eval (needs keys; spends free quota or money)

`eval/voice/results/` is empty today, so there is no Claude baseline yet. **The Claude runs (step 0 and the re-run) are deferred until an Anthropic key is available.** When one is, run step 0 on a commit from before this feature's refactor (for example a worktree at the last pre-005 commit), and keep the file. Until then, the offline byte-identity tests in §1 stand in for SC-006, and only the Gemini runs below are needed.

```bash
# 0. Claude baseline, pre-change commit (needed for SC-006)
ANTHROPIC_API_KEY=... npm run eval:voice -- --model claude-sonnet-5

# Claude after the change (SC-006: within ±2 points of step 0)
ANTHROPIC_API_KEY=... npm run eval:voice -- --model claude-sonnet-5

# Gemini candidates (research R1), free tier
GEMINI_API_KEY=... npm run eval:voice -- --model gemini-3.8-flash --free
GEMINI_API_KEY=... npm run eval:voice -- --model gemini-3.6-flash --free
GEMINI_API_KEY=... npm run eval:voice -- --model gemini-3.5-flash-lite --free

# Side by side
npm run eval:voice:compare -- eval/voice/results/<date>-claude-sonnet-5.json eval/voice/results/<date>-gemini-3.8-flash.json
```

Expected:
- Every run finishes with no `ERR` from rate limits (pacing and retries work: FR-015). `rateLimitRetries` may be > 0.
- Both result files have the same keys ([contracts/eval-report.md](contracts/eval-report.md)), and the comparison prints cost per command for both (SC-005, US2-4).
- Record per candidate: overall ≥ 85% (SC-002) or the per-category gap; p95 < 2.5 s API time (SC-003 budget); malformed/refused counts.
- Pick the default Gemini model from these runs, and update `defaultModel` in the registry if it isn't `gemini-3.8-flash`.

## 3. Manual check in the app (SC-001, US1, US3)

1. `npm run dev`, open on a phone or in Chrome with a microphone. Start a stopwatch at a fresh profile.
2. Ajustes → Proveedor: Google Gemini → paste the free key → keep the model → Guardar. The Gemini notes are visible.
3. Start a 1830 session, open an OR, hold the mic and say «la PRR paga 240». Expected: the same confirmation card as with Claude, and nothing changes until Confirmar. Stop the stopwatch: under 5 minutes.
4. Say «compra un cuatro y paga 290» → one proposal with both actions. Say «deshacer» → undo card.
5. Ajustes → enter a wrong Gemini key → say a command → «La clave de la API no es válida.» plus the touch fallback.
6. Ajustes → model `gemini-nope` → «Este modelo no está disponible para esta clave.»
7. Ajustes → switch to Anthropic Claude (key already saved) → say a command → Claude answers. Switch back → the Gemini key is still there.
8. Export the session → open the JSON → no key of either provider in it.
