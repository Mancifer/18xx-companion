# Bug Verification: Chip breakdown missing from toasts for transfers that don't involve the bank

- **Slug**: toast-chips-non-bank
- **Tested**: 2026-10-12
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The assessment's reproduction (RotLA `buyShare` from treasury, player → company) now shows a "Bruno paga a …" chip strip with chip discs in the undo toast. It was run as an automated UI test in jsdom. The new and updated tests, type-check and lint all pass. The only full-suite failures are the 10 eval-fixture tests that were already out of date before this fix. They differ only in the chip preset and do not touch flows.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Temporary `tests/ui/zz-tmp-repro-toast-chips.test.tsx`, run with `npx vitest run` and then deleted. Seeds RotLA, launches EXP, taps "Tesorería Bruno", then asserts the toast has `/Bruno paga a .*\$\d+/` and ≥1 chip disc | pass | Automated UI equivalent of assessment steps 1–3 (jsdom, default chip set). Not run on a device. |
| New / updated tests | `npx vitest run tests/domain/flows.test.ts tests/ui/chips.test.tsx tests/voice/resolve.test.ts` | pass | 3 files, 93 tests passed |
| Regression suite | `npx vitest run` | pass (with pre-existing failures) | 1529 passed, 10 failed. All failures are in `tests/eval/voice.test.ts` › "eval fixtures (T135) … on disk matches a fresh build" |
| Lint / type-check | `npx tsc --noEmit -p .`; `npx eslint <changed files>` | pass | both exit 0 |

## Output Excerpts

```
Test Files  3 passed (3)
     Tests  93 passed (93)
```

```
Tests  10 failed | 1529 passed (1539)
FAIL tests/eval/voice.test.ts > eval fixtures (T135) > 1830-or on disk matches a fresh build ...
  "chipSet": { "chips": [
-   "color": "#6a1b9a",
+   "color": "#2e7d32",
+   "countAvailable": 50,
```

The eval failures differ only in `chipSet` (the feature 008 preset). No file under `tests/eval/` mentions `flows`, `moneyFlows` or `bankFlows`.

## Residual Risks

- The reproduction ran in jsdom, not on a phone. Toast height with more strips was not checked. This matters for RotLA dividends paid from a treasury and 1830/1848 payouts, and could affect the `toast-obscures-voice-button` fix.
- The reproduction was not run against the pre-fix code, so the change in result was not observed directly. The pre-fix `bankFlows` filtered out non-bank transfers, so the asserted "Bruno paga a …" strip could not have rendered.
- Multi-step groups (receivership/bankruptcy) now replace the text transfer list with chip strips whenever a chip set is configured. That was a design decision in the fix, not something the reporter asked for. It is covered only by existing tests.
- The eval fixtures (T135) are still out of date. That is unrelated to this bug.

## Recommendation

Close the bug. The original symptom is gone in the automated UI reproduction, and no new regressions appeared. Before shipping, do a quick check on a phone: buy a RotLA share from treasury and run a 1830 payout, to confirm the taller toasts don't cover the voice button. Regenerate the T135 eval fixtures separately.
