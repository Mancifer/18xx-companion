# Feature Specification: UI Readability Polish and RotLA Major Names

**Feature Branch**: `013-ui-readability-polish`

**Created**: 2026-10-15

**Status**: Implemented

**Input**: User description: "I want to implement a few changes based on my testings, mostly UI related: update the history and other parts of the application where we show the company short name so it appears with its background color, the same way we display it in the player and company components (examples: the history, the income sheet), to help players recognize companies when scanning the app. Present trains as badges, simulating the cards trains are in the physical game, because they are hard to see on the company board. Improve the buy-shares modal shown during the SR when tapping a company: it shows where shares can be bought from and how many are left, but inline and hard to read. Finally, implement the real second names of the RotLA majors and remove the placeholders: Unlimited/Union, Conglomerate/Consortium, International/Inc., Federation/Firm, League/LLC, Alliance/Authority, Syndicate/System, Experiment/Enterprise."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognize companies at a glance everywhere (Priority: P1)

While scanning the play history, the income summary, or any other screen that mentions a company, a player sees each company as its colored short-name badge (the same badge the player tiles and company cards already use), instead of plain text. They can spot "every entry about the red company" without reading each line.

**Why this priority**: Company references appear on almost every screen and the history is the main place players check during disputes. It is the change the user tested most and gives the widest readability gain.

**Independent Test**: Play a few actions involving two companies, open the history and the income summary, and confirm every company mention shows as a colored badge with the short name, matching the badge on the company card.

**Acceptance Scenarios**:

1. **Given** a history entry for an action involving a company (buy share, operate, dividend, train purchase, merger), **When** the player opens the history, **Then** each company mentioned in the entry's summary appears as a badge with the company's color and short name, readable inside the sentence.
2. **Given** the income summary lists movements involving companies (dividends, payments), **When** the player opens it, **Then** each company appears as its badge.
3. **Given** a reverted (struck-through) history entry, **When** it is shown, **Then** its company badges stay readable and the entry still looks reverted.
4. **Given** any other screen that today names a company by its short name in plain text (for example the results screen, the out-of-turn notice, the market prompt, the stock-round trader list in a corporate round), **When** it is shown, **Then** the company appears as its badge.

---

### User Story 2 - See a company's trains as cards (Priority: P2)

On the company board (company card on the table and the operate view), each train the company owns is shown as its own small card-like badge with the train's name, so a player can count and identify trains at a glance, the way they look at the physical train cards.

**Why this priority**: Trains drive revenue and train limits; today they are a plain text list that is hard to read. It is very visible, but it affects fewer screens than company badges.

**Independent Test**: Give a company a 2-train and a 3-train, open the table and the operate view, and confirm two separate train cards are visible, ordered by train type, with the count and limit still shown.

**Acceptance Scenarios**:

1. **Given** a company owns trains, **When** its card or operate view is shown, **Then** each train appears as a separate card-like badge with its name (e.g. "2", "3", "D"), ordered from oldest to newest type.
2. **Given** a company owns a rusted train it may keep (e.g. Resourceful in RotLA), **When** its trains are shown, **Then** that train's card is visibly marked as rusted with a text cue, not only a color.
3. **Given** a company is over its train limit, **When** its trains are shown, **Then** the over-limit warning remains visible with text alongside the cards.
4. **Given** a company owns no trains, **When** its trains are shown, **Then** the "no trains" text still appears.
5. **Given** the operate view's train line offers "Corregir…", **When** trains become cards, **Then** that correction entry point remains available.

---

### User Story 3 - Read share availability clearly when buying (Priority: P2)

During a stock round, when a player taps a company, the buy-shares view shows each place shares can be bought from (IPO, pool, company treasury) as a clearly separated item with its share count and price, instead of one inline line of text.

**Why this priority**: Buying shares is the most frequent stock-round action; misreading what's left in the IPO versus the pool leads to wrong purchases. It is a contained change to one view.

**Independent Test**: Open a floated company during an SR with shares in both the IPO and the pool, and confirm each source is shown as a separate, labeled item with its count and price, readable without parsing a sentence.

**Acceptance Scenarios**:

1. **Given** a company with shares in the IPO and the pool, **When** the player taps it during an SR, **Then** the view shows the IPO and the pool as separate items, each with its label, shares remaining, and price per share.
2. **Given** a source has zero shares left, **When** the view is shown, **Then** that source is shown as empty (e.g. "0") or de-emphasized, so the player sees it is exhausted.
3. **Given** a company holding its own shares in its treasury (RotLA), **When** the view is shown, **Then** the treasury appears as its own item with count and price.
4. **Given** the existing buy and sell buttons per player, **When** the availability display changes, **Then** buying and selling still take the same number of taps as today.

