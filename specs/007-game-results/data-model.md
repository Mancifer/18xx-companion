# Data Model: Game Results Screen

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

This feature adds no IndexedDB store and doesn't change the DB version. It adds the following:
- a `scoring` block on game definitions;
- an end trigger type;
- a bankruptcy mode;
- two actions;
- derived replay fields;
- one optional meta field.

## 1. `GameDefinition.scoring` (new, optional)

```ts
scoring?: {
  /** End triggers that end the game without the table (R3). bankBroken counts once the OR set is complete. */
  autoEnd: Array<"cyclesComplete" | "scheduleComplete" | "bankBroken" | "bankruptcy">;
  /** How a bankrupt player is ranked (FR-010). */
  bankruptPlayers: "eliminated" | "scored";
  /** How equal totals are ordered (FR-009). */
  tieBreak: "shared" | "presidentEarliest";
  /** Added to the final share price per unit of a company counter (21Moon §13, R5). */
  shareBonus?: { counter: string; perUnit: number };
}
```

| Game | autoEnd | bankruptPlayers | tieBreak | shareBonus |
|---|---|---|---|---|
| 1830 | [] | scored | shared | — |
| 1848 | [] | eliminated | shared | — |
| 21Moon | [scheduleComplete] | eliminated | shared | eastWestTokens × 50 |
| RotLA | [cyclesComplete, bankBroken, bankruptcy] | eliminated | presidentEarliest | — |

**Validation**:
- Zod: `autoEnd` holds distinct values, and `perUnit` is a positive integer.
- An `autoEnd` entry acts only while the same type is in `endTriggers`: the game ends on the triggers that fired, filtered by `autoEnd`. RotLA's base list has only `cyclesComplete`, and the Bank Break option adds the other two. So the validator doesn't cross-check the two lists.
- When the block is absent, `scoringOf` uses the `scoring` of the built-in game with id `basedOn ?? id` (research R16). Sessions store their own copy of the definition, so this is how sessions and custom games from before this feature get their rules. Only when no such built-in exists do the defaults `{ autoEnd: [], bankruptPlayers: "eliminated", tieBreak: "shared" }` apply, and the definition is treated as `verification.scoring = "unverified"` (FR-011). `hasUnverified` uses the same lookup.
- Built-ins set `verification.scoring = "verified"`.

## 2. `EndTriggerSchema`: new `scheduleComplete`

`{ type: "scheduleComplete" }` fires when all of these hold:
- the schedule is `fixed`;
- `turn.scheduleIndex` is its last slot;
- `turn.round` is `"OR"`;
- `orSetComplete(state)` is true.

Its message is "Fin de la partida: se jugó la última ronda de operaciones." 21Moon's `endTriggers` become `[lastRound, scheduleComplete, bankruptcy]`.

## 3. `CorporateBankruptcyConfig.playerMode`: new `"keepHoldings"`

The only event is `counterChange player:<id> bankrupt +1`. Cash, shares and privates stay with the player (R6). The 1830 Classic option sets it.

## 4. Actions (new)

| Action | Payload | Events | Availability | Warnings |
|---|---|---|---|---|
| `endGame` | `{ type: "endGame", triggers: EndTriggerType[] \| null }`. `null` from voice or touch: the expander records the fired triggers. | `[{ t: "note", text: "Fin de la partida" }]` | always | `alreadyEnded` (info) when the game is already finished; `noEndCondition` (info) when no trigger has fired |
| `reopenGame` | `{ type: "reopenGame" }` | `[{ t: "note", text: "Partida reabierta" }]` | only when the game is finished ("La partida no está terminada" otherwise) | — |

- Neither action has dependents to protect. Amend is refused for both: there is nothing to correct, so undo it instead.
- `ActionContext` gains optional `gameEnd?: GameEndStatus` (§5). The store fills it so `available` and `validate` can read it. Callers that don't fill it (tests, the eval harness) get "not finished".
- In History, `endGame` reads "Fin de la partida" plus the condition list, and `reopenGame` reads "Partida reabierta".

## 5. Derived game-end status (replay fold, R2/R7/R8)

```ts
interface GameEnd {
  readonly groupId: GroupId;         // the endGame group, or the group that reached an automatic end
  readonly seq: number;
  readonly at: string;               // that group's time
  readonly auto: boolean;
  readonly triggers: readonly EndTriggerType[];
  readonly state: SessionState;      // state right after that group: the frozen results (FR-012)
  readonly eliminationOrder: readonly PlayerId[]; // elimination order at that group: frozen with the state
}

interface GameEndStatus {
  readonly end: GameEnd | null;      // null = not finished
  readonly laterEntries: number;     // active groups with seq > end.seq (0 when not finished)
}

// ReplayCursor gains:
readonly over: boolean;                          // gameOver(game, state) after the last group
readonly end: GameEnd | null;
readonly eliminationOrder: readonly PlayerId[];  // players in the order their bankrupt counter went above 0
readonly autoEndGroups: readonly GroupId[];      // every group that reached an automatic end, kept after a reopening (History tags them)
```

