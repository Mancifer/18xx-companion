# Feature Specification: Player and Company History, Last Run Revenue

**Feature Branch**: `017-entity-history-revenue`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "I want to implement a feature that came out before in one of the specs and I rejected it at the time to reduce complexity, however, now that the app is in a better place we can afford to do this. Basically, the idea is to add a button to check the history based on players and companies. So let's say I tap the player tile, and there's a button that says History inside the Player sheet, if I tap that, it shows me the history but only with the entries that are relevant to the player (shares they bought, incomes from ORs, actions over the players for adjustments and the like, etc). Same for companies, so we can easily reconstruct what happend to a particular company without having to review the whole history. This is based on personal experience when testing the application, many times we had to check how much a company made, or in one case we had to trace back different actions to find how some money ended up on the company. Finally, for companies, one related thing that I would like to add is the amount companies generated during the last OR, visible on the company tile and the company sheet, that value, along with trains, is detrimental to take decisions when buying and selling shares, but also to easily know how much money the company made last time in case you haven't made any change to the tracks that could grant you extra."

**Related decision**: feature 010 (Reliable Play History) left out filtering the history by player
or company. Its reason was that "the table reads the history as a timeline, and undoing from a
filtered view would be confusing". This feature adds that filter. It keeps the full History as the
only place where undo happens (see FR-008), so that concern still holds.

## Clarifications

### Session 2026-11-09

- Q: Are the defaults acceptable (read-only filtered histories, "last OR" = most recent run,
  undone entries listed)? → A: Yes.
- Q: Does a company formed or grown by a RotLA merger show the last run of the minors merged into
  it? → A: No. It would not be accurate, and leaving it out is simpler. The company shows no last
  run revenue until it runs itself.

## Overview

During real games the table often needs the story of one player or one company, not the whole
game:

- "How much did the B&O make last time?"
- "How did the PRR end up with 320 in the treasury?"
- "Why does Ana have 40 less than she thinks?"

Today the only answer is to scroll the full History, which in a long game holds well over a
hundred entries, and open entries one by one.

This feature adds two things:

1. **A history for one player or one company.** It opens from the player sheet or the company
   sheet. It shows only the entries that touched that player or company, in the same timeline
   layout as the full History.
2. **Last run revenue on every company.** The amount the company's trains made the last time it
   ran, shown next to its trains on the company card and in the company sheet. Players use it,
   with the trains, to decide what to buy and sell. It also lets the table repeat a run that did
   not change.

**Out of scope**:

- Undoing from the player or company history (see FR-008).
- Histories for the bank, the pool or a private company.
- Free-text search, or filters by action type, round or amount.
- Totals, charts or statistics (for example "total dividends received this game"). Feature 012
  already covers the per-phase settlement.
- Revenue from earlier runs beyond the last one, other than by reading the company's history.
- Asking for a player or company history by voice. Voice can still answer questions about state
  as it does today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trace what happened to a company (Priority: P1)

The PRR has more money than the table expects. Someone taps the PRR card, then "Historial" in the
company sheet. The app shows only the entries that touched the PRR: its par, the shares players
bought from its IPO, its runs and payouts, the trains it bought, money moved in or out by hand,
price moves and status changes. The table finds the entry where the money came in by reading a
dozen entries instead of the whole game.

**Why this priority**: This is the reported case. Tracing a company's money through the full
History took the table a long time and was error-prone.

**Independent Test**: In an 1830 session, play two stock rounds and two ORs with several
companies. Open the PRR's history. It lists every entry that moved PRR money, PRR shares, PRR
trains, the PRR price or the PRR status, and nothing else.

**Acceptance Scenarios**:

1. **Given** a session in progress, **When** the user opens a company sheet, **Then** it offers
   "Historial" for that company.
2. **Given** the company history, **When** it opens, **Then** it lists, newest first, every entry
   with at least one movement involving that company: money in or out of its treasury, any
   transfer of its shares (between any holders), a change to its share price, trains it gained or
   lost, privates it gained or lost, a change to its status (floated, receivership, closed) and
   any counter kept for it (loans, tokens).
