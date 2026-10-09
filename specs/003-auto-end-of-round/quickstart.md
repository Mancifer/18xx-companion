# Quickstart: Validating the Automatic End-of-Round Step

**Feature**: [spec.md](spec.md) · Contracts: [actions](contracts/actions.md), [ui](contracts/ui.md)

## Prerequisites

```sh
npm install
npm run typecheck && npm run lint && npm test   # all green before and after
npm run dev                                     # for the manual checks
```

## Automated checks

| Scenario | Where | Expect |
|----------|-------|--------|
| 1830 SR → OR with a company floated this SR | `tests/domain/capitalization.test.ts` | One `startOR` group: the capital flow, `capitalPending: false`, then `OR 1.1` |
| 1830 / 1848 sold out at the end of the SR | `tests/games/1830.test.ts`, `1848.test.ts` | `startOR` moves the company up 1, and the operating order uses the new price |
| `endSR` then `startOR` | `tests/domain/roundEnd.test.ts` | The move is applied once; the second `endSR` is unavailable |
| `startOR`, undo, `startOR` | `tests/domain/roundEnd.test.ts` | The state after undo equals the state before; the redo applies the step once; the money invariant holds |
| Legacy log: old `endSR` group (no marker), then `startOR` | `tests/domain/roundEnd.test.ts` | No second move (flag inferred from `soldOut` / `capitalPending: false`) |
| 21Moon CR → OR with pool shares of an operated company | `tests/domain/corporateRound.test.ts` | One `startOR` group: down 1 (`poolPenalty`), then the OR |
| 21Moon SR → OR (CR skipped) | `tests/games/21moon.test.ts` | No `soldOut` or `poolPenalty` move |
| OR → SR, PRIVATES → SR/OR | `tests/domain/turns.test.ts` | No end-step events, no marker |
| `setTurn` from SR to OR | `tests/domain/turns.test.ts` | No end-step events |
| Table controls | `tests/ui/taps.test.tsx` | No "Fin de ronda de acciones" or "Fin de ronda corporativa" button in any round |
| e2e flows | `npm run test:e2e` | `operating`, `a11y` and `offline` pass without the removed taps |

## Manual check (5 minutes)

1. Start a new **1830** game. In the SR, have one player buy 6 NYC shares (NYC floats; its capital is pending) and have the players buy every PRR share.
2. Tap **Empezar OR** once. Expect:
   - the NYC treasury holds its capital;
   - PRR is one cell up;
   - the round indicator shows `OR 1.1`;
   - the undo toast lists the capital flow and "fin de la ronda de acciones · PRR → …".
3. Tap undo once. Expect the SR again, with NYC capital pending and PRR at its old price.
4. Say "fin de la ronda de acciones" and confirm, then say it again. The second time, expect the message "Ya se aplicó el fin de la ronda de acciones" and nothing added to History. Tap **Empezar OR**: no second capital payment and no second move.
5. In **21Moon**, go SR → **Empezar ronda corporativa** → issue a share of a company that has operated → **Empezar OR**. Expect that company down 1 in the same entry that starts the OR.
