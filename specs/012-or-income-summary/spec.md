# Feature Specification: Operating Round Income Summary

**Feature Branch**: `012-or-income-summary`

**Created**: 2026-10-14

**Updated**: 2026-10-15 (read-only net settlement; the "Cobrado" mark was dropped)

**Status**: Implemented

**Input**: User description: "I want to implement a feature based on my observations from the last match I tested: When operating the companies, players frequently prefer to get their income from their shares at the end of the operating round (including all ORs, before proceeding to the next SR), this is because in most cases players can't do anything with their own money unless a company they own goes broke. So it would be good to have an easy to access screen that shows a summary of what the income for each player was, so at the end of all ORs they can check how much they need to get from the bank. And it would be good to have it accessible in general, so if a company goes broke, users can check their income up to that point and get their money before paying for the companies expenses."

Update: "I don't want to add the 'Cobrado' option, just make it readonly, we already give players their income currently, let's handle this automatically, if during the OR phase they lost money because they had to pay for company assets, we can subtract that from the final summary. So basically the summary should show the difference between the start of the operating phase and the current values, available until the end of the operating phase."

## Background

During operating rounds (ORs), the app credits each player's dividends and private income as
soon as they happen. At the physical table, players often don't take the chips at that moment.
A player's personal cash is rarely needed during ORs, so the table prefers to settle everyone's
money in one go after the last OR, before the next stock round (SR).

Today the app has no place that totals this. The table has to scroll the history or work it out
by hand.

**Operating phase**: the run of consecutive ORs between two other rounds (for example OR 2.1
and OR 2.2 between SR 2 and SR 3). It starts when its first OR starts. It ends when another
round (SR, corporate round, merger round) starts.

**Settlement**: for each player, their cash now minus their cash at the start of the operating
phase. It includes everything the app recorded for that player during the phase: dividends,
private income, money they put into a company (for example toward a train their company could
not afford), and any other change. A positive amount is what the player takes from the bank. A
negative amount is what they pay to the bank.

This works because the table follows one rule during the operating phase: **players don't move
their own chips**. Every change to a player's cash is settled with the bank at the end. The
company's own chips still move as usual.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Settle every player's money at the end of the ORs (Priority: P1)

The last company of the last OR has just operated. Before starting the SR, someone opens the
income summary from the Table screen. It lists every player with the change in their cash since
the operating phase started (for example "+350, take from the bank"), with the chips for that
amount. Each player takes their amount from the bank, and the table starts the SR.

**Why this priority**: This is the core of the request. It replaces adding up income by hand
after every operating phase.

**Independent Test**: In an 1830 session, play an operating phase of two ORs with several
payouts and private income, then open the summary. Each player's amount equals their cash now
minus their cash when OR 1 of that phase started.

**Acceptance Scenarios**:

1. **Given** an operating phase in progress or with its last OR just finished, **When** the user
   opens the income summary from the Table screen, **Then** it lists every player with their
   cash at the start of the phase, their cash now, and the difference.
2. **Given** a player started the phase with 400 and received 140 in OR 3.1 and 210 in OR 3.2,
   **When** the summary is shown, **Then** that player's amount is +350, labeled as money to take
   from the bank, with its chip breakdown.
3. **Given** a player's cash did not change during the phase, **When** the summary is shown,
   **Then** they are listed with 0 and nothing to settle.
4. **Given** an entry recorded during the phase was undone, **When** the summary is shown,
   **Then** the amounts reflect the game without that entry.
5. **Given** every player's amount is 0, **When** the summary is shown, **Then** it is clear
   that nothing needs settling.

---

### User Story 2 - A president pays for their company mid-phase (Priority: P1)

During OR 3.2, a company must buy a train and doesn't have enough money. Its president puts in
the 300 it is missing. The app records it as usual, taking the 300 from the president's cash. The
president doesn't touch their chips: the company hands its own chips to the bank for the train,
and the president's share is settled at the end. They had earned 200 in dividends so far, so at
the end of the phase the summary shows −100: they pay 100 to the bank.

