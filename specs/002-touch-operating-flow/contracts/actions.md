# Contract: Action Behavior Changes

**Feature**: [../spec.md](../spec.md)

No action schemas change: the voice tools and the Zod `ActionSchema` stay the same. Only the
expansion and validation of existing actions change. Each change must be covered by domain
tests written first (Principle VI).

## `nextCompany`

| Situation | Before | After |
|-----------|--------|-------|
| Current company has a run this OR | `turnAdvance` to the next company | Unchanged |
| Current company (non-national) has **no** run | `runs` +1, then `turnAdvance`. No market move | The events of `zeroRunAction(game, company)` = `runAndPayout{company, parts: all 0, mode}`, where `mode` is `withhold` when the game has a choice part and allows it, `full` when it has a choice part without `withhold` (a zero full payout counts as a withhold), and `null` for fixed parts (market move by the game's withhold rule, `runs` +1), then `turnAdvance`, all in one group. Warning `noRunRecorded` |
| Current company is national, no run | `runs` +1, `turnAdvance` | Unchanged, plus info warning `noRunRecorded` (no market move) |
| No current company | `turnAdvance` to the first company | Unchanged |

When the zero run is added, `nextCompany.validate` also returns the `runAndPayout` warnings for that payload (for example `forcedWithhold`).

Invariants: money stays conserved (zero transfers). Undo reverts the market move and the
advance together.

## Operating actions in an OR

Applies to `runAndPayout`, `buyTrain`, `payCost`, `bankPays`, `takeLoan`,
`buyPrivateByCompany`, `discardTrain`.

| Condition | Result |
|-----------|--------|
| `round === "OR"`, `turn.currentCompany` defined, and `action.company` (after `withCurrentCompany`) ≠ `turn.currentCompany` | Applied as before, plus warning `outOfTurn` stored on the group |
| Otherwise | Unchanged |

`outOfTurn` never makes an action unavailable (Principle III).

## New queries (`src/domain/queries.ts`)

```ts
turnActivity(effective: readonly Group[], state: SessionState, company: CompanyId):
  { runRecorded: boolean; canFinish: boolean; groups: readonly Group[] }

upcomingCompanies(game: GameDefinition, state: SessionState, n?: number): CompanyId[]

purchasablePrivates(game: GameDefinition, state: SessionState): PrivateDef[]
```

All three are pure functions of their inputs and have unit tests. Semantics are in
[../data-model.md](../data-model.md).
