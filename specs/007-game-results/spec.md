# Feature Specification: Game Results Screen

**Feature Branch**: `007-game-results`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "I'm not sure if we have it but it would be good to implement a result screen once a game is completed (based on the game rules) and display the players in a rank kind of format with the final money they had (counting cash money and shares priced at the final share price). And also add the option to revisit that screen from the main page, so if a previous game was completed we identify it as such in the main page and tapping on it takes you to the results page for that match. This ranking should also account for players that were eliminated during the match since they automatically lose and are ranked last in most variations of the game (depends on the rules)"

## Background

Part of this already exists, but only for Railways of the Lost Atlas (RotLA):

- **Score sheet ("Puntuación")**: a read-only sheet on the Table screen. It shows each player's rank, cash, share value at the current price, and total. It also shows the tie-break when one was needed and lists eliminated players last with no total. It opens by itself when a RotLA game ends (all cycles done, bank broken at the end of an OR set, or a bankruptcy). Players can also open it from a button that is offered only in RotLA.
- **Game-end warnings**: for 1830, 1848, and 21Moon the app shows the game-end conditions that have been met (bank broken, top cell reached, loans issued, takeovers, last round, bankruptcy) as warnings only. Under the constitution the table decides when the game is over, so nothing in these games marks the game as ended or offers the results.
- **Home list**: every stored session looks the same. Tapping a session always opens its Table. Nothing shows whether a game is finished.

This feature turns the RotLA-only score sheet into a results screen for every game. It records when a game is finished and makes finished games visible and reviewable from Home.

How the rulebooks treat a bankrupt player differs by game, so the ranking must follow each game's rules:

| Game | Bankrupt player | Source |
|------|-----------------|--------|
| 1830 (Classic) | The game ends at once. The bankrupt player is still scored on the shares they could not sell and "can win". | 1830 rules C-2.5 note, p. 28 |
| 21Moon | "Out of the game": their money goes to the bank and their stock to the pool. | 21Moon rules §11.7–11.8.1 |
| RotLA | Usually ends the game. If the others play on, the player is removed from the game. They are ranked last, with no total. | RotLA base rules, Bankruptcy and End of Game |
| 1848 | Player bankruptcy is not part of this game's rules in the app. | — |

Some games also value shares or end the game in their own way:

- **21Moon** has a fixed length, like RotLA. It ends after its 11th OR, because the last round has 3 ORs instead of 2 (user, 2026-10-10).
- **21Moon** values each share at its current price plus 50 for each East-West bonus token its company holds (21Moon rules §13; user, 2026-10-10).
- **1830 Classic**: a bankrupt player keeps the cash and shares they could not sell. Those are what they are scored on (1830 rules C-2.5 note; user, 2026-10-10).
- **1848**: a player's outstanding loans are not subtracted from their final wealth. Taking a loan already lowers the company's share price during the game. Bank of England (BoE) shares count toward wealth at the final price shown on the BoE loan track, not on the share price chart (user, 2026-10-10).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the final ranking when a game ends (Priority: P1)

The last round of a game finishes, or the table decides the game is over. The players see one results screen that ranks every player by final wealth: personal cash plus every share they hold valued at its company's final share price. The winner is clearly marked. Eliminated players appear where the game's rules place them.

**Why this priority**: This is the core of the request. Without it, the table still has to add up wealth by hand for 1830, 1848, and 21Moon.

**Independent Test**: In a 1830 game where the bank has broken, end the game and confirm. The results screen opens and lists every player with cash, share value, and total, in rank order, with the leader marked as the winner. The totals match a hand count.

**Acceptance Scenarios**:

1. **Given** a RotLA game whose last cycle has just completed, or a 21Moon game whose 11th OR has just completed, **When** the game reaches its end, **Then** the game is marked finished and the results screen opens on its own (as the RotLA score sheet does today).
2. **Given** an 1830, 1848, or 21Moon game, **When** a player chooses "Terminar partida" and confirms, **Then** the game is marked finished and the results screen opens.
3. **Given** a game where game-end conditions have fired, **When** the players look at the Table, **Then** "Terminar partida" stands out as the suggested next step but does nothing until someone taps it.
4. **Given** the results screen is open, **When** the players read it, **Then** each row shows rank, player name, cash, share value, and total, and the first-ranked player is marked as the winner.
5. **Given** two players with equal totals, **When** the results are shown, **Then** the tie is broken by the game's tie-break rule where it has one (RotLA: president of the company acting earliest), the reason is shown, and otherwise the players share the rank.
6. **Given** a game was marked finished by mistake, **When** the player undoes "Terminar partida", **Then** the game is no longer finished and play can continue.

