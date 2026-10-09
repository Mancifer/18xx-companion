# Contract: Touch Controls

**Feature**: [../spec.md](../spec.md)

Labels are in Spanish, as in the rest of the UI. All controls are at least 48 px and work in
phone portrait and tablet landscape (FR-016).

## Round controls (Table screen)

| Round | Controls (in order) | Notes |
|-------|---------------------|-------|
| OR, current company C | **Operar C** (primary) · "Después: D, E" (text) · Cobrar privadas (when offered) · Empezar ronda de acciones · Empezar OR | `Siguiente` is **removed** (FR-001) |
| OR, no current company (set finished) | Empezar ronda de acciones (primary) · Empezar OR | |
| PRIVATES / SR | Comprar privada **only if** `purchasablePrivates` is non-empty (FR-014) · existing SR controls | |

## Company card tap

| Round | Company | Opens |
|-------|---------|-------|
| OR | current | `OperateSheet` (in turn) |
| OR | not current | `CompanySheet` (details), with an extra **Operar fuera de turno…** control → `OperateSheet` (out of turn) |
| other | any | Unchanged (`StockSheet`) |

## OperateSheet — in turn

```text
┌ [PRR] $420 · $90 ─────────────────────────┐
│ Este turno: ✓ Corrió 160, pagó · Compró 3   │  ← turnActivity summary (FR-008)
│ [ revenue keypad / parts ]                  │  ← hidden once runRecorded
│ [Pagar] [Retener] [Mitad]  [No corrió]      │  ← "No corrió" = zero run (FR-002)
│ Comprar tren · Pagar costo · Cobro del banco│
│ Comprar privada · Préstamo · Descartar tren │
│ Detalles y ajustes…                         │
│ [ Terminar turno → siguiente: PRR→NYC ]     │  ← enabled iff canFinish (FR-003)
└─────────────────────────────────────────────┘
```

- When "Terminar turno" is disabled, it shows the reason "Registra lo que corrió o «No corrió»
  primero".
- A sub-view action that succeeds returns to this view; the sheet stays open (FR-007).
- The typed revenue survives going into a sub-view and coming back (FR-006).
- A successful payout clears the draft and shows the run as recorded.
- "Terminar turno" dispatches `nextCompany`. The sheet then closes, and the next company becomes
  current.
- National company: the national payout replaces the keypad, and "No corrió" is not shown.

## OperateSheet — out of turn

- A banner reads "Fuera de turno: le toca a C. Lo que registres quedará marcado en el historial."
- Same action set, but no "No corrió" and no "Terminar turno".

## PrivatesSheet

- The list comes from `purchasablePrivates`. When it is empty, the sheet shows "No hay privadas a
  la venta ahora." (FR-015).
