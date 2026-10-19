# Bug Verification: "Pagar…" sheet lists companies as plain text, not badges

- **Slug**: pay-modal-company-colors
- **Tested**: 2026-10-19
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The bug no longer reproduces. In the built app on a Pixel 7 viewport, the "Pagar…" target grid, the "Pagar $30 a PRR" button and the "Mover acciones" De/A grid all show companies as colored badges. The full suite, typecheck and lint pass, with no regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix), real browser | `npm run build`, `vite preview`, then a Playwright script (Pixel 7, es-ES): new 1830 game with 3 players → Ana's tile → Pagar… → PRR → 30; then Mover acciones → PRR | pass | PRR target badge background `rgb(50, 118, 63)`; 1 badge in the confirm button; 1 badge in "la IPO de PRR (10)"; no horizontal overflow. Screenshots reviewed by eye. |
| New tests | `npx vitest run tests/ui/playerSheet.test.tsx` | pass | 2 new tests in "Ajustes show companies as badges …". They failed before the fix (recorded in fix.md). |
| Existing pay flows | `tests/ui/chips.test.tsx` (within full run) | pass | Names "el banco", "Bruno" and `/^Pagar \$30/` unchanged |
| Regression suite | `npx vitest run` | pass | 94 files, 1821 tests |
| Type-check | `npx tsc --noEmit -p .` | pass | |
| Lint | `npx eslint src/ui/sheets/HolderSheet.tsx tests/ui/playerSheet.test.tsx` | pass | |
| Playwright e2e suite (`e2e/`) | — | skipped | Not run; the targeted browser script covers the changed sheet. `e2e/helpers.ts` `payBank` uses `/^Pagar .* al banco$/`, and the bank path is unchanged. |

## Output Excerpts

```
PRR target badge background: rgb(50, 118, 63)
confirm badges: 1
horizontal overflow: false
IPO button badges: 1 | name: la IPO de PRR (10)
```

```
 Test Files  94 passed (94)
      Tests  1821 passed (1821)
```

Screenshots (session scratchpad, not in repo): `pay-sheet-phone.png`, `shares-sheet-phone.png`.
- Pagar…: the badges for all 8 companies fit the 3-column grid, and the selected PRR badge stays readable on the blue pressed button.
- Mover acciones: "la IPO de PRR (10)" wraps to two lines inside its button. The other cells stay on one line.

## Residual Risks

- Tablet landscape was not checked visually. The grid is wider there, so it is unlikely to differ.
- The "la IPO de <badge> (n)" button wraps to two lines on phone portrait. It is readable and fits the grid, so I treat it as cosmetic only.
- The full Playwright e2e suite was not run.

## Recommendation

Close the bug: verified end to end, both in a real browser on a phone viewport and by the unit and regression suites.
