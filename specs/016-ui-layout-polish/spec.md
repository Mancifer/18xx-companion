# Feature Specification: UI Layout Polish

**Feature Branch**: `016-ui-layout-polish`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "General UI improvements: a clearer and more consistent Settings screen; History reachable directly from the board; demote the rarely used share-batch ('Lote de acciones') button; better use of tablet and large screens with the players and companies panes aligned; no microphone overlay when voice can't work in this browser (and fix the lag when tapping it); a per-company holdings table with sell actions and certificate counts on the player sheet; a 'Trains' label on company cards on large screens."

## Scope Note

The request covers seven independent polish items. They are kept in **one specification** because
they share one surface (the Table screen and its sheets plus Settings), one kind of change
(presentation and placement, no new rules or money logic), and one verification style (visual and
interaction checks on phone and tablet). Each item is written as its own prioritized user story
that can be built, tested and shipped on its own, so the work can be split into separate
deliveries at planning time without changing this spec.

**Amendment 2026-11-08**: After the first implementation pass, two stories were added from review
on device: US7 (certificates at a glance: a donut on the player tile and the certificate summary
in the sheet header) and US8 (company choices always on two lines). Adjustments the user made by
hand during review are recorded under [Amendments](#amendments-2026-11-08) and supersede the
original wording where they differ.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - History one tap away on the board (Priority: P1)

During play, a player wants to check that the last few actions were recorded correctly, or look up
a value, without leaving the board through the general menu. The board shows a History control at
all times, in the board's action row (where the share-batch button used to be). The share-batch
action stays available, but as a secondary option rather than a prominent board button.

**Why this priority**: History is the most used check during a game (validating actions, finding
when a value changed). Today it takes two taps through the menu; making it one tap removes
friction many times per session, and it frees board space taken by an action that is hardly used.

**Independent Test**: Start a session, record a few actions, and open History from the board in one
tap in every round type; confirm the share batch is still reachable from its new secondary place
and works as before.

**Acceptance Scenarios**:

1. **Given** a session in any round (private auction, stock, operating, merger, corporate), **When** the player looks at the board, **Then** a History control is visible without opening any menu.
2. **Given** the board is shown, **When** the player taps History, **Then** the History screen opens in that single tap, and going back returns to the board in the same state.
3. **Given** a stock round, **When** the player looks at the board's action area, **Then** there is no share-batch button there.
4. **Given** a stock round, **When** the player wants to record a share batch, **Then** they can reach it from a secondary location (see FR-004) and it behaves exactly as before.
5. **Given** a phone in portrait, **When** the History control is added, **Then** no existing board control is pushed off-screen or covered.

---

### User Story 2 - Holdings table with certificate counts on the player sheet (Priority: P1)

When a player taps their card, the sheet shows their holdings as a table: one row per company they
hold, with the company, the percentage, the number of certificates (share cards) they hold in it,
whether they are president, and the sell action at the end of the row. A total of certificates is
shown together with the certificate limit that applies, so the player can tell before buying
whether one more certificate would break the rules.

**Why this priority**: The current sell buttons for every company sit side by side in one row,
which overflows and becomes hard to read with several holdings. And the certificate count matters
for legality: going over the limit is easy to miss at the table, and discovering it later forces
undoing several actions. Both problems directly cost game time.

**Independent Test**: Give a player shares in four or more companies (including one presidency),
open their sheet on a phone and check each company appears on its own row with correct
percentage, certificate count and a working sell action; check the total against a hand count.

**Acceptance Scenarios**:

1. **Given** a player holding shares in several companies, **When** their sheet opens, **Then** each company is shown on its own row with company name/badge, percentage held, certificates held, and a president mark where it applies.
2. **Given** a holding row, **When** the player taps its sell action, **Then** in a stock round one share of that company is sold in that tap (today's quick sell), and in any other round the existing "choose how many" sell flow opens with that company already selected; validation and confirmation are the same as today.
3. **Given** a player who holds a president's certificate (e.g. 20%) plus two ordinary 10% shares in the same company, **When** the sheet shows that row, **Then** it shows 40% and 3 certificates.
4. **Given** a game that defines a certificate limit, **When** the sheet opens, **Then** it shows the total certificates that count toward the limit next to the limit itself (e.g. "11 / 16").
5. **Given** a player at or over the certificate limit, **When** the sheet opens, **Then** the total is visibly marked as at/over the limit with a text cue (not color alone); nothing is blocked.
6. **Given** a player with no shares, **When** their sheet opens, **Then** the table is replaced by a short "no shares" line and the rest of the sheet works as today.
7. **Given** a phone in portrait with eight holdings, **When** the sheet opens, **Then** no row overflows horizontally; the sheet scrolls vertically if needed.

---

### User Story 3 - No microphone overlay when voice cannot work (Priority: P1)

When voice input is not usable on this device (for example: the browser has no speech recognition
and Whisper is turned off), the board no longer shows the microphone button or the "Este navegador
no reconoce la voz" message floating over the interface. Instead, the home screen shows a short
notice explaining that voice is not available in this browser and that it can be enabled from
Settings (by turning on Whisper). Tapping where the button used to be does nothing special, and the
app no longer lags.

**Why this priority**: The overlay covers interactive controls on the board, and tapping the
disabled button causes the app to lag (seen in Firefox for Android). This is a usability bug that
affects every session in those browsers.

**Independent Test**: In a browser without speech recognition and with Whisper off, open a session
and confirm no microphone or voice message is shown on the board and all controls are tappable;
go to the home screen and confirm the notice with a path to Settings. Then turn Whisper on (with a
key) and confirm the microphone appears again.

**Acceptance Scenarios**:

1. **Given** a browser without speech recognition and Whisper turned off, **When** a session is open on the board, **Then** no microphone button and no voice-unavailable message are displayed.
2. **Given** the same setup, **When** the player opens the home screen, **Then** a notice says voice is not available in this browser and offers a direct way to open Settings.
3. **Given** the same setup, **When** the player turns Whisper on in Settings (with a valid key) and returns to the board, **Then** the microphone button is shown and works.
4. **Given** voice is available, **When** the board is shown, **Then** the microphone button and its listening/transcribing feedback behave exactly as today.
5. **Given** voice is unavailable, **When** the player taps anywhere on the board, **Then** the app responds without noticeable delay (no lag caused by a hidden or disabled voice control).

---

### User Story 4 - Aligned panes on tablets and large screens (Priority: P2)

On a tablet or desktop browser, where players and companies are shown side by side, the first row
of player cards starts at the same height as the first row of company cards. The group titles on
the companies side (such as "En juego" or "Disponibles") stay, and the players side gets matching
spacing (or a matching title) so the tops line up. Tabs are not shown when both panes are visible.

**Why this priority**: It makes the large-screen board look intentional and easier to scan, but it
does not block any task.

**Independent Test**: Open a session on a tablet in landscape and on a desktop browser window; check
the top edge of the first player card and the first company card line up, and that no tabs are
shown; check the phone layout is unchanged.

**Acceptance Scenarios**:

1. **Given** a screen wide enough to show both panes side by side, **When** the board is shown, **Then** the top of the first player card is level with the top of the first company card.
2. **Given** the same screen, **When** the board is shown, **Then** the players/companies tabs are not displayed.
3. **Given** the first company group is empty and the companies pane starts with a different group title (e.g. "Disponibles" before any company floats), **When** the board is shown, **Then** the panes are still aligned.
4. **Given** a phone in portrait, **When** the board is shown, **Then** the tabbed layout is unchanged.

---

### User Story 5 - Clear, consistent Settings screen (Priority: P2)

The Settings screen is reorganized into clearly titled groups: Idioma (language), Interpretación
(IA) (AI provider, key and model), Reconocimiento de voz (speech recognition, Whisper and its Groq
key), Privacidad (privacy), and Desarrollo (development builds only). Each setting shows a short label
and its control first; explanatory text is brief and placed under the control, not around it. All
on/off settings use the same kind of control, and all one-of-several choices use the same kind of
control, so the Whisper toggle and the model choice no longer look like different kinds of things.
The privacy section is kept.

**Why this priority**: Settings are visited rarely (setup, changing a key or engine), so the impact
per session is lower than the board items, but the current screen makes it hard to see what is
being changed and what it affects.

**Independent Test**: Open Settings on a phone; for each setting, a tester can name in a few seconds
which group it belongs to and what it changes; all toggles look and behave alike; all choice
groups look and behave alike; saving and the stored values behave exactly as today.

**Acceptance Scenarios**:

1. **Given** the Settings screen, **When** it opens, **Then** settings are grouped under short titled sections, each group containing only related settings.
2. **Given** any on/off setting (e.g. Whisper, remember key, development audio clips), **When** displayed, **Then** it uses the same toggle control as every other on/off setting.
3. **Given** any one-of-several choice (e.g. language, provider, model), **When** displayed, **Then** it uses the same choice control as every other such choice.
4. **Given** a setting with explanatory text, **When** displayed, **Then** the label and control appear first and the explanation is at most a short line or two beneath them.
5. **Given** a setting that only applies when another is on (e.g. Groq key only matters with Whisper on), **When** displayed, **Then** it is visually placed with and subordinate to the setting it depends on.
6. **Given** the privacy section, **When** Settings opens, **Then** it is still present with its current information.
7. **Given** existing saved settings, **When** the new screen loads, **Then** every value is shown as before and saving works without any change in stored behavior.

---

### User Story 6 - "Trains" label on company cards on large screens (Priority: P3)

On tablets and large screens, company cards show a "Trenes" (Trains) label in front of their train
cards, so the train section is recognizable even though cards have a lot of free space. On phones
the label stays hidden to save room, as today.

**Why this priority**: A small clarity gain on large screens only.

**Independent Test**: Open a session with companies owning trains on a tablet in landscape and
confirm the label appears on each card with a train section; on a phone confirm it does not.

**Acceptance Scenarios**:

1. **Given** a large screen and a company with trains, **When** the board is shown, **Then** its card shows the "Trenes" label beside or above the train cards.
2. **Given** a large screen and a company with no trains, **When** the board is shown, **Then** the card shows no train section and no label, as today.
3. **Given** a phone in portrait, **When** the board is shown, **Then** company cards look as they do today (no label).

---

### User Story 7 - Certificates at a glance on the tile and the sheet (Priority: P2)

The player tile lists the player's companies in a column, which leaves empty space on its side.
That space shows a small donut chart of the player's **certificates**, not percentages. The full
ring stands for the certificate limit. Each company held is an arc in its company color, sized by
its certificate count. The rest of the ring is an empty track, so how close the player is to the
limit shows at a glance. The number of certificates counting toward the limit is written in the
middle. On the player sheet, the certificate summary moves from under the holdings table to the
sheet header, next to the cash figure. It is smaller and quieter than cash, and draws attention
only at or over the limit.

**Why this priority**: US2 made the certificate total correct, but it sits under the table and
the action buttons, where players miss it. The limit is a legality check that comes up whenever a
player is about to buy. Showing it on the board, before anyone opens a sheet, answers "can I buy
one more?" without a tap.

**Independent Test**: 1830, 4 players (limit 16). Give a player shares in three companies,
including a presidency and one company in the yellow zone. Check the tile: three arcs in company
colors plus a dimmed arc for the exempt share, an empty track for the rest, and the counted number
in the middle, matching the sheet. Open the sheet: the summary sits next to cash. Bring the player
to 16 and then 17 certificates: the tile and the sheet both show the at-limit and over-limit cues.

**Acceptance Scenarios**:

1. **Given** a player with shares, **When** the board is shown, **Then** their tile shows the companies in a column with the donut beside them, and the donut's center shows the certificates counting toward the limit.
2. **Given** a game with a certificate limit, **When** the tile is shown, **Then** the full ring stands for the limit and the empty part of the ring shows the remaining room.
3. **Given** a holding exempt from the limit (1830 yellow/orange/brown zone), **When** the tile is shown, **Then** its arc is visually distinct (dimmed) and the center number excludes it, the same as the sheet's counted total.
4. **Given** a player at or over the limit, **When** the tile is shown, **Then** the donut shows a warning (at) or danger (over) cue; on the sheet the summary shows "en el límite" / "sobre el límite" as text.
5. **Given** a player without shares, **When** the tile is shown, **Then** the donut is an empty track with "0" in the middle, so every tile has the same layout.
6. **Given** a screen reader, **When** it reaches the donut, **Then** it reads one label such as "11 de 16 certificados" (plus "en el límite" / "sobre el límite" when it applies), not the arcs one by one.
7. **Given** the player sheet, **When** it opens, **Then** the certificate summary ("11 / 16 cert.") is in the header next to the cash figure, and is also shown when cash is hidden ("bank only" mode).

---

### User Story 8 - Company choices always on two lines (Priority: P3)

In sheets that ask the player to pick a company from a grid ("Abrir menor", merger), each choice
shows the company badge and its full name. Today they sit on one line when there is room and wrap
when there isn't, so the grid looks different from one screen to another and choices in the same
grid can differ. Each choice now always shows the badge on top and the name below, the way small
screens already show it.

**Why this priority**: Cosmetic, but it makes the grid easy to scan and the same on every device.

**Independent Test**: Open "Abrir menor" in 1848 on a phone in portrait and on a tablet in
landscape: on both, every choice shows the badge above the name; same for the merger sheet.

**Acceptance Scenarios**:

1. **Given** the "Abrir menor" sheet on any screen width, **When** it opens, **Then** every company choice shows the badge on the first line and the name on the second.
2. **Given** a long company name, **When** the choice is shown, **Then** the name wraps under the badge without changing the badge line or overflowing the button.
3. **Given** the merger sheet, **When** it opens, **Then** its company choices follow the same two-line layout.

---

### Edge Cases

- A player holds shares in every company of a large game (e.g. 8+ rows): the holdings table scrolls with the sheet; no horizontal overflow.
- A company's certificates are not all the same size (president's certificate, or games with multi-share certificates): certificate counts reflect the actual cards, not percentage ÷ 10.
- Certificates that do not count toward the limit in the current game state (e.g. 1830 shares in yellow/orange/brown market zones): the total toward the limit excludes them, using the same rule the app already uses for its limit warning; per-company rows still show the cards held.
- A game without a certificate limit: the total is shown without a limit.
- A minor company or private held by the player: shown consistently with how the sheet shows them today; privates are not part of the shares table.
- Voice becomes unavailable mid-session (e.g. Whisper turned off): returning to the board shows no microphone.
- Voice is available in the browser but the AI key (or the Groq key, with Whisper on) is missing: this is a setup issue, so the mic is hidden and Home shows the missing-key notice with "Abrir ajustes" (see Assumptions).
- The screen is rotated between portrait and landscape mid-session: the board switches between tabbed and side-by-side layouts, keeps the current selection, and stays aligned.
- A sheet is open when the player wants History: the History control sits on the board under the sheet's backdrop, so it can't be tapped until the sheet is closed; no stacked screens. No extra handling needed.
- The share batch is needed in a stock round: it is still reachable within two taps.
- Exempt certificates would not fit in the ring (held exempt certificates plus counted ones exceed the limit), or the player is over the limit: the ring's scale grows to the player's total so every arc still fits; the center still shows the counted number.
- A game without a certificate limit: the ring stands for the player's total (no empty track), and the label reads "N certificados" without a limit.
- Many companies with similar colors: the arcs are decorative only; the company list beside the donut and the sheet's holdings table carry the text.

## Requirements *(mandatory)*

### Functional Requirements

**History and share batch (US1)**

- **FR-001**: The board MUST show a History control in every round and session state where the board is shown, reachable in one tap without opening the general menu.
- **FR-002**: The History control MUST meet the minimum touch target size and MUST NOT cover existing board controls or push any of them off-screen on phone portrait. The action row MAY wrap to one extra line.
- **FR-003**: The share-batch ("Lote de acciones") button MUST no longer appear in the board's action area.
- **FR-004**: The share batch MUST remain available during stock rounds from a secondary location (the general menu by default), reachable within two taps, with unchanged behavior.
- **FR-005**: History MAY also remain in the general menu.

**Player holdings (US2)**

- **FR-006**: The player sheet MUST show the player's share holdings as a list of rows, one per company held, each with: company identification (name/badge, never color alone), percentage held, number of certificates held, president indication, and that company's sell action in every round.
- **FR-007**: The sell action on a row MUST, in a stock round, sell one share of that company in one tap (today's quick sell), and in any other round open the existing sell flow with that company preselected; no change to validation, confirmation, amounts, or recorded actions.
- **FR-008**: The sheet MUST show the player's total certificates counting toward the limit and, when the game defines one for the current situation, the limit itself.
- **FR-009**: When the total is at or above the limit, the sheet MUST mark it with a visible text cue; it MUST NOT block any action.
- **FR-010**: The old side-by-side row of per-company sell buttons MUST be removed.
- **FR-011**: The holdings rows MUST fit phone portrait width without horizontal overflow.

**Voice availability (US3)**

- **FR-012**: When voice input cannot be used on this device in its current configuration (in particular: no browser speech recognition and Whisper off), the board MUST NOT display the microphone button or any voice-unavailable message.
- **FR-013**: In that situation the home screen MUST show a short notice that voice is not available in this browser, with a direct way to open Settings where it can be enabled.
- **FR-014**: When voice becomes usable (e.g. Whisper turned on with a key), the microphone MUST appear on the board without restarting the app.
- **FR-015**: Tapping the board where the hidden microphone would be MUST NOT cause any delay or lag.
- **FR-016**: When voice is usable, the microphone and its feedback MUST behave as today.

**Large-screen layout (US4, US6)**

- **FR-017**: When players and companies are shown side by side, the top of the first player card MUST align with the top of the first company card, regardless of which company group title appears first.
- **FR-018**: The players/companies tabs MUST NOT be shown when both panes are visible side by side.
- **FR-019**: The phone portrait layout MUST remain tabbed and visually unchanged by FR-017/FR-018.
- **FR-020**: On layouts where players and companies are side by side, company cards MUST show a "Trenes" (localized) label for their train section; on phone portrait the label MUST stay hidden.

**Settings (US5)**

- **FR-021**: Settings MUST be organized into titled groups of related settings; each setting MUST belong to exactly one group.
- **FR-022**: All on/off settings MUST use one consistent toggle control; all short one-of-several settings (a handful of options) MUST use one consistent choice control. Long lists (e.g. the 8 speech regions) MAY use a list picker.
- **FR-023**: Each setting MUST present its label and control first; explanatory text MUST be brief and placed beneath the control.
- **FR-024**: Settings that only apply when another setting is on MUST be shown grouped with, and visually subordinate to, the setting they depend on.
- **FR-025**: The privacy section MUST remain.
- **FR-026**: The reorganization MUST NOT change what settings exist, their stored values, their defaults, or what they do (including that nothing is sent to the transcription service while Whisper is off).

**Certificates at a glance (US7)**

- **FR-029**: The player tile MUST show a certificate donut beside the column of companies held. The full ring stands for the game's certificate limit for the current player count. When there is no limit, or when the player's total exceeds the limit, the ring stands for the player's total instead.
- **FR-030**: Each company held MUST appear as one arc, in game-definition order, colored with that company's color and sized by the certificates held in it (not percentage). Certificates exempt from the limit MUST be visually distinct (dimmed) and placed after the counted arcs.
- **FR-031**: The donut's center MUST show the number of certificates counting toward the limit, computed by the same domain function as the sheet (`certificateStatus`), so tile and sheet never disagree.
- **FR-032**: At the limit the donut MUST show a warning cue; over the limit, a danger cue. Color MUST NOT be the only cue for the screen-reader label or on the sheet, where the cue is written as text.
- **FR-033**: The donut MUST expose a single accessible name with the counted total, the limit when defined, and the at/over-limit state when it applies (e.g. "11 de 16 certificados", "17 de 16 certificados, sobre el límite"); its arcs MUST be hidden from assistive technology.
- **FR-034**: The player sheet MUST show the certificate summary (counted / limit, the "N en total" note when some are exempt, and the at/over badge) in its header next to the cash figure, including when cash is hidden. It MUST no longer appear under the holdings table.
- **FR-035**: The donut MUST NOT widen the tile or cause horizontal overflow in the two-column phone portrait grid at 360 px.

**Company choices (US8)**

- **FR-036**: Company choices in pick-a-company grids that show a badge and a full name ("Abrir menor", merger) MUST always place the badge on the first line and the name on the second, at every screen width.

**Cross-cutting**

- **FR-027**: All new or changed text MUST exist in every supported display language (Spanish with Uruguayan wording, and English).
- **FR-028**: All new or moved controls MUST meet the minimum 48 px touch target and MUST work on phone portrait and tablet landscape.

### Key Entities

- **Holding row**: what a player holds in one company — company, percentage, certificates held (cards), president flag, and the sell entry point.
- **Certificate total**: the player's certificates counting toward the limit and the limit that applies (from the game definition, for the current player count, including variant patches such as RotLA's bank break), and which holdings are exempt by market zone (1830). No shipped game varies the limit by phase; that stays out of scope.
- **Voice availability**: whether voice can be used on this device now, and why not if it can't; drives whether the microphone is shown and whether the home notice appears.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the board, History opens in 1 tap in every round type (down from 2).
- **SC-002**: With 8 holdings on a phone in portrait, the player sheet shows every holding with zero horizontal overflow, and a tester can find the certificate count for any company in under 5 seconds.
- **SC-003**: A tester can tell from the player sheet alone, in under 5 seconds, whether buying one more certificate would exceed the limit.
- **SC-004**: With voice unavailable, 0 voice elements are shown on the board and 100% of board controls are tappable; no tap on the board takes noticeably longer than with voice available.
- **SC-005**: On a tablet in landscape and a desktop browser, the first player card and first company card tops are aligned within a few pixels, in all company-group combinations.
- **SC-006**: In Settings, a tester can identify the group and effect of each setting in under 10 seconds, and 100% of on/off settings share one control style and 100% of choice settings share another.
- **SC-007**: No change to recorded actions, money, or stored settings: the full existing test suite passes and existing sessions and settings load unchanged.
- **SC-008**: From the board alone, without opening a sheet, a tester can tell in under 5 seconds whether each player is under, at or over the certificate limit; the tile's number matches the sheet's counted total in 100% of states, including exempt holdings.
- **SC-009**: On a phone in portrait and on a tablet in landscape, 100% of company choices in "Abrir menor" and the merger sheet show the badge above the name.

## Assumptions

- "Large screen" means the existing side-by-side breakpoint (landscape, roughly tablet width and up); no new breakpoint is required unless planning finds one necessary.
- The share batch moves to the general menu during stock rounds; that is the least disruptive secondary place and keeps it within two taps.
- The History control lives on the board's always-visible area (e.g. the top bar or the action area); its exact placement is a design decision for planning, as long as FR-001/FR-002 hold.
- The certificate count uses the same counting the app already uses for its certificate-limit warning (president's certificate counts as one card; zones that don't count are excluded from the total). Per-company rows show the cards actually held.
- The certificate limit shown is the one the game definition provides for the current player count (variants can patch it in, e.g. RotLA's bank break). Games without a defined limit show the total only.
- US3 applies to every case where voice cannot be used because of the browser or configuration (not only the Web Speech + Whisper-off case). Transient failures during a command (no network, transcription error) keep today's behavior: they occur after the button is pressed and fall back to touch.
- The home-screen notice is informational and dismissible or unobtrusive; it doesn't block starting or resuming a session.
- The lag on tapping the disabled microphone (Firefox for Android) is resolved by no longer rendering the control when voice is unavailable; if planning finds a deeper cause that also affects the available case, it is fixed as part of US3.
- Settings keep their current content and behavior; only grouping, control styles and text placement change. Wording may be shortened but not change meaning.
- Purely presentational: no new events, no change to the ledger, game definitions, or voice resolution. The voice eval set does not need re-running.
- The donut is drawn as inline SVG with no chart library (one circle per arc using stroke dash lengths). It is decorative over text that already exists elsewhere, which is why its arcs are hidden from assistive technology.
- The donut's center shows the counted number only (e.g. "11"), so it stays legible at tile size. The limit shows through the ring's empty track, the accessible name and the sheet header ("11 / 16 cert.").

## Amendments 2026-11-08

Changes made by hand during review, accepted as part of this feature. Where they differ from the
text above, they win:

- **History placement (US1)**: "Historial" is the **first** button of the Table's action row, not
  the last, because it is the one control present in every round. FR-001/FR-002 still hold.
- **Holdings table (US2)**: the table's visual style was revised for readability (striped rows,
  alignment). Content and behavior are unchanged (FR-006–FR-011). Under US7 the total line moves
  to the sheet header.
- **Company badge**: badges use a monospace font so every badge has the same width, which keeps
  the holdings columns and tile lists aligned.
- **Choice group titles**: `choice-fieldset` legends are uppercase, to set group titles apart from
  the choices and body text.
- **Speech engine (US5)**: the Whisper on/off toggle becomes a "Motor de reconocimiento" choice of
  two segmented buttons, "Del navegador" and "Whisper (Groq)", like the language and provider
  choices; it still saves at once and the stored `whisper` flag is unchanged (015 FR-003 holds:
  choosing "Del navegador" is the toggle off). The Groq key is no longer indented under it: the
  speech group reads engine, region, then the Groq key with its link and billing note. The on/off
  switch control is dropped as too bulky: "No recordar" and the dev clips are plain checkboxes again,
  which satisfies FR-022's "one consistent toggle control". Settings help lines have no paragraph
  margins.
