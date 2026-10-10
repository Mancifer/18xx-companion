# Bug Verification: RotLA voice share buys default to the IPO

- **Slug**: rotla-buy-default-treasury
- **Tested**: 2026-10-10
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Every deterministic part of the fix is verified:
- The RotLA prompt says a buy with no source named comes from the treasury, and that «del banco» means the pool.
- The snapshot shows where each company's shares are.
- The StockSheet no longer offers an IPO button in RotLA.
- In the domain, a treasury buy and a pool buy both succeed in the RotLA SR fixture.

The full suite, typecheck and lint pass. The original symptom was the language model choosing `source: "ipo"`. The user re-ran it against Gemini Flash on 2026-10-10, and both `rl-sr-buy-02` (treasury) and `rl-sr-buy-03` (pool) passed.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction, domain side (post-fix) | `npx vitest run tests/eval/voice.test.ts -t "rl-sr-buy"` | pass | A golden response for each of `rl-sr-buy-01/02/03` resolves to a proposal in the rotla-sr fixture (after the AGR launch): treasury for no source, pool for «del banco» |
| Reproduction, model side (post-fix) | Live voice eval on `rl-sr-buy-02`/`03` (Gemini default model) | pass | Run by the user on 2026-10-10: both cases passed |
| New / updated tests | `npx vitest run tests/voice/prompt.test.ts tests/ui/rotla.test.tsx tests/eval/voice.test.ts tests/voice/tools.test.ts` | pass | 4 files, 228 tests, including the prompt default line, the snapshot share locations, no IPO button once the treasury is sold out, and the prompt file snapshots |
| Regression suite | `npx vitest run` | pass | 72 files, 1240 tests |
| Lint / type-check | `npm run typecheck`, `npm run lint` | pass | Both exit 0 |

## Output Excerpts

```
Test Files  4 passed (4)
     Tests  228 passed (228)          # targeted
     Tests  3 passed | 125 skipped    # rl-sr-buy-01/02/03 golden validity
Test Files  72 passed (72)
     Tests  1240 passed (1240)        # full suite
tc=0  lint=0
```

## Residual Risks

- The fix steers the model through the prompt. It was confirmed on Gemini Flash only; Claude providers and the rest of the eval suite were not re-run.
- «del banco» = pool is scoped to share purchases in the prompt wording. The model could still over-apply it to bank payments (`bankPays`, `payCost`). The eval's existing bank and cost cases would catch that.
- The snapshot line grew for every game, so the token cost per call rose slightly.
- The user said a major with an empty treasury is fine as-is: majors work like any normal 18xx company.

## Recommendation

Close the bug. The deterministic checks pass, and the original voice symptom no longer reproduces on Gemini Flash. Optionally, run the full eval later to confirm that «del banco» = pool did not leak into bank payment cases.
