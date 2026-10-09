# Contract: Action Behavior Changes

**Feature**: [../spec.md](../spec.md)

No action schemas, voice tool schemas or tool descriptions change. Only the `available` checks and the expansions change. `E(state)` is `roundEndEvents(game, state)` (see [data-model §3](../data-model.md#3-round-end-step-composition)). Each row needs a domain test written first.

## `startOR`

| Situation | Before | After |
|-----------|--------|-------|
| round SR, not ended | `startOREvents(state)`: capital and sold-out moves lost | `E(state)`, then `startOREvents(interim)` |
| round SR, already ended | `startOREvents(state)` | `startOREvents(state)` (unchanged) |
| round CR (21Moon), not ended | `startOREvents(state)`: CR moves lost | `E(state)` (CR step), then `startOREvents(interim)` |
| round OR / PRIVATES | `startOREvents(state)` | unchanged (`E` is empty) |

The existing `newSet` info warning is unchanged.

## `startCR` (21Moon `corporateRound` mechanic)

| Situation | After |
|-----------|-------|
| round SR, not ended | `E(state)` (SR step: marker only in 21Moon), then `turnAdvance{ round: "CR", scheduleIndex?, company: null }` |
| otherwise | unchanged |

## `startSR`

| Situation | After |
|-----------|-------|
| round CR, not ended | `E(state)` (CR step), then the SR `turnAdvance` |
| round SR, not ended (voice only; the button is hidden in SR) | `E(state)` (SR step), then the SR `turnAdvance` |
| round OR / PRIVATES | unchanged |

## `endSR` (voice)

| Situation | Before | After |
|-----------|--------|-------|
| round SR, not ended | capital + sold-out moves | `E(state)`: same events plus the marker |
| round SR, already ended | applied again (duplicate) | **unavailable**: "Ya se aplicó el fin de la ronda de acciones" (nothing appended) |
| round ≠ SR | applied in any round | **unavailable**: "Solo en la ronda de acciones" |

## `endCR` (voice, 21Moon)

| Situation | Before | After |
|-----------|--------|-------|
| round CR, not ended | sold-out moves and pool penalty | `E(state)`: same events plus the marker |
| round CR, already ended | applied again | **unavailable**: "Ya se aplicó el fin de la ronda corporativa" |
| round ≠ CR | applied in any round | **unavailable**: "Solo en la ronda corporativa" |

## Unchanged

- `nextCompany`, including its automatic start of the next OR in the set: it leaves an OR, so there is no end step.
- `setTurn` (manual override): no end step. A round change clears `roundEnded`.

## Summaries (`i18n/es.ts` `effectsEs`)

| Event | Effect line |
|-------|-------------|
| `turnAdvance{ roundEnd: "SR" }` | `fin de la ronda de acciones` |
| `turnAdvance{ roundEnd: "CR" }` | `fin de la ronda corporativa` |

Capital already shows as a bank flow, and sold-out and pool-penalty moves already show as "X → price".