---

### User Story 4 - Real second names for RotLA majors (Priority: P3)

When a RotLA major merges and takes its second identity, the app shows the real name from the game instead of a placeholder ("International II", etc.), and voice commands recognize the real names.

**Why this priority**: Small data correction, but it removes visible placeholders that look like bugs during play.

**Independent Test**: Start a RotLA game (with Landmarks), check each major's two identity names in the merger view and the custom-game editor, and say a command using a second name (e.g. "Firm") to confirm it resolves to the right company.

**Acceptance Scenarios**:

1. **Given** a RotLA session, **When** the player opens a merger into a major, **Then** the identity choices show these pairs: Consortium / Conglomerate, Union / Unlimited, System / Syndicate, International / Inc., Federation / Firm, Experiment / Enterprise, and with Landmarks, Authority / Alliance and League / LLC.
2. **Given** a major that took its second identity, **When** its name is shown anywhere the full name appears, **Then** the real second name is shown (e.g. "Firm", not "Federation II").
3. **Given** the player names a major by its second name in a voice command, **When** the command is resolved, **Then** it maps to the correct company.
4. **Given** the game definition's verification status, **When** the names are updated, **Then** the major names are no longer flagged as unverified placeholders.

---

### User Story 5 - The market shows only companies still in play (Priority: P3)

*Added 2026-10-15, after testing.*

On the Market screen, a closed company's token no longer appears on the track or in the "Sin ficha en el mercado" row. Closed companies don't operate, so their tokens only made the market harder to read.

**Why this priority**: It is confusing, but it doesn't block play. It is a small change to one screen.

**Independent Test**: In 1830, close a floated company. Open the Market and confirm its token appears nowhere while the other tokens are unchanged. Undo the close and confirm the token is back on its cell.

**Acceptance Scenarios**:

1. **Given** a company that was closed (closed by hand, or a RotLA minor that merged into a major), **When** the player opens the Market, **Then** its token is not shown on any cell or in the "Sin ficha en el mercado" row.
2. **Given** a RotLA company dissolved on the closed cell, **When** the player opens the Market, **Then** its token is not shown, and the "Cerrada" cell itself is still drawn.
3. **Given** the close is undone, **When** the player opens the Market, **Then** the token is back on its cell, in its place in the stack.
4. **Given** companies in receivership or bankrupt but not closed, **When** the player opens the Market, **Then** their tokens are still shown.

---

### Edge Cases

- A company with a very light color (e.g. Authority, light gray) or very dark color must keep a readable short name and stay distinguishable from the background in both themes.
- History summaries that mention two or more companies in one sentence (mergers, exchanges) show each as its own badge.
- A history entry from an older session whose company no longer exists in the game definition (custom game edited) falls back to the plain identifier.
- Many trains (e.g. a company at a high limit with permanent trains, or 21Moon's unlimited types) wrap onto several lines without horizontal scrolling on a phone in portrait.
- Train types with long names (e.g. "2 (Manufacturing)") still fit inside a train card or wrap gracefully.
- A merged major's badge keeps its short name; only the full name (shown in titles and tooltips) switches to the second identity.
- A token was selected for a move when its company closed (for example, after a voice command): the selection is dropped, and the prompt goes back to the default text (US5).
- Sessions saved before this change that recorded a merger into a second identity show the new real name on reload (names come from the game definition, not from stored text).

## Requirements *(mandatory)*

### Functional Requirements

**Company badges**

- **FR-001**: Every place where the app names a company by its short name as plain text MUST instead show the company badge (company color background, contrasting text color, short name), the same visual element used on player tiles and company cards.
- **FR-002**: History entry summaries MUST show every company they mention as a badge, inline within the sentence.
- **FR-003**: The income summary MUST show every company it mentions as a badge.
- **FR-004**: Badges inside running text MUST keep the line readable: sized to the surrounding text and not breaking line height noticeably.
- **FR-005**: Badges are a visual presentation only. Text that leaves the screen as plain text (voice prompts and replies, exports, accessible labels) MUST keep the plain name. On screen, assistive technology MUST read the same words as before the change.
- **FR-006**: Badges MUST keep the company's full name (the second identity if the company took it) as a hover hint, as badges do today. Where the full name matters to the task (company card, merger choices, sheet titles), it is shown as visible text next to the badge.

**Train cards**

- **FR-007**: The company card and the operate view MUST show each train a company owns as a separate card-like badge with the train's name, ordered by train type from oldest to newest.
- **FR-008**: A rusted train still held MUST be marked on its card with a text cue (not only color).
- **FR-009**: The train count against the train limit and the over-limit warning MUST remain visible as text next to the train cards.
- **FR-010**: The "no trains" state and the "Corregir…" entry point in the operate view MUST be preserved.
- **FR-011**: Train cards MUST wrap within the available width on phone portrait and tablet landscape, with no horizontal scrolling.

**Buy-shares view**

- **FR-012**: The stock-round company view MUST present each share source (IPO, pool, and company treasury when it holds shares) as a separate, labeled item showing the shares remaining and the price per share from that source.
- **FR-013**: A source with no shares left MUST be visibly marked as empty.
- **FR-014**: The change MUST NOT add taps to buying or selling: the per-player buy and sell actions keep working as today.

**RotLA major names**

- **FR-015**: The RotLA base majors' second identities MUST be: Consortium → Conglomerate, Union → Unlimited, System → Syndicate, International → Inc., Federation → Firm, Experiment → Enterprise.
- **FR-016**: The Landmarks majors' second identities MUST be: Authority → Alliance, League → LLC.
- **FR-017**: Voice aliases for the new second names MUST be added (English name plus a natural Spanish form where one exists), and the placeholder aliases ("international dos", etc.) MUST be removed.
- **FR-018**: The RotLA definition MUST no longer mark the major names as unverified placeholders, and the project's research notes MUST record the source (the user's copy, 2026-10-15).
- **FR-019**: Company short names, colors and which identity is the default MUST stay unchanged.

