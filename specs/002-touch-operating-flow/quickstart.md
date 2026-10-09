# Quickstart: Validate the Touch-First Operating Flow

**Feature**: [spec.md](spec.md) · Contracts: [actions](contracts/actions.md), [ui](contracts/ui.md)

## Prerequisites

```bash
npm install
npm run typecheck && npm run lint && npm test   # all green before and after
```

## Automated checks

| Area | Command | Proves |
|------|---------|--------|
| Domain: `nextCompany` no-run move, `outOfTurn` warning, the 3 queries | `npx vitest run tests/domain` | contracts/actions.md, SC-001, SC-002 |
| Operate sheet: draft survives train purchase, finish gating, no run | `npx vitest run tests/ui/operate.test.tsx` | FR-003, FR-006–FR-008, SC-003 |
| Tap counts | `npx vitest run tests/ui/taps.test.tsx` | SC-004 (≤ 6 taps + digits; no run ≤ 3) |
| Privates control in every round of 1830 / 1848 / 21Moon | `npx vitest run tests/ui` | SC-005 |
| E2E operating round | `npm run test:e2e -- operating` | Stories 1–3 end to end |
| Voice eval (`fl-01` and others unchanged) | `npm run eval:voice` | R8; report accuracy |

## Manual walkthrough (`npm run dev`)

1. New 1830 session, 3 players. Buy all privates, then float PRR, NYC and B&O in SR1. End
   the SR and start the OR.
   - **Expect**: the round controls show "Operar <first by price>" and "Después: …". There is
     no "Siguiente" button. "Comprar privada" is not shown.
2. Tap "Operar …". Type 80, open "Comprar tren", go back.
   - **Expect**: 80 is still on the keypad.
3. Buy a 2-train.
   - **Expect**: the sheet stays open, the summary lists the train, and 80 is still typed.
     "Terminar turno" is disabled, with its reason shown.
4. Tap "Pagar", then "Terminar turno".
   - **Expect**: the next company becomes current.
5. For the next company, tap "No corrió", then "Terminar turno".
   - **Expect**: its token moves one step left on the Market view, and History shows a run of
     0.
6. Tap the card of a company that has already operated. Choose "Operar fuera de turno…", then
   pay a cost.
   - **Expect**: History shows the entry with the "fuera de turno" warning, and the current
     company does not change.
7. Undo twice.
   - **Expect**: the out-of-turn cost is reverted first, then the last finished turn, and the
     previous company is current again.
8. Finish the OR set and start SR2.
   - **Expect**: "Comprar privada" is back (1830 allows resale from SR2), and it lists the
     owned privates.
9. Voice (if a key is set): with a company current and nothing recorded, say "siguiente
   compañía".
   - **Expect**: the confirmation card shows the `noRunRecorded` warning and the market move.
