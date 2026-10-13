# Bug Assessment: Undoing a price drop leaves the price unchanged when a later entry moved the same company

- **Slug**: undo-stale-market-move
- **Created**: 2026-10-11
- **Source**: pasted text
- **Verdict**: valid (reproduced)
- **Severity**: high
- **Status**: resolved by feature 010 (reliable play history, 2026-10-12). Undo now runs only newest first ("Deshacer" on the latest entry, "Deshacer hasta acá" with a confirmation for older ones), so no entry stays active after an undone one and no later event can re-apply a stale price. Neither re-expansion nor relative market moves was needed (specs/010-reliable-play-history/research.md R3). Regression: "SC-002: undoing an issue after a run restores the price" in `tests/games/rotla.test.ts`, plus the 1830 sell → payout → undo back to the sell case in `tests/app/sessionStore.test.ts`. The recommendations below are kept for the record.
- **Previous status**: deferred to a feature spec (2026-10-11). The user will redesign transaction history in general rather than patch this as a bug. Options weighed: re-expanding later actions vs. storing before/after cells on `marketMove`. This file is input for that spec.

## Report (verbatim or summarized)

> When you undo an action, if that action caused the stock price to fall, the stock price is not reversed. This causes problems when for example you emit shares from a company into the bank pool (in RotLA). This causes the stock price to fall, and if you undo the action that causes it, the share price remains the same, this can lead to subsequent problems

## Symptom

After undoing an earlier action that moved a company's price, the price stays where that action put it whenever a *later* active entry also recorded a market move for that company. Shares and money are restored, but the price is not. Expected: the price is as if the undone action never happened.

Undoing the action **immediately**, with no later entry touching the company's market position, works correctly (verified below).

## Reproduction

Reproduced with a throwaway script driving the real `SessionStore` (RotLA, 3 players, no repo files changed):

1. `launchCompany` p1 → TUN (bid 160), p2 → EXP (bid 160), `startOR`. TUN price **80** (`{row:18,col:0}`).
2. `issueShares` TUN ×1 → events include `marketMove {to:{row:19,col:0}, reason:"issue"}`. Price **70**.
3. `runAndPayout` TUN, revenue 50, full → RotLA's last payout rule (`stackBottom`) records `marketMove {to:{row:19,col:0}, reason:"restack"}`, an **absolute** cell.
4. Undo the issue (the store asks "Hay 1 entrada posterior que depende de esta", confirm).
5. **Actual**: price **70** (`{row:19,col:0}`). **Expected**: 80 (or wherever the payout would move it from 80).

Control: steps 1–2, then undo the issue right away → price returns to 80. ✔

In RotLA nearly every company action after an issue triggers this, because every run records a market event (up/down/restack). So "issue, operate, then notice the mistake and undo" always leaves the wrong price.

## Suspected Code Paths

