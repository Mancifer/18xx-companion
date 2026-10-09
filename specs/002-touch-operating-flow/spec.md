# Feature Specification: Touch-First Operating Flow

**Feature Branch**: `002-touch-operating-flow`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "I want to work on implementing some changes to our application to simplify ease of use for users who don't use voice commands based on findings from my testings: (1) The button to buy private companies in the top menu remains active even after the bidding phase where all private companies were bought [...] once the private companies are sold the button opens an empty menu. (2) Currently you can skip the operation round for a company without entering what it produced or if it didn't produce anything. This is relevant when the bank and stock is managed by the application because the stock price will fall if the company doesn't run any train during an OR. [...] have the button to proceed to next OR be the same as the one to operate a company, that way, you can't proceed without first entering what happened to the operation of the last company. (3) Currently it's possible to buy trains and operate, but you can't do both things at once. [...] users may input the corp income and lose it once they click on the buy train button. It works but it's unintuitive. (4) If the app is managing everything, I think we should follow ORs in order, according to the corp position in the market track, just like it's defined in the rules, otherwise users may perform actions from other companies during rounds where they normally should not."

## Context

These changes come from play-testing the touch-only path, without voice. Four problems were seen:

- The round-controls bar offers "Comprar privada" in every stock round. Once every private has
  been sold, and no player-to-player resale is allowed, the button opens an empty list.
- In an operating round, "Siguiente" ends the current company's turn even when nothing was
  recorded for it. The rules lower a company's share price when it does not run (pays nothing).
  Skipping silently means that price move never happens, so the market drifts away from the
  table.
- The operate sheet shows the revenue keypad and a "Comprar tren" button on the same screen.
  Tapping "Comprar tren" throws away any revenue already typed. Coming back from buying a train
  closes the sheet, so the run then has to be entered from scratch.
- The operating order is computed, but nothing ties it to the touch controls. During an
  operating round, any company's operate sheet can be opened and used, so actions can be
  recorded for a company whose turn it is not.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A company's turn ends only after its operation is recorded (Priority: P1)

During an operating round, the table works through companies in order. For the current company
there is one primary control. It opens that company's operating turn. The user records what
happened: the revenue and payout mode, or "did not run". Optional actions such as buying trains
or paying costs can be added. The user then finishes the turn, and the app moves on to the next
company in operating order. No separate "next" button lets the turn end with nothing recorded.

**Why this priority**: Skipping a company without recording its run leaves money and share
prices wrong. This is the app's core value (correct money and market), so this is the most
important fix.

**Independent Test**: Start an operating round with three floated companies. Check that the
only way forward is through each company's turn, and that a company recorded as "did not run"
has its share price moved as the game's rules say.

**Acceptance Scenarios**:

1. **Given** an operating round with a current company, **When** the user looks at the round
   controls, **Then** one primary control names the current company (for example "Operar PRR")
   and no control advances the turn without opening that company's turn.
2. **Given** the current company's turn is open and nothing has been recorded, **When** the user
   tries to finish the turn, **Then** finishing is unavailable, and the app explains that a run
   or "no run" must be recorded first.
3. **Given** the current company's turn is open, **When** the user chooses "no run" and finishes
   the turn, **Then** a run with zero revenue is recorded, the share price moves as the game
   says for a company that does not pay, and the next company in operating order becomes
   current.
4. **Given** the current company has recorded its run, **When** the user finishes the turn,
   **Then** the next company in operating order becomes current. If none is left, the app goes
   to the next OR in the set, or offers to start the stock round, as it does today.
5. **Given** the user made a mistake, **When** they undo, **Then** the finished turn and the
   advance are reverted together, and the same company is current again.

---

### User Story 2 - Revenue entry and train purchase in one operating turn (Priority: P1)

Inside a company's operating turn, the user can enter revenue and also buy one or more trains,
in any order, without losing what they already entered. After a train purchase the turn stays
open. The user sees what has been recorded so far and can carry on, until they finish the turn.

**Why this priority**: Losing typed revenue is a silent data-entry trap. It is on the same path
as Story 1, and Story 1's "finish turn" step needs a turn that stays open across several
actions.

**Dependency**: This story builds on Story 1's operating turn (the turn that stays open and its
"finish turn" step), so it is delivered after Story 1.

**Independent Test**: Open a company's turn and type a revenue amount. Go to buy a train and
buy one. Come back and confirm the typed amount is still there. Record the run and finish the
turn.

**Acceptance Scenarios**:

1. **Given** the user has typed a revenue amount without confirming a payout, **When** they open
   train buying and come back without buying, **Then** the typed amount is still shown.
2. **Given** the user has typed a revenue amount, **When** they buy a train, **Then** the turn
   stays open on the company's operating view, the typed amount is still shown, and the new
   train is listed among the company's holdings.
