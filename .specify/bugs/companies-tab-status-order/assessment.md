# Bug Assessment: Closed companies look like open ones in the Companies tab

- **Slug**: companies-tab-status-order
- **Created**: 2026-10-10
- **Source**: pasted text (follow-up while testing RotLA; replaces the withdrawn `rotla-merge-round-missing`, which the user found was expected behavior)
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> I just checked and the merge round is working, it was my bad. That said, there's an UX problem here, because the minor companies used for the merge are closed but they're shown at the top in with the same highlighting that open companies, which is confusing.
> I think in general, for the companies tab, we could order the contents in three rows, With open/operating companies at the top, available at the middle and closed companies at the bottom since they're less relevant for players.

## Symptom

After a RotLA merger the two minors are `closed`, but they keep their place at the top of the Companies tab. Their cards look the same as those of open companies, so they read as active. Expected: the cards are grouped by status, with open/operating companies first, then the ones that can still be opened, then closed ones at the bottom, and closed cards are visibly de-emphasized.

## Reproduction

1. Start a RotLA session. Launch two minors (e.g. Express and Tunneling) and reach green.
2. In the Merger Round, merge them into a major (e.g. Union).
3. Open the Companies tab. EXP and TUN still appear first, styled like open companies, with only the small "cerrada" status label to tell them apart. UNI appears further down, after all 12 minors.

## Suspected Code Paths

- [src/ui/screens/Table.tsx:301-311](src/ui/screens/Table.tsx#L301-L311): the companies pane renders `meta.game.companies.map(...)`, which is definition order. For RotLA that is the 12 minors, then the majors, then Landmarks ([grotla.ts](src/domain/games/grotla.ts) `companies: [...ROTLA_MINORS, ...ROTLA_MAJORS]`). Nothing sorts or groups by status.
- [src/ui/components/CompanyCard.tsx:37-47](src/ui/components/CompanyCard.tsx#L37-L47): adds the `status-${record.status}` class and the status label.
- [src/ui/styles/components.css:186-194](src/ui/styles/components.css#L186-L194): only `status-unstarted` (opacity 0.7) and `status-receivership` / `status-bankrupt` (dashed red border) are styled. There is **no** `status-closed` rule, so closed cards look exactly like open ones.
- [src/domain/mechanics/custom/mergers.ts:178](src/domain/mechanics/custom/mergers.ts#L178): the merger sets both minors to `closed`. This is correct; the problem is only how they are shown.
- [src/domain/events/types.ts:24](src/domain/events/types.ts#L24): `CompanyStatus = "unstarted" | "parred" | "floated" | "receivership" | "bankrupt" | "closed"`.

## Root Cause Hypothesis

The companies pane was built for 1830/1848, where companies rarely close, so it keeps the definition order and has no style for `closed`. RotLA closes two minors on every merger, and companies also close on dissolution (`corporateBankruptcy` with `companyStatus: "closed"`). Closed cards therefore pile up among the active ones. Confidence: **high**. This follows directly from the render code and the CSS.

## Proposed Remediation

**Preferred**: Group the cards into three sections in the companies pane, each keeping definition order inside it.

1. **En juego**: `parred`, `floated`, `receivership`.
2. **Disponibles**: `unstarted`.
3. **Cerradas**: `closed`, `bankrupt`.

Put the grouping in a small pure helper, e.g. `companyGroups(game, state)` in `src/domain/queries.ts` (next to `upcomingCompanies`), so it can be unit-tested. Render each group with a light heading, and leave out any group that is empty. Add a `.company-card.status-closed` style (reduced opacity, perhaps a muted or grey border) so closed cards are de-emphasized even on their own.

**Alternatives**:
- *Sort only, without headings*: less UI, but the boundaries are less clear.
- *Collapse the closed group by default* (a "Cerradas (4)" disclosure): saves space in long RotLA games. It could be added on top of the preferred fix.
- *Order "En juego" by operating order instead of definition order*: closer to the table's flow in an OR, but cards move around between ORs. Keep definition order unless the user prefers otherwise.

**Files likely to change**:
- `src/ui/screens/Table.tsx` (companies pane)
- `src/domain/queries.ts` (grouping helper)
- `src/ui/styles/components.css` (`status-closed`, group headings)
- `tests/domain/queries*.test.ts`, `e2e/rotla.spec.ts`

**Tests to add or update**:
- Unit: `companyGroups` places floated/parred/receivership in group 1, unstarted in 2, closed/bankrupt in 3, and keeps definition order within each group.
- E2E (RotLA): after a merger, the merged minors appear under "Cerradas" after every open and available company, and the new major appears under "En juego".
- Regression check for 1830/1848: with no closed companies, the order of open and unstarted companies is unchanged except for the grouping.

## Risks & Considerations

- Existing e2e tests find cards by name or test id, not by position (none found that index into `.company-grid`). The risk of breaking them is low, but they should be re-run.
- On tablets both panes are visible at once. Check that the group headings fit the grid layout.
- 1848 receivership and 1830 bankrupt cards keep their dashed red style. Bankrupt cards move to "Cerradas", as the user confirmed.

## Open Questions

- Resolved (user, 2026-10-10): `bankrupt` companies go in "Cerradas".
- Resolved (user, 2026-10-10): RotLA majors that can only be formed by merger (`start: "merger"`) stay in "Disponibles". They cannot be opened directly, and that is acceptable.
