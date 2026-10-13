# Contract: History Screen, Range Confirmation and Undo Toast

New UI strings use the Uruguayan voseo and "acá" (FR-020). Touch targets are at least 48 px. Badges are always text, never color alone (constitution V).

## History list (`src/ui/screens/History.tsx`)

Entries are listed newest first: every group, including undone ones.

**Row (collapsed)**:
- Source icon (👆 / 🎤 / ⚙), time and badges:
  - "deshecha" (reverted)
  - "corregida" (legacy amended)
  - "descuadre desde acá" (first entry after which an invariant broke)
  - "Fin de la partida (automático)"
- The one-line summary (`summaryEs` with events). A reverted entry's line is struck through. A legacy amended entry shows the original struck through, then the latest version.
- An entry with one money movement already shows its amount here (FR-014).

**Actions on the row**: the newest effective non-setup entry only shows **"Deshacer"**. Tapping it calls `undoLast()`, with no confirmation.

**Expanded panel** (tap the row, `<details>`; one tap, SC-003). Sections are omitted when empty:

1. **Movimientos**: one line per `Movement` (data-model §5), in event order.
   - Money: "$240: Banco → Ana".
   - Shares: "2 PRR: IPO → Ana", with " (presidencia)" when it applies.
   - Assets: "tren 3: Banco → PRR", "Camden & Amboy: Ana → PRR".
   - Price: "PRR: $100 → $112". Labels follow `effectsEs` (restack = "pasa al fondo de la pila", receivership zone, closed cell).
   - Status: "EXP: flotó → cerrada".
   - Counter: "deuda de VH: +$100".
   - Turn and phase markers: one plain line each.
2. **Saldos**: one line per `BalanceChange`.
   - Default: "Ana: $480 → $720 (+$240)".
   - Unlimited bank: "Banco: −$240" (amount only).
   - Order: players by seat, then companies in definition order, then bank, pool and other holders.
3. **Transcript**: «…», for voice entries, including undone ones.
4. **Warnings**: as today.
5. **"Deshacer hasta acá"**: only on effective non-setup entries other than the newest. Tapping it calls `undoTo(id)`. On `confirmRange`, the app opens `UndoRangeSheet`.

Reverted entries keep sections 1 to 4 and have no actions (FR-017). The setup entry has no undo action.

**Removed**: "Corregir", "Deshacer corrección", the `MULTI_STEP` special case (every entry is now expandable), `AmendSheet` and `DependentsDialog`.

## `UndoRangeSheet` (`src/ui/components/UndoRangeSheet.tsx`)

Opened by History and by voice `undoTo` results.

- Title: **"¿Deshacer N entradas?"**
- Body:
  - "Desde: <summary of range.oldest>"
  - "Hasta: <summary of range.newest>"
  - Muted note: "Quedan en el historial marcadas como deshechas. Después volvé a anotar lo que corresponda."
- Buttons: "Cancelar" (closes, nothing changes, FR-003) and primary **"Deshacer N"**. "Deshacer N" calls `undoTo(range.targetId, { confirmed: true })`, then closes.
- From voice, the transcript is shown above the title.

## Undo toast (`src/ui/components/UndoToast.tsx`)

- After one undo: "Deshecho: <summary>", as today.
- After a range: "Deshechas N entradas: desde <oldest summary> hasta <newest summary>".
- The applied-group toast's "Deshacer" calls `undoLast()`. If that group is no longer the newest, for example after a voice entry was applied in between, the store still undoes only the newest, which is the visible toast's own group in practice. The toast is replaced on every new group.
- The `amended` toast is removed.