3. **Given** the user has recorded the run (payout done), **When** they buy a train, **Then** the
   turn stays open and the run is shown as already recorded. It is not offered for entry again.
4. **Given** several actions were recorded in one turn, **When** the user views the turn,
   **Then** a short summary lists what was recorded in this turn (run and payout, trains bought,
   costs paid).

---

### User Story 3 - Operating actions follow the operating order (Priority: P2)

In an operating round, operating actions are offered for the current company only. Companies
operate in the order the game's rules set: by share price on the market, with the game's
tie-breakers. Other companies' cards still show their details. Recording an operating action
for a company that is not current needs a deliberate override, and that override is recorded.

**Why this priority**: This stops actions being recorded against the wrong company. The order
is already computed, so this is mostly about how the controls behave. It ranks below Stories 1
and 2 because in practice the table usually follows the order on its own.

**Independent Test**: In an operating round with three companies, tap a non-current company's
card. Check that its operating actions are not offered as the normal path, and that the
override path works and shows in History.

**Acceptance Scenarios**:

1. **Given** an operating round, **When** the round starts, **Then** the first company in the
   game's operating order is current, and the order is visible (for example, the next one or two
   companies are named).
2. **Given** an operating round where company B is not current, **When** the user taps B's card,
   **Then** B's details are shown, and its operating actions are reachable only through an
   explicit "operate out of turn" control.
3. **Given** the user chooses "operate out of turn" for company B, **When** they record an
   action for B, **Then** the action is applied, B does not become current, and History marks
   the action as recorded out of turn.
4. **Given** a company's share price changes during the OR (for example, a payout moves it),
   **When** the next company is picked, **Then** the order is worked out again from current
   prices, skipping companies that have already operated in this OR (current behavior kept).
5. **Given** the table needs to fix the turn, **When** the user opens the turn editor, **Then**
   they can still set any company as current. This is recorded as a manual override.

---

### User Story 4 - "Comprar privada" appears only when a private can be bought (Priority: P3)

The round-controls bar shows the private-purchase control only when at least one private can
actually be bought now. That means one still unsold in the bank, or a player-to-player resale
that the game allows in the current round. Otherwise the control is not shown.

**Why this priority**: The bug is cosmetic and harmless, but confusing. The fix is small and
does not depend on the other stories.

**Independent Test**: Sell every private in the opening round, then start stock round 1 and
confirm the control is gone. In a game that allows resale, start stock round 2 and confirm it
comes back.

**Acceptance Scenarios**:

1. **Given** the private-auction round with unsold privates, **When** the controls are shown,
   **Then** "Comprar privada" is offered.
2. **Given** all privates are owned and resale is not allowed in the current round, **When** the
   controls are shown, **Then** "Comprar privada" is not shown.
3. **Given** all privates are owned and the game allows player-to-player resale in the current
   stock round, **When** the controls are shown, **Then** "Comprar privada" is offered, and the
   list shows the privates that can be traded.
4. **Given** every private has closed or been removed, **When** the controls are shown, **Then**
   "Comprar privada" is not shown in any round.
5. **Given** a voice command or "do it by hand" asks for a private purchase while none can be
   bought, **When** the touch fallback opens, **Then** the user sees a short message saying no
   private can be bought now, not an empty list.

---

### Edge Cases

- **National company / revenue in parts (21Moon, 1848 BoE)**: "No run" and finishing the turn
  must work for every way revenue is entered: one amount plus a payout mode, revenue split into
  parts, or a national company's payout.
- **Forced withhold** (for example, a company with no trains): only withhold is offered, as
  today. "No run" stays available.
- **Company in receivership**: it still takes its turn in operating order, and its operation is
  recorded the same way.
- **Turn already recorded by voice**: if a voice command recorded the run, the touch turn shows
  it as recorded, and finishing the turn is available right away.
- **Last company in the last OR of a set**: finishing the turn moves to the end of the set, as
  "Siguiente" did before (a prompt to start the stock round).
- **Company floats or closes in the middle of an OR**: the next current company is worked out
  again from the order at that moment (current behavior kept).
- **Private income**: the "collect private income" control is not affected by this feature.
- **Undo after advancing**: undoing the finish-turn step brings back the previous company as
  current, with its recorded actions intact.
- **Closing the sheet without finishing**: if the turn sheet is closed without finishing the
  turn, the company stays current. Anything already recorded is kept, and anything typed but
  not confirmed is dropped.

## Clarifications

### Session 2026-10-09

- Q: When someone records an operating action for a non-current company, should it be allowed through a recorded override or blocked? → A: Allowed only through an explicit "operate out of turn" control, marked in History. Never fully blocked.
## Requirements *(mandatory)*

### Functional Requirements

**Operating turn (Stories 1–2)**

- **FR-001**: During an operating round, the round controls MUST show one primary control that
  opens the current company's operating turn. The separate control that advanced to the next
  company without opening the turn MUST be removed.
