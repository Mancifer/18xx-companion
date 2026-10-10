# Bug Fix: Voice transcript repeats every interim guess

- **Slug**: speech-transcript-duplication
- **Fixed**: 2026-10-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Replaced the naive concatenation in `textOf()` with a pure `assembleTranscript()` helper that
treats cumulative revisions (Android Chrome's result model) as replacements and joins genuine
segments (desktop model) with a single space, so "Manuel" + "Manuel Abre" + … + "Manuel Abre por 60"
becomes just "Manuel Abre por 60".

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/voice/speech.ts` | modified | New exported `assembleTranscript()`; `textOf()` now delegates to it |
| `tests/voice/speech.test.ts` | added test | Unit tests for the helper and `SpeechCapture.stop()` |

## Diff Highlights

```ts
export function assembleTranscript(transcripts: readonly string[]): string {
  const segments: string[] = [];
  for (const raw of transcripts) {
    const t = norm(raw);
    if (!t) continue;
    const last = segments.at(-1);
    if (segments.length > 1 && startsWithCi(t, segments.join(" "))) segments.splice(0, segments.length, t);
    else if (last !== undefined && (startsWithCi(t, last) || startsWithCi(last, t))) segments[segments.length - 1] = t;
    else segments.push(t);
  }
  return segments.join(" ");
}
```

Comparison is case-insensitive with whitespace collapsed. A result that extends the whole text so
far, extends the previous segment, or is a prefix of the previous segment counts as a revision.
Anything else is a new segment.

## Tests Added or Updated

- `tests/voice/speech.test.ts` — "collapses Android-style cumulative revisions to the latest":
  `["Manuel", "Manuel Abre", "Manuel Abre", "Manuel Abre por 60"]` → `"Manuel Abre por 60"`.
- "ignores case changes between revisions".
- "joins desktop-style segments with a single space": `["Manuel abre Erie", " por 60"]` → `"Manuel abre Erie por 60"`.
- "handles a final segment followed by cumulative interims of the next one".
- "treats a result that restates all segments so far as a revision".
- "skips empty results and trims".
- `SpeechCapture` — "stop() resolves with the deduplicated transcript after several onresult events"
  (also checks the interim callbacks).

## Local Verification

- Commands run: `npx vitest run tests/voice/speech.test.ts tests/ui/voice.test.tsx` → 23 passed.
- `npx vitest run` → 72 files, 1235 tests passed.
- `npx tsc --noEmit -p .` and `npx eslint` on the changed files → clean.
- Manual checks: none yet. jsdom cannot reproduce the Android recognizer, so this still needs
  checking on the reporter's phone.

## Deviations from Assessment

- Besides "t starts with the previous entry", the helper also counts "the previous entry starts
  with t" (a shorter re-emission) as a revision. Android sometimes re-sends a shorter interim; the
  latest result wins, which matches the cumulative model.
- `tests/ui/voice.test.tsx` was left unchanged (the assessment marked it optional). Multi-result
  events are covered at the `SpeechCapture` level in the new unit test.

## Follow-ups

- Manual check in Chrome on Android: hold the mic, say "Manuel abre Erie por 60", and confirm the
  transcript has no repeated prefixes. Optionally check desktop Chrome too (the open question in the
  assessment).
- Out of scope: the missing "Erie" (recognition accuracy). Consider company-name hints later.
