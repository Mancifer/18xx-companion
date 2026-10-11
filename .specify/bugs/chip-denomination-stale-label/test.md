# Bug Verification: Chip breakdown shows the old value after editing a chip's value

- **Slug**: chip-denomination-stale-label
- **Tested**: 2026-10-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

An automated version of the assessment's reproduction now passes. It drives the real UI in jsdom: remove the 1 chip, change the 5 chip to 1, save, then make a $3 payment. The strip shows `3×1`. The full suite, type-check and lint pass, so no regressions were found. The fix has not been checked by hand in a real browser.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix, automated) | `tests/ui/chips.test.tsx › a $3 payment shows 3×1, not the old 3×5` | pass | Repeats assessment steps 1–4 through the "Fichas" sheet and the "Cobrar del banco" toast; asserts `["3 × 1", "3×1"]` |
| Reproduction (manual, real browser) | Edit a chip's value in a running game and read the toast strip | not-run | Needs the running app on a device; left to the user |
| New / updated tests | `npx vitest run tests/ui/chips.test.tsx tests/domain/chips.test.ts` | pass | 19/19. Covers the stale label, a custom label ("Oro") surviving a value change, a previously saved session with `{ value: 1, label: "5" }`, and the 4 `chipLabel` unit cases |
| Regression suite | `npx vitest run` | pass | 77 files, 1383 tests. Includes `tests/eval/voice.test.ts` fixture matching against the regenerated fixtures |
| Type-check | `npm run typecheck` | pass | exit 0 |
| Lint | `npx eslint src tests` | pass | exit 0 |
| Preset clean-up | `grep label` in the `chipPreset` entries of `g1830.ts`, `g1848.ts`, `g21moon.ts`, `grotla.ts` | pass | No chip `label` entries remain |
| Remaining raw label renders | `grep "\.label" src/ui` | pass | The only chip `.label` reads left are in the `ChipSetEditor` inputs, which is expected. Every display path uses `chipLabel` |

## Output Excerpts

```
 Test Files  2 passed (2)
      Tests  19 passed (19)
```
```
 Test Files  77 passed (77)
      Tests  1383 passed (1383)
TYPECHECK=0
LINT=0
```

## Residual Risks

- Not checked by hand in a real browser or on Android. jsdom does not check rendering details such as whether the disc text fits.
- The new tests were not run against the pre-fix code to confirm they fail there, because this command must not modify source. The fix notes report that the eval fixture tests failed before the fixtures were regenerated, but they do not say the same for the new UI tests.
- The "Etiqueta" input still accepts a numeric label that differs from the value. The display ignores it, so it does no harm, but it may confuse users. This is listed as an optional follow-up in fix.md.

## Recommendation

Close the bug. The automated reproduction and all regression checks pass. Before release, optionally do the quick manual check from fix.md: in a running game, change a chip's value in "Fichas" and confirm the toast strip shows the new denomination.