**State transitions** (per effective group, in seq order):

| From | Group | To |
|---|---|---|
| any | `endGame` | finished at this group (`auto: false`) |
| finished | `reopenGame` | open |
| open | `reopenGame` | open (no-op in the fold; refused at dispatch as unavailable, §4) |
| open | other, `autoEnd` game, `over` false→true | finished at this group (`auto: true`); the group is added to `autoEndGroups` |
| finished | other | finished, unchanged (counts in `laterEntries`) |
| any | reverted group | as if the group never existed (replay) |

`Snapshot` gains `over`, `end`, `eliminationOrder` and `autoEndGroups`. A snapshot without them is skipped during `rebuild` (R9). `StoreSnapshot` exposes `gameEnd: GameEndStatus`, `eliminationOrder` and `autoEndGroups`.

## 6. Final result (computed, never stored)

```ts
interface PlayerResult {
  readonly player: PlayerId;
  readonly cash: number;                // may be negative, never clamped
  readonly sharesValue: number;         // Σ units × (price + bonus); 0 for unpriced companies
  readonly total: number | null;        // null when eliminated
  readonly rank: number | null;         // null when eliminated; equal ranks when shared
  readonly status: "active" | "bankrupt" | "eliminated";  // bankrupt = scored bankrupt (1830)
  readonly winner: boolean;             // rank === 1
  readonly tieBreak?: CompanyId;        // presidentEarliest only
}

finalResults(game, players, state, eliminationOrder): PlayerResult[]
// final:       finalResults(game, players, end.state, end.eliminationOrder)
// provisional: finalResults(game, players, liveState, cursor.eliminationOrder)
```

**Rules** (in order):

1. Only player cash and player-held shares count. Company treasuries, trains, privates and loans don't, and no debt is subtracted (FR-007).
2. A share's value is `priceOf(game, state, company)` plus `shareBonus.perUnit × counterOf(company, shareBonus.counter)`, or 0 when the company has no price. 1848 BoE: `priceOf` reads its loan track.
3. A player is bankrupt only when their `bankrupt` counter is above 0 in the given `state`. Players in `eliminationOrder` whose counter is 0 there (a bankruptcy recorded after the end) are ignored. With `bankruptPlayers: "scored"`, bankrupt players are ranked with everyone else and get `status: "bankrupt"`.
4. With `"eliminated"`, they come after every ranked player, ordered by `eliminationOrder` reversed (the latest first), with `total` and `rank` null.
5. Equal totals: `presidentEarliest` uses today's RotLA rule, with a `tieBreak` company. `shared` gives the same rank to every tied player, and the next rank skips (1, 1, 3).
6. `winner` is set on every rank-1 row. When every player but one is eliminated, that player is the only winner.

`finalScores` is replaced by `finalResults`. RotLA output is unchanged apart from the added `status` and `winner`.

## 7. `SessionMeta.outcome` (new, optional derived cache, R10)

```ts
outcome?: { readonly endedAt: string; readonly winners: readonly PlayerId[] } | null;
```

- **absent**: written before this feature. Home backfills it once from a replay.
- **`null`**: the game is not finished.
- **object**: the game is finished. `endedAt` is the end group's `at`, and `winners` are the rank-1 players.

**How it is computed**: one pure helper, `outcomeOf(game, players, status: GameEndStatus): { endedAt: string; winners: PlayerId[] } | null` in `src/domain/mechanics/gameEnd.ts`. It returns `null` when `status.end` is null. Otherwise it returns `{ endedAt: status.end.at, winners }`, where `winners` are the players with `winner: true` in `finalResults(game, players, status.end.state, status.end.eliminationOrder)`, in `players` order. Every writer below calls it, so the store, import and backfill can't disagree.

**Who writes it**:
- `SessionStore.persist`: through `appendEntry(sessionId, entry, metaPatch)`, in the same strict transaction as the entry, whenever the derived outcome changed.
- `importSession`: from the import replay.
- Home: the backfill.

It never appears in export files. `updateMeta` callers can't set it, because it isn't part of the store's public patch type.

## 8. Navigation

`Screen` gains `{ name: "results"; from: "table" | "home" }`. Like `table`, it needs an open session. Without one, `Screens` falls back to Home.
