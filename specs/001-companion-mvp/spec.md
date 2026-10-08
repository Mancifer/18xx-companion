# Feature Specification: 18xx Companion MVP

**Feature Branch**: `001-companion-mvp`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "@docs/spec.md" (18xx Companion product spec, Draft v0.1, 2026-10-07)

## Clarifications

### Session 2026-10-07

- Q: What does "custom game" cover in v1? → A: Copy a built-in game and edit its values;
  authoring from scratch is deferred to a later version.
- Q: Do touch actions show the confirmation card? → A: No. They apply immediately, with one-tap
  undo (resolves open item UX-1).
- Q: How much of 1848 must v1 support? → A: Full support, including loans, Bank of England,
  Commonwealth Railway, and receivership, built as reusable mechanics (resolves open item G-1).
- Q: How many players? → A: The game's own supported range, with a hard cap of 7 for every game
  (1830 2–7, 1848 3–6, 21Moon 2–5).
- Q: How is revenue recorded in games without a pay/withhold choice (21Moon)? → A: The game
  defines revenue parts with fixed destinations (21Moon: local base → treasury, Space Port base
  → dividends), and the user enters an amount per part.
- Q: Do 1848 loans carry interest or get repaid? → A: No. A company receives £100 per loan from
  the Bank of England and never repays it; interest and repayment exist only as optional fields
  of the game definition for future games.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set up a game and track money by touch (Priority: P1)

A banker sets up a new session on a shared phone or tablet: picks a built-in game (1830, 1848,
21Moon) or a custom game, enters the players (within the game's range, at most 7; names,
colors, aliases), and chooses a wallet
mode. The app deals starting cash from the bank. From then on, the Table screen shows a large
tile per player with their cash and a company grid with treasury, share price, and president.
The banker can make manual adjustments (pay X from A to B, set a value) with a few taps, and
the bank total always reflects what has been paid out.

**Why this priority**: Replacing paper money with a reliable shared counter is the smallest
slice that already speeds up a real game. Everything else builds on the session, holders, and
ledger introduced here.

**Independent Test**: Start a 4-player 1830 session, perform a series of manual transfers
between bank, players, and companies, and verify that every total updates and the overall sum
of money is unchanged.

**Acceptance Scenarios**:

1. **Given** the Home screen, **When** the user creates a new 1830 session with 4 players,
   **Then** each player receives the game's starting cash for 4 players and the bank shows the
   game total minus what was dealt.
2. **Given** an open session, **When** the user transfers 100 from a player to the bank,
   **Then** the player's cash drops by 100, the bank rises by 100, and the total money is
   unchanged.
3. **Given** an open session, **When** the user closes and reopens the app, **Then** the session
   resumes in exactly the same state.
4. **Given** the "Bank only" wallet mode, **When** the Table screen is shown, **Then** player
   cash totals are hidden and only bank and company money is tracked.
5. **Given** the new-session flow, **When** the user creates a custom game from 1830 and changes
   the bank size and one company's name, **Then** the session uses the edited values and the
   built-in 1830 definition is unchanged.
6. **Given** an open session, **When** the user applies a transfer by touch, **Then** it takes
   effect immediately and a brief notice with an Undo button is shown.

---

### User Story 2 - Undo, amend, and review history (Priority: P1)

Every change is recorded in a history ledger, grouped by user intent. Any action can be undone
in one tap, and any past entry can be amended ("no, it was 260") or undone from the History
screen. Reverted entries remain visible in the history.

**Why this priority**: Mistakes at a busy table are inevitable; trust in the app depends on
cheap, safe correction. Required before any automation is useful.

**Independent Test**: Perform several actions, undo the last one, amend an earlier one, and
confirm all balances match what they would be had the corrected actions been entered directly.

**Acceptance Scenarios**:

1. **Given** a just-applied action, **When** the user taps Undo once, **Then** all its effects
   are reverted together and the entry shows as reverted in History.
2. **Given** a payout recorded with revenue 240, **When** the user amends it to 260, **Then**
   all affected balances and the share price reflect 260 and History shows both the original
   (reverted) and the corrected entry.
3. **Given** an earlier entry that later entries depend on, **When** the user tries to undo or
   amend it, **Then** the app warns before applying the change.