---

### User Story 2 - Eliminated players ranked by each game's rules (Priority: P1)

A player went bankrupt during the game. The results screen places them according to the game's rules. Where the rules remove them from the game, they appear below every active player, labeled "Eliminado" and with no total. Where the rules still score them (1830), they are ranked by their remaining wealth like everyone else, and the label shows they went bankrupt.

**Why this priority**: The user called this out explicitly. A wrong winner on the results screen undermines the whole feature.

**Independent Test**: In a 21Moon game, declare a player bankrupt and end the game. That player is listed last as "Eliminado" with no total. Do the same in a 1830 game. The bankrupt player is ranked by the value of their unsold shares and is marked as bankrupt.

**Acceptance Scenarios**:

1. **Given** a game whose rules remove bankrupt players (21Moon, RotLA), **When** the results are shown, **Then** every eliminated player is listed after all active players, marked "Eliminado", with no rank number and no total.
2. **Given** a game whose rules still score a bankrupt player (1830), **When** the results are shown, **Then** that player is ranked by their cash plus remaining shares like any other player and carries a "Quiebra" marker.
3. **Given** several eliminated players in a game that removes them, **When** the results are shown, **Then** they are listed in the order they went bankrupt, the most recent first. A player who outlasted another places above them.
4. **Given** every player but one is eliminated, **When** the results are shown, **Then** the remaining player is the winner.

---

### User Story 3 - Finished games recognizable on Home and reopened to their results (Priority: P2)

On Home, the player sees which stored games are finished and who won each one. Tapping a finished game opens its results screen, not the Table. From the results, the player can still open the game's Table if they need to look at or correct something.

**Why this priority**: This lets the group look back at past results. It depends on User Story 1 recording that a game is finished.

**Independent Test**: Finish a game, return to Home, and reload the app. The game's row shows a finished marker and the winner. Tapping it opens the results screen with the same ranking that was shown when the game ended.

**Acceptance Scenarios**:

1. **Given** Home lists finished and unfinished games, **When** the player looks at the list, **Then** each finished game shows a "Completa" marker (as text, not only color) and the winner's name, and unfinished games look as they do today.
2. **Given** a finished game on Home, **When** the player taps it, **Then** the results screen for that game opens and shows the same ranking and values as at game end.
3. **Given** the results screen was opened from Home, **When** the player chooses to open the game, **Then** the Table opens for that game, and undoing the game end there returns it to unfinished.
4. **Given** the results screen was opened from Home, **When** the player goes back, **Then** they return to Home.
5. **Given** the last session ("Continuar") is a finished game, **When** the player taps "Continuar", **Then** the results screen opens.
6. **Given** a finished game is exported and imported on another device, **When** it appears on Home there, **Then** it is shown as finished with the same results.

---

### User Story 4 - Reopen a game that was ended by mistake (Priority: P2)

The table ends a game too early, or the app ends it on its own and a mistake is spotted afterwards, such as a dividend recorded wrong in the last OR. From the results screen, a player chooses "Reabrir partida" and confirms. The game is no longer complete, the Table opens, and they can fix entries and keep playing. This works right after the end and also days later from Home.

**Why this priority**: Ending the game freezes the results that the group sees and that Home remembers. If that cannot be reversed, a single wrong tap or an end reached on a wrong entry leaves a wrong winner on record.

**Independent Test**: Finish a RotLA game, which ends on its own, and then reopen it from the results screen. The game is no longer marked complete, the Table opens, and it does not end again right away. Undo the last dividend, record it again, and finish the game again. The results reflect the corrected dividend.

**Acceptance Scenarios**:

1. **Given** the results screen of a complete game, opened right after the end or from Home, **When** the player chooses "Reabrir partida" and confirms, **Then** the game is no longer complete, the Table opens, and Home no longer shows it as "Completa".
2. **Given** a game that ended on its own (RotLA, 21Moon), **When** it is reopened, **Then** it does not end on its own again until a new entry is recorded that takes the game from not meeting its end condition to meeting it (for example, undoing the last dividend and recording it again). Until then, "Terminar partida" is offered as the suggested next step.
3. **Given** a reopened game, **When** the player looks at the history, **Then** both the end and the reopening are shown as entries, and nothing that happened before them is lost or changed.
4. **Given** a reopened game, **When** it is ended again (automatically or with "Terminar partida"), **Then** the results reflect the game as it stands at the new end.
5. **Given** the "Reabrir partida" confirmation, **When** the player cancels, **Then** the game stays complete and the results do not change.

