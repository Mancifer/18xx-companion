# Bug Fix: "Pagar…" sheet lists companies as plain text, not badges

- **Slug**: pay-modal-company-colors
- **Fixed**: 2026-10-19
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

`HolderSheet` now renders holders with the existing `HolderName` component, so companies (and "la IPO de X") show as their colored badge. This covers the "Pagar…" target grid, the "Pagar $N a X" confirm button, and the "Mover acciones" De/A grid. Bank and player labels are unchanged, and accessible names read the same words as before (FR-005).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/ui/sheets/HolderSheet.tsx` | modified | `badged` render helper for the "A quién" grid; `toName` returns JSX (`a <badge>`); SharesForm grid renders `<HolderName/> (units)`; removed the now-unused `holderName` import and SharesForm `name` helper |
| `tests/ui/playerSheet.test.tsx` | added tests | New describe block, 2 tests |
| `specs/013-ui-readability-polish/tasks.md` | modified (note) | Line 350: dropped the incorrect "HolderSheet render props are string props" claim and recorded this fix |

## Diff Highlights

```tsx
const badged = (h: HolderRef) => <HolderName holder={h} game={meta.game} players={meta.players} />;
const toName = (h: HolderRef) => (h === "bank" ? "al banco" : <>a {badged(h)}</>);
...
<ChoiceGrid label="A quién" ... render={badged} />
...
render={(h) => (
  <>
    <HolderName holder={h} game={ctx.game} players={ctx.players} /> ({unitsOf(state, h, company)})
  </>
)}
```

## Tests Added or Updated

- `tests/ui/playerSheet.test.tsx` › "Pagar… lists company targets as badges and names the badge in the confirm button": the PRR target button is named "PRR" and contains a `.company-badge`; "el banco" has no badge; the confirm button is named `Pagar $30 a PRR` and contains the badge.
- `tests/ui/playerSheet.test.tsx` › "Mover acciones lists company holders as badges with their units": after picking PRR, the button "la IPO de PRR (n)" contains the PRR badge.

## Local Verification

- I ran the new tests before the fix: both failed (no badge found), as expected.
- `npx tsc --noEmit -p .` → no errors.
- `npx eslint src/ui/sheets/HolderSheet.tsx` → clean.
- `npx vitest run tests/ui/playerSheet.test.tsx tests/ui/chips.test.tsx` → 19/19 passed. The existing pay flows that use "el banco", "Bruno" and `/^Pagar \$30/` still pass.
- `npx vitest run` (full suite) → 94 files, 1821 tests passed.
- Manual checks: none yet. The badge size inside `.choice-grid` buttons on phone portrait is still to check visually.

## Deviations from Assessment

None.

## Follow-ups

- Visual check on phone portrait: the Pagar… and Mover acciones grids, and the pay button, with company badges.
