# Feature Specification: Chip Inventory and Bank Setup

**Feature Branch**: `008-chip-inventory-setup`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "I want to update the default chips for all games. Let's make it so by default chips are: 500 - Green, 100 - Red, 25 - Black, 5 - Blue, 1 - White." Follow-up: "We currently have a setting that shows the label for the chips, but we're not really using it; it's up to the player to track that, if they decide to use a chip with 25 printed on it to represent 5 for instance. Something more useful would be setting how many physical chips of each color the player has at their disposal, and that would also help building the bank for games that have a set bank. Some existing apps kinda do this, where you specify how many chips you have and what value they represent and they build the bank with that constraint. Of course there will be scenarios where you can't build the bank with what they have; here I think we should add a warning and add the missing chips regardless, but we give the opportunity for users to adjust the number of chips or their value before committing."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New sessions start with the new default chips (Priority: P1)

A player starts a new session of any built-in game (1830, 1848, 21Moon, Railways of the Lost
Atlas). Without editing anything, the chip set is the new default: 500 green, 100 red, 25 black,
5 blue, 1 white. Chip breakdowns on confirmation cards, undo notices and the launch sheet use only
these values and show them in these colors.

**Why this priority**: The base of the feature. It removes the hand editing every session needs
today, and the other stories build on it.

**Independent Test**: Start a new session of each built-in game, keep the default chips, and check
the chip set and the breakdown of a bank payout.

**Acceptance Scenarios**:

1. **Given** any built-in game is chosen on the new-session screen, **When** the user opens the
   chip editor, **Then** it lists exactly five colors, highest value first: green 500, red 100,
   black 25, blue 5, white 1, each with a default count (see FR-004).
2. **Given** a session with the default chips, **When** the bank pays a player 287, **Then** the
   breakdown is 2 × 100, 3 × 25, 2 × 5, 2 × 1.
3. **Given** a session with the default chips, **When** the bank pays 50, **Then** the breakdown is
   2 × 25.
4. **Given** a new Railways of the Lost Atlas session, **When** the bank pays 7, **Then** the
   breakdown is 1 × 5, 2 × 1.

---

### User Story 2 - Record the chips the table owns (Priority: P1)

The group owns a physical set of poker chips. In the chip editor, for each chip color they set how
many of those chips they have and which value it stands for at this table (a chip printed "25" may
stand for 5). There is no separate label field any more: a chip is a color, a value and a count.

**Why this priority**: The counts are what make the bank setup (Story 3) possible, and the value
per color covers what the label tried to do.

**Independent Test**: Edit the counts and values in the chip editor, start the session, reopen the
editor, and check they were kept.

**Acceptance Scenarios**:

1. **Given** the chip editor, **When** the user looks at a chip row, **Then** it shows color, value
   and count, and no label field.
2. **Given** the chip editor, **When** the user sets black to value 5 and blue to value 25, **Then**
   breakdowns show black chips for 5 and blue chips for 25.
3. **Given** a count field, **When** the user clears it, **Then** that color is treated as
   unlimited, as today.
4. **Given** a saved session whose chips had labels, **When** it is reopened, **Then** each chip shows
   its value, and the old label is ignored.
5. **Given** a session with a count of 2 for green (500), **When** the bank pays 2,000 mid-game,
   **Then** the breakdown is 4 × 500; the count does not limit it.

---

### User Story 3 - Build the bank and starting cash from the table's chips (Priority: P2)

Before the game starts, the app shows how to set up the money on the table: which chips each
player takes as starting cash, and which chips make up the bank. For a game with a fixed bank
(1830: 12,000; 1848: 10,000; RotLA with the bank-breaking variant: 8,000) the whole bank total is
split. For a game with an unlimited bank, only the players' starting cash is split and every
remaining chip goes to the bank.

**Why this priority**: Saves the slow counting at setup, which is the main reason to record counts.
It depends on Stories 1 and 2.

**Independent Test**: Choose 1830 with 4 players and the default chips, open the setup, and check
each player gets chips worth 600 and the bank gets chips worth 9,600, within the counts owned.

**Acceptance Scenarios**:

1. **Given** 1830, 4 players and enough chips, **When** the setup is shown, **Then** each player's
   chips add up to 600, the bank's chips add up to 9,600, and no color is used more times than its
   count.
2. **Given** 1830, 4 players and the default chips, **When** the setup is shown, **Then** each
   player's 600 is 1 × 500, 1 × 100.
3. **Given** 1848, 4 players and the default chips, **When** the setup is shown, **Then** each
   player's 630 is 1 × 500, 1 × 100, 1 × 25, 1 × 5.
4. **Given** a game with an unlimited bank, **When** the setup is shown, **Then** each player's chips
   add up to their starting cash and the bank gets all remaining chips.
5. **Given** the setup is shown, **When** the user starts the session, **Then** the setup can be
   opened again during the game from the chips sheet.