3. **Given** the company history, **When** an entry did not involve that company, **Then** it is
   not listed. For example another company's payout is not listed, even when the same players
   received money from both.
4. **Given** a player bought a PRR share from the pool, **When** the user opens the PRR history,
   **Then** that entry is listed, because PRR shares moved, even though no PRR money moved.
5. **Given** the company history, **When** the user taps an entry, **Then** it expands the same
   way as in the full History ("Movimientos", "Saldos", transcript, warnings), with the company's
   own movements and balance shown first.
6. **Given** the company history, **When** it is shown, **Then** it keeps the round sections of
   the full History ("Ronda de operaciones 2.1 · terminada" and so on). It shows only the
   sections that hold at least one listed entry.
7. **Given** a company that has not been touched by any entry yet, **When** the user opens its
   history, **Then** it shows a short empty message instead of a blank screen.

---

### User Story 2 - See a company's last run revenue at a glance (Priority: P1)

During a stock round, a player is deciding whether to buy into the B&O. Its card shows its
trains and "Última corrida 160". They don't need to ask the president or open the History. If
they want to know whether it paid out, the company sheet says so. During an OR, the B&O president sees the same 160 and, since their track did not change,
records the same run.

**Why this priority**: The user calls this value decisive for buying and selling. It is read
every stock round, by every player.

**Independent Test**: In an 1830 session, run the B&O for 160 and pay out, then run it for 0 and
withhold in the next OR. After each run the B&O card and sheet show that run's revenue and how it
was paid. Undo the second run: they show 160 again.

**Acceptance Scenarios**:

1. **Given** a company that has run at least once, **When** the user looks at its card on the
   Table screen, **Then** the card shows the revenue of its most recent run, next to its trains.
2. **Given** the same company, **When** the user opens its sheet, **Then** the sheet shows that
   revenue, how it was paid (full payout, withheld or half), and which OR it was in (for example
   "OR 2.1").
3. **Given** a company that has never run, **When** it is shown, **Then** no revenue appears. It
   does not show 0, which would read as a run that made nothing.
4. **Given** a run of 0 (no trains, or no route), **When** it is recorded, **Then** the company
   shows 0 as its last run revenue.
5. **Given** a new OR has started and the company has not operated yet in it, **When** it is
   shown, **Then** it still shows its previous run, labeled with that run's OR, until it runs
   again.
6. **Given** the last run is undone, **When** the company is shown again, **Then** it shows the
   run before it (or nothing, if there is none).
7. **Given** a game whose revenue has several parts (21Moon: local and space port), **When** the
   company runs, **Then** the card shows the total of all parts and the sheet also lists each
   part.
8. **Given** a closed company, **When** it is shown, **Then** no revenue appears, as with its
   other operating values.
9. **Given** a RotLA merger whose minors had run, **When** the resulting company is shown before
   it has run itself, **Then** no revenue appears. It does not take any minor's last run.

---

### User Story 3 - Trace what happened to a player (Priority: P2)

A player thinks their cash is off. Someone taps their player tile, then "Historial" in the player
sheet. The app lists only the entries that touched that player: shares they bought or sold,
dividends and private income they received, money they put into a company, transfers and
adjustments made to their money, privates and certificates they gained or lost. The table finds
the step where the money went.

**Why this priority**: Same need as US1, but players' money is checked less often than
companies'. During ORs, feature 012's settlement already explains most changes to a player's
cash.

**Independent Test**: In an 1830 session, play a stock round and an OR, then make a manual
adjustment to one player. Open that player's history. It lists every entry that moved their money,
shares, certificates or privates, including the adjustment, and nothing else.

**Acceptance Scenarios**:

1. **Given** a session in progress, **When** the user opens a player sheet, **Then** it offers
   "Historial" for that player.
