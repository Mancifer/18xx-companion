# Bug Fix: RotLA market strip is drawn highest-price-first

- **Slug**: rotla-market-track-reversed
- **Fixed**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The RotLA 1-D market strip now renders lowest price first ("Cerrada" on the left, $500 on the
right), matching the physical track. Only the display order changed; the domain data stays top-down
so `up`/`down` moves are unaffected.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/ui/screens/Market.tsx` | modified | `1d` branch collects `{ cell, ref }` pairs (ref keeps the data row), reverses them, and numbers "posición N" from the left as displayed; comment updated |
| `tests/ui/market.test.tsx` | updated + added test | T102 launch-range expectation flipped to ascending; new test pins the strip order, posición numbering and the cell ref used for a tap-move |

## Diff Highlights

```tsx
{game.market.cells
  .flatMap((row, r) => row.flatMap((cell, c) => (cell ? [{ cell, ref: { row: r, col: c } }] : [])))
  .reverse()
  .map(({ cell, ref }, position) => { /* … */ `(posición ${position + 1})` … cellView(ref, …) })}
```

## Tests Added or Updated

- `tests/ui/market.test.tsx` › "is one wrapping strip…" — `inRange` is now `["$60", "$70", "$80", "$90"]`.
- `tests/ui/market.test.tsx` › "reads like the board: Cerrada first (posición 1), $500 last (posición 27), and moves still land on the tapped cell" — first and last strip cells plus a tap-move of TUN to $120, which checks that the reversal did not change the `{ row, col }` refs.

## Local Verification

- `npx vitest run tests/ui/market.test.tsx` with the old `Market.tsx` (stashed) → 2 failed (both RotLA tests), confirming they catch the bug.
- `npx vitest run tests/ui/market.test.tsx` with the fix → 5 passed.
- `npx vitest run tests/ui` → 160 passed (12 files).
- `npx tsc --noEmit -p .` → clean.
- Manual checks: none (visual check in the app left for `/speckit-bug-test`).

## Deviations from Assessment

None. Open question resolved as the assessment suggested: "posición N" counts from the left as
displayed (1 = Cerrada, 27 = $500).

## Follow-ups

- `e2e/rotla.spec.ts` only finds strip cells by name, so it should be unaffected; it was not run here.
- Drag-and-drop on a real device: wrapped rows now go from Cerrada at the top-left to $500 at the bottom-right.
