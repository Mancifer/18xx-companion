# Feature Specification: Reliable Play History

**Feature Branch**: `010-reliable-play-history`

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "I recently tested our application in a real world playthrough of RotLA and I found a few problems related to the undo feature. While the current feature is serviceable, what's useful in a real world scenario is to be able to track back any operation made during play, so you can see exactly what happened, and how much money was distributed. This is necessary, because if anyone makes an error at some point and the application cannot be trusted, it can cause the match to go awry. [...] I should be able to track back any operation made during the game, like players buying shares, companies buying trains, companies paying dividends, transferring money to a player, setting a fixed amount of money to a player, and so on. History entries should show a bit more information, particularly in any operation involving money [...] if I pay dividends as a company, the amount it paid should be reflected in the history [...] I can't see the exact money distribution between players and companies in the history. [Atomizing company operations] should be a separate spec."

**Related input**: bug assessment `.specify/bugs/undo-stale-market-move/assessment.md` (deferred to this spec on 2026-10-11). Undoing an earlier entry leaves the share price wrong when a later entry also moved that company's price.

## Clarifications

### Session 2026-10-12

- Q: Can an entry be undone while later entries are still active? → A: No. Undo goes back in order, newest first. It never skips steps.
- Q: Should past entries stay editable (correct an entry, recalculate later ones)? → A: No. Correcting past entries is removed entirely for now, because it is limited and can lead to issues. The only way to change the past is to undo back to that point and play the actions again. Editing past entries may come back in a future spec.
- Q: How does the table go back several steps at once? → A: With "undo back to here" on any entry in the history. It undoes that entry and every entry after it. Anything beyond the latest action asks for confirmation first.
- Q: Should the history be filterable by player or company? → A: No. The table reads the history as a timeline, and undoing from a filtered view would be confusing.
- Q: Should there be tools to repair a single past entry in place (cancel just that entry, move trains or privates by hand, insert a different action at that point)? → A: No. That would be like creating a separate branch of the game where things happened differently.

## Overview

During a real game the history is how the table checks the app. When a number looks wrong, players open the history to find the step where it went wrong and go back to it. Two things get in the way today:

1. **Going back is not trustworthy.**
   - Undoing an earlier entry, or correcting it, leaves later entries with results calculated from a game that no longer exists. The reported case: in RotLA, a company issues a share (price drops), then operates (its price moves). Undoing the issue restores money and shares but leaves the price where the issue put it.
   - Undoing back many steps means one undo at a time.
2. **Entries don't show enough detail to audit money.** A dividend entry shows the total and the per-share amount, but not who received what. "Set money to X" doesn't show what the amount was before. Players can't compare an entry to the physical cash on the table.

This feature fixes both:

- **Undo always goes back in order.** Either one step, or back to a chosen entry in one go with a confirmation. The game is always exactly the state it was in before that point.
- **Correcting past entries is removed.**
- **Every entry shows exactly where the money went.**

**Out of scope**:

- Editing or correcting past entries, recalculating later entries, and flagging inconsistent entries. These may come back in a future spec.
- Repair tools for a single past entry: cancelling one entry out of order, moving trains or privates by hand, inserting actions in the middle of the history, changing an entry into a different type of action.
- Filtering the history by player or company. The table reads the history as a timeline.
- Redoing undone entries. After undoing, the table plays the actions again.
- **Separate spec**: grouping a company's whole operating turn into one confirm-or-cancel operation. The user will retest the operating flow after this feature ships and decide then.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Undo the latest action (Priority: P1)

A player just made a mistake. They undo it, and the game returns exactly to where it was before that action, the same way the table would take back a move on the physical board. They can keep undoing, one step at a time, newest first.

**Why this priority**: This is the most common fix during play. Undoing strictly in order removes the reported bug: there are never later entries holding results from a game that no longer exists.

**Independent Test**: Play a sequence (e.g. RotLA: issue a share, buy a train, pay out). Undo three times. After each undo the state must equal the state before the undone entry. At the end it must equal the state before the issue.

**Acceptance Scenarios**:

1. **Given** any game, **When** the user undoes the latest action, **Then** prices, money, shares, trains, privates, phase, and turn are exactly what they were before that action, with no confirmation needed.
2. **Given** a RotLA company issued a share (price 80 → 70) and then ran and paid out, **When** the user undoes the payout and then the issue, **Then** the price is back at 80, and the treasury and every player's money equal the values before the issue.
3. **Given** several undos in a row, **When** the user keeps undoing, **Then** each step stays available until the start of the game.
4. **Given** the history screen, **When** the user looks at an older active entry, **Then** it offers no single-entry undo. It offers "undo back to here" (US2).
5. **Given** a voice request to undo, **When** it has no target or targets the latest action, **Then** the latest action is undone, as by touch.
6. **Given** an automatic effect that followed the latest action (e.g. the end-of-round effects of feature 003), **When** the user undoes, **Then** it behaves as today: the action and the effects it triggered are undone together.

---

### User Story 2 - Undo back to a chosen entry (Priority: P1)

