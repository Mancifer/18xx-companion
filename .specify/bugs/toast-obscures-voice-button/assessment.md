# Bug Assessment: Undo toast covers the mic button

- **Slug**: toast-obscures-voice-button
- **Created**: 2026-10-10
- **Source**: pasted text (one of four issues found while testing RotLA; see also `rotla-buy-default-treasury`, `voice-start-latency-feedback`, `companies-tab-status-order`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> The voice button is frequently obscured by the toast notifications and you need to wait until it's gone to use it again

## Symptom

After every committed action, the undo toast appears at the bottom of the screen and sits on top of the mic button for 6–12 s. The player cannot hold to talk until it goes away. Expected: the mic button is always reachable.

## Reproduction

1. Open any session on a phone-width viewport (under about 600 px).
2. Commit an action (touch or voice). The undo toast appears.
3. Try to press the 🎤 button at the bottom right. The toast covers it until it closes (6 s, or 12 s for a long one).

## Suspected Code Paths

- [src/ui/styles/layout.css:249-263](src/ui/styles/layout.css#L249-L263) `.toast`: `position: fixed; bottom: space-4; left: 50%; width: min(560px, 100% − 2·space-4); z-index: 30`. On a phone it spans the full width at the bottom.
- [src/ui/styles/components.css:649-659](src/ui/styles/components.css#L649-L659) `.mic-area`: `position: fixed; right/bottom: space-4; z-index: 20`. It is in the same corner and below the toast.
- [src/ui/components/UndoToast.tsx:11, 25](src/ui/components/UndoToast.tsx#L11): `VISIBLE_MS = 6000`, doubled for long toasts.
- [src/ui/styles/layout.css:266-271](src/ui/styles/layout.css#L266-L271): there is already a rule that moves the toast to the top when a sheet is open. It does not apply on the bare Table.

## Root Cause Hypothesis

Both elements are fixed to the bottom of the viewport. The toast has the higher z-index and, on narrow screens, the full width, so it overlaps the 76 px mic button. Confidence: **high**. This follows directly from the CSS.

## Proposed Remediation

**Preferred**: Keep the toast clear of the mic. When voice is enabled, give the toast a right margin equal to the mic area (76 px + gutter), or lift it above the button with a `bottom` offset (76 px + space-4 + safe area). Do this with a `--mic-clearance` custom property set by `.mic-area`'s presence (e.g. a class on the app root when voice is on). Then the toast's Undo button and the mic are both reachable.

**Alternatives**:
- Raise `.mic-area` above the toast (z-index 31). This is simplest, but the mic then covers part of the toast, possibly its Undo button.
- Move the toast to the top always, as is already done when a sheet is open. This is consistent, but the top is far from the thumb for Undo.

**Files likely to change**:
- `src/ui/styles/layout.css`, `src/ui/styles/components.css`
- possibly `src/ui/App.tsx` / `Table.tsx` (root class when voice is available)
- `e2e/a11y.spec.ts` or a new e2e check

**Tests to add or update**:
- Playwright e2e at a phone viewport (e.g. 390×844): after committing an action, the mic button's bounding box does not intersect the toast's, and `elementFromPoint` at the mic's center returns the mic button.

## Risks & Considerations

- Raising the toast above the mic makes it overlap more of the table content. Check this on small screens.
- Safe-area insets (iOS) must be kept in both offsets.

## Open Questions

- None.
