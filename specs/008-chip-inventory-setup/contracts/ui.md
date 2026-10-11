# Contract: Chip Editor, Setup Plan View, Start Notice

**Feature**: [spec.md](../spec.md) | **Domain contract**: [domain.md](domain.md) | **Research**: [research.md](../research.md) R3, R9–R11

All visible text is in Spanish (Uruguayan wording). Touch targets are at least 48 px. Every disc
has its value written next to it, so color is never the only cue.

## 1. Chip editor (`src/ui/components/ChipSetEditor.tsx`)

The row is: color picker, **Valor**, **Cantidad** (placeholder "∞"), and ✕. The "Etiqueta"
column is removed, and the grid goes from 3 middle columns to 2.

| Interaction | Result |
|---|---|
| Edit Valor | The value changes. No label handling is left. |
| Clear Cantidad | `countAvailable` is `undefined` (unlimited, US2-3). |
| Type 0 in Cantidad | `countAvailable: 0`. |
| "Añadir ficha" | Adds `{ value: 1, color: "#9e9e9e" }`, unlimited. |

## 2. Chip discs (`src/ui/components/ChipStrip.tsx`)

`Discs` is extracted and exported as `ChipDiscs({ chips, set, missing? })`. Each disc shows
`{count}×{value}` with `aria-label="{count} × {value}"`. Missing chips use the same disc with a
dashed outline and the text "faltan", with `aria-label="faltan {count} × {value}"`.
`ChipStrip` uses `ChipDiscs`, and its "pagó con" buttons show the value.

`.chip-disc` gets a solid 2 px ring in the `--chip-ring` color (tokens.css; dark in light mode,
light in dark mode), so white and black discs stay visible.

## 3. Setup plan view (`src/ui/components/ChipSetupPlan.tsx`, new)

Props:

```ts
{
  plan: SetupPlan;
  set: ChipSet;
  game: Pick<GameDefinition, "currency">;
  /** When present, the fixed bank is adjustable (new session, chips sheet); absent = read-only (start notice). */
  pins?: Readonly<Record<string, number>>;
  onPinsChange?: (pins: Record<string, number>) => void;
  /** "notice" (start notice): only "Cada jugador", the fixed bank's "Banco" and the warning; no "Apartadas", no unlimited-bank row, no adjusting. Default "full". */
  variant?: "full" | "notice";
}
```

| Row | Content |
|---|---|
| Warning (when `plan.missing` is not empty) | `role="status"` warning box: "Faltan … Podés cambiar cantidades o valores, o empezar igual y usar otras fichas." |
| "Cada jugador {money}" | `ChipDiscs` for `perPlayer` (owned and missing). |
| "Banco {money}" (fixed) | `ChipDiscs` for the bank (owned and missing). |
| "Apartadas" (fixed, when `setAside` is not empty) | `ChipDiscs` for `setAside`, muted: "no se usan". |
| "Banco" (unlimited) | `ChipDiscs` for `bank.owned`, plus "sin límite: {values}" when there are unlimited colors. No adjusting. |

**Adjusting the bank** (fixed bank with `onPinsChange`, FR-022b and [R16](../research.md#r16-adjusting-the-bank-pin-and-refill-fr-022b-fr-022c)):
the "Banco" row becomes a list with one row per chip color.

| Element | Behavior |
|---|---|
| Disc + value | The same disc as `ChipDiscs`, with its value. |
| − / count field / + | It shows the bank's count for that color (owned + missing). − and + change it by 1, and the field takes a typed number. Any change pins that color: `onPinsChange({ ...pins, [value]: n })`. − is disabled at 0. Each button is at least 48 px, with `aria-label="Menos fichas de {value} en el banco"` / "Más …". |
| Pinned marker | A pinned color's row shows "fijada" (text, not only style). |
| "Restablecer" | Shown when there is at least one pin. Calls `onPinsChange({})`. |
| Off the total (`difference ≠ 0`) | A warning: "El banco tiene {money} de más." or "Al banco le faltan {money}.", followed by "Cambiá alguna ficha fijada o tocá Restablecer." It never blocks (FR-022c). |

Every change recomputes the plan in the same render, so the unpinned rows and "Apartadas"
update right away.

## 4. New session (`src/ui/screens/NewSession.tsx`)

- **"Fichas" fieldset**:
  - The collapsed button shows small discs with values, not the `chipLabel` text, followed by "· Editar".
  - Below it, `ChipSetupPlan` is always shown for
    `setupPlan(patched, rows.length, chipSet ?? preset, pins)`, adjustable.
  - `pins` is new component state. It starts as `{}`, is cleared when the game changes, and is
    kept when players or options change.
  - "Empezar" passes `bankPins: pins` to `newSession`.
  - When there is a warning, the editor opens on its own, so counts can be changed in place (US5-2).
- **Updates**: any change to chips, players or options recomputes the plan in the same render (FR-024).
- **Starting**: "Empezar" is never disabled by the warning (FR-025).

## 5. Chips sheet (`src/ui/sheets/ChipsSheet.tsx`)

- **Layout**: a "Preparación" section above the editor shows `ChipSetupPlan` for the **draft**
  chip set and **draft** pins (starting from `meta.bankPins ?? {}`), with `meta.game` and
  `meta.players.length`, adjustable. Edits update it live, and with no edits it is the session's
  plan (FR-026, US3-5, US3-7, US5-3).
- **"Guardar"**: saves both with `updateChips(sorted, pins)`. It is enabled when the chip set is
  valid; pins never disable it.
- **"Volver al juego"**: restores the built-in game's `chipPreset` when `meta.game.id` is
  built-in, otherwise `meta.game.chipPreset`
  ([R10](../research.md#r10-volver-al-juego-for-older-sessions-fr-002)), and clears the draft pins.

## 6. Start notice (`src/ui/components/StartChipsNotice.tsx`, new; rendered by `Table`)

| Aspect | Behavior |
|---|---|
| Shown when | `effective` holds only the `createSession` group and the notice has not been dismissed in this view. |
| Content | Title "Fichas iniciales". "Cada jugador {money}" with `ChipDiscs`. For a fixed bank, "Banco {money}" with `ChipDiscs`, computed with `meta.bankPins` (US3-7). The missing-chips warning when there is one. Missing chips are marked (US4-3). Rendered as `ChipSetupPlan` with `variant="notice"` and no `onPinsChange`: no "Apartadas" row, and for an unlimited bank no "Banco" row (players only, FR-026a). |
| Style | Same container and chip style as the undo toast (`.toast`), with `role="status"`. It does not auto-hide. |
| Dismiss | An "Entendido" button. The first applied action also hides it, because the log then has more than one group (US4-4). |
| Later | The same plan is in the chips sheet ("Preparación"). |

## 7. Voice

No change: chips are not in the voice snapshot or the tools.