A player notices that an action several entries back was wrong. They find it in the history and choose "undo back to here". The app shows how many entries will be undone and asks for confirmation. Once confirmed, that entry and every entry after it are undone in one go. The table then plays the actions again correctly.

**Why this priority**: With past-entry editing removed, this is the only way to fix an older mistake. Doing it one undo at a time would be slow and error-prone in a long game.

**Independent Test**: Play 10 actions. Choose "undo back to here" on the 4th. Confirm. The state must equal the state before the 4th action, and the 4th to 10th entries must show as undone.

**Acceptance Scenarios**:

1. **Given** a game with 10 active entries, **When** the user chooses "undo back to here" on the 4th entry, **Then** a confirmation shows that 7 entries will be undone, naming the oldest (the chosen one) and the newest. Nothing changes until the user confirms.
2. **Given** that confirmation, **When** the user confirms, **Then** the 4th to 10th entries are undone, and the state equals the state before the 4th entry.
3. **Given** that confirmation, **When** the user cancels, **Then** nothing changes.
4. **Given** "undo back to here" on the latest action, **When** chosen, **Then** it behaves like a normal undo, with no confirmation.
5. **Given** a voice request to undo back to an older entry (e.g. "deshacé hasta la compra del tren de A"), **When** it is understood, **Then** the same confirmation is shown before anything is undone.
6. **Given** entries undone back to a point, **When** the user opens the history, **Then** the undone entries stay visible, marked as undone, with their full breakdown (US3). The table can still read what was removed while playing the actions again.

---

### User Story 3 - See exactly where the money went in every entry (Priority: P1)

A player wants to check an entry against the table. They open the history and expand the entry. They see every movement it caused: who paid whom and how much, shares moved, price changes, trains moved. For holders whose money changed, they see the balance before and after.

**Why this priority**: Without the breakdown, the table can't find the step where the app and the physical cash diverged, so it can't decide how far back to undo. The user asked for this explicitly with the dividends example.

**Independent Test**: Apply a dividend payout in a game with several shareholders, including shares in the pool or the company treasury. Open the entry and check each recipient's amount and resulting balance against a hand calculation.

**Acceptance Scenarios**:

1. **Given** a company paid dividends, **When** the user expands the entry, **Then** they see the total paid, the per-share amount, and one line per recipient (each player, the company itself, and the bank/pool when the game pays them) with the amount received, plus any price movement with old and new price.
2. **Given** a half pay or withhold, **When** the entry is expanded, **Then** it shows how much went to the company treasury and how much went to shareholders, per recipient.
3. **Given** the user set a player's money to a fixed amount, **When** the entry is viewed, **Then** it shows the previous amount, the new amount, and the difference, and where the difference came from or went to (bank).
4. **Given** a player bought a share, **When** the entry is expanded, **Then** it shows the price paid, who received the money (bank, pool, or company), the share moved, and the buyer's balance before and after.
5. **Given** a company bought a train, **When** the entry is expanded, **Then** it shows the train, the seller, the price, any trade-in, and the company's treasury before and after.
6. **Given** any money transfer between two holders, **When** the entry is expanded, **Then** it shows the payer, the recipient, the amount, and both balances before and after.
7. **Given** an entry with a single simple movement, **When** the history is shown, **Then** its one-line summary already states the amount, so no expansion is needed to read it.
8. **Given** an automatic or system entry (private income, end-of-round effects, game end), **When** the entry is expanded, **Then** it shows the same breakdown as a manual entry.
9. **Given** any operation that changes the game (buying or selling shares, buying a train, paying out, transferring money, setting money or a price, issuing or redeeming shares, closing a company, and so on), **When** it is applied by touch, by voice, or automatically, **Then** it appears in the history as its own entry. No change to the game happens without a history entry.

---

### Edge Cases

- **Undo back to a very early entry in a long game** (hundreds of later entries): it completes without the app freezing (see SC-004).
- **Undo back past the end of a round or the end of the game**: automatic end-of-round effects and the automatic game end (features 003 and 007) are undone with the entries that triggered them.
- **Undo back past the game start or setup**: setup entries (session creation) cannot be undone. "Undo back to here" is not offered on them.
- **Voice entries**: undone entries keep their source (voice/touch/system) and transcript in the history.
- **Invariant breaks** (money not conserved, share units off) are shown as today. They are never corrected silently.
- **Unlimited bank** games: balances before/after are shown for players and companies. The bank shows only the amount moved.
- **Sessions saved before this feature**:
  - They load and play normally, and their entries show the new breakdown.
  - Entries that were undone out of order in older sessions stay undone as they were.
  - Entries that were corrected in older sessions show their latest version, marked as corrected, and can be undone like any other entry.
- **Export/import**: an exported session imports with the same history, undone marks, and state.
- **Correct option removed everywhere**: the history no longer offers "correct", and voice requests to correct an entry are answered with an explanation that the table should undo back to that entry and play the actions again.

## Requirements *(mandatory)*

### Functional Requirements

**Undo in order**