---

### User Story 3 - Run an operating round with automated dividends (Priority: P1)

During an operating round, the app shows the current operating company. The user enters the
run's revenue on a keypad and picks Pay, Withhold, or Half (where the game allows it), or, in
games that split revenue between parts with fixed destinations, enters each part. The app
distributes dividends to all shareholders according to ownership, routes dividends for IPO,
treasury, and pool shares as the game defines, moves the share price, and advances to the next
company. The user can also record train purchases (from the bank or another company), costs
paid to the bank, and private-company income.

**Why this priority**: Dividend calculation is the most tedious and error-prone bookkeeping in
18xx; automating it is the app's core value.

**Independent Test**: In an 1830 session with known holdings, pay out a given revenue and
compare every player's and the company's resulting cash and the new share price against a
hand-calculated result from the rulebook.

**Acceptance Scenarios**:

1. **Given** a floated 10-share company where Ana owns 60%, Bruno 20%, and 20% is in the pool,
   **When** the user records a full payout of 240, **Then** Ana receives 144, Bruno 48, the pool
   share dividends go where the game definition says, and the share price moves one step per
   the game's payout rule.
2. **Given** the same company, **When** the user records a withhold of 180, **Then** the company
   treasury receives 180, no player receives money, and the price moves per the withhold rule.
3. **Given** a game that does not allow half-pay, **When** the operate sheet is shown, **Then**
   the Half option is not offered.
4. **Given** a company buying a train from the bank, **When** the purchase is confirmed, **Then**
   the company pays the train's cost to the bank and, if the train triggers a new phase, the
   phase change is recorded.
5. **Given** the start of an operating round, **When** private income is applied, **Then** each
   private company's owner receives its income from the bank.