---

### Edge Cases

- **Ending a game with no end condition met**: allowed (the table wins). The confirmation notes that no game-end condition has fired yet.
- **Undo after finishing**: undoing the game end entry right after it is recorded makes the game unfinished again, the same as "Reabrir partida". Home stops showing it as finished.
- **Reopening an automatic end, then undoing entries**: if the player undoes entries after reopening and records them again, the game ends on its own again only when a newly recorded entry reaches the end.
- **Undoing the reopening**: undoing "Reabrir partida" makes the game complete again, with the same results as before.
- **Actions after finishing**: the app does not block further entries (it never blocks the table). An entry made after the end does not silently change the stored results. The results always show the state at the moment the game was ended. If later entries exist, the results screen says so.
- **Shares of a company with no price** (never started, closed, or removed): they count as zero and are not listed as value.
- **Company treasuries, trains, privates, and loans**: they do not count toward any player's wealth. In 1848, outstanding loans are not subtracted from any player's total.
- **1848 Bank of England shares**: valued at the BoE's final price on its loan track, not on the share price chart.
- **21Moon ended early by the table** (before the 11th OR): allowed through "Terminar partida", like any other game.
- **Negative cash or totals**: shown as they are, never clamped to zero.
- **Old sessions** created before this feature that already reached a RotLA game end: they are recognized as finished, because the end is derived from their history. Each session keeps the copy of the game definition it was created with, so sessions from before this feature take their ranking rules (elimination, tie-break, share bonus) and the list of conditions that end the game on its own from the current built-in game they are based on. The rest of their stored copy is unchanged, which has these effects:
  - RotLA games already in progress keep ending on their own as they do today.
  - 21Moon games created before this feature do not end on their own after the 11th OR, because their stored copy lacks that end condition. The table ends them with "Terminar partida".
  - A bankruptcy recorded in a 1830 Classic game created before this feature still sends the player's holdings to the pool, as it did when the game was created.
- **A finished game deleted from Home**: it uses the existing delete flow. Nothing changes.

## Requirements *(mandatory)*

### Functional Requirements

**Ending a game**

- **FR-001**: The system MUST mark a game as finished when its game definition ends it automatically (RotLA when its cycles are complete, its bank breaks at the end of an OR set, or a bankruptcy ends it; 21Moon when its 11th OR, the last OR of its final round, is complete).
- **FR-002**: For every game, the system MUST offer a "Terminar partida" action on the Table, by touch and by voice. After a confirmation, it marks the game as finished.
- **FR-003**: When one or more game-end conditions have fired, the system MUST show "Terminar partida" as the suggested next step. It MUST NOT end the game without the player's confirmation, except in the automatic cases in FR-001.
- **FR-004**: Ending a game with "Terminar partida" MUST be recorded in the game's history as one entry that can be undone in one tap like any other action. Undoing it MUST make the game unfinished again. An automatic end (FR-001) has no entry of its own: it is attached to the entry that reached it, History marks that entry as the end, and undoing that entry undoes the end.
- **FR-005**: Ending or reopening a game MUST NOT move any money or shares.

**Reopening a game**

- **FR-005a**: The results screen of a complete game MUST offer "Reabrir partida". After a confirmation, it makes the game not complete and opens its Table. This MUST work whether the game ended on its own or through "Terminar partida", and whether the results were opened right after the end or later from Home.
- **FR-005b**: Reopening MUST be recorded in the game's history as its own entry. It never deletes or rewrites the end entry or any earlier entry, and it can be undone in one tap like any other action.
- **FR-005c**: After a game that ended on its own is reopened, the system MUST NOT end it on its own again until a new entry, recorded after the reopening, takes the game from not meeting its automatic end condition to meeting it. An entry recorded while the condition still holds does not end the game. Until then it MUST offer "Terminar partida" as the suggested next step.

**Results screen**

