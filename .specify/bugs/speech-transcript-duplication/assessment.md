# Bug Assessment: Voice transcript repeats every interim guess

- **Slug**: speech-transcript-duplication
- **Created**: 2026-10-10
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> I'm testing the application right now and I'm noticing a recurrent bug when the application interprets speech. It kind of picks words as you say them, but it includes everything into the command that is then sent to the model.
> For instance, I'm trying to say "Manuel abre erie por 60" yet the command is interpreted as "ManuelManuel AbreManuel AbreManuel AbreManuelAbre por Manuel Abre por 60", maybe it didn't catch the "Erie", but still why is it concatenating every previous attempt to understand me?

## Symptom

When the user holds the mic and speaks, the transcript sent to the model is every interim guess
glued together ("Manuel" + "Manuel Abre" + "Manuel Abre" + … + "Manuel Abre por 60") instead of
only the latest guess. Expected: just "Manuel abre Erie por 60" (or the recognizer's best
attempt at it). Missing "Erie" is a separate recognition-accuracy issue, not this bug.

## Reproduction

1. Open the app in Chrome on a phone (confirmed by the reporter).
2. Set an AI key so the mic is enabled; hold the mic button.
3. Say a multi-word command slowly, e.g. "Manuel abre Erie por 60", and release.
4. Observe the transcript shown during "interpreting" / in the result: it contains repeated,
   growing prefixes of the phrase concatenated without separators.

## Suspected Code Paths

- [src/voice/speech.ts:43-47](../../../src/voice/speech.ts#L43-L47) `textOf()` — concatenates
  `event.results[i][0].transcript` for **every** result in the list. This is the standard
  desktop-Chrome recipe, where each entry in `results` is a distinct segment of speech.
- [src/voice/speech.ts:66-72](../../../src/voice/speech.ts#L66-L72) `SpeechCapture.start()` —
  sets `continuous = true` and `interimResults = true`, the combination that triggers the
  Android behaviour described below, then stores `textOf(event)` as the final text.
- [src/app/voiceController.ts:71-99](../../../src/app/voiceController.ts#L71-L99) — consumes the
  live text and the text resolved by `stop()`, and sends it unchanged to `interpret()`.
  It only passes the string along; the bug is not here.
- [tests/ui/voice.test.tsx:45](../../../tests/ui/voice.test.tsx#L45) — the `FakeRecognizer` only
  ever sends one result with one transcript, so the tests never exercise multi-result events.

## Root Cause Hypothesis

Chrome on Android handles `continuous = true` + `interimResults = true` differently from desktop.
It does not replace the interim result in place. Instead it appends new entries to
`event.results`, and each entry holds the **cumulative** transcript so far ("Manuel",
"Manuel Abre", "Manuel Abre por 60", …). Some of those entries are marked final. `textOf()`
assumes desktop semantics, where results are separate segments, and joins all of them. The
result is exactly the reported pattern: growing prefixes concatenated with no spaces, and a
complete phrase at the end. Confidence: **high** that `textOf()` causes this, and
**high** that the trigger is the mobile Chrome result model (the reporter confirmed Chrome on
their phone). This bug has been present since the MVP; it is not a regression.

## Proposed Remediation

**Preferred**: Make transcript assembly robust to both result models inside `textOf()` (or a new
pure helper exported from `speech.ts`). Walk `event.results` in order, keeping an accumulated
string. For each result's transcript `t`, if it starts with the text accumulated so far (after
trimming and ignoring case), or with the previous entry's transcript, treat it as a
cumulative revision and **replace** that tail rather than appending it. Otherwise append it
with a single space separator. This yields "Manuel Abre por 60" on Android and still joins
real multi-segment results on desktop. The desktop join also needs a space; today segments
are joined with `""`.

**Alternatives**:
- *Use only the last result* (`event.results[event.results.length - 1]`). This is the simplest
  fix and correct on Android, but on desktop it drops earlier final segments after a pause
  ("Manuel abre Erie… por 60" would become "por 60"). Acceptable only if it is gated on a
  user-agent check, which is brittle.
- *`continuous = false`* and restart in `onend` while the button is still held. This avoids
  the Android quirk entirely, but adds restart gaps (lost words) and more complex state.
  Would only be worth it if the prefix-dedupe proves unreliable.

**Files likely to change**:
- `src/voice/speech.ts`
- `tests/voice/speech.test.ts` (new, unit tests for the assembly helper / `SpeechCapture`)
- `tests/ui/voice.test.tsx` (optionally, let `FakeRecognizer` emit multi-result events)

**Tests to add or update**:
- Android-style cumulative results `["Manuel", "Manuel Abre", "Manuel Abre", "Manuel Abre por 60"]`
  → `"Manuel Abre por 60"`.
- Desktop-style segments `["Manuel abre Erie", " por 60"]` → `"Manuel abre Erie por 60"`
  (single spaces, no duplication).
- Mixed: a final segment followed by cumulative interims of the next segment.
- `SpeechCapture.stop()` resolves with the deduplicated text after a sequence of `onresult` events.

## Risks & Considerations

- Prefix heuristics can misfire when a user really repeats a word ("dos dos acciones"). This
  is unlikely in practice, and comparing against the previous *entry*, not single words,
  limits the damage.
- The recognizer may change capitalization between revisions ("Manuel abre" vs
  "Manuel Abre"), so the comparison must ignore case.
- Behaviour differs between browsers and versions. Verify by hand on the target phone after
  the fix (jsdom cannot reproduce it).
- No API, storage or security impact. The change is confined to the voice capture layer.

## Open Questions

- Resolved (2026-10-10): the reporter uses Chrome on their phone. This matches the
  cumulative-results hypothesis. The pattern points to Android; iOS Chrome uses WebKit's
  recognizer, but the preferred fix covers both.
- [NEEDS CLARIFICATION: Does the same thing happen on desktop Chrome? If not, that confirms the Android result model. This does not block the fix.]
- The missing "Erie" is a recognition-accuracy issue. It could be helped later with
  `SpeechGrammarList` or company-name hints in the prompt, but it is out of scope here.