6. **Given** an 1848 session, **When** a company takes a loan, **Then** the company receives £100
   from the Bank of England, its loan count increases, its share price moves per the game's loan
   rule, and no interest is charged and no repayment is offered later (1848 loans are never
   repaid; other games' loan terms follow their game definition).
7. **Given** an 1830 session, **When** the operate sheet is shown, **Then** no loan actions are
   offered.

---

### User Story 4 - Run a stock round (Priority: P2)

During a stock round, the user records players parring companies, buying shares from the IPO
or pool, and selling shares. The app moves money between the right holders (including the
company treasury when the game uses incremental capitalization), updates ownership and the
president, marks companies as floated when the float threshold is reached, moves prices on
sales, and applies sold-out moves at the end of the round. Entries can be recorded live as they
happen, or as one end-of-round batch.

**Why this priority**: Needed for a full game, but stock rounds involve fewer calculations than
operating rounds and are easier to do by hand in the meantime.

**Independent Test**: Run an 1830 stock round in which players par, buy, and sell, then verify
ownership percentages, presidents, float status, treasuries, and prices against expected
values.

**Acceptance Scenarios**:

1. **Given** an unstarted company, **When** Ana pars it at 82, **Then** Ana holds the
   president's certificate, pays its price, and the company is marked as parred.
2. **Given** a full-capitalization game, **When** enough shares are sold to reach the float
   percentage, **Then** the company is marked floated and receives its full capitalization from
   the bank.
3. **Given** Carla holds three shares, **When** she sells two, **Then** the shares move to the
   pool, she receives the current price for each, and the price moves per the game's sell rule.
4. **Given** a sale that leaves another player with more shares than the president, **When**
   the sale is confirmed, **Then** the presidency transfers to that player.
5. **Given** a batch statement with several buys and sells, **When** it is entered, **Then**
   they are shown on one summary card in the stated order with assumed prices visible and
   editable before confirmation.

---

### User Story 5 - Use voice commands in Spanish (Priority: P2)

The user holds a large mic button and speaks a command in Spanish ("240, paga", "Carla vende
dos Erie", "compra un 4 y paga 290"). The live transcript is shown. On release, the app
interprets the command into one or more actions and shows a confirmation card in Spanish with a
plain-language summary, money flows, and chip breakdown. The user confirms, edits a field, or
cancels. Ambiguous commands produce a clarification question with tap options. Questions like
"¿cuánto tiene Ana?" are answered from the app's own state.

**Why this priority**: Voice is the fastest input at the table, but it is a shortcut on top of
the touch flows, which must exist first.

**Independent Test**: Speak each command in the v1 example set and verify the confirmation card
proposes the expected action with the expected values; confirm and check the resulting state.

**Acceptance Scenarios**:

1. **Given** the PRR is operating, **When** the user says "240, paga", **Then** a confirmation
   card proposes a full payout of 240 for PRR and nothing changes until confirmed.
2. **Given** a compound command "compra un 4 y paga 290", **When** it is interpreted, **Then**
   one card shows both the train purchase and the payout, applied together on confirmation.
3. **Given** a command naming a player ambiguously, **When** it is interpreted, **Then** the app
   asks which player was meant, with one button per candidate.
4. **Given** "¿cuánto tiene Ana?", **When** it is interpreted, **Then** the app shows Ana's cash
   from its own records and changes nothing.
5. **Given** no network connection or no AI key, **When** the user opens the Table screen,
   **Then** the mic is shown as unavailable and all touch actions keep working.
6. **Given** an uninterpretable command, **When** interpretation fails, **Then** the app shows
   "No entendí" with the transcript and a path to enter the action by touch.

---

### User Story 6 - Make change with poker chips (Priority: P3)

The session has a configurable chip set (denominations, colors, optional counts available),
with a preset per game. For every confirmed transaction that moves money into or out of the
bank, the app shows which chips to hand over, as colored discs with counts, using the fewest
chips possible. When someone pays the bank with a larger chip, the change to return is shown
too.

**Why this priority**: Speeds up physical handling at tables that use chips, but the app is
fully usable without it.

**Independent Test**: Configure a chip set, perform bank payouts and payments of various
amounts, and verify the chip breakdowns are correct and minimal.

**Acceptance Scenarios**:

1. **Given** chips of 1, 5, 10, 50, 100, 500, **When** the bank pays 287, **Then** the app shows
   2×100, 1×50, 3×10, 1×5, 2×1.
2. **Given** a payment of 30 to the bank made with a 50 chip, **When** confirmed, **Then** the
   app shows 20 in change as 2×10.
3. **Given** limited counts available for a denomination, **When** a breakdown would exceed
   them, **Then** the app uses other chips and still shows the fewest-chip valid breakdown, or
   says that exact change is not possible.

---

### User Story 7 - Track turns and the stock market (Priority: P3)

The top bar shows the current round (SR, or OR with set and index such as "OR 2.1"), the
current operating company, and bank remaining. The app proposes the operating order from share
prices and steps through it. A Market view shows each company's token on the game's market
grid and allows manual moves.

**Why this priority**: Helps orientation and drives "current company" defaults for operating
and voice, but the table can track turns manually.

**Independent Test**: Advance through a stock round and two operating rounds and verify the
round indicator, operating order, and current company at each step.

**Acceptance Scenarios**:

1. **Given** the end of a stock round, **When** the user starts the operating round, **Then**
   the indicator shows "OR n.1" and operating order follows the game's ordering rule.
2. **Given** the last company has operated, **When** the user says "siguiente compañía" or taps
   Next, **Then** the app moves to the next OR in the set or prompts to start a stock round.
3. **Given** the Market view, **When** the user drags a company token to a new cell, **Then** the
   price change is recorded as an override in History.

---

### User Story 8 - Back up, restore, and move a session (Priority: P3)

The user can export a session to a file and import it on the same or another device, for
backup, bug reports, or switching devices mid-game. The AI key is never included.

**Why this priority**: Protects long sessions against device failure; not needed for a basic
game.

**Independent Test**: Export a session mid-game, import it on a fresh install, and verify state
and history are identical and no AI key is present in the file.

**Acceptance Scenarios**:

1. **Given** a session in progress, **When** it is exported and imported elsewhere, **Then** all
   balances, holdings, prices, turn state, and history match the original.
2. **Given** an exported file, **When** its contents are inspected, **Then** it contains no AI
   key.

---

### Edge Cases

- A payout's per-share amount is not a whole number: rounding follows the game's rounding rule.
- The bank runs out (bank broken): the bank shows broken status and the game's end trigger is
  indicated; payments that would take the bank below zero are still recorded and flagged.
- A company is short of cash for a required train purchase: the app records what the table
  decides (e.g. president contributes) via manual transfers; it does not enforce rules.
- An action would break a rule (certificate limit, selling in the same round as buying): the
  app warns but allows it.
- The money total or share count check fails after an event: a visible warning appears and the
  offending entry is highlighted in History; nothing is auto-corrected.
- A sale drops the price to the bottom of the market, or a payout hits the top: the token stops
  at the edge per the game's market rules.
- A player's voice alias matches two players or two companies: the app asks for clarification.
- The app is closed, the screen sleeps, or the device restarts mid-action: no confirmed event is
  lost, and an unconfirmed proposal is discarded.
- The user undoes an action that later actions depend on: the app warns before applying.
- A batch stock round statement where sell order changes prices: assumed prices are shown and
  editable.

## Requirements *(mandatory)*

### Functional Requirements

**Sessions & setup**

- **FR-001**: Users MUST be able to create a session from a built-in game definition (1830,
  1848, 21Moon) or a custom game.
- **FR-002**: Users MUST be able to enter players with name, color, voice aliases, and seat
  order, within the player-count range of the chosen game and never more than 7.
- **FR-003**: Users MUST be able to choose a wallet mode: "app is the source of truth" (player
  cash tracked) or "bank only" (player cash hidden).
- **FR-004**: The system MUST deal starting cash from the bank according to the game definition
  for the number of players.
- **FR-005**: A session MUST keep its own copy of the game definition, so later edits to
  definitions do not change sessions in progress.
- **FR-006**: Users MUST be able to resume the most recent session from the Home screen.
- **FR-007**: Users MUST be able to create a custom game by copying a built-in game definition
  and editing its values (e.g. bank size, starting cash, companies, privates, trains, chip
  preset). Authoring a game from scratch (new market grids, phase structures, or dividend rules)
  is out of scope for v1.

**Ledger, undo & history**

- **FR-010**: Every state change MUST be recorded as an entry in an append-only history; no
  state change may bypass it, including manual overrides.
- **FR-011**: Each user intent (e.g. a payout) MUST be recorded as one grouped entry whose
  effects are applied and undone together.
- **FR-012**: Users MUST be able to undo the most recent entry in one tap.
- **FR-013**: Users MUST be able to undo or amend any past entry from the History screen;
  reverted entries MUST remain visible and marked as reverted.
- **FR-014**: The system MUST warn before undoing or amending an entry that later entries depend
  on.
- **FR-015**: After every change, the system MUST verify that total money equals the starting
  total (unless the bank is unlimited) and that each company's held shares equal its total
  certificates, and MUST show a visible warning if not, without auto-correcting.

**Holdings, money & companies**

- **FR-020**: The system MUST track money for the bank, each player, and each company, and share
  holdings for each player, each company's IPO, company treasuries, and the pool.
- **FR-021**: The system MUST track the president of each company and transfer the presidency
  when another player comes to hold more shares than the current president.
- **FR-022**: The system MUST track company status (unstarted, parred, floated, closed) and mark
  companies as floated when the game's float percentage is reached.
- **FR-023**: The system MUST capitalize companies according to the game definition (full on
  float, or incremental per share sold from IPO/treasury).
- **FR-024**: Users MUST be able to manually adjust any holder's money and any company's market
  position; each adjustment MUST be recorded in History.
- **FR-025**: The system MAY warn when an action looks illegal under the game's rules but MUST
  NOT block it.
- **FR-026**: Private companies MUST be trackable with owner, income per OR, and closed status;
  users MUST be able to record private purchases at a given price.

**Operating rounds**

- **FR-030**: Users MUST be able to record a run with revenue and a payout mode (full, withhold,
  or half) limited to the modes the game allows. For games whose revenue is split into parts
  with fixed destinations (e.g. 21Moon: local base to the treasury, Space Port base as
  dividends), users MUST instead enter the amount of each part, and no payout mode is offered.
- **FR-031**: For a full or half payout, the system MUST pay each shareholder their share of the
  paid amount and route dividends for IPO, treasury, and pool shares as the game defines; for
  withhold, the full revenue MUST go to the company treasury; for half, the retained part MUST
  go to the company. Fixed-destination revenue parts MUST be paid to the treasury or distributed
  as dividends as the game defines.
- **FR-032**: Per-share amounts and half-pays MUST be rounded according to the game's rounding
  rule; all amounts are whole currency units.
- **FR-033**: The system MUST move the share price after a run according to the game's payout or
  withhold movement rule, including rules that depend on the dividend relative to the share
  price (21Moon).
- **FR-034**: Users MUST be able to record train purchases from the bank (at list cost) or from
  another company (at an agreed price), and train ownership MUST be tracked.
- **FR-035**: When a train purchase triggers a new phase, the system MUST record the phase change
  and apply its effects defined in the game (e.g. rusting trains, closing privates).
- **FR-036**: Users MUST be able to record a company paying a cost to the bank with an optional
  reason.
- **FR-037**: The system MUST offer to pay private-company income at the start of each operating
  round.

**Stock rounds**

- **FR-040**: Users MUST be able to record parring a company at a chosen par price, buying
  shares from the IPO or pool, and selling shares to the pool.
- **FR-041**: Sales MUST move the price according to the game's sell rule (per share or per
  sale), and sold-out companies MUST move at the end of the stock round per the game's rule.
- **FR-042**: Users MUST be able to enter stock round actions live (one at a time, at current
  prices) or as a batch shown on one summary card in the stated order, with assumed prices
  visible and editable.

**Turns & market**

- **FR-050**: The system MUST track round type (stock or operating), operating round set and
  index, operating order, current company, and game phase.
- **FR-051**: The system MUST derive operating order from the game's ordering rule and step
  through companies on "next company".
- **FR-052**: Users MUST be able to view the market grid with company tokens and move tokens
  manually.

**Confirmation**

- **FR-060**: Actions proposed from voice MUST be shown on a confirmation card (summary in
  Spanish, money flows, chip breakdown) and applied only after the user confirms; users MUST be
  able to edit fields or cancel.
- **FR-061**: Touch actions MUST apply immediately, without a confirmation card, and show a brief
  notice of what was applied (including the chip breakdown for bank transactions) with a one-tap
  undo.
- **FR-062**: Users MUST be able to confirm a voice proposal by tap or by saying "sí" /
  "confirmar".

**Voice**

- **FR-070**: Users MUST be able to issue commands by holding a mic button and speaking Spanish;
  the transcript MUST be shown live and capture MUST end on release.
- **FR-071**: The system MUST interpret a command into one or more of the same actions available
  by touch, including compound commands spanning several actions.
- **FR-072**: The system MUST resolve player and company names using their names and aliases,
  and ask a clarification question with tap options when ambiguous.
- **FR-073**: Questions about state (e.g. a player's cash) MUST be answered from the app's own
  records, never from the interpreter's free text.
- **FR-074**: The system MUST support corrections by voice ("deshacer", "no, eran 260") acting on
  the latest entry.
- **FR-075**: When the interpreter is unavailable (no network, no key) voice MUST be shown as
  disabled; when a command cannot be interpreted, the app MUST show "No entendí" with the
  transcript and a path to touch entry.
- **FR-076**: Users MUST be able to set their AI key, voice locale (Spanish variants), and
  interpreter model in Settings.

**Chips & bank**

- **FR-080**: Users MUST be able to configure a chip set per session (value, color, optional
  label, optional count available), starting from a per-game preset.
- **FR-081**: For every confirmed transaction into or out of the bank, the system MUST show the
  chips to hand over with the fewest chips possible, respecting available counts, and MUST show
  change when a payment is made with larger chips.
- **FR-082**: The system MUST show remaining bank total and a "bank broken" status at zero.

**Persistence & data**

- **FR-090**: Every confirmed change MUST be saved immediately so that the session survives
  reloads, screen sleep, and app restarts.
- **FR-091**: Users MUST be able to export a session to a file and import it, reproducing the
  identical state and history.
- **FR-092**: The AI key MUST be stored only on the device and MUST NOT appear in exports.
- **FR-093**: The app MUST work offline for everything except voice interpretation.

**Usability & accessibility**

- **FR-100**: Common actions (payout, buy share, sell, next company, undo) MUST take at most 2
  taps from the Table screen or one short voice command.
- **FR-101**: Touch targets MUST be at least 48 px; company colors MUST always be accompanied by
  short names; layouts MUST work on phone portrait and tablet landscape.
- **FR-102**: The screen MUST stay awake while a session is open.

**Games**

- **FR-110**: Built-in game definitions MUST use values verified against each game's rulebook.
- **FR-111**: 1848 MUST be fully supported, including its loans, its special entities (Bank of
  England, Commonwealth Railway), and receivership, as defined by the rulebook.
- **FR-112**: Users MUST be able to record taking loans for games that define loans; loan
  amounts, limits, and market effects MUST follow the game definition, and loan actions MUST NOT
  be offered for games without loans. Interest and repayment exist only as game-definition
  fields for future games; v1 builds no interest charging or repay action, because no v1 game
  uses them (constitution VII).
- **FR-113**: Game-specific mechanics that cannot be expressed as game-definition values (such as
  1848's special entities and receivership) MUST be implemented as named, reusable game
  mechanics that other games can enable later, rather than as one-off logic.

### Key Entities

- **Session**: one game in progress; its game definition copy, players, companies, chip set,
  settings, and history.
- **Game definition**: the rules data for a game: bank size, starting cash per player count,
  companies, privates, capitalization type, float percentage, dividend routing for unowned
  shares, allowed payout modes or revenue parts, player-count range, rounding rule, market grid and movement rules, phases, trains,
  optional loans, end trigger.
- **Holder**: anything that can hold money and/or shares: the bank, a player, a company
  treasury, a company's IPO, the pool.
- **Player**: name, aliases, color, seat order, cash.
- **Company**: short and full name, aliases, color, share count, par price, market position,
  status, president, trains.
- **Private company**: name, owner, income per OR, closed flag.
- **Holding**: how many share units of a company a holder owns, plus who holds the president's
  certificate.
- **Market**: the game's price grid with company positions.
- **Turn state**: round type, OR set and index, operating order, current company, phase.
- **History entry**: one user intent with its grouped effects, timestamp, and reverted/amended
  status.
- **Loan**: a loan held by a company in games that define loans; amount, limits, and market
  effects come from the game definition (interest and repayment are data-only fields in v1).
- **Chip set**: denominations with value, color, label, and optional available count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A full 1830 game can be played with the app handling all money, with no manual
  corrections other than those caused by misheard commands.
- **SC-002**: In a full playthrough, total money is conserved after every change (zero invariant
  warnings not caused by user overrides).
- **SC-003**: At least 90% of common operating-round voice commands in the Spanish evaluation
  set are proposed correctly on the first attempt.
- **SC-004**: The confirmation card appears within 3 seconds of the user finishing a voice
  command on a typical connection.
- **SC-005**: Any applied action can be undone in one tap.
- **SC-006**: A payout for an operating company takes no more than 2 taps after entering the
  revenue, or one voice command.
- **SC-007**: After a reload or restart, the session resumes with 100% of confirmed changes
  present.
- **SC-008**: Players new to the app can record a full operating round without help after
  watching it done once.

## Assumptions

- Users already know the rules of the game being played; no tutorials are needed.
- One device is shared at the table, usually held by a banker; multi-device play, online play,
  and private wallets are out of scope.
- Map, tiles, routes, and revenue calculation stay on the table; revenue is entered by users.
- Mergers, conversions, company closures beyond simple status, 1817-style loans (beyond what
  1848 needs), from-scratch custom game authoring, more games, and more voice languages are later
  iterations; data shapes allow for them but they are not built.
- Full 1848 support is the largest single scope item in v1; its exact mechanics come from the
  rulebook during planning.
- Voice interpretation needs a network connection and a user-provided AI key; everything else
  works offline.
- Voice is Spanish only in v1 (configurable Spanish regional variant).
- Rule details (dividend routing, rounding, market movement, 1848 loans, 21Moon specifics) were
  confirmed from the rulebooks in `docs/rules/` and by the user during planning (research
  R13–R15).
- The default interpreter model is `claude-sonnet-5` (user decision). An evaluation set of about
  60 Spanish commands confirms or replaces it by measuring accuracy and latency.
- The "decisions API" mentioned in early notes is out of scope until identified.
