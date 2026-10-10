# Research: Game Results Screen

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-10

The stack, storage and test setup are the same as in earlier features, so the Technical Context had no open questions. These are the design decisions. Each was checked against the current code and, for rules, against the rulebooks in `docs/rules/`.

## R1. How a game end and a reopening are recorded

**Decision**: Add two actions, `endGame` and `reopenGame`. Each expands to one `note` primitive ("Fin de la partida" / "Partida reabierta"), so it moves no money or shares (FR-005). Whether the game is finished is **derived** by folding the effective log during replay (R2). It is not stored as a flag:

- an active `endGame` group ends the game at that group;
- an active `reopenGame` group cancels the current end;
- undoing either group with the normal one-tap undo (a `revert` entry) removes its effect on the next replay (FR-004, FR-005b, the "Undo after finishing" and "Undoing the reopening" edge cases).

`endGame` carries `triggers: EndTriggerType[]`, the conditions that had fired when it was recorded. The expander fills it from `endTriggers(game, state)`, and the action schema accepts it so the field stays in the history ("Game end" entity).

**Rationale**:
- No new primitive is needed, so Principle I's closed vocabulary holds. `note` is the existing "nothing moves" event.
- An end and a reopening are ordinary groups, so History, undo, amend refusal, export and import all work with no special cases.
- Deriving "finished" from the log means the result is the same after a reload, an export and import, or a revert (FR-018, SC-005).

**Alternatives considered**:
- *A `gameEnded` counter on `bank` (counterChange ±1)*: puts "finished" into `SessionState`, but sessions recorded before this feature have no counter (R2). It also needs a second counter to tell "never ended" from "reopened".
- *A flag in `SessionMeta`*: state outside the log. That breaks Principle I and gives undo nothing to work on.
- *A new primitive `gameStatus`*: needs a constitution-level amendment and buys nothing over `note` plus the action type.

## R2. Automatic end: the transition rule

**Decision**: For games whose definition ends them on their own (R3), a group also ends the game when the game-over check goes from **false before** the group to **true after** it. The fold keeps `over` (the last game-over value) in the replay cursor, so each group costs one `gameOver` call.

```text
for each effective group g (seq order):
  after = reduce(state, g.events)
  elim = eliminationOrder + players whose bankrupt counter went 0 → >0 in g
  if g.action is endGame         → end = { group: g, auto: false, state: after, eliminationOrder: elim }
  else if g.action is reopenGame → end = none
  else if autoEnds(game) and !over and gameOver(game, after)
                                 → end = { group: g, auto: true, state: after, eliminationOrder: elim }
                                   autoEndGroups += g
  over = gameOver(game, after); state = after; eliminationOrder = elim
```

**Rationale**: This one rule covers every case in the spec:

- **FR-001**: the entry that completes the last cycle or OR 5.3 ends the game.
- **FR-005c, US4-2**: after a reopening, `over` is still true, so no transition happens and the game stays open. "Terminar partida" is the suggested step because the end triggers are still firing (R11).
- **"Reopening an automatic end, then undoing entries"**: undoing the last dividend makes the state not over. Recording it again after the reopening is a new false→true transition, so the game ends again (US4 independent test).
- **"Undo after finishing"** for an automatic end: undoing the entry that reached the end means no transition, so the game is not finished.
- **"Old sessions"**: a RotLA session recorded before this feature replays through the same rule and is recognized as finished. No migration writes to its log. Its stored game definition has no `scoring` block, so the rule depends on the R16 fallback.

The automatic end has no entry of its own. It is attached to the group that reached it, and History labels that group "Fin de la partida (automático)" (FR-004 now says so). The fold also keeps `autoEndGroups`, every group that reached an automatic end, not only the current one. After a reopening `end` is cleared, but History still tags the earlier end, so the history shows the end, the reopening and any later end (US4-3). A separate system group was rejected because undoing it alone would leave the state still over, and the game would end again at once.

**Alternatives considered**:
- *Append a system `endGame` group automatically after the triggering group*: the store has no auto-append path (feature 003 put the end step inside the triggering group instead). Undo would also need special cases, and old sessions would never get the group.
- *A trigger (`runTriggers`) that adds an end marker event to the triggering group*: works only for new entries, so old sessions would need a second derived rule. One derived rule is simpler.

## R3. Which games end on their own (data)

