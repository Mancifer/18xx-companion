# Bug Verification: Closed companies look like open ones in the Companies tab

- **Slug**: companies-tab-status-order
- **Tested**: 2026-10-10
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

I ran the assessment's reproduction (RotLA, merge EXP + TUN into UNI, open the Companies tab) in a real browser, on both the phone and tablet viewports. The bug no longer reproduces. The tab shows "En juego" (UNI), then "Disponibles", then "Cerradas" (EXP, TUN), and the closed cards are visibly greyed out. No regressions were found in the unit, type-check, lint or e2e suites.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) | Temporary Playwright script in the session scratchpad that follows the assessment's steps 1–3, against `npm run preview`. It logs card order and computed styles and takes screenshots | pass | Phone and tablet. Headings `["En juego","Disponibles","Cerradas"]`. UNI is first, EXP/TUN are last. Screenshots inspected by eye |
| New unit tests | `npx vitest run tests/domain/queries.test.ts -t companyGroups` | pass | 3 passed |
| New e2e test | `npx playwright test` (includes `rotla.spec.ts › after a merger the minors are listed as closed…`) | pass | Phone and tablet |
| Regression: unit | `npx vitest run` | pass | 72 files, 1243 tests |
| Regression: e2e (incl. a11y audits) | `npx playwright test` | pass | 32/32 |
| Type-check | `npx tsc -b` | pass | exit 0 |
| Lint | `npm run lint` | pass | exit 0 |

## Output Excerpts

Card order and computed style after the merger (the phone and tablet results are identical):

```
UNI:status-floated:op=1:border=solid:bg=rgb(255, 255, 255)
AGR:status-unstarted:op=0.7:border=solid:bg=rgb(255, 255, 255)
… (EMN, EXV, NPT, RES, SUB, CON, SYS, INT, FED, EXM: same)
EXP:status-closed:op=0.7:border=dotted:bg=rgb(236, 236, 231)
TUN:status-closed:op=0.7:border=dotted:bg=rgb(236, 236, 231)
```

```
Test Files  72 passed (72)
     Tests  1243 passed (1243)
32 passed (25.2s)
```

## Residual Risks

- I checked the visuals only in the light theme. The dark theme uses the same tokens (`--surface-2`, `--text-muted`) and was not looked at.
- Right after a merger, the merger toast and the voice hint can briefly cover the "Cerradas" section on a phone. The overlap is temporary and unrelated to this fix.
- Closed cards still show their last price (EXP $90, TUN $70). This was already the case before the fix and is outside this bug's scope, but it could confuse players.
- I did not check this on a physical tablet. Only Playwright's iPad Pro 11 landscape emulation was used.

## Recommendation

Close the bug. It is verified end-to-end: the reproduction from the assessment no longer shows the symptom on either viewport, the new tests cover both the grouping logic and the UI after a real merger, and the full regression suite is green. As optional follow-ups, look at the dark theme by eye, and consider hiding the price on closed cards.
