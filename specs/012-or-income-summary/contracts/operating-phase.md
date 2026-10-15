# Contract: `operatingPhase` (domain)

Module: `src/domain/ledger/operatingPhase.ts` (new). It is pure and does no I/O. Shapes are in
[data-model.md](../data-model.md).

```ts
export function operatingPhase(
  game: GameDefinition,
  players: readonly Player[],
  effective: readonly EffectiveGroup[],
  state: SessionState,
): OperatingPhase | null;
```

## Behavior

1. **Fold the turn.** Fold the turn from `initialState(game, [])` over `effective` in `seq`
   order, event by event, with `advanceTurn` for each `turnAdvance` (as in `roundSections`).
2. **Open and close the phase.** A `turnAdvance` that sets `round: "OR"` while the folded round
   is not `"OR"` opens a phase at that event. A `turnAdvance` that sets any other round closes
   it. Events before the opening event, including earlier events of the same group, are outside
   the phase.
3. **Accumulate money.** For every `moneyTransfer` inside the phase whose `from` or `to` is
   `player:<id>`, add `±amount` to that player's per-group net. Record the folded
   `{orSet, orIndex}` at the first such event for that player in that group.
4. **Return `null`** when no phase is open after the last event.
5. **Otherwise return** the `OperatingPhase`:
   - one `PlayerSettlement` per player, in seat order;
   - movements with a zero net are dropped;
   - `startCash = cashOf(state, ref) − delta`;
   - `out = isPlayerBankrupt(state, id)`;
   - `over` follows the formula in data-model §1.

## Guarantees (tested)

| # | Guarantee |
|---|---|
| G1 | Σ `movements.amount` === `delta` for every player. |
| G2 | `startCash` equals the player's cash in `replay(…)` of the effective log up to and including the opening event. This is the property test oracle. |
| G3 | When the turn is not in an OR, the result is `null`, including before the first OR and right after `startSR`, `startCR` or `startMR`. |
| G4 | ORs back to back (OR → OR, including a new set started from an OR) are one phase. |
| G5 | Undoing the group that opened the next round brings the phase back, and undoing the OR start removes it. The result depends only on `effective`. |
| G6 | Over a 300-group log, it runs in under 20 ms in Node. |
| G7 | It doesn't read or need the log's `undo`, legacy `revert` or legacy `amend` entries beyond what `effectiveLog` already resolves. Old sessions work. |

## Labels (i18n)

`src/domain/i18n/es.ts` gains `INCOME_ES`, with all strings in Uruguayan Spanish:

| Key | Text |
|---|---|
| `title` | "Ingresos de las ORs" |
| `take` | `(m) => "Cobra del banco " + m` |
| `pay` | `(m) => "Paga al banco " + m` |
| `none` | "Nada que liquidar" |
| `allSettled` | "Nadie tiene nada que liquidar." |
| `out` | "Fuera de la partida" |
| `rule` | "Durante las ORs los jugadores no tocan sus fichas: al final cada uno cobra o paga la diferencia al banco." |
| `since` | `(or) => "Desde el inicio de la OR " + or` |
| `startCash` / `cashNow` | "Al empezar" / "Ahora" |
| `orHeading` | `(set, index) => "OR " + set + "." + index` |

Movement lines reuse `summaryEs(action, ctx)` with no events ([research R3](../research.md#r3-movements-and-their-labels-us3-fr-005)),
followed by the signed amount.