2. **Given** the player history, **When** it opens, **Then** it lists, newest first, every entry
   with at least one movement involving that player: money they received or paid (dividends,
   private income, share purchases and sales, transfers, set-money adjustments, money toward a
   company's train), shares or certificates they gained or lost, privates they gained or lost,
   presidencies they gained or lost and any counter kept for them.
3. **Given** a company payout where the player held no shares, **When** the user opens that
   player's history, **Then** the payout is not listed.
4. **Given** a set-money adjustment on the player, **When** the user expands it in their history,
   **Then** it shows their money before → after, as in the full History.
5. **Given** the player history, **When** it is shown, **Then** it uses the same sections,
   expansion and empty message as the company history (US1).

---

### User Story 4 - Move from a filtered history to the full timeline (Priority: P3)

The table has found the wrong entry in the PRR history and wants to fix it. The filtered view
does not undo. Instead, the entry offers "Ver en el historial completo". It opens the full History
at that entry, where "Deshacer hasta acá" works as today and the confirmation shows every entry
that will be undone, including the ones that did not involve the PRR.

**Why this priority**: Fixing a mistake is the next step after finding it, but undo already
exists. This story only connects the two screens.

**Independent Test**: Open a company history, expand an older entry, choose "Ver en el historial
completo". The full History opens with that entry visible and expanded. Its undo options are the
usual ones.

**Acceptance Scenarios**:

1. **Given** an expanded entry in a player or company history, **When** the user chooses "Ver en
   el historial completo", **Then** the full History opens scrolled to that entry, with it
   expanded.
2. **Given** a player or company history, **When** it is shown, **Then** no entry offers
   "Deshacer" or "Deshacer hasta acá".
3. **Given** the full History reached this way, **When** the user goes back, **Then** they return
   to the sheet or screen they came from, as with any other screen.

---

### Edge Cases

- **Undone entries**: they are listed in the player or company history when they involved that
  player or company, marked "deshecha" as in the full History. They are judged by the movements
  they had when they were active.
- **Automatic effects**: an entry and the automatic effects it triggered (feature 003, end of
  round) appear as they do in the full History. The entry is listed when either the action or its
  effects involved the player or company.
- **Entries with no movements** (notes, turn changes, round starts): not listed. The one
  exception is an entry that passes the turn to the company, which is listed in that company's
  history. Notes are free text and are never matched to a player or company. Round boundaries are
  still shown as section headers.
- **Merged or converted companies** (RotLA mergers, 1848 exchanges): the history of each company
  involved lists the merger entry. Entries from before the merger stay under the company they
  happened to. A company resulting from a merger does not take a last run revenue from the
  companies merged into it. Its own runs from before the merger, if any, still count (FR-017).
- **Company that changes hands**: the company history shows every president, since it follows
  the company, not the player.
- **Session finished** (feature 007): both histories stay available, read-only, like the full
  History.
- **Old sessions** imported or saved before this feature: both histories and the last run revenue
  work from their existing entries, with no migration.
- **Bank with unlimited money**: it never appears as a filter subject. Bank balances in the
  expansion follow the full History's rules.
- **Last run in games with special runs**: a national company (the 1848 Bank of England) has
  no run of its own, so it never shows a last run revenue. When the turn passes from a company
  that did not record a run, the app records a run of 0 ("no corrió"), and that counts as its last
  run. A company that only receives money without a run (bank pays, loans) keeps its previous run
  revenue.
- **Company runs twice in one OR** (recorded out of turn, or after an undo): the most recent
  active run counts.

## Requirements *(mandatory)*

### Functional Requirements

**Player and company history**

- **FR-001**: The player sheet MUST offer "Historial", opening that player's history.
- **FR-002**: The company sheet MUST offer "Historial", opening that company's history.
- **FR-003**: A player history MUST list exactly the entries that involve the player: any
  movement of money to or from them, any share, certificate, private or presidency they gained or
  lost, and any counter kept for them.
- **FR-004**: A company history MUST list exactly the entries that involve the company: any
  movement of money to or from its treasury, any transfer of its shares between any holders, any
  change to its price, trains or privates it gained or lost, any change to its status, any
  counter kept for it, or a turn change to it.
- **FR-005**: Both histories MUST use the full History's layout: newest first, round sections
  (only those holding a listed entry), undone entries marked, and the same entry expansion.
- **FR-006**: In an expanded entry, the movements and balance of the history's subject MUST be
  shown first, and stand out from the rest. The other movements MUST still be shown, so the
  table sees where the money came from or went.
- **FR-007**: The title of each history MUST name its subject, with the player's name or the
  company's badge.
- **FR-008**: Player and company histories MUST be read-only. They MUST NOT offer "Deshacer" or
  "Deshacer hasta acá". Every expanded entry MUST offer "Ver en el historial completo", which
  opens the full History at that entry, expanded.
- **FR-009**: When no entry involves the subject, the history MUST show a short message saying
  so.
- **FR-010**: Both histories MUST follow the ledger. Every time an entry is added or undone,
  they show the change the next time they are opened or while they are open.

**Last run revenue**

- **FR-011**: Each company's last run revenue MUST be the total revenue of its most recent active
  run, summing every revenue part the game defines.
- **FR-012**: Every company card on the Table screen MUST show the last run revenue next to the
  company's trains, labeled so it is not read as cash.
- **FR-013**: The company sheet MUST show the last run revenue with how it was paid (full,
  withheld, half), the OR it happened in and, in games with several parts, each part's amount.
- **FR-014**: A company that has never run MUST show no revenue. A run of 0 MUST show 0.
- **FR-015**: After an undo, the last run revenue MUST be the one from the most recent run that is
  still active.
- **FR-016**: Closed companies MUST NOT show a last run revenue.
- **FR-017**: A merger MUST NOT pass a last run revenue from the merged companies to the resulting
  company. The resulting company shows only its own runs: none until it runs, if it is new.

**General**

- **FR-018**: Every new label MUST be available in Spanish (Uruguayan usage) and English, in the
  display language.
- **FR-019**: These features MUST NOT add or change recorded game events. Both are derived from the
  existing entries, including entries written by older versions.
- **FR-020**: New controls MUST meet the existing touch rules: at least 48 px targets, and
  companies always shown with their name alongside their color.
- **FR-021**: `docs/spec.md` MUST be updated to describe both histories and the last run
  revenue.

### Key Entities

- **History subject**: the player or company a filtered history is for.
- **Involvement**: whether an entry concerns a subject. It is true when any of the entry's
  movements (money, shares, certificates, trains, privates, price, status, counters) has the
  subject as source, destination or owner, or when the entry passes the turn to the company.
- **Last run**: a company's most recent active run. It has a total revenue, its parts, how it was
  paid, and the OR it belongs to.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the Table screen, a player or company history opens in 2 taps (tile or card,
  then "Historial").
- **SC-002**: In a recorded full game (RotLA, about 160 actions), a company's history lists every
  entry that changed that company's treasury, shares, trains, price or status, with no missing
  entries and no unrelated ones, checked against the full History.
- **SC-003**: For the same game, adding up the money movements of a company's active (not undone)
  entries in its history gives its current treasury.
- **SC-004**: A player can read any company's last run revenue from the Table screen with no taps.
- **SC-005**: After any run or undo, the last run revenue shown always equals the revenue of the
  company's most recent active run.
- **SC-006**: In the manual check, the table traces where a given company's money came from in
  under 1 minute, compared with scrolling the full History.
- **SC-007**: No undo can be started from a player or company history.

## Assumptions

- "Last OR" means the company's most recent run, not strictly the latest OR. A company that has
  not operated yet in the current OR shows its previous run, labeled with that OR. This answers
  the question the table actually asks: "what did it make last time?"
- The card shows only the total. How it was paid and the parts are in the sheet, so the card stays
  compact.
- Undo stays out of the filtered views. That keeps feature 010's rule that the table reads undo
  as one timeline, and the confirmation always counts every entry that will be undone.
- Undone entries are listed, marked, as in the full History. Hiding them would make the filtered
  view tell a different story from the full one.
- Mentions of a player as president alone (for example their company bought a train without their
  money) do not make an entry part of the player's history. Only the player's own holdings count.
  The company's history covers it.
- The existing entry movements (feature 010) hold everything needed to decide involvement, so no
  new data is recorded.
- Voice keeps its current queries. A voice request for a filtered history is not added in this
  feature.
