# Feature Specification: Action Menus UX

**Feature Branch**: `011-action-menus-ux`

**Created**: 2026-10-12

**Status**: Implemented

**Input**: User description: "Improve the UX for some of the action menus: add basic game actions (sell and buy shares) to the player menu and separate them from adjustments; show a company's trains in the operating menu; make the history easier to scan by highlighting round starts and ends; fix the misleading 'Siguiente compañía' title on the entry that ends the operating rounds; add a way to correct the trains a company holds, choosing where a removed train goes."

## Scope Decision

The request covers five related problems. They are kept in one feature because they all touch the
same table sheets (player, operating) and the history screen, and each one is small. Each is
written as an independent user story with its own priority, so they can be planned, built, tested
and shipped one at a time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sell and buy shares from the player menu (Priority: P1)

A player at the table says "I sell 2 shares of PRR". The person running the app taps that
player's tile. The player menu shows a "Jugada" (game actions) section at the top with "Vender
acciones" and "Comprar acción", and an "Ajustes" (corrections) section below with the existing
correction tools (pay, receive from the bank, set money, move shares, debt, and so on). The user
taps "Vender acciones", picks PRR (only companies the player holds are offered), sets the count
(default 1), sees how much the player receives at the current market price, and confirms. The
player receives the money from the bank, the shares go to the bank pool, and the share price
moves as the game's rules say. Buying works the same way: pick the company and the source (IPO or
pool) and confirm.

**Why this priority**: Selling and buying shares are the most common things a player does in a
stock round. Today the user has to go through the company or through "Mover acciones", a
correction tool that takes several taps and does not apply the sale price or market move. Players
think of shares as theirs, so the player is where they look first.

**Independent Test**: In a RotLA or 1830 session in a stock round, open a player who holds shares,
sell one through "Vender acciones" and buy one through "Comprar acción". Check that money, share
holdings, pool and market match what the existing sell and buy actions produce from the company
side.

**Acceptance Scenarios**:

1. **Given** a stock round and a player holding 3 shares of a company priced at 67, **When** the
   user opens the player, taps "Vender acciones", picks the company, sets 2 and confirms, **Then**
   the player receives 134 from the bank, 2 shares move to the bank pool, the market marker moves
   as the game defines for a sale, and history shows a sale entry (not a share move).
2. **Given** the player menu is open, **When** the user looks at it, **Then** game actions
   ("Vender acciones", "Comprar acción") appear in a first, labeled section and corrections
   ("Pagar…", "Cobrar del banco", "Fijar dinero", "Mover acciones", debt and other adjustments) in
   a second, labeled section below.
3. **Given** a player who holds shares of exactly one company, **When** they tap "Vender acciones",
   **Then** that company is preselected so the sale can be confirmed without choosing it.
4. **Given** a player who holds no shares, **When** the player menu opens, **Then** "Vender
   acciones" is shown disabled with a short reason, and "Comprar acción" stays available.
5. **Given** a sale that would pass the presidency or break a sale rule the game defines (for
   example, selling in the round the company was parred, or exceeding the pool limit), **When** the
   user confirms, **Then** the app shows the same warnings the company-side sale shows and does not
   block the action.
6. **Given** an operating round, **When** the user opens a player, **Then** the game actions are
   still offered (some games allow emergency sales), but the stock actions are not featured above
   the round's own actions.

---

### User Story 2 - See a company's trains in the operating menu (Priority: P2)

While a company operates, the person running the app opens the operating menu and sees, without
leaving it, how many trains the company has, which types, and the train limit for the current
phase, for example "Trenes 2/4 · 2, 3". Players across the table can be told at a glance
before the user taps "Comprar tren".

**Why this priority**: Train count drives the most expensive decision in an operating turn. Today
it is only visible on the company card, which is hidden while the operating menu is open.

**Independent Test**: Open the operating menu for a company holding 2 trains in a phase with
limit 4; the menu shows the count, the types and the limit. Buy a train and reopen; the count
updates.

**Acceptance Scenarios**:

1. **Given** a company holding a 2-train and a 3-train in a phase with limit 4, **When** the
   operating menu opens, **Then** it shows the count (2), the limit (4) and the train types held.
2. **Given** a company with no trains, **When** the operating menu opens, **Then** it shows that the
   company has no trains, clearly enough to stand out.
3. **Given** a company holding a rusted train that it may still run once (game rule), **When** the
   operating menu opens, **Then** that train is shown marked as rusted.
4. **Given** a company over its train limit, **When** the operating menu opens, **Then** the count
   is shown as over the limit, together with the existing over-limit prompt.

---

