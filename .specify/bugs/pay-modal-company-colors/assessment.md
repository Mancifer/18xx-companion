# Bug Assessment: "Pagar…" sheet lists companies as plain text, not badges

- **Slug**: pay-modal-company-colors
- **Created**: 2026-10-19
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> for spec 013-ui-readability-polish we didn't update the "Pagar..." modal, it still shows the companies without its color like the rest of the application

## Symptom

Opening a player or company sheet and tapping **Ajustes → Pagar…** shows the "A quién" target list with companies as plain short names (e.g. "PRR", "NYC"), and the confirm button reads "Pagar $30 a PRR" in plain text. Per feature 013 (FR-001, SC-001) every on-screen company mention should be the colored `CompanyBadge`, as it already is on the sheet title, the tiles and the rest of the app.

## Reproduction

1. Open any session and tap a player tile (or a company card) on the Table.
2. Tap **Pagar…**.
3. Look at the "A quién" grid: company buttons show plain short names, no company color.
4. Pick a company and enter an amount: the primary button "Pagar $N a <SHORT>" is also plain text.

Same pattern, same file: **Mover acciones** → pick a company → the "De" / "A" grid renders companies (and "la IPO de X") as plain text with the unit count.

## Suspected Code Paths

- [src/ui/sheets/HolderSheet.tsx:58](src/ui/sheets/HolderSheet.tsx#L58) — `ChoiceGrid ... render={name}` where `name` is `holderName(...)`, which returns a plain string.
- [src/ui/sheets/HolderSheet.tsx:40](src/ui/sheets/HolderSheet.tsx#L40) / [:65](src/ui/sheets/HolderSheet.tsx#L65) — `toName` builds `"a <name>"` as a string for the confirm button.
- [src/ui/sheets/HolderSheet.tsx:193](src/ui/sheets/HolderSheet.tsx#L193) — `SharesForm` target grid renders `` `${name(h)} (${units})` `` as a string.
- [src/ui/components/CompanyBadge.tsx:40](src/ui/components/CompanyBadge.tsx#L40) — `HolderName` already exists (added by 013) and renders `holderName` with companies / IPOs as badges, same words.
- [specs/013-ui-readability-polish/tasks.md:350](specs/013-ui-readability-polish/tasks.md#L350) — the 013 sweep note says HolderSheet render props were "left plain on purpose ... which are string props".

## Root Cause Hypothesis

The feature 013 sweep skipped `HolderSheet` on the belief that `ChoiceGrid`'s `render` prop takes a string. It does not: `render: (value: T) => ReactNode` ([HolderSheet.tsx:234](src/ui/sheets/HolderSheet.tsx#L234)), so a badge fits there with no API change. The sheet was never touched on this branch (`git diff` is empty for it). This is an omission in the sweep, not a design limit. Confidence: high.

## Proposed Remediation

**Preferred**: In `HolderSheet.tsx`, render holders with the existing `HolderName` component instead of the `holderName` string:

- "A quién" grid: `render={(h) => <HolderName holder={h} game={meta.game} players={meta.players} />}`.
- Confirm button: replace the string `toName(target)` with JSX: `al banco` for the bank, else `a <HolderName …/>`. Keep the leading `Pagar $N ` text so the accessible name still starts with "Pagar $30".
- `SharesForm` "De"/"A" grid: `<><HolderName …/> ({units})</>`.

The bank and players have no badge, so `HolderName` returns the same plain text for them. `CompanyBadge` keeps the short name as its text, so accessible names stay the same ("el banco", "Bruno", "PRR"), as FR-005 requires. Existing tests that query `getByRole("button", { name: "el banco" })` and `/^Pagar \$30/` keep passing.

Also correct the tasks.md:350 note, which says HolderSheet render props are string props.

**Alternatives**:
- Change `holderName` to return ReactNode. Rejected: it feeds voice prompts, exports and aria-labels, which must stay plain (FR-005).

**Files likely to change**:
- `src/ui/sheets/HolderSheet.tsx`
- `tests/ui/playerSheet.test.tsx` (or `tests/ui/chips.test.tsx`)
- `specs/013-ui-readability-polish/tasks.md` (note correction only)

**Tests to add or update**:
- Open a player sheet, tap "Pagar…", and assert the company target button contains a `.company-badge` (or whatever selector the other 013 badge tests use) with the short name, while the button's accessible name is still the short name.
- After picking a company target, assert the confirm button contains the badge and its name still matches `/^Pagar \$\d+ a PRR/`.
- In "Mover acciones", after picking a company, assert the "De" grid shows company holders as badges with their unit count.
- Existing `chips.test.tsx` pay flows (bank, player) must stay green.

## Risks & Considerations

- Badge sizing inside `.choice-grid` buttons: use the inline size (the `HolderName` default) so button height doesn't jump. Check on phone portrait.
- Accessible names: confirm the badge renders no extra aria text, or `getByRole(..., { name })` queries in other tests could break.
- Very low blast radius: one sheet, view only, no state or action changes.

## Open Questions

- None blocking. Optional: should the "Cobrar del banco" / "Fijar dinero" sheet titles change too? They already show `title`, which CompanySheet passes as a badge, so probably no.