6. **Given** 1830, 4 players and the default chips, **When** the user sets the bank's green chips
   to 6, **Then** the bank keeps 6 × 500 and the colors the user has not changed are recalculated
   so the bank still adds up to 9,600 (red drops from 77 to 47).
7. **Given** the user has adjusted the bank, **When** the session starts, **Then** the start
   notice and the chips sheet show the adjusted bank, not the suggestion.
8. **Given** an adjusted bank, **When** the user taps "Restablecer", **Then** the bank goes back to
   the suggestion.
9. **Given** adjustments that cannot add up to the bank total (e.g. more green than the bank
   needs), **When** the setup is shown, **Then** it shows how far off the bank is, and the user
   can still start.

---

### User Story 4 - Starting-chips notice when the game starts (Priority: P2)

When the session starts, the game screen shows a notice like the one shown after a bank
transaction: the chips each player takes for their starting cash, shown as colored chips with
counts, and, for a fixed-bank game, the chips that make up the bank. The table hands out chips
straight from it without opening any menu.

**Why this priority**: Handing out starting money is the first thing every game does; showing it
where transactions are shown makes it quick. Depends on Story 3.

**Independent Test**: Start an 1830 session with 4 players and check the notice lists each
player's chips and the bank's chips, then dismiss it.

**Acceptance Scenarios**:

1. **Given** a new session is started, **When** the game screen opens, **Then** a notice shows,
   per player, the chips for their starting cash in the same chip style as transaction notices.
2. **Given** all players get the same amount, **When** the notice is shown, **Then** it shows the
   chips once ("Cada jugador") rather than repeating the same row per player.
3. **Given** the plan has missing chips, **When** the notice is shown, **Then** the missing chips are
   marked as in the setup plan.
4. **Given** the notice, **When** the user dismisses it or makes the first action, **Then** it goes
   away, and the same information stays available from the chips sheet.

---

### User Story 5 - Warn and fill in when the chips are not enough (Priority: P2)

When the owned chips cannot cover the bank (or the starting cash), the app still produces a full
setup: it adds the missing chips, clearly marked as missing, and shows a warning with what is
missing (e.g. "Faltan 12 fichas rojas (100)"). Before starting, the user can change counts or
values and the setup updates at once. The user can also start anyway; the table then uses
substitutes (paper money, other chips) for the missing ones.

**Why this priority**: Without it the setup is useless for small chip sets, which are common.

**Independent Test**: Set the green and red counts to 10 for 1830 with 4 players, check the
warning ("Faltan 8 fichas verdes (500), 1 roja (100)") and the marked chips, raise the green count
to 50, and check the warning goes away. (With only red at 10, the greens still cover the bank and
no warning shows; see research R13.)

**Acceptance Scenarios**:

1. **Given** chips worth less than the bank total, **When** the setup is shown, **Then** a warning
   lists, per color, how many chips are missing, and the setup still adds up to the full amounts.
2. **Given** a warning is shown, **When** the user raises a count or changes a value, **Then** the
   setup and warning update without leaving the screen.
3. **Given** a warning is shown, **When** the user starts the session anyway, **Then** the session
   starts and the warning is still visible when the setup is reopened.
4. **Given** chips worth more than enough in total but no way to make an exact player amount (e.g.
   no small chips), **When** the setup is shown, **Then** the missing small chips are added and
   warned about the same way.

---

### Edge Cases

- A color with no count (unlimited) is never reported as missing.
- All counts empty: the setup uses as many chips as it needs and shows no warning.
- A count of 0 means the table has none of that color; the setup only uses it as a missing chip.
- Starting cash that changes with the number of players, or with a game option, updates the setup.
- Wallet mode "Solo banco": players still receive their starting cash in chips.
- Mid-game payouts may show more chips of a color than the table owns; the counts do not limit
  play.
- Amounts that are multiples of 10 but not of 25 are made with 5s (30 = 1 × 25 + 1 × 5).
- White chips stay visible on a light background, and black chips stay visible in dark mode.
- A custom game created after the update starts from the new default chips of the game it copies.
- An unlimited-bank game has nothing to adjust: the bank gets every remaining chip.
- A bank adjustment for a chip value that no longer exists (the value was edited or the chip
  removed) is dropped.
- A bank adjustment stays when the number of players or a game option changes; the other colors
  are recalculated around it.

## Requirements *(mandatory)*

### Functional Requirements

**Default chips**

- **FR-001**: Every built-in game MUST have the same default chip set: 500 green, 100 red,
  25 black, 5 blue, 1 white, highest value first, and no other values.
- **FR-002**: New sessions MUST start with the default chip set unless the user edits it, and the
  "Volver al juego" action in the chips sheet MUST restore it.
- **FR-003**: Sessions and custom games saved before the update MUST keep their stored chip sets.
- **FR-004**: The default chip set MUST come with default counts per color, matching a common
  500-chip poker set: green 50, red 150, black 50, blue 100, white 150. Users can change them per
  session.

**Chip inventory**

- **FR-010**: Each chip in the editor MUST have a color, a value and a count; the label field MUST
  be removed from the editor.