- **FR-002**: The operating turn MUST offer an explicit "no run" choice. It records the run with
  zero revenue and applies the game's market move for a company that does not pay.
- **FR-003**: The operating turn MUST offer "finish turn" only after a run (including "no run")
  has been recorded for the current company in this OR. If it is unavailable, the reason MUST be
  shown.
- **FR-004**: Finishing the turn MUST advance to the next company in operating order. When no
  company is left, it MUST continue to the next OR or the end of the set, as advancing does
  today.
- **FR-005**: Finishing a turn MUST be one undoable step. Undo MUST make the previous company
  current again.
- **FR-006**: Unconfirmed revenue typed in the operating turn MUST be kept while the user moves
  between that turn's sub-views (train purchase, costs, bank payments, privates, loans) and
  after an action recorded in a sub-view.
- **FR-007**: After an action is recorded inside the operating turn (for example, a train
  purchase), the turn MUST stay open on the company's operating view and MUST NOT close.
- **FR-008**: The operating turn MUST show a summary of the actions already recorded for this
  company in the current OR. A run already recorded MUST show as done, not as a new entry.
- **FR-009**: Voice commands MUST keep producing the same actions. A run recorded by voice MUST
  count as "run recorded" for FR-003. A voice "next company" command MUST follow the same rule
  as finishing the turn (it needs a recorded run, or it records "no run" only after
  confirmation).

**Operating order (Story 3)**

- **FR-010**: At the start of each operating round, the first company in the game's operating
  order MUST be current. The round controls MUST show the current company and at least the next
  company in order.
- **FR-011**: During an operating round, operating actions MUST be offered as the normal path
  only for the current company. Tapping another company's card MUST show its details.
- **FR-012**: Recording operating actions for a non-current company MUST be possible only
  through an explicit "operate out of turn" control. It MUST NOT be fully blocked (Constitution
  Principle III). Such actions MUST be marked as out of turn in History, and MUST NOT change
  which company is current.
- **FR-013**: The turn editor MUST still allow setting any company as current, recorded as a
  manual override.

**Private purchase control (Story 4)**

- **FR-014**: The round controls MUST show the private-purchase control only when at least one
  private can be bought now: one unsold in the bank, or one resellable under the game's resale
  rules in the current round.
- **FR-015**: When the private-purchase sheet is opened by another path (voice fallback) and no
  private can be bought, it MUST show an explanatory message, not an empty list.

**General**

- **FR-016**: All controls added or changed by this feature MUST meet the existing touch-target
  and accessibility rules, and MUST work in phone portrait and tablet landscape.
- **FR-017**: The product reference (`docs/spec.md`) MUST be updated to describe the new
  operating-turn flow and the removal of the standalone "next" control.

### Key Entities

- **Operating turn**: one company's part of an OR. It holds the actions recorded for that
  company in this OR, whether a run (or "no run") has been recorded, and whether the turn is
  finished.
- **Turn draft**: values typed but not confirmed in an open operating turn (such as revenue).
  It is kept only while the turn is open. It is never part of the game record.
- **Purchasable private**: a private that can be bought right now, given who holds it, whether
  it is closed, the round, and the game's resale rules.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a full touch-only operating round, 0 companies can end their turn without a
  run or "no run" recorded. This is checked by trying to skip each company.
- **SC-002**: After a full OR played by touch, every company that did not pay has had its share
  price moved by the game's rule. Market positions match a hand-computed reference for 100% of
  companies.
- **SC-003**: Typed revenue survives a train purchase in 100% of tested sequences (type → buy
  train → return; type → open train view → back).
- **SC-004**: A standard turn (enter revenue, pay, buy one train, finish) takes at most 6 taps
  plus the revenue digits. A "no run" turn takes at most 3 taps.
- **SC-005**: The private-purchase control is never shown when the private list would be empty.
  This is checked across every round type in all three built-in games.
- **SC-006**: In a play-test OR, testers record 0 operating actions against the wrong company
  without first using the override.
## Assumptions

- "If the app is managing everything" is read as: the app tracks the stock market. It always
  does in this product, whatever the wallet mode. So the new operating-turn rules apply to
  every session, in both wallet modes.
- "No run" is recorded as a run with zero revenue and the withhold mode, which already brings
  the game's market move for a company that does not pay. No new market rule is needed.
- Optional actions (buying trains, paying costs, loans, buying privates) do not have to happen
  before finishing a turn. Only the run, or "no run", is required.
- The operating-order rule (share price, then the game's tie-breakers, plus "operates first"
  companies such as the 1848 BoE) already exists and is not changed. Only how the controls use
  it changes.
- The constitution's "warn, never block" principle applies to Story 3. The finish-turn rule in
  Story 1 is guided flow, not a rules block: the user can always record "no run", or fix the
  turn in the turn editor.
- The "Empezar OR" and "Empezar ronda de acciones" controls stay as they are.