**Why this priority**: The user named this case. Handling it automatically means no mark,
no extra step and no chance of collecting the same money twice.

**Independent Test**: Run an operating phase where a player earns 200 in dividends and then puts
300 into a company. At the end, the summary shows −100 for that player, labeled as money to pay
to the bank.

**Acceptance Scenarios**:

1. **Given** a player earned 200 and then put 300 into a company during the phase, **When** the
   summary is shown, **Then** that player's amount is −100, labeled as money to pay to the bank,
   with its chip breakdown.
2. **Given** a president is about to put money into a company mid-phase, **When** they open the
   summary, **Then** it shows their amount so far, so the table can see what they have earned
   before deciding.
3. **Given** a player sold shares during the phase (for example to raise money for their
   company), **When** the summary is shown, **Then** the sale money is part of their amount like
   any other change.

---

### User Story 3 - See where a player's amount came from (Priority: P2)

A player doubts their amount. The user expands that player's row and sees the movements that
make it up, grouped by OR: dividends from each company, private income, money put into a
company, and other changes.

**Why this priority**: It makes the amount easy to check and trust, but the amount alone is
enough to settle.

**Independent Test**: Expand a player's row after an operating phase with payouts, private
income and a contribution to a company. The listed movements add up exactly to the amount.

**Acceptance Scenarios**:

1. **Given** a player's row in the summary, **When** the user expands it, **Then** it lists the
   phase's movements for that player, grouped by OR, each with its source and amount, and they add
   up to the shown amount.
2. **Given** a player received 60 in dividends from one company and 20 in private income in
   OR 2.1, **When** their row is expanded, **Then** both appear under OR 2.1 with their source.

---

### User Story 4 - Find the summary fast, only while it applies (Priority: P2)

During the operating phase, the summary is one tap away from the Table screen. When the last OR
of the phase is over, the Table makes the summary stand out as the step before starting the next
round. Once the next round starts, the summary is no longer offered.

**Why this priority**: It makes the main flow easier and helps the table not forget, but the
summary is useful without it.

**Independent Test**: During an OR, open the summary from the Table in one tap. Finish the last
OR and check the summary is highlighted. Start the SR and check the summary is no longer offered.
Undo the SR start and check it is offered again.

**Acceptance Scenarios**:

1. **Given** an OR is in progress, **When** the user looks at the Table screen, **Then** the
   summary opens in at most 2 taps.
2. **Given** the last OR of the phase is over and the next round has not started, **When** the
   user looks at the Table screen, **Then** the summary is offered prominently next to starting
   the next round. Nothing blocks starting the next round.
3. **Given** the next round (SR, corporate round or merger round) has started, **When** the user
   looks at the Table screen and the menu, **Then** the summary is not offered.
4. **Given** the game has had no OR yet, **When** the user looks at the Table screen, **Then**
   the summary is not offered.

### Edge Cases

- **Starting cash**: the cash a player had when the first OR of the phase started, after any
  end step of the round before it.
- **ORs back to back with no other round between them** (a new set started straight from an OR):
  they all belong to the same operating phase.
- **A player goes bankrupt during the phase**: their cash went to the bank under the game's rules.
  The summary shows them as out of the game, with no amount to settle.
- **A player moved their own chips during the phase anyway** (for example they took a dividend
  at once): the summary doesn't know. The movement list (US3) lets the table spot and adjust it.
  The summary states the rule it assumes.
- **Manual corrections of a player's cash** during the phase ("Fijar dinero", "Cobrar del banco",
  payments between players): they are part of the difference, like any other change.
- **Money between two players** during the phase: each side's amount includes it, and the two
  settle with the bank. In total nothing changes.
- **Undo across the start of the phase** (undoing the OR start): the summary is no longer offered,
  or it is computed from the earlier phase start if the game is back in an earlier phase.