- **FR-006**: When a game becomes finished, the system MUST open the results screen.
- **FR-007**: The results screen MUST list every player of the game with rank, name, cash, share value, and total. The total is cash plus, for each company, the player's shares times that company's final share price. A company whose price lives on its own track (1848 Bank of England: the loan track) is valued at its final price on that track. Player debt is not subtracted unless a game's rules say so (none of the current games do).
- **FR-008**: The results screen MUST clearly mark the winner or winners (rank 1).
- **FR-009**: Ties MUST be broken by the game's tie-break rule when the game defines one, and the reason MUST be shown. Otherwise tied players share the rank.
- **FR-010**: How bankrupt players are ranked MUST come from each game's definition, with two behaviors:
  - **Removed from the game** (21Moon, RotLA): listed after every active player, marked "Eliminado", with no rank number and no total. Among themselves, the player eliminated later is listed first.
  - **Still scored** (1830): ranked by cash plus the shares they still hold, like other players, and marked "Quiebra".
- **FR-011**: Each game's elimination rule MUST be taken from its rulebook. A game whose rule has not been verified MUST default to "removed from the game" and be marked as unverified in its definition.
- **FR-012**: The values on the results screen MUST be those of the game at the moment it was ended. Later entries MUST NOT silently change them, and the screen MUST say when entries exist after the end.
- **FR-013**: The results screen MUST work on phone portrait and tablet landscape, with touch targets of at least 48 px, and MUST NOT rely on color alone to mark the winner or eliminated players.
- **FR-014**: The existing RotLA "Puntuación" view MUST be replaced by, or become the same as, the results screen, so there is one results view for all games. Before the game ends it shows a provisional ranking, labeled as such.

**Home**

- **FR-015**: Home MUST mark each finished game in the session list with a "Completa" text label and the winner's name, or names on a shared win.
- **FR-016**: Tapping a finished game on Home, or "Continuar" when the last session is finished, MUST open that game's results screen.
- **FR-017**: From a results screen opened from Home, the player MUST be able to open the game's Table and to go back to Home.
- **FR-018**: Whether a game is finished MUST survive reloads and app restarts, and MUST carry over through export and import.

### Key Entities

- **Game end**: an entry in the game's history recording that the table ended the game, or, for an automatic end under the rules, the entry that reached the end, marked as such. It has a time and an optional list of the game-end conditions that had fired. It can be undone.
- **Game reopening**: an entry in the game's history recording that a complete game was reopened. It cancels the most recent game end without removing it from the history, and it can itself be undone.
- **Final result**: for each player, their cash, share value, total, rank, elimination status, and any tie-break reason. It is computed from the game state at the game end, not stored separately.
- **Elimination rule** (per game definition): whether a bankrupt player is removed from the game (ranked last, no total) or still scored on their remaining wealth.
- **Session summary** (Home list): gains a finished flag and the winner names, so Home can show them without opening the game.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every supported game (1830, 1848, 21Moon, RotLA), a finished game shows a ranking whose totals match a hand count of cash plus shares at final prices in 100% of test scenarios.
- **SC-002**: In every test scenario with bankrupt players, the eliminated players are placed as each game's rulebook says, with no false winners.
- **SC-003**: From the Table, once a game-end condition has fired, a player can end the game and see the results in at most 2 taps (the suggested "Terminar partida" and its confirmation). Ending a game before any condition has fired is not a common action and may take one more tap through the menu.
- **SC-004**: From Home, a player can reach any finished game's results in 1 tap, and can tell finished games from unfinished ones without opening any of them.
- **SC-005**: After a reload, an app restart, or an export and import, 100% of finished games are still shown as finished with the same results.
- **SC-006**: A game ended by mistake, whether by the table or on its own, can be reopened from its results screen in at most 2 taps (reopen and confirm), with no change to any money or share holdings, and it stays open until the game is ended again.

## Assumptions

- "Final share price" means each company's current position on the stock market when the game is ended. Companies with no price contribute zero.
- Only player cash and player-held shares count toward wealth. Company treasuries, trains, privates, and loans do not, which matches the 1830, 1848, and RotLA rules. Player debt is never subtracted in the current games (1848 confirmed by the user, 2026-10-10).
- The 1848 rulebook has no player-bankruptcy elimination. If a game definition later allows it, FR-011's default applies.
- 21Moon ends after its 11th OR (confirmed by the user, 2026-10-10). Its bankrupt players are "removed from the game" (§11.7: "out of the game").
- Ending a game is a new kind of recorded entry in the game history. It does not move money or shares, so money invariants are unaffected.
- The existing score calculation for RotLA (cash plus shares at current price, tie-break, eliminated last) is the starting point and is extended, not replaced, for the other games.
- Custom games use the elimination rule and tie-break of the game they are based on, or the defaults (removed from the game; shared ranks) if none is defined.
- Text shown to players stays in Spanish, like the rest of the app.