- **FR-011**: An empty count MUST mean unlimited; a number MUST mean the total chips of that color
  the table owns.
- **FR-012**: Labels stored in older sessions MUST be ignored for display; the chip's value is shown.
- **FR-013**: Counts MUST be used only to build and check the setup plan. Mid-game chip breakdowns
  (after setup) MUST ignore counts and always show the fewest chips for the amount; how the table actually makes
  change (e.g. 5 × 100 instead of 1 × 500) is up to the players.

**Bank setup**

- **FR-020**: The app MUST show a setup plan on the new-session screen before the session starts:
  the chips for each player's starting cash, and the chips for the bank.
- **FR-021**: For a fixed-bank game, the plan MUST add up to the bank total: the players' starting
  cash plus the bank's remaining amount. For an unlimited-bank game, the players' chips MUST add up
  to their starting cash and the bank MUST get every remaining owned chip.
- **FR-022**: Each player's starting cash MUST be split into the fewest chips, the same rule as
  for transactions (e.g. 600 → 1 × 500, 1 × 100); players make change with the bank as they need
  it.
- **FR-022a**: For a fixed-bank game, the bank's amount MUST be built from the owned chips left
  after the players, keeping as many lower-value chips as it can so the bank can make change;
  chips not needed for the exact total are set aside, and the plan says how many of each.
- **FR-022b**: For a fixed-bank game, the user MUST be able to change how many chips of each color
  go to the bank, on the new-session screen and in the chips sheet. A changed color keeps the
  user's count; the colors not changed are recalculated with the FR-022a rule so the bank still
  adds up to its amount. A reset MUST return to the suggestion. Only the bank can be adjusted;
  players' chips follow FR-022.
- **FR-022c**: When the user's counts make the bank add up to more or less than its amount, or use
  more chips than the table has left, the plan MUST show the difference or the missing chips
  (FR-023) and MUST NOT stop the user from starting.
- **FR-022d**: The user's bank adjustments MUST be saved with the session and included in its
  export. They are table configuration: they MUST NOT add events or change any balance.
- **FR-023**: The plan MUST use owned chips first; when they are not enough, it MUST add the
  missing chips, mark them as missing, and show a warning with the missing count per color.
- **FR-024**: The plan MUST update immediately when the chips, the number of players, or a game
  option that affects the bank or starting cash changes.
- **FR-025**: A warning MUST NOT stop the user from starting the session.
- **FR-026**: The plan for the session's chips and players, with any bank adjustments, MUST be
  viewable and adjustable during the game from the chips sheet.
- **FR-026a**: When a session starts, the game screen MUST show a dismissible notice with each
  player's starting chips (grouped as "Cada jugador" when all amounts are equal) and, for a
  fixed-bank game, the bank's chips, in the same chip style as transaction notices.
- **FR-027**: The setup is guidance for the table only; it MUST NOT add events to the game log or
  change any balance.

### Key Entities

- **Chip**: a physical chip color at this table, with the value it stands for and how many the
  table owns (or unlimited).
- **Chip set**: the session's chips, highest value first, with unique values.
- **Setup plan**: for each player, the chips that make their starting cash; for the bank, the
  chips that make the rest; plus the missing chips per color when the owned ones are not enough.
- **Bank adjustment**: the bank counts the user set by hand, per chip value, saved with the
  session; colors without one follow the suggestion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A group using 500/100/25/5/1 chips in green/red/black/blue/white starts a session of
  any built-in game with zero chip edits.
- **SC-002**: For every built-in game and player count, the setup plan's amounts are exact: each
  player gets exactly their starting cash, and for a fixed bank the plan totals the bank total.
- **SC-003**: The setup plan never uses more chips of a color than the table owns without listing
  the extra as missing.
- **SC-004**: Changing a count or value updates the plan and warning in under 1 second.
- **SC-005**: 100% of sessions created before the update show the same chip values and colors after
  it.
- **SC-006**: Setting up the table's money takes a group less time than counting it by hand
  (target: under 2 minutes for 4 players).

## Assumptions

- "All games" means the four built-in game definitions; custom games keep the chips they were
  saved with.
- RotLA also gets the 1 chip; its bank-breaking variant counts as a fixed bank of 8,000.
- In a fixed-bank game, the bank total includes the players' starting cash (the players take their
  money from the bank), as in the rulebooks.
- Missing chips are made up at the table with substitutes; the app does not track them after setup.
- The app does not track where chips are during the game; counts are table totals, used only for
  the setup plan. This drops today's per-transaction count limit; it may come back after play
  testing.
- A way to save the user's own default chips (across sessions) is a possible later feature, out of
  scope here.
- Giving players a mix of smaller chips at the start (to pay for privates and shares without
  breaking big chips) is left for later; it needs some calculation to know whether skipping the
  highest value actually helps.
- Exact color shades are a design choice, as long as each reads as its named color and the value
  stays legible.
- Existing tests and evaluation fixtures that assume the old chip set or labels will be updated.