- [src/domain/events/types.ts:41](src/domain/events/types.ts#L41): `marketMove` stores an absolute `to: CellRef`, computed from the price at expansion time.
- [src/domain/events/reduce.ts:50-68](src/domain/events/reduce.ts#L50-L68): the reducer sets `position = event.to` unconditionally, so a later move overwrites whatever an earlier (now reverted) move did.
- [src/domain/mechanics/market.ts:181-205](src/domain/mechanics/market.ts#L181-L205) `applyMoveRules` / `runMoveEvent`: payout/withhold moves resolved to absolute cells. `stackBottom` records the *current* cell as `to`.
- [src/domain/actions/expand/operating.ts:423](src/domain/actions/expand/operating.ts#L423) (issue), [src/domain/actions/expand/stock.ts:75](src/domain/actions/expand/stock.ts#L75) (sell), [src/domain/mechanics/roundEnd.ts:46-49](src/domain/mechanics/roundEnd.ts#L46-L49) (soldOut/poolPenalty), plus custom mechanics (loans, landmarks, mergers, bankruptcy): all emit absolute targets.
- [src/domain/ledger/amend.ts:19-22](src/domain/ledger/amend.ts#L19-L22): documents the design ("Later groups keep their stored events", research R3). The same staleness affects **amend**.
- [src/app/SessionStore.ts:179-190](src/app/SessionStore.ts#L179-L190) and [src/domain/ledger/dependencies.ts](src/domain/ledger/dependencies.ts): revert detects dependents (`market:<company>` touch key) and asks for confirmation, but after confirmation it replays later groups' *stored* events unchanged.

Ruled out: snapshot invalidation ([src/domain/ledger/snapshots.ts](src/domain/ledger/snapshots.ts)), the effective-log walk, and UI memoization. All undo entry points (toast, History, voice) call the same `store.revert`.

## Root Cause Hypothesis

Events are frozen at dispatch time, and `marketMove` records an absolute destination cell. Reverting a group removes its events from replay, but a later group's `marketMove` still sets the position to the cell it computed from the old (pre-revert) price. The later move "re-applies" the reverted drop. The same holds for amend, and for any later group whose stored values were derived from state the reverted group changed (e.g. payout amounts depending on pool shares). The price is the most visible case and the one that corrupts subsequent play. Confidence: **high** (reproduced).

## Proposed Remediation

**Preferred**: On revert/amend, **re-expand dependent groups** instead of replaying their stored events. When the store builds the post-revert cursor, re-run each later effective group's stored `action` through `runPipeline` against the replayed state from the first changed group onward. This yields fresh events (correct market cells, and also correct derived money/payout amounts and rule selection; e.g. RotLA payout rules compare against the pre-move price, so 140 at 70 is "up 2" but at 80 is "up 1"). Persist the re-derived versions as `amend` entries for the affected groups, or as a new "rebase" entry kind, so the stored log stays the source of truth and export/import and snapshots keep working. **Undo and amend are never blocked** (user decision, 2026-10-11): the dependents confirmation stays, but confirming always succeeds. If a dependent action becomes `unavailable` or `invalid` after re-expansion, keep its stored events (today's behavior for that one entry), let the re-expansion continue past it, and flag it. The flag is a warning on the undo/amend toast naming the entry, plus a marker in History, so the table can fix or undo it by hand.

**Alternatives**:
- **Relative market moves**: store the move intent (`dir`, `n`, or `restack`) alongside `to`, and have the reducer resolve it from the current position. This is narrower: it fixes the price for the reported case (issue → run → undo issue), but rule *selection* stays stale (the RotLA payout tiers above) and so do other derived values. The reducer currently has no `GameDefinition` (`reduce(state, event)`), so it needs that threaded through. The event schema also changes, so old logs need a fallback: treat events without the intent as absolute.
- ~~**Block instead of fix**~~: rejected by the user. Undoing past later entries is a valid action and must work.
- **Manual-correction hint**: after such a revert, show a warning with the expected price and a one-tap manual `marketMove` (`reason: "manual"`). This is a band-aid.

**Files likely to change** (preferred):
- `src/app/SessionStore.ts` (revert/amend persistence path)
- `src/domain/ledger/amend.ts` (shared re-expansion helper), possibly a new `src/domain/ledger/rebase.ts`
- `src/domain/ledger/entries.ts` / `effectiveLog.ts` (if a new entry kind is added)
- `src/ui/components/DependentsDialog.tsx`, `src/ui/screens/History.tsx` (re-derived / could-not-re-derive markers)
- `src/persistence/exportImport.ts` (if the entry kind changes)
- `specs/…/research.md` R3 / `docs/spec.md` FR-013/FR-014 (documented behavior changes)
- Tests: `tests/app/sessionStore.test.ts`, `tests/domain/ledger.test.ts`, `tests/domain/amend.test.ts`, `tests/domain/issue.test.ts`

**Tests to add or update**:
- RotLA: issue → runAndPayout → revert issue (confirmed) → price equals the no-issue line, and the payout's market event is re-derived from 80.
- 1830: sell (price down) → later payout (price right) → revert sell → price is one step right of the original, not of the dropped price.
- Amend variant: amend an issue from count 1 to count 2 with a later payout → price reflects two steps down plus the re-derived payout move.
- Revert where a dependent action becomes unavailable after re-expansion → revert **succeeds**. That entry keeps its stored events and is flagged, and the groups after it are still re-derived.
- Regression gap: today no test reverts a group that has later market-dependent groups. The existing revert tests ([tests/app/sessionStore.test.ts:78](tests/app/sessionStore.test.ts#L78), [tests/domain/ledger.test.ts:42](tests/domain/ledger.test.ts#L42)) cover only log bookkeeping and money. The RotLA and 1830 tests above close that gap.
- Snapshot interaction: the same scenarios with ≥50 groups so a snapshot sits between the reverted group and its dependents.
- Random-walk/property test (`tests/helpers/randomWalk.ts`): after random revert, state equals a fresh replay of the action sequence without the reverted group.

## Risks & Considerations

- **Semantic change** to FR-013/FR-014 and research R3 ("later groups keep their stored events"). History currently shows later entries unchanged. After this fix their summaries/amounts may change, and History should show that they were re-derived.
- **Performance**: re-expansion runs the pipeline for every later group on each revert/amend. Long games (hundreds of groups) need it to stay within the perf budget (`tests/domain/perf.test.ts`). It can be limited to groups after the reverted one, starting from the nearest valid snapshot.
- **Auto end-of-round groups** (feature 003) and game-end folds (feature 007) are derived during replay. Make sure re-expansion doesn't double-apply or skip them, and regenerate eval fixtures per the feature-003 memory note if expanders are touched.
- **Persistence/export**: a new entry kind needs a schema version bump and import compatibility. Reusing `amend` entries avoids that but makes "Deshacer corrección" on a re-derived group subtle.
- Voice-originated groups keep their `transcript`. Re-expansion must preserve `source`/`transcript` metadata.
- Not a regression: the behavior dates from the original event-sourcing design. RotLA (feature 004) made it common, because every run records a market event.

## Open Questions

Resolved (user, 2026-10-11):

- ~~Was the undo immediate or after operating?~~ **After operating**, which matches the reproduction. The immediate case already works; the after-operating case had no test.
- ~~Refuse, cascade, or proceed when a dependent becomes invalid?~~ **Never block.** The undo is valid as long as each action is tracked properly. Default chosen for the edge case: keep that entry's stored events and flag it (see Preferred).
- ~~Broad re-expansion or price-only?~~ **Re-expansion** ("properly tracking each action"). Relative market moves stay as a fallback only.

Still open:

- [NEEDS CLARIFICATION: Persist re-derived groups as `amend` entries or as a new entry kind? This is a technical choice for `/speckit-bug-fix`. `amend` avoids a schema bump, but then "Deshacer corrección" would roll back a re-derivation the user never made.]
