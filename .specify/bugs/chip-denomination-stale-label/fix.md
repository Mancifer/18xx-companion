# Bug Fix: Chip breakdown shows the old value after editing a chip's value

- **Slug**: chip-denomination-stale-label
- **Fixed**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Chip text now comes from a shared `chipLabel(chip)` helper. If a label is only digits and does not match the value, the helper treats it as stale and shows the value instead. This also fixes sessions that were already saved. Changing "Valor" in the editor now clears a label that only repeated the old value, and the four built-in presets no longer carry redundant labels.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/domain/mechanics/chips.ts` | modified | Added `chipLabel(chip)` |
| `src/ui/components/ChipStrip.tsx` | modified | `Discs` (text + aria-label) and "pagó con" buttons use `chipLabel` |
| `src/ui/components/ChipSetEditor.tsx` | modified | Changing Valor clears `label` when it equalled `String(oldValue)`; custom labels kept |
| `src/ui/screens/NewSession.tsx` | modified | Chip summary on the "Editar" button uses `chipLabel` (scope expansion, see below) |
| `src/domain/games/g1830.ts`, `g1848.ts`, `g21moon.ts`, `grotla.ts` | modified | Removed `label: "<value>"` from every `chipPreset` entry |
| `eval/voice/fixtures/*.json` (10 files) | regenerated | `npx tsx eval/voice/buildFixtures.ts`; the diff only removes the chip `label` lines |
| `tests/domain/chips.test.ts` | added tests | `chipLabel` unit tests |
| `tests/ui/chips.test.tsx` | added tests | End-to-end regression tests through the "Fichas" sheet and a seeded stale session |

## Diff Highlights

```ts
export function chipLabel(chip: Pick<Chip, "value" | "label">): string {
  const { label, value } = chip;
  if (!label || (/^\d+$/.test(label) && label !== String(value))) return String(value);
  return label;
}
```

```tsx
// ChipSetEditor, Valor onChange
patch(i, c.label === String(c.value) ? { value: next, label: undefined } : { value: next });
```

## Tests Added or Updated

- `tests/domain/chips.test.ts › chipLabel` checks four cases: no label shows the value, a stale numeric label shows the value, a matching numeric label is kept, and a custom label ("Oro") is kept.
- `tests/ui/chips.test.tsx › a $3 payment shows 3×1, not the old 3×5` removes the 1 chip in "Fichas", changes the 5 chip to 1, saves, and collects $3. The test expects `3 × 1` / `3×1`.
- `tests/ui/chips.test.tsx › a custom label survives a value change` follows the same flow with the label "Oro" and expects `3 × Oro`.
- `tests/ui/chips.test.tsx › a session saved with a stale numeric label shows the value` seeds a chip `{ value: 1, label: "5" }` and expects `3 × 1`.

## Local Verification

- `npx vitest run tests/ui/chips.test.tsx tests/domain/chips.test.ts` → 19 passed
- `npx vitest run` (full suite) → 77 files, 1383 tests passed. Before the fixtures were regenerated, the 10 `tests/eval/voice.test.ts` fixture-match tests failed, as the assessment's Risks section predicted.
- `npm run typecheck` → exit 0; `npx eslint src tests` → exit 0
- Manual checks: none yet (left for `/speckit-bug-test`).

## Deviations from Assessment

- **Scope expansion**: `src/ui/screens/NewSession.tsx` also showed `c.label ?? c.value` in the chip summary on the "Editar" button. It now uses `chipLabel` so every place that shows a chip's text behaves the same way.
- **Scope expansion**: the eval fixtures in `eval/voice/fixtures/` serialize `chipSet` and had to be regenerated. The assessment flagged this as a risk.
- No game-definition checksum test broke.

## Follow-ups

- Manual check: in a running game, edit a chip's value in "Fichas" and confirm the toast strip shows the new denomination.
- Optional: the editor's "Etiqueta" input could reject a numeric label that differs from the value, which matches the rule the user confirmed.
