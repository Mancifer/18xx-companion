# Data Model: Operating Round Income Summary

Everything here is **derived**, never stored ([research R9](research.md#r9-persistence-and-export)).
Inputs are the session's effective log (`EffectiveGroup[]`), the current `SessionState`, the
game definition and the players.

## 1. OperatingPhase

The current run of consecutive ORs, or `null` when none is current.

| Field | Type | Notes |
|---|---|---|
| `startGroupId` | `GroupId` | The effective group whose `turnAdvance` opened the phase (R1). |
| `firstOR` | `{ orSet: number; orIndex: number }` | The OR the phase started with. |
| `over` | `boolean` | `turn.round === "OR" && turn.currentCompany === undefined && turn.orIndex >= turn.orsInSet`. Drives the highlight (FR-010). |
| `players` | `PlayerSettlement[]` | Every player, in seat order. |

**Lifecycle** (the fold over effective events, R1):

```text
no phase ──turnAdvance{round:"OR"} from a non-OR round──▶ phase current
phase current ──turnAdvance{round:"OR"} (next OR / new set)──▶ same phase
phase current ──turnAdvance{round ≠ "OR"} (SR, CR, MR, PRIVATES)──▶ no phase
```

Undo only changes the input (`effective`), so any undo is reflected on the next computation.

## 2. PlayerSettlement

| Field | Type | Notes |
|---|---|---|
| `player` | `PlayerId` | |
| `out` | `boolean` | `isPlayerBankrupt(state, player)` now (R5). When true, `delta` is shown as nothing to settle and `movements` are hidden. |
| `startCash` | `number` | `cash − delta` (R2). |
| `cash` | `number` | `cashOf(state, "player:<id>")`. |
| `delta` | `number` | Σ transfers to the player − Σ from the player, over the phase's events. Integer. |
| `movements` | `SettlementMovement[]` | In log order. Σ `amount` === `delta` (SC-003). |

**Direction** (FR-003), computed in the UI from `delta`:

| `delta` | Wording |
|---|---|
| > 0 | "Cobra del banco $X" |
| < 0 | "Paga al banco $X" (X = −delta) |
| 0 | "Nada que liquidar" |

## 3. SettlementMovement

| Field | Type | Notes |
|---|---|---|
| `groupId` | `GroupId` | The entry it comes from. |
| `seq` | `number` | For ordering. |
| `or` | `{ orSet: number; orIndex: number }` | The turn at the group's first counted money event for this player (R4). |
| `action` | `Action` | The entry's action, labelled with `summaryEs(action, ctx)` without events (R3). |
| `amount` | `number` | The player's signed net in this group, counting only events after the phase start. Never 0 (zero nets are dropped). |

## 4. Validation rules

- `delta` and every `amount` are integers (constitution II). No rounding is applied: they are
  sums of recorded integer transfers.
- `startCash + delta === cash` for every player.
- Σ `movements[].amount === delta` for every player.
- When there is no current phase, the function returns `null`, and the UI renders no entry point
  for the summary.