- **FR-001**: Only the most recent active action MUST be undoable on its own. Undo MUST restore the game exactly to the state before that action.
- **FR-002**: Every active entry in the history other than setup entries and the most recent one MUST offer "undo back to here", which undoes that entry and every later active entry. The result MUST equal the state before that entry. The most recent entry offers plain undo instead (FR-001), which has the same effect.
- **FR-003**: "Undo back to here" on any entry other than the most recent MUST ask for confirmation first. The confirmation MUST show how many entries will be undone, and the oldest and newest of them. Cancelling MUST change nothing.
- **FR-004**: Undoing the most recent action MUST not ask for confirmation, as today.
- **FR-005**: Voice MUST support undoing the latest action and undoing back to an identified older entry. The latter MUST show the same confirmation as touch before anything is undone.
- **FR-006**: Undo MUST never be blocked except by order. Every step back to the first non-setup entry MUST stay available.
- **FR-007**: Automatic effects (end of round, end of game, and similar) MUST be undone together with the entry that triggered them.

**Correct removed**

- **FR-008**: Correcting or editing past entries MUST be removed from every entry point (history, voice). A voice request to correct MUST be answered with the instruction to undo back to that entry and play the actions again.

**Detailed history entries**

- **FR-009**: Every operation that changes game state MUST create a history entry, whatever its source (touch, voice, automatic). This includes share purchases and sales, train purchases, payouts, money transfers, fixed money or price settings, share issues and redemptions, and company closures. No state change may happen without one.
- **FR-010**: Every entry in the history MUST be expandable to list every movement it caused: money (payer, recipient, amount), shares (from, to, count, company), trains and privates (from, to), price changes (old and new price), and status changes.
- **FR-011**: For every holder whose money changed in an entry, the expanded entry MUST show that holder's balance before and after the entry (except the bank in unlimited-bank games, which shows only the amount moved).
- **FR-012**: Dividend, half-pay, and withhold entries MUST show the total, the per-share amount where it applies, and the amount received by each recipient (each player, the company, and the bank/pool when the game pays them).
- **FR-013**: "Set money to a fixed amount" entries MUST show the previous amount, the new amount, and the difference.
- **FR-014**: Entries with one money movement MUST show the amount in their one-line summary.
- **FR-015**: Automatic and system entries (private income, end-of-round effects, game end, closures, bankruptcy, mergers) MUST be shown with the same breakdown as user entries.
- **FR-016**: Amounts in the history MUST use the game's currency format and MUST match, unit for unit, the changes applied to the game state.
- **FR-017**: Undone entries MUST stay visible, marked as undone, with their breakdown, so the table can see what was removed.

**Compatibility and parity**

- **FR-018**: Sessions saved before this feature MUST load, show the new breakdown for their existing entries (including corrected ones, shown in their latest version), and support the new undo behavior from that point on.
- **FR-019**: Exporting and importing a session MUST preserve the history, undone marks, and resulting state exactly.
- **FR-020**: UI text MUST be in Spanish, using the Uruguayan variant the app already uses.

### Key Entities

- **History entry**: one user intent (or one automatic effect) as shown in the history. It has a time, a source, an optional transcript, a status (active, undone, and corrected for older sessions only), a one-line summary, and a list of movements.
- **Movement**: one change caused by an entry: money moved between two holders, shares moved, a train or private moved, a price change, or a status change. Money movements carry the amount and the before/after balances of the holders involved.
- **Undo point**: the entry chosen in "undo back to here". It and every later active entry are undone together.
- **Holder**: a player, a company treasury, the bank, or the pool (and other game-specific holders), whose balance or holdings an entry can change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any sequence of actions in any supported game, undoing the latest action, or undoing back to any entry, gives a state identical to the state before that entry, in 100% of automated randomized checks.
- **SC-002**: The reported RotLA case (issue, operate, then go back to before the issue) restores the price to the no-issue value in every run.
- **SC-003**: For every entry that moves money, a player can read each recipient's amount and resulting balance from the history in at most 2 taps.
- **SC-004**: Undoing back to the first entry of a 300-entry game finishes, with updated state and history on screen, in under 2 seconds on a typical mid-range phone.
- **SC-005**: In a real playthrough, the table can find a deliberately introduced money mistake using only the history, go back to it in one confirmed step, and continue playing.
- **SC-006**: Sessions saved before this feature open and stay playable with no loss of history, in 100% of saved test sessions.

## Assumptions

- "Undo back to here" includes the chosen entry: the entry where the mistake happened is undone too, so the table can play it again correctly.
- Undone entries cannot be redone. The table plays the actions again.
- The breakdown can be derived from the information the app already records for each entry, so older sessions get it without migration of their meaning.
- The product reference (`docs/spec.md`) will be updated: correcting past entries and out-of-order undo are removed, and "undo back to here" is added.
- The bug assessment for `undo-stale-market-move` is resolved by this feature, because entries are only ever undone newest first, and it needs no separate bug fix.
- Grouping a company's operating turn into one confirm-or-cancel operation is a separate future spec.
