# Bug Verification: RotLA market strip is drawn highest-price-first

- **Slug**: rotla-market-track-reversed
- **Tested**: 2026-10-11
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The original reproduction (new RotLA game → launch a company → Menú → Mercado) was run in a real
browser (Playwright, phone and tablet). The strip now starts at "Cerrada" (posición 1) and ends at
$500 (posición 27), and the company token still sits on its correct cell. No regressions were found
in the full unit/UI suite, the RotLA e2e spec, the type-check or lint.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Throwaway Playwright spec (deleted after the run): `newRotla` → launch TUN → Menú → Mercado, read strip `aria-label`s, bounding boxes and a screenshot | pass | The first run showed the bug because Playwright reused a running preview server whose `dist` (08:43) predated the fix (08:48). After `npm run build` it showed the fixed order on both projects |
| New / updated tests | `npx vitest run tests/ui/market.test.tsx` | pass | 5/5 |
| Regression suite | `npx vitest run` | pass | 77 files, 1384 tests |
| RotLA e2e | `npx playwright test e2e/rotla.spec.ts` | pass | 6/6 (phone + tablet), run on the rebuilt `dist` |
| Type-check | `npx tsc --noEmit -p .` | pass | exit 0 |
| Lint | `npm run lint` | pass | no findings |

## Output Excerpts

```
FIRST: Casilla cerrada (posición 1) | SECOND: Casilla $10 (posición 2) | LAST: Casilla $500 (posición 27)
first box 16 150 last box 136 406          # phone: Cerrada top-left, $500 bottom
TUN in: Casilla $70 (posición 8), precio de salida
  2 passed (3.2s)
```

Before the rebuild (stale `dist`): `FIRST: Casilla $500 (posición 1) … LAST: Casilla cerrada (posición 27)`.

The phone screenshot shows the strip reading Cerrada, $10 … $50 / $60–$90 (launch range highlighted,
TUN on $70) … / $400, $450, $500.

## Residual Risks

- Drag-and-drop was not tested by touch on a real device. Unit tests cover the tap-move cell refs, and
  drag reads the same `data-cell` ref.
- With `reuseExistingServer`, the e2e suite can silently test a stale build if a preview server is
  already running locally. That is unrelated to this fix, but worth knowing for any local e2e
  verification.

## Recommendation

Close the bug. The fix was verified end-to-end in the browser, with no regressions.
