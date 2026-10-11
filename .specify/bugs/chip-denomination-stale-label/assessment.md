# Bug Assessment: Chip breakdown shows the old value after editing a chip's value

- **Slug**: chip-denomination-stale-label
- **Created**: 2026-10-10
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> When you change the chips and its values mid game, the application still refers to them with the
> old value. For instance, if I change the 5 valued chip to 1, and we make an operation where
> something needs to pay 3, the application says 3x5, so it gets the amount right based on the real
> value (and the color as well), but the chip value is wrong, it should be 3x1

## Symptom

After editing a chip's **value** in the "Fichas" sheet, the chip strips (breakdowns and "pagó con"
buttons) keep showing the chip's previous value as its text (e.g. "3×5" for a $3 payment using the
red chip whose value is now 1). The amount and color are computed correctly; only the displayed
denomination text is stale. Expected: "3×1".

## Reproduction

1. Start any built-in game (1830, 1848, 21Moon or RotLA — all presets carry labels).
2. Open "Fichas", change the red chip's Valor from 5 to 1 (and remove/alter the existing 1 chip so
   values stay unique), Guardar.
3. Perform an action producing a $3 bank flow (e.g. a payment) and look at the chip strip.
4. It reads "3×5" in the red disc; expected "3×1".

## Suspected Code Paths

- `src/domain/games/g1830.ts:165-171`, `g1848.ts:192-198`, `g21moon.ts:178-184`,
  `grotla.ts:378-384` — every preset chip carries `label: "<value>"`, i.e. a label that merely
  duplicates the value.
- `src/ui/components/ChipSetEditor.tsx:28-33` — editing "Valor" patches only `value`; the `label`
  ("5") is left untouched.
- `src/ui/components/ChipStrip.tsx:15-19,54` — `Discs` and the "pagó con" buttons render
  `chip?.label ?? c.value`, so the stale label wins over the new value.
- `src/app/sessions.ts:47` — sessions copy `game.chipPreset` into `meta.chipSet`, so saved sessions
  already hold these redundant labels.

## Root Cause Hypothesis

The built-in presets set `label` equal to the value as a string. The label is an optional free-text
override, and the display prefers it over the value. When the user edits the value, the label is
not updated, so the display shows the old denomination. Breakdown math uses `value`, which is why
amounts and colors are right. Confidence: high.

## Proposed Remediation

**Preferred** (two small parts):
1. **Stop treating a value-echo as a real label.** Remove `label` from the four built-in presets
   (it is optional; display falls back to the value). In `ChipSetEditor`, when "Valor" changes and
   the current label equals `String(oldValue)` (an auto label), clear it (or set it to the new
   value) in the same patch. A user-chosen label such as "Oro" is preserved.
2. **Handle already-saved sessions in the display.** Add a shared `chipLabel(chip)` helper used by
   `ChipStrip` (both `Discs` and the "pagó con" buttons): a label made only of digits that differs
   from `String(value)` is treated as absent, so the value is shown. Per the resolved open question,
   numeric labels must match the value, so nothing legitimate is hidden. Non-numeric labels are
   shown as-is.

**Alternatives**:
- Only fix the editor (sync label when it matched the old value). Smallest change, but leaves the
  redundant labels in presets and keeps the trap for anyone who edits value then label order.
- Hide the label field entirely and always show value. Loses the FR-080 custom-label feature.

**Files likely to change**:
- `src/ui/components/ChipSetEditor.tsx`
- `src/ui/components/ChipStrip.tsx` (or a `chipLabel` helper in `src/domain/mechanics/chips.ts`)
- `src/domain/games/g1830.ts`, `g1848.ts`, `g21moon.ts`, `grotla.ts` (drop redundant labels)
- `tests/ui/chips.test.tsx`, `tests/domain/` chip tests

**Tests to add or update**:
- UI: edit a preset chip's value 5 → 1 (with unique values), save, trigger a $3 flow; the strip shows
  "3×1" (and aria-label "3 × 1").
- UI: a chip with a custom label ("Oro") keeps that label after its value is changed.
- Unit: `chipLabel` returns the value when the label is absent or a stale numeric echo, and the
  custom label otherwise.
- Check any existing test or eval fixture that asserts on preset `label` fields (golden/export
  fixtures may serialize `chipSet`).

## Risks & Considerations

- Exported sessions / fixtures that serialize `chipSet` will differ if presets lose their labels;
  import must still accept chips with labels (schema already optional).
- Game definitions are deep-frozen and may be hashed/versioned for export compatibility — verify no
  definition checksum test breaks.
- Low data risk: money amounts are already correct; this is display-only, but it can mislead players
  into handing over the wrong chips, hence medium.

## Open Questions

- ~~If a user deliberately sets a numeric label different from the value, should it be respected?~~
  **Resolved (user, 2026-10-10)**: no. A chip's value must match what is printed on the physical
  chip; a numeric label that disagrees with the value is not a supported setup. So the display-time
  rule is acceptable: a label made only of digits that differs from `String(value)` is treated as
  stale and the value is shown. This also fixes sessions already saved with stale labels, with no
  re-save or migration. Non-numeric custom labels (e.g. "Oro") are still shown as-is. Keep the
  editor-side clearing and the preset clean-up as well, so new data does not carry stale labels.