**Market (added 2026-10-15)**

- **FR-020**: The Market screen MUST NOT show the token of a company whose status is closed, either on the track or in the "Sin ficha en el mercado" row.
- **FR-021**: Hiding is a view of the current state only. Nothing is recorded, and an undo that reopens the company MUST bring its token back where it was.
- **FR-022**: Companies in any other status (parred, floated, receivership, bankrupt) MUST keep showing as today, and the market's cells, including RotLA's "Cerrada" cell, MUST still be drawn.

### Key Entities

- **Company badge**: the visual identity of a company: color, contrasting text color, short name, full name as the accessible label.
- **Train card**: the visual of one train owned by a company: train name, rusted mark when applicable.
- **Share source**: a place shares can be bought from (IPO, pool, company treasury), with shares remaining and price per share.
- **Major identity pair**: a RotLA major's default name and second name, each with voice aliases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of company mentions in the history, the income summary, and the other screens listed in User Story 1 render as company badges (no plain-text short names remain on those screens).
- **SC-002**: In a manual check, a player can find all history entries for a given company in a 30-entry history by scanning colors, in under 10 seconds.
- **SC-003**: A player can tell how many trains a company owns and which types, from the table screen, in under 2 seconds without opening any view.
- **SC-004**: A player can read the IPO and pool share counts in the stock-round view without misreading either source in a manual check across all supported games.
- **SC-005**: Zero placeholder major names ("… II") remain in the RotLA and Landmarks definitions, and the voice eval cases that use second identities resolve to the right company.
- **SC-006**: Buying a share still takes at most 2 taps from the table.
- **SC-007**: In every built-in game, the Market shows zero tokens of closed companies, and the same tokens as before for every other company.

## Assumptions

- The user's list pairs each major's two identities; the arrow direction does not change which identity is the default. Current defaults (Consortium, Union, System, International, Federation, Experiment, Authority, League) stay the defaults, and the other name in each pair becomes the second identity.
- Short names (CON, UNI, SYS, INT, FED, EXM, AUT, LGE) stay the same for both identities; only the full name changes.
- "Other parts of the application" means every screen that today prints a company's short name as text; the plan will inventory them. Company names inside select/dropdown options may stay plain where the platform cannot render badges inside options.
- Train cards use a neutral card style shared by all games; per-train-type colors are not required.
- The buy-shares change is limited to how availability is displayed; the actions and their rules are unchanged.
- Spanish (Uruguayan) UI labels, consistent with the rest of the app.
- No domain logic, ledger events or money rules change; existing sessions replay unchanged.
- "Closed" means the company status `closed` only (US5). Bankrupt and receivership companies stay visible: they can still hold a price and, in some games, operate.
- A closed company's price can no longer be moved from the Market screen. That is acceptable, because a closed company has no price that matters. A manual correction is still possible through the existing manual actions (Principle III).
