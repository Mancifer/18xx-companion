# Data Model: Automatic End-of-Round Step

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

## 1. Primitive event change: `turnAdvance.roundEnd`

```ts
| {
    readonly t: "turnAdvance";
    // …existing optional fields…
    /** This round's end step was applied (marker). */
    readonly roundEnd?: "SR" | "CR";
  }
```

- Zod (`events/schema.ts`): `roundEnd: z.enum(["SR", "CR"]).optional()`.
- The field is optional, so every existing log and export still parses.
- An end step always emits it as its own event `{ t: "turnAdvance", roundEnd }`, with no other field set.

## 2. Derived turn state: `TurnState.roundEnded`

```ts
interface TurnState {
  // …existing…
  /** Derived: the current round's end step has been applied. */
  readonly roundEnded?: true;
}
```

The reducer sets and clears the flag as follows:

| Event | Effect on `roundEnded` |
|-------|------------------------|
| `turnAdvance` where `round`, `srNumber`, `orSet` or `orIndex` differs from the previous value | cleared (absent), like `operatedThisOR` and `soldThisSR` |
| `turnAdvance` with `roundEnd` | set (`true`), after the clear check (the marker event never changes the round) |
| `marketMove` with reason `soldOut` or `poolPenalty` | set (legacy inference, research R2) |
| `companyStatus` with `capitalPending: false` | set (legacy inference) |
| anything else | unchanged |

The initial state has no `roundEnded`. Snapshots carry it as part of `turn`. A snapshot without the field reads as "not ended".

## 3. Round end step (composition)

Built by `roundEndEvents(game, state)` for the **current** round:

| Current round | `roundEnded` | Events, in order |
|---------------|--------------|------------------|
| SR | absent | the `pendingCapitalEvents` events (`moneyTransfer` bank → company, then `companyStatus` with `capitalPending: false`, for each company), then the `endOfRoundMoves(…, "endSR")` moves (sold-out moves, highest price first), then `turnAdvance{ roundEnd: "SR" }` |
| CR | absent | the `endOfRoundMoves(…, "endCR")` moves (sold-out moves or pool penalty, highest price first), then `turnAdvance{ roundEnd: "CR" }` |
| SR or CR | `true` | none |
| OR or PRIVATES | any | none |

Game data decides what each part contains:

| Game | SR end step | CR end step |
|------|-------------|-------------|
| 1830 | capital (full, `endOfSR`) + sold-out moves (players) | n/a |
| 1848 | sold-out moves (players) | n/a |
| 21Moon | marker only | sold-out moves (players and companies) + pool penalty (only if the company has operated) |

## 4. Round transition (one group)

A start action's group is the end step of the round being left, followed by that action's own events, computed on the state after the end step:

```text
[ …roundEndEvents(state) , …startXEvents(reduceAll(state, roundEndEvents(state))) ]
```

State transitions for `turn.round` / `roundEnded`:

```text
SR(∅) ──endSR──▶ SR(✓) ──startOR──▶ OR(∅)          end step applied once, by endSR
SR(∅) ──────────startOR───────────▶ OR(∅)          end step applied inside startOR
SR(∅) ──startCR──▶ CR(∅) ──startOR──▶ OR(∅)        SR step, then CR step (21Moon)
OR(∅) ──startSR / startOR──▶ SR(∅) / OR(∅)        no end step
undo(startOR) ⇒ back to SR(∅) when the end step was inside that group, or SR(✓) when it came from an earlier endSR
```

## 5. Invariants

- Money: the end step only moves money bank → company through existing transfers, so conservation holds.
- At most one marker per round instance in the effective log, because the marker is only produced while `roundEnded` is absent.