- **Unlimited-bank games**: the summary still works. Chip breakdowns follow the table's chips as
  they do elsewhere.
- **Old sessions** saved before this feature: the summary works from their history with no
  migration.
- **RotLA, 21Moon and other games with their own round names**: the operating phase ends when any
  non-operating round starts, whatever the game calls it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide an income summary that lists every player with their cash at
  the start of the current operating phase, their cash now, and the difference.
- **FR-002**: The difference MUST include every change to the player's cash recorded during the
  phase, whatever its source, and MUST match the app's balances to the unit.
- **FR-003**: Each amount MUST say clearly whether the player takes it from the bank (positive) or
  pays it to the bank (negative), in words and not by color alone.
- **FR-004**: The summary MUST show the chip breakdown for each amount, using the same
  change-making as other bank flows in the app.
- **FR-005**: The summary MUST let the user see the movements behind a player's amount, grouped by
  OR, each with its source (dividends of a named company, private income, money put into a
  company, share sale, other). The movements MUST add up to the amount.
- **FR-006**: The summary MUST be read-only. It MUST NOT record anything in history or change
  balances, holdings or the market.
- **FR-007**: The summary MUST be computed from the game history, counting only entries still in
  effect, so it updates on every new entry and every undo.
- **FR-008**: The summary MUST be offered only during an operating phase: from the start of its
  first OR until another round starts. Outside it, the app MUST NOT offer the summary.
- **FR-009**: During the operating phase, the summary MUST open from the Table screen in at most
  2 taps.
- **FR-010**: When the last OR of the phase is over and the next round has not started, the Table
  screen MUST make the summary stand out. It MUST NOT block or add a step to starting the next
  round.
- **FR-011**: The summary MUST state the rule it assumes: players don't move their own chips during
  the operating phase.
- **FR-012**: A player who went bankrupt during the phase MUST be shown as out of the game, with no
  amount to settle.
- **FR-013**: All labels MUST be in Spanish, using Uruguayan usage (for example "Ingresos de las
  ORs", "Cobra del banco", "Paga al banco").
- **FR-014**: The summary MUST work for every built-in game (1830, 1848, 21Moon, Railways of the
  Lost Atlas) and for custom games.
- **FR-015**: The layout MUST work on phone portrait and tablet landscape, with touch targets of
  at least 48 px.

### Key Entities

- **Operating phase**: a run of consecutive ORs between two other rounds. It has a start point
  (when its first OR started) and is current until another round starts.
- **Player settlement**: per player, their cash at the phase start, their cash now and the
  difference, with its direction (take from or pay to the bank). Derived, never stored.
- **Settlement movement**: one change to a player's cash during the phase, with its OR, source
  and amount. Derived from history, never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At the end of an operating phase, the table can see how much every player must take
  from or pay to the bank in under 15 seconds, without adding anything up by hand.
- **SC-002**: In test games covering all built-in games, each player's amount equals, to the unit,
  their cash now minus their cash at the phase start, including after undos.
- **SC-003**: In each test, a player's movements add up exactly to their amount.
- **SC-004**: During an operating phase, the summary opens in at most 2 taps from the Table
  screen. Outside one, it is never offered.
- **SC-005**: In a playtest where players don't touch their chips during ORs, the table settles
  through the summary only, and physical cash matches the app's at the start of the next SR.

## Assumptions

- The app keeps crediting and debiting players at the moment of each entry, as today. The
  summary only helps the table settle physical chips later.
- During an operating phase, players don't move their own chips. Everything is settled with the
  bank at the end (user, 2026-10-15). Tables that pay players at once can ignore the summary.
- No collection mark, nothing recorded in history, no reminders about earlier phases (user,
  2026-10-15).
- The existing notices after each entry (with chip breakdowns) stay as they are.
- Voice access to the summary is not required. Touch is enough (constitution V requires every
  capability by touch, not by voice).
- `docs/spec.md` will be updated to describe the summary when this feature is built.
