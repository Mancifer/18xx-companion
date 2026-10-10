# Bug Fix: Undo toast covers the mic button

- **Slug**: toast-obscures-voice-button
- **Fixed**: 2026-10-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

On the Table, the undo toast now stays out of the bottom-right column where the mic sits. It is centered in the space that's left, so the mic and the toast's Deshacer button can both be pressed while the toast shows. A Playwright check pins this on phone and tablet viewports.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/ui/styles/layout.css` | modified | New `.mic-area ~ .toast` rule: `left: space-4`, `right: mic-size + 2·space-4`, `max-width: 560px`, `margin-inline: auto`, no transform. The safe-area `bottom` and the sheet-open "move to top" rule are unchanged. |
| `src/ui/styles/tokens.css` | modified | New `--mic-size: 76px` token. |
| `src/ui/styles/components.css` | modified | `.mic-button` uses `var(--mic-size)` instead of the literal 76px. |
| `e2e/a11y.spec.ts` | added test | Checks that the mic and the toast don't overlap and that the mic is the element at its own center. |

## Diff Highlights

```css
.mic-area ~ .toast {
  left: var(--space-4);
  right: calc(var(--mic-size) + 2 * var(--space-4));
  width: auto;
  max-width: 560px;
  margin-inline: auto;
  transform: none;
}
```

## Tests Added or Updated

- `e2e/a11y.spec.ts` › "the undo toast never covers the mic (bug toast-obscures-voice-button)": after a bank payment shows the undo toast, the bounding boxes of `.mic-button` and `.toast` don't intersect, and `document.elementFromPoint` at the mic's center lands on the mic. It runs on both the phone (Pixel 7) and tablet (iPad Pro 11 landscape) projects.

## Local Verification

- `npx playwright test e2e/a11y.spec.ts` → 6 passed, including the new test on phone and tablet. The FR-101 tap-target audit still passes, so the narrower toast keeps its Deshacer button at 48 px or more.
- Red check: I stashed the `layout.css` change and ran the new test. Phone failed (`mic {x:320,y:747,76×76} vs toast {x:16,y:642,380×181}`), and tablet passed because the centered toast never reached the mic there. After restoring the change, both pass.
- `npx playwright test` (full e2e) → 34 passed.
- `npx vitest run` → 1243 passed.
- Manual checks: none. A visual check on a real phone is still worth doing (see Follow-ups).

## Deviations from Assessment

- The assessment suggested a root class on the app (`App.tsx` / `Table.tsx`) when voice is available. I didn't need one. `MicButton` is rendered just before `UndoToast` in the Table, so the general sibling selector `.mic-area ~ .toast` scopes the rule. The Market screen has no mic, so its toast keeps the full centered width. `MicButton` is rendered even when voice is unavailable, so the clearance applies whenever the button is on screen, which is what we want.
- Of the two variants in the preferred remediation, I chose the right margin rather than lifting the toast above the button. A lifted toast would cover the live transcript and the "voice unavailable" reason, which `.mic-area` stacks above the button, and it would cover more of the table.

## Follow-ups

- On a phone, the toast is now about 288 px wide (412 px viewport), so long toasts (warnings, takeover flows, chip strips) wrap into more lines and get taller. Check them on a real device.
- When a sheet is open, the toast moves to the top but keeps the right-hand clearance it doesn't need there. That's harmless, and it could be reset if the full width at the top matters.
- While listening, `.mic-transcript` (up to 80vw wide) can still extend left above the toast and sit under it in z-order. It's text, not a target, so I left it alone.
