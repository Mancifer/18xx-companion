# Contract: Voice and the Eval Set in Two Languages

Feature 014, constitution 2.1.0 (Principle VI, Platform constraints). It extends the feature 005
and 009 voice contracts. Those stay in force except where this contract says otherwise.

## Which languages offer voice (FR-014e)

- `voiceLanguages()` (contracts/catalogs.md) lists the languages voice is offered in. In
  production it is `["es"]` until English passes its eval gate (below). Then the build setting
  `VITE_VOICE_LANGUAGES=es,en` turns English on.
- Development builds and tests can set it earlier (`.env.development.local`, `vi.stubEnv`).
- When the display language isn't in the list:
  - the mic button and voice panel aren't rendered;
  - no recognizer is created;
  - Settings shows the catalog note "Voice isn't available in English yet." in place of the
    region select.
  - The provider key and model fields stay, because they're shared with Spanish.
- The eval runner doesn't read the gate. It builds sessions for any language, so English can be
  measured before it is offered.

## Request

| Part | Spanish (`lang: "es"`) | English (`lang: "en"`) |
|---|---|---|
| Speech recognizer `lang` | `voiceLocales.es` (default `es-ES`) | `voiceLocales.en` (default `en-US`) |
| System prompt | **byte-identical to today's** | English version of the same instructions, in the same order: answer only through tools, query for questions, `askClarification`, `notUnderstood`, undo and amend phrasing, number words ("two hundred forty" = 240), `company: null` = operating company. Then the same game, player and company lines, with English labels. |
| Tools | **byte-identical to today's** | Same tool names, parameters, types and enums. English descriptions. |
| User message (snapshot + transcript) | Same as today | Same lines and order, with English labels ("Round:", "Bank:", "Players:", "Latest entries (id in brackets, newest last):", "Transcript:") |

- One call per command. The stable prefix (prompt + tools) comes first and the volatile snapshot
  last, as before.
- The language is part of the stable prefix, so each language has its own provider cache.
- A language switch takes effect on the next command. A command already in flight finishes in
  the language it started with.

## Response handling

These are unchanged and the same for both languages:
- tool-call validation through `ActionSchema`
- the pipeline
- `askClarification` options (by id)
- query answers from state only
- the touch fallback

The text shown comes from the catalogs in the **display language** at render time:
- the proposal summary
- clarification prompt chrome
- query answers
- `notUnderstood` reasons and hints
- provider error messages

## Aliases

Each company and private keeps one `aliases` list with both languages' spoken forms (FR-014d). The
alias audit adds the common English spoken forms that are missing. For example:
- 1830: "Pennsy", "B and O", "C and O", "New York Central"
- 1848: "Commonwealth"

Changing aliases is a definition change. It requires the game tests and a regenerated prompt
snapshot.

## Eval cases (`eval/voice/cases.jsonl`)

```jsonc
{ "id": "en-or-pay-01", "lang": "en", "fixture": "1830-or", "transcript": "240, pays", "category": "payout",
  "expect": { "kind": "actions", "actions": [ /* same shape as Spanish cases */ ] }, "tags": ["digits"], "heldout": false }
```

- **Fields**:
  - `lang` is optional. When absent it means `"es"`, so existing cases are unchanged.
  - English case ids start with `en-`.
- **Coverage**:
  - Every category that has Spanish cases also has English cases: payout, stock, trains, flow,
    corrections, costs, compound, loans, queries, clarification, notUnderstood.
  - Every fixture is used.
  - About 20% of English cases are held out.
- **Transcripts**: written as an English-speaking table would say them, as constitution 2.1.0
  allows for a new language, and replaced by real transcripts over time. Some carry the tag
  `written` until they are replaced.

## Runner and report

- **`npm run eval:voice -- --lang es|en|all`** (default `all`): each case runs with
  `VoiceSession.lang = case.lang`.
- **Report**: a section per language with accuracy overall and by category, held-out accuracy,
  and cost per command. The totals line names both languages.
- **`eval:voice:compare`**: compares the two runs per language.
- **Baseline**: kept per language. The Spanish baseline is the latest pre-014 run.
- **Gate before release (SC-007)**:
  - default provider/model: English accuracy ≥ Spanish accuracy − 5 points;
  - Spanish accuracy ≥ the Spanish baseline;
  - each allowlisted provider/model has a report for both languages.
