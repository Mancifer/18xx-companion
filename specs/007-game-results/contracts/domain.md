# Contract: Game End, Reopening and Final Results (Domain, Store, Persistence)

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Research**: [research.md](../research.md)

## 1. Actions

In `src/domain/actions/schemas.ts`, with handlers in `src/domain/actions/expand/flow.ts`:

```ts
export const endGameAction = z.object({
  type: z.literal("endGame"),
  /** Fired conditions at the time of the end; null = filled by the expander. */
  triggers: z.array(EndTriggerTypeSchema).nullable(),
});
export const reopenGameAction = z.object({ type: z.literal("reopenGame") });
```

| Case | Result |
|---|---|
| `endGame` with no trigger fired | Group with one `note` event. Info warning `noEndCondition`: "Todavía no se cumplió ninguna condición de fin de partida." |
| `endGame` with triggers fired, `triggers: null` | The stored action has `triggers` set to the fired types, in definition order. |
| `endGame` while already finished | Accepted, with info warning `alreadyEnded`. The end moves to this group. |
| `reopenGame` while finished | Group with one `note` event. The game is open. |
| `reopenGame` while open | `unavailable`: "La partida no está terminada". |
| Undo of the `endGame` or `reopenGame` group | The status goes back to what it was before that group. |
| Amend of either | Refused: "No hay nada que corregir: deshazlo". |
| Money and shares | Unchanged by both. The invariants are untouched (FR-005). |

## 2. Game-end fold

In `src/domain/mechanics/gameEnd.ts` (new), used by `src/domain/ledger/replay.ts`:

```ts
/** One step of the fold (research R2, R8). Pure. */
export function stepGameEnd(
  game: GameDefinition,
  prev: { over: boolean; end: GameEnd | null; eliminationOrder: readonly PlayerId[]; autoEndGroups: readonly GroupId[] },
  group: { id: string; seq: number; at: string; action: Action; events: readonly PrimitiveEvent[] },
  before: SessionState,
  after: SessionState,
): { over: boolean; end: GameEnd | null; eliminationOrder: PlayerId[]; autoEndGroups: GroupId[] };

/** Status for the UI and ActionContext. */
export function gameEndStatus(cursor: ReplayCursor, effective: readonly EffectiveGroup[]): GameEndStatus;
```

`advance(game, cursor, group)` now takes `{ id, seq, at, action, events }`. Every caller already passes an `EffectiveGroup` or `GroupEntry`. `EffectiveGroup` gains `at`.

## 3. `gameOver` and the end triggers

In `src/domain/mechanics/endTriggers.ts`:

```ts
/** Fired end triggers filtered by scoring.autoEnd; bankBroken only once the OR set is complete. */
export function gameOver(game: GameDefinition, state: SessionState): boolean;
/** game.scoring, else the built-in `basedOn ?? id` game's scoring, else the defaults (research R16). Never throws. */
export function scoringOf(game: GameDefinition): Required<Pick<Scoring, "autoEnd" | "bankruptPlayers" | "tieBreak">> & Pick<Scoring, "shareBonus">;
```

| Game and state | `gameOver` |
|---|---|
| RotLA, last cycle's OR 2 complete, no MR due | true (unchanged) |
| RotLA + Bank Break, bank ≤ 0, OR set complete | true (unchanged) |
| 21Moon, OR 5.3 complete | true (new) |
| 21Moon, OR 5.2 complete | false |
| 1830 or 1848, any state | false (the table decides) |
| RotLA session created before this feature (stored definition has no `scoring`), last cycle complete | true (R16 fallback; same as today) |
| 21Moon session created before this feature (no `scheduleComplete` in its stored `endTriggers`), OR 5.3 complete | false (the table uses "Terminar partida") |

## 4. Final results

In `src/domain/mechanics/scores.ts`. `finalResults` replaces `finalScores`, and its rules are in data-model §6.

```ts
export function finalResults(
  game: GameDefinition,
  players: readonly Player[],
  state: SessionState,
  eliminationOrder: readonly PlayerId[],
): PlayerResult[];
```

## 5. Store

`StoreSnapshot` gains:

```ts
readonly gameEnd: GameEndStatus;
readonly eliminationOrder: readonly PlayerId[];
readonly autoEndGroups: readonly GroupId[];
```

- `runPipeline` receives `gameEnd` in its context (data-model §4).
- After each committed entry (an action, an undo or an amend), the store computes `outcome` (data-model §7) and passes it to the writer only when it changed:
  `appendEntry(sessionId, entry, metaPatch?: { outcome })`.

## 6. Persistence

Every writer of `outcome` computes it with `outcomeOf(game, players, status)` from `src/domain/mechanics/gameEnd.ts` (data-model §7).

| Function | Change |
|---|---|
| `SessionRepo.appendEntry(id, entry, metaPatch?)` | Merges `metaPatch` into the meta row in the same strict transaction as the entry. |
| `importSession` | Writes `outcome` computed from the replay it already runs. |
| `backfillOutcome(repo, meta)` (new, `src/app/sessions.ts`) | Called by Home for metas with no `outcome` key. It loads the session, replays it, writes `outcome` with `updateMeta`, and returns the new meta. A failure leaves the row as is: no marker is shown, and nothing is thrown to the UI. |
| Export format | Unchanged (`EXPORT_VERSION` stays 1). `outcome` is never exported. |