### User Story 3 - Correct the trains a company holds (Priority: P2)

The user notices, several actions later, that a company has a train it should not have (for
example, a train recorded twice by mistake). Undoing back to that point would also drop every
later action. Instead, the user opens the company's adjustments and chooses "Corregir trenes".
They pick the train and where it goes: back to the train supply (the stack trains are bought
from), to the bank pool (only offered when the game has a pool for trains), or out of the game.
When the train goes back to the supply, the app offers to refund the price paid to the company,
prefilled with the train's list price and editable. The user can also give a company a train
from the supply as a correction, with no money changing hands unless they enter an amount.

**Why this priority**: Money already has correction tools; trains do not. The current "Descartar
tren" follows the game's discard rule (pool or out of the game), which is the wrong tool for
undoing a mistake, so the only fix today is a long undo.

**Independent Test**: Buy a 2-train for a company twice in a row by mistake, record other actions,
then use "Corregir trenes" to return one 2-train to the supply with a refund. The company's
trains, treasury, the supply count and the bank all match a game where the second purchase never
happened, and the later actions are untouched.

**Acceptance Scenarios**:

1. **Given** a company holding two 2-trains, one recorded by mistake, **When** the user corrects
   one 2-train back to the supply with the refund on, **Then** the company keeps one 2-train, the
   supply has one more 2-train available to buy, the company receives the list price from the
   bank, and history shows a correction entry naming the train, destination and refund.
2. **Given** the same situation, **When** the user chooses "out of the game", **Then** the train
   leaves the game and no money moves.
3. **Given** a game where discarded trains go out of the game rather than to a pool, **When** the
   user opens "Corregir trenes", **Then** the pool destination is not offered.
4. **Given** a correction that returns the train which started the current phase, **When** the
   user confirms, **Then** the app warns that the phase (and any rusting it caused) is not changed
   automatically and points to the existing phase correction; it does not block.
5. **Given** a company and a train type with trains left in the supply, **When** the user gives
   the company a train as a correction with no amount, **Then** the train moves from the supply to
   the company and no money moves.
6. **Given** a correction entry, **When** the user undoes it (it being the newest entry), **Then**
   the train and any refund go back exactly as before.

---

### User Story 4 - Scan the history by round (Priority: P3)