**Decision**: A new optional `scoring` block in `GameDefinition` (data-model §1) lists, in `autoEnd`, the end triggers that end the game without the table:

| Game | `autoEnd` | Source |
|---|---|---|
| RotLA | `cyclesComplete`, `bankruptcy`, `bankBroken` (after the OR set) | Today's `gameOver` behavior. `bankruptcy` and `bankBroken` fire only with the Bank Break option, which adds those triggers. |
| 21Moon | `scheduleComplete` (new trigger type) | §13: "At the conclusion of Operating Round 5.3"; user, 2026-10-10 |
| 1830, 1848 | none | The table decides (1830 §8.0, 1848 §13.1) |

- **New `scheduleComplete` end trigger**: fires when the turn is on the last slot of a fixed schedule, the round is an OR, and the OR set is complete (`orSetComplete`). For 21Moon that is after OR 5.3. `orsInSetFor` already gives set 5 three ORs from the sequence. The existing `lastRound` trigger stays as the warning it is today.
- **`gameOver(game, state)` is generalized**: it returns true when a trigger listed in `scoring.autoEnd` fires. `bankBroken` counts only once `orSetComplete` holds. With RotLA's data, the result is exactly what `gameOver` returns today.
- Not added: 21Moon's second end ("all players but one are bankrupt", §13). FR-001 doesn't list it. The `bankruptcy` warning already fires, so "Terminar partida" is suggested, and US2-4 ranks the remaining player first.

**Rationale**: Principle III puts game differences in data. `gameOver` currently hard-codes "only games with `cyclesComplete`". Moving this into `autoEnd` lets 21Moon join without a code path of its own.

**Alternatives considered**:
- *Reuse `cyclesComplete` for 21Moon*: its rule (SR count, the Merger Round check) is RotLA-specific, and 21Moon's schedule opens with PRIVATES, so `cycleCount` returns undefined.
- *An `auto: true` flag on each `EndTriggerDef`*: also works, but it puts scoring policy into the warning list. Options that patch `endTriggers` (RotLA Bank Break) would then also have to restate it.

## R4. Ranking rules as data

**Decision**: The `scoring` block also holds:
- `bankruptPlayers: "eliminated" | "scored"`;
- `tieBreak: "shared" | "presidentEarliest"`;
- `shareBonus` (R5).

It gets a `verification.scoring` key.

