# Bug Fix: Closed companies look like open ones in the Companies tab

- **Slug**: companies-tab-status-order
- **Fixed**: 2026-10-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The Companies tab now shows three sections: **En juego** (parred / floated / receivership), **Disponibles** (unstarted) and **Cerradas** (closed / bankrupt). Each section keeps definition order, and a section with no companies is not shown. Closed cards are also de-emphasized with a new `status-closed` style. The grouping is done by a pure, unit-tested helper, `companyGroups`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/domain/queries.ts` | added | `CompanyGroup` type and `companyGroups(game, state)` |
| `src/ui/screens/Table.tsx` | modified | Companies pane renders one `role="group"` per non-empty section, each with an `h2` heading and its own `.company-grid`. Each section has `data-testid="company-group-<group>"` |
| `src/ui/styles/components.css` | modified | `.company-card.status-closed` (opacity 0.7, dotted border, `--surface-2` background), `.company-group` spacing, `.company-group-title` heading |
| `tests/domain/queries.test.ts` | added tests | `companyGroups` describe block (3 tests) |
| `e2e/rotla.spec.ts` | added test | Merger, then check the section each card lands in |

## Diff Highlights

```ts
const group: CompanyGroup = status === "unstarted" ? "available"
  : status === "closed" || status === "bankrupt" ? "closed" : "inPlay";
```

```tsx
{COMPANY_GROUPS.map(([group, title]) => {
  const ids = groups[group];
  return ids.length > 0 ? (
    <div className="company-group" role="group" aria-label={title} data-testid={`company-group-${group}`}>
      <h2 className="company-group-title">{title}</h2>
      <div className="company-grid">{/* CompanyCard per id */}</div>
    </div>
  ) : null;
})}
```

## Tests Added or Updated

- `tests/domain/queries.test.ts › companyGroups › with nothing closed, keeps definition order…`: 1830 regression check. Seeding NYC before PRR still gives definition order, and the unstarted companies keep their order.
- `tests/domain/queries.test.ts › companyGroups › parred, floated and receivership are in play; closed and bankrupt go last`: checks the status-to-section mapping and the order inside each section.
- `tests/domain/queries.test.ts › companyGroups › RotLA: merged minors are closed…`: EXP/TUN go to closed, UNI is in play, and the other majors (e.g. CON, `start: "merger"`) stay available.
- `e2e/rotla.spec.ts › RotLA: after a merger the minors are listed as closed, the major as in play`: a real merger through the UI. Then: 3 sections, the last one is "Cerradas", EXP and TUN are in it, UNI is in "En juego", and EXP is not in "Disponibles".

## Local Verification

- `npx vitest run`: 72 files, 1243 tests passed.
- `npx tsc -b`: clean. The first run caught a `noUncheckedIndexedAccess` error in the new test, now fixed.
- `npm run lint`: clean.
- `npx playwright test`: 32/32 passed on the phone and tablet projects. This includes the a11y audits (`a11y.spec.ts`: tap targets, RotLA sheets) and the new RotLA test.
- Manual checks: none. The tablet layout of the headings is covered only by the tablet e2e project, not by eye.

## Deviations from Assessment

- The alternatives (a "Cerradas (n)" disclosure that is collapsed by default, and ordering by operating order) were not implemented, as the assessment recommended.
- The closed style uses opacity 0.7 (the same as unstarted) plus a dotted border and a grey background, not a lower opacity. This keeps the text contrast at the level the a11y audits already accept. The two styles still look different: unstarted cards are only faded, closed cards are greyed out with a dotted border.

## Follow-ups

- Check the headings on a real tablet in landscape, where both panes show side by side.
- Consider the collapsible "Cerradas" section if long RotLA games make the list too long.
