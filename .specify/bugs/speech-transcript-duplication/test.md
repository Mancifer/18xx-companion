# Bug Verification: Voice transcript repeats every interim guess

- **Slug**: speech-transcript-duplication
- **Tested**: 2026-10-10
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

All automated checks pass, and the cumulative-results pattern from the assessment now collapses to
"Manuel Abre por 60". The reporter re-tested on their phone (2026-10-10) and found the transcript
"mostly clean, works much better now". Some trouble remains when a sentence mixes two names; the
reporter considers this acceptable (see Residual Risks). No regressions were found.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction on device (post-fix) | Reporter held the mic in Chrome on their phone and spoke commands | pass (minor) | "Mostly clean, works much better"; still some trouble with two names in one sentence, accepted by the reporter |
| Replay of reported transcript | Temporary vitest file feeding three possible result lists that rebuild the reported string into `assembleTranscript` (deleted afterwards) | partial | 2 of 3 lists → `"Manuel Abre por 60"`; list A → `"Manuel Abre ManuelAbre por Manuel Abre por 60"` |
| New tests | `npx vitest run tests/voice/speech.test.ts` | pass | 7/7 |
| Regression suite | `npx vitest run` | pass | 72 files, 1235 tests |
| Type-check | `npx tsc --noEmit -p .` | pass | exit 0 |
| Lint | `npx eslint src/voice/speech.ts tests/voice/speech.test.ts` | pass | exit 0 |

## Output Excerpts

```
✓ assembleTranscript > collapses Android-style cumulative revisions to the latest
✓ assembleTranscript > joins desktop-style segments with a single space
✓ assembleTranscript > handles a final segment followed by cumulative interims of the next one
✓ SpeechCapture > stop() resolves with the deduplicated transcript after several onresult events
Tests  1235 passed (1235)
```

Replay (each list joined with `""` rebuilds the reporter's string
`"ManuelManuel AbreManuel AbreManuelAbre por Manuel Abre por 60"`):

```
A ["Manuel","Manuel Abre","Manuel Abre","ManuelAbre por ","Manuel Abre por 60"]
  => "Manuel Abre ManuelAbre por Manuel Abre por 60"
B ["Manuel","Manuel Abre","Manuel Abre","Manuel","Abre por ","Manuel Abre por 60"]
  => "Manuel Abre por 60"
C ["Manuel","Manuel Abre","Manuel Abre","Manuel","Manuel Abre por","Manuel Abre por 60"]
  => "Manuel Abre por 60"
```

## Residual Risks

- **Revisions with different spacing**: if Android sends a revision whose spacing differs from the
  previous entry (list A: "ManuelAbre por" after "Manuel Abre"), the prefix check misses it. The
  output is still much shorter than before, but it still repeats words. Comparing with all
  whitespace removed, or letting a result that extends *any* earlier accumulated prefix replace
  everything up to it, would cover this.
- **Two names in one sentence** (reporter, after the fix): still some trouble. It is unclear whether
  this is leftover repetition (the spacing case above) or misrecognition of proper names (same kind
  of issue as the missing "Erie", out of scope). Reporter accepts it for now.
- The real Android result model has not been seen first-hand. Which list (A/B/C) matches reality is
  unknown. Logging `event.results` on the device once would settle it.
- Desktop Chrome behaviour has not been checked by hand (open question in the assessment).
- Prefix heuristics can merge a real repetition ("dos dos") into a single revision. This is unlikely
  in practice.

## Recommendation

Close the bug. The reporter verified on the device that the repeated-prefix symptom is essentially
gone and accepted the remaining behaviour. If problems with two names in one sentence turn out to be
repeated words (not misheard names), open a follow-up to make `assembleTranscript` ignore whitespace
(list A above is the ready-made regression case). Name-recognition accuracy belongs in a separate
bug (e.g. company/player name hints).