The user opens the history to check something that happened "in the second OR". Each round is
visually set apart: a clear start marker ("Inicio · Ronda de operaciones 2.2", "Inicio · Ronda de
acciones 3") and end marker, with entries inside a round visually grouped under it, and the round
type recognizable at a glance (stock, operating, and game-specific rounds such as RotLA's
merger rounds and 21Moon's corporate round), not only by color. RotLA's landmarks are not a round;
they stay ordinary entries. The user scrolls, finds
the round, then the entry.

**Why this priority**: History is used to check and fix things, often under time pressure at the
table. Today every entry looks the same, so finding a round means reading entry by entry.

**Independent Test**: Play through SR 1, OR 1.1 and part of SR 2 in a 1830 session, open the
history, and check that each round's start and end are distinct and labeled, that every entry
sits under the right round, and that it still lists newest first.

**Acceptance Scenarios**:

1. **Given** a session with several finished rounds, **When** the user opens the history, **Then**
   each round has a labeled start and end marker that is visually distinct from ordinary entries,
   including the round name and number (for example "Ronda de operaciones 2.1").
2. **Given** a round still in progress, **When** the user opens the history, **Then** that round has
   a start marker and no end marker, and is identified as the current round.
3. **Given** a round boundary that was later undone, **When** the user opens the history, **Then**
   the undone boundary is shown struck through like other undone entries and does not create a
   round section.
4. **Given** rounds of different types, **When** the user scans the history, **Then** each type is
   recognizable by a label and icon or shape, not only by color.

---

### User Story 5 - Name the entry that ends the operating rounds (Priority: P3)

When the last company of the last OR in a set finishes, the history entry (and its toast and
confirmation) is currently titled "Siguiente compañía", like any other turn, with the message "Fin
de las rondas de operaciones…" underneath. The title should say what happened: the operating
rounds ended. It does not name the round that follows, because that depends on the game (a stock
round in most games, a merger round in RotLA from the green phase on); the next entry and its
History section name it. Likewise, the entry that closes one OR and opens the next in the set
should be titled as the end of that OR and the start of the next.

**Why this priority**: It is a small fix with a clear payoff for history readability, and it
pairs naturally with Story 4.

**Independent Test**: Finish the last company of the last OR of a set; the resulting entry's title
names the end of the operating rounds. Finish the last company of an OR that is not the last of
its set; the title names the end of that OR.

**Acceptance Scenarios**:

1. **Given** the last company of OR 2.2 (the last OR of the set) is operating, **When** the user
   advances to the next company, **Then** the entry is titled as the end of the operating rounds
   ("Fin de las rondas de operaciones"), not "Siguiente compañía", in history, toast and
   confirmation alike.
2. **Given** a RotLA game in the green phase, where a merger round follows the ORs, **When** the
   last company of the second OR finishes, **Then** the entry is titled "Fin de las rondas de
   operaciones" and says nothing about a stock round.
3. **Given** the last company of OR 2.1 (not the last of the set) is operating, **When** the user
   advances, **Then** the entry is titled as the end of OR 2.1 and start of OR 2.2.
4. **Given** a session recorded before this change, **When** it is reopened, **Then** its existing
   end-of-round entries show the new titles too (titles are derived, nothing is rewritten).

---

### Edge Cases

- Selling shares when the bank has less money than the proceeds (finite bank): the sale is
  recorded and the existing bank-broken handling applies, the same as a company-side sale.
- Selling more shares than the player holds: the count control does not allow it.
- Selling shares of a company with no market price yet (not parred or not on the market): the
  company is not offered for sale.
- Buying from the IPO or pool when no shares are left there: that source is not offered.
- A company acting as a shareholder (games where companies hold shares of others) keeps its
  existing tools; this feature changes the player menu only.
- Games with unusual share actions keep their existing entries. RotLA's exchange of privates
  ("Canjear privada…") moves into the player's game-actions section. 21Moon's certificate swap is
  done by the president with the company treasury, so it stays on the company card.
- Correcting a train that a company is required to keep (its only train under a must-own-a-train
  rule): allowed, with no special warning beyond the usual validation.
- Correcting a train back to the supply when that train type is no longer sold in the current
  phase: allowed; the train returns to the supply as recorded, with a warning.
- Correcting a rusted-but-kept train: the rusted mark is cleared with it, as with discarding.
- A round with no entries between its start and end (for example an OR where nothing ran): the
  round still shows its start and end markers.
- Very long sessions (around 160 actions or more): round grouping stays readable and scrolling stays
  smooth.

## Requirements *(mandatory)*

### Functional Requirements

**Player menu (Story 1)**

- **FR-001**: The player menu MUST have two labeled sections: game actions first, corrections
  second.
- **FR-002**: The game-actions section MUST offer "Vender acciones" and "Comprar acción" for every
  game that has a stock round, and SHOULD list other player game actions the game defines (such as
  exchanging a private) in the same section.
- **FR-003**: The corrections section MUST keep every adjustment the player menu offers today
  ("Pagar…", "Cobrar del banco", "Fijar dinero", "Mover acciones", debt and other counters).
- **FR-004**: "Vender acciones" MUST record the same sale action the company-side sale records,
  so money, pool, presidency, market movement, warnings and voice parity are identical.
- **FR-005**: "Vender acciones" MUST offer only companies the player holds shares of that have a
  market price, preselect the company when there is only one, default the count to 1, cap it at
  the shares held, and show the proceeds before confirming.
- **FR-006**: "Comprar acción" MUST record the same buy action the company-side buy records,
  offering only companies and sources (IPO, pool) that have shares available, and showing the
  price before confirming.
- **FR-007**: A sale or buy of one company with the default count MUST take at most 3 taps from the
  table (player, action, confirm) when the company is preselected, and at most 4 otherwise.
- **FR-008**: Rule warnings for sales and buys MUST be shown but MUST NOT block the action.

**Operating menu (Story 2)**

- **FR-009**: The operating menu MUST show the company's train count, the types held, and the train
  limit for the current phase, without extra taps, and update after every change.
- **FR-010**: The trains display MUST mark rusted-but-kept trains and an over-limit state, and MUST
  NOT rely on color alone.

**Train correction (Story 3)**

- **FR-011**: Users MUST be able to remove a specific train from a company as a correction,
  choosing its destination: the train supply, the bank pool (only when the game sends discarded
  trains to a pool), or out of the game.
- **FR-012**: When the destination is the train supply, the correction MUST offer a refund from the
  bank to the company, prefilled with that train type's list price, editable, and possible to turn
  off. For other destinations the correction MUST NOT offer a refund; if one is given anyway (for
  example by voice), it is recorded with a warning rather than refused (the table wins).
- **FR-013**: A train returned to the supply MUST become available to buy again, in the same order
  the supply would sell it.
- **FR-014**: Users MUST be able to give a company a train from the supply as a correction, with an
  optional amount paid to the bank (default none).
- **FR-015**: Train corrections MUST be recorded as one history entry each, clearly marked as a
  correction, naming the company, train, destination or source, and any money moved; they MUST be
  undoable like any other entry.
- **FR-016**: A train correction MUST NOT change the phase or un-rust trains automatically; when the
  corrected train is the one that started the current phase, the app MUST warn and point to the
  existing phase correction.
- **FR-017**: The existing "Descartar tren" MUST keep its current game-rule behavior and stay a
  game action; train correction MUST be offered with the company's corrections, not in its place.

**History (Stories 4 and 5)**

- **FR-018**: The history MUST show a labeled start marker and, for finished rounds, a labeled end
  marker for every round, visually distinct from ordinary entries, with the round type and number.
  The section header can serve as the end marker when it states that the round is finished (for
  example "· terminada").
- **FR-019**: Entries MUST appear grouped under the round in which they were recorded, still listed
  newest first, with the current round identified as in progress.
- **FR-020**: Round types MUST be distinguishable by text and icon or shape, not only by color.
- **FR-021**: Undone round boundaries MUST be shown as undone and MUST NOT open or close a round
  section.
- **FR-022**: The entry that ends the last OR of a set MUST be titled as the end of the operating
  rounds, without naming the next round (it differs by game and phase); the entry that ends a
  non-final OR MUST be titled as the end of that OR and the start of the next. Ordinary
  company-to-company advances keep "Siguiente compañía". The end-of-set warning shown before the
  advance MUST NOT name a next round that may be wrong either.
- **FR-023**: The new titles MUST be used everywhere that entry is summarized (history, undo toast,
  confirmation card) and MUST apply to sessions recorded before this change without rewriting them.

**General**

- **FR-024**: Every new action reachable by touch in this feature MUST also be reachable by voice
  where an equivalent voice action exists (selling and buying already are); the train correction
  MUST be added to the voice tools, and the voice eval set re-run.
- **FR-025**: All new labels MUST be in Uruguayan Spanish, consistent with existing app wording.
- **FR-026**: The product reference (docs/spec.md) MUST be updated to describe the new player menu
  sections, operating-menu train display, train correction, and history round markers.

### Key Entities

- **Player menu sections**: the game-actions group (sell, buy, and other player game actions) and
  the corrections group (money and share adjustments, counters).
- **Train correction**: a recorded correction moving one specific train between a company and the
  supply, pool, or out of the game, with an optional refund or payment.
- **Round section (history)**: a derived grouping of history entries between a round's start and
  end boundaries, labeled with round type and number; never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Selling one share from a player in a stock round takes at most 2 taps. Selling or
  buying through the player's forms takes at most 3 taps when the company is preselected and at
  most 4 otherwise, down from 5 or more today.
- **SC-002**: In a hallway test, a person who knows 18xx but not the app finds how to sell a
  player's shares on the first try, starting from the table, in at least 4 of 5 attempts.
- **SC-003**: A company's train count, types and limit are readable in the operating menu with zero
  extra taps.
- **SC-004**: A train recorded by mistake can be corrected in at most 5 taps without undoing any
  later entry, and afterwards money, trains and the supply match the game where the mistake never
  happened.
- **SC-005**: In a session of at least 160 entries, a user can locate the start of a named OR (for
  example "OR 3.2") in the history in under 10 seconds.
- **SC-006**: 100% of entries that end an OR or a set of ORs are titled as round ends; none read
  "Siguiente compañía".
- **SC-007**: Money and share invariants hold after every sell, buy and train correction in the
  test suite (no new invariant violations).

## Assumptions

- "Train supply" means the stack trains are bought from (the bank's trains); "bank pool" is the
  open market for discarded trains in games that have one (1830, RotLA); 1848 discards trains out
  of the game, so its correction offers no pool.
- Selling from the player menu follows each game's existing sale rules (price, market move,
  presidency, pool limit) exactly as the company-side sale already does; no rule changes.
- Corrections are not blocked by round or turn (the table wins); they are marked as corrections in
  the history.
- The refund default uses the train's list price because purchases from the supply are almost
  always at list price; purchases between companies at other prices are corrected with the
  existing money tools or by editing the refund amount.
- Round grouping in the history is derived from round-boundary entries already in the log; no data
  migration is needed.
- The company sheet's existing sell and buy entry points stay as they are.
- Rounds specific to a game (RotLA merger round, 21Moon corporate round) are shown with their own
  names. RotLA's landmarks are not a round in the app and stay ordinary entries.
- The pool destination is offered only in games that discard trains to a pool, the same way
  "Cambiar oferta de trenes" exists only in games with reserve trains: in other games the pool
  holds no trains, so the option has no meaning there.