| Game | `bankruptPlayers` | `tieBreak` | Source |
|---|---|---|---|
| 1830 | `scored` | `shared` | C-2.5 note (p. 28): "final score … is the value of all of the shares that he could not sell … can win". No tie rule in §8.0. |
| 1848 | `eliminated` (default, no bankruptcy in the app) | `shared` | §13.2. No tie rule. |
| 21Moon | `eliminated` | `shared` | §11.8.1, §13. No tie rule. |
| RotLA | `eliminated` | `presidentEarliest` | B p.17, p.19 (today's `finalScores`) |

When `scoring` is absent, `scoringOf` first falls back to the built-in game the definition comes from (R16). Only when there is no such built-in (a hand-written definition) do the defaults apply: `eliminated`, `shared`, no `autoEnd`, no bonus. Such a definition is treated as `verification.scoring = "unverified"` (FR-011). Custom games are cloned from a built-in (`createCustomGame`), so new ones inherit its `scoring`, as the spec's Assumptions require, and older ones get it through the R16 fallback.

**Rationale**: FR-010 and FR-011 ask for per-game data. The current `finalScores` hard-codes RotLA's tie-break and "eliminated". This turns both into data and keeps RotLA's output the same.

## R5. 21Moon: the East-West bonus in the final share value (rule found during research)

**Finding**: 21Moon §13 says "The final value is the current share price plus 50 for each East-West bonus token the corporation holds." The spec doesn't mention this. The app already tracks the tokens as the company counter `eastWestTokens`, which the table sets with `adjustCounter`.

**Decision**: `scoring.shareBonus = { counter: "eastWestTokens", perUnit: 50 }` for 21Moon. The final share value of a company is its price plus `perUnit × counter(company)`, and it applies only when the company has a price. Constitution III requires game values from the rulebook, and SC-001's "hand count" for 21Moon includes the bonus.

**Confirmed by the user (2026-10-10)**: 21Moon has this rule. It raises 21Moon totals compared with "price only".

## R6. 1830 Classic: the bankrupt player keeps the shares they could not sell

**Finding**: 1830 Classic uses `corporateBankruptcy` with the default `playerMode: "toPool"`. That mode returns the player's cash to the bank and moves every share to the pool, so a bankrupt 1830 player would always total 0. Under C-2.4 and C-2.5, the player has already sold every share they are allowed to sell. The game then ends at once ("No further actions may be taken"), and the note on p. 28 scores the shares they could not sell.

**Decision**: Add `playerMode: "keepHoldings"` to `CorporateBankruptcyConfig`. It only marks the player bankrupt (the `bankrupt` counter): their remaining cash and shares stay where they are. The 1830 Classic option uses it. 21Moon keeps `toPool` (§11.8.1) and RotLA keeps `liquidatePresided`. The existing 1830 Classic bankruptcy test changes from "shares to the pool" to "holdings stay", and the old expectation is removed.

**Rationale**: Without this, FR-010's "still scored" behavior can't produce a non-zero total, and the spec's US2 independent test fails. Confirmed by the user (2026-10-10).

**Alternative considered**: score 1830 bankrupt players from the state *before* the bankruptcy group. That depends on the order of groups, and the pool transfer would still be wrong for the rest of the session.

## R7. Results are frozen at the end

**Decision**: The fold (R2) keeps the state right after the end group (`end.state`). The results screen ranks players from that state, never from the live state (FR-012). "Entries after the end" means the active groups with `seq > end.seq`. When there are any, the screen shows "Hay N entradas posteriores al final que no cuentan en esta clasificación." (singular for one: "Hay 1 entrada posterior al final que no cuenta en esta clasificación.")

The ranking is computed, not stored ("Final result" entity): the screen calls `finalResults(game, players, end.state, end.eliminationOrder)` when it renders. The end keeps its own copy of the elimination order, so a bankruptcy recorded after the end can't reach the frozen ranking. As a second guard, `finalResults` only treats a player as bankrupt when their `bankrupt` counter is above 0 in the state it is given.

**Rationale**:
- Later entries can't silently change the stored result.
- A correction to an entry *before* the end (undo or amend) does change the result, because it changes history. US4 relies on that.

## R8. Elimination order

**Decision**: The same fold records, in order, the players whose `bankrupt` counter goes from 0 to above 0 (`eliminationOrder`). Eliminated players are listed with the most recent first (FR-010, US2-3). A player who reaches the counter again is not added twice. A reverted bankruptcy disappears on replay.

**Rationale**: `SessionState.counters` holds the value, not when it was set. The fold already visits every group, so this costs one scan of the group's events.

## R9. Snapshots and replay

**Decision**: `ReplayCursor` gains `over`, `end`, `eliminationOrder` and `autoEndGroups`, and `Snapshot` stores them too. A stored snapshot without these fields (written before this feature) is treated as unusable: `rebuild` skips it and replays from the start once. The next snapshot point writes a new one.

`replay()` and `replayFromSnapshot()` return the new fields in `ReplayResult`. `advance()` takes the group's `action` so the fold can recognize `endGame` and `reopenGame`.

**Cost**: `gameOver` runs once per group for games with an `autoEnd` list. It already runs on every Table render today. The perf test (`tests/domain/perf.test.ts`) stays the guard.

## R10. Home: the finished marker and winners without opening each game

**Decision**: `SessionMeta` gains an optional derived cache, `outcome`:
- `null`: not finished;
- `{ endedAt, winners: PlayerId[] }`: finished.

The field is absent for sessions that predate the feature. The log stays the source of truth:

- **On every write**, `SessionStore.persist` computes the outcome from the new cursor. When it changed, the store passes it to `appendEntry` as a meta patch, written in the **same strict transaction** as the entry, so the cache can't go out of sync with the log.
- **Old sessions** (no `outcome` field): Home backfills them once. It loads and replays each one, then calls `updateMeta({ outcome })`. These are the RotLA sessions from before this feature.
- **Import**: `importSession` already replays the file in `parseImport`. It writes `outcome` from that replay. The export format doesn't change: the outcome is derived from the entries, so an import on another device shows the same result (FR-018, US3-6).

**Rationale**:
- Home lists every session from `sessions.getAll()` and must not replay each log on every visit.
- A cache updated in the entry's own transaction is as reliable as the log.

**Alternatives considered**:
- *Replay every session on each Home load*: cost grows with the number of sessions and their length.
- *Add the outcome to the export file*: a second copy of derived data that could disagree with the entries.

## R11. Table: "Terminar partida" and the provisional ranking

**Decision**:
- **"Terminar partida" on the Table, for every game.** It is a button in the end banner when end triggers fire, styled `primary` there. It is also always in the menu. Tapping it opens a `ConfirmSheet`:
  - it lists the fired conditions;
  - when none have fired, it says "Todavía no se cumplió ninguna condición de fin de partida.";
  - confirming dispatches `endGame`.

  From the banner that is 2 taps (SC-003, which applies once a condition has fired). From the menu it is 3, which is fine because ending before any condition has fired is not a common action. The existing `scoreAfter` path (bankruptcy confirmation → "Terminar partida") opens the same sheet.
- **RotLA's `CycleControls`**: after the last cycle, while the game is open (reopened), the button shows "Terminar partida" instead of "Ver puntuación".
- **Results screen on end**: the Table watches the end status. When `end.groupId` changes to a new group (open to ended, or an `endGame` recorded by voice on a game that was already finished), it navigates to the results screen (FR-006). This replaces the current `scoreShown` logic that opened `ScoreSheet`.
- **Provisional ranking**: the menu item "Clasificación" is shown for **every** game (today "Puntuación" is RotLA-only). It opens the results screen in provisional mode, with the heading "Clasificación provisional" (FR-014). `ScoreSheet` is deleted. One results view remains.

**Rationale**: FR-002, FR-003, FR-014, SC-003. A suggestion that never acts on its own satisfies "the table wins" (Principle III).

## R12. The results screen and navigation

**Decision**: A new full screen, `{ name: "results", from: "table" | "home" }`. It isn't a sheet, because it has to open from Home without the Table. The screen needs an open session (like `table`), and Home opens the session first (`openSession`).

- **Content**:
  - **Header**: "Resultados" (finished) or "Clasificación provisional".
  - **Line under the header**: the game, the end time, and "automático" or the fired conditions.
  - **Table**: rank, player, cash, shares, total.
  - **Markers**: the winner row carries a "🏆 Ganador" text badge, `aria-label`led. Eliminated rows show "Eliminado" with "—" for rank and total. Scored bankrupt rows carry a "Quiebra" badge. Tie-break lines are kept from `ScoreSheet`, and shared ranks show "=". The text markers mean color is never the only cue (FR-013).
- **Actions**:
  - "Ver mesa": goes to the Table.
  - "Reabrir partida", only when finished: a confirmation `Sheet` with Cancelar / Reabrir. Confirming dispatches `reopenGame` and goes to the Table (FR-005a, US4-5).
  - "Volver": to Home when `from: "home"`, to the Table otherwise (FR-017, US3-4).
- **From Home**: tapping a finished row, or "Continuar" when the last session is finished, opens the session and then the results (FR-016, US3-5). An unfinished row opens the Table, as today.
- **Layout**: a scrollable table that fits phone portrait at 360 px by stacking cash and shares under the name below a breakpoint. Buttons are at least `--tap`.

**Rationale**: SC-004 (1 tap from Home), FR-013, FR-017.

## R13. Voice

**Decision**: `endGame` joins `ACTION_TOOLS` ("terminar la partida", "fin de la partida") with no arguments for the model: the expander fills `triggers`. `reopenGame` is touch-only and not a voice tool. It is a correction offered only on the results screen, where voice doesn't run, so it stays out of the cached prefix.

Tool and prompt snapshots (`tests/voice/__snapshots__`) are regenerated, and the eval fixtures are rebuilt (`eval/voice/buildFixtures.ts`). Two or three eval cases are added for "terminar la partida". The constitution requires a scored eval run before merging. That needs the user's API key, so it is left as a task for the user.

**Rationale**: FR-002 says "by touch and by voice". Principle V asks for parity on common actions, and reopening isn't one.

## R14. 1848 values that need no special code

- **BoE shares**: `priceOf` already reads the BoE price from its loan track (`priceAt` with an `index` position), so FR-007's "own track" needs no new code. A test pins it.
- **Loans**: player cash isn't reduced by company loans. Loans are company assets and are never counted (FR-007, §13.2).
- **Unpaid dividends after the Bank breaks (§13.1)**: the app keeps paying dividends from a bank whose cash goes negative (the TopBar shows the negative bank), so those amounts are already in player cash. A test confirms that a dividend paid from a broken bank shows up in the total.

## R15. Tests (Principle VI)

Test-first, in this order:

1. **`tests/domain/gameEnd.test.ts`** (new): the R2 fold. It covers:
   - a manual end and its undo;
   - a reopening and its undo;
   - an automatic end at the transition;
   - no automatic end again after a reopening until a new transition;
   - the legacy session with no end entries;
   - entries after the end;
   - elimination order.
2. **`tests/domain/scores.test.ts`** (extended):
   - `scored` against `eliminated`;
   - `shared` ties against `presidentEarliest`;
   - the 21Moon East-West bonus;
   - BoE on its track;
   - negative cash;
   - companies with no price;
   - every player but one eliminated.
3. **`tests/domain/endTriggers.test.ts`**: `scheduleComplete` for 21Moon after OR 5.3 (not after OR 5.2), and `gameOver` driven by `autoEnd`. The RotLA cases stay the same.
4. **Game tests**:
   - `tests/games/1830.test.ts`: Classic bankruptcy keeps holdings.
   - `tests/games/21moon.test.ts`: the auto end after the 11th OR.
   - `tests/games/definitions.test.ts`: every built-in has a verified `scoring` block.
5. **`tests/domain/snapshots.test.ts`**: snapshots carry the end, and an old snapshot is skipped.
6. **`tests/persistence/*`**: `outcome` is written with the entry, export and import keep the result, and Home backfills.
7. **UI** (`tests/ui/results.test.tsx` new, plus `home.test.tsx`, `rotla.test.tsx`):
   - end → results;
   - reopen → Table;
   - Home marker and winner;
   - Continuar → results;
   - the provisional heading.
8. **e2e `e2e/rotla.spec.ts`**: the RotLA score sheet steps become the results screen.

## R16. Sessions keep their own copy of the game definition (found during analysis)

**Finding**: `SessionMeta.game` holds the full game definition as it was when the session was created (options already applied), and replay, the store, amend and import all read that copy. Every session and custom game saved before this feature has no `scoring` block, and 21Moon copies have no `scheduleComplete` trigger. If `scoringOf` used only the stored copy, every old session would get the defaults:

- RotLA games, finished or still in progress, would never end on their own. Today's `gameOver` does end them, because it checks `endTriggers` for `cyclesComplete`. That would be a regression, and it would break the spec's "Old sessions" edge case.
- 1830 sessions would rank bankrupt players as eliminated instead of scored.
- Old custom games would show as unverified.
- The Home backfill would store `outcome: null` for finished RotLA sessions.

**Decision**: `scoringOf(game)` resolves the block in this order:

1. `game.scoring` when present;
2. otherwise the `scoring` of the built-in game with id `game.basedOn ?? game.id`, looked up without throwing (`builtInGames.find`). That covers built-in sessions and custom games from before this feature;
3. otherwise the defaults, and the definition counts as `verification.scoring = "unverified"` (FR-011).

`hasUnverified` uses the same lookup, so an old session of a built-in game isn't flagged.

**What the fallback does not change**: the rest of the stored copy is still used as is.
- Old 21Moon sessions don't list `scheduleComplete` in their `endTriggers`. They don't end on their own, and the table uses "Terminar partida" as it does today. They do get the East-West bonus and the elimination rule.
- Old 1830 Classic sessions keep the `toPool` bankruptcy mode in their stored option config. A bankruptcy recorded in them still moves holdings to the pool.

Both are acceptable: neither breaks a game in progress, and the stored copy is never rewritten (it is not log data, but rewriting it would change how old entries replay).

**Alternatives considered**:
- *Migrate `meta.game` on load to add `scoring`*: writes outside the log for every old session and has to repeat for imports. The read-time fallback needs no write.
- *Keep `gameOver`'s current `cyclesComplete` check as a second path*: keeps RotLA working but leaves 1830 ranking and custom games wrong, and it is the hard-coding R3 removes.

**Tests**: the legacy cases in `tests/domain/gameEnd.test.ts`, `tests/domain/endTriggers.test.ts` and `tests/app/sessions.test.ts` use a RotLA definition **with `scoring` removed**. Built from the current definition, they would pass and hide this case.
