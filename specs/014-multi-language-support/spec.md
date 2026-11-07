# Feature Specification: Multi-Language Support (English and Spanish)

**Feature Branch**: `014-multi-language-support`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User description: "Now that the application is stable and working as intended, I think it's a good moment to add multi language support. Initially the idea is to offer spanish and english, with english as the default. It will be a big change I think because we have text all over the place, but I think we already have some effort done for internationalization in the domain folder"

## Clarifications

### Session 2026-11-04

- Q: Where should each language's text live? → A: In one place per language: a single folder holds all of that language's text (screens, messages, voice and game text), split into a few files, with one shared definition of what every language must provide. Adding a language means copying one folder and translating it.
- Q: Should new saved entries stop storing the warning text, keeping only its code and values? → A: No. New warnings keep storing their Spanish text along with the code and values, so files stay importable by older versions; the text is small (0–1 KB per session). On screen, warnings always use the current wording in the display language. The stored text is shown only when a warning can't be rebuilt, which applies to entries saved before this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the whole app in English (Priority: P1)

A player whose device is not set to Spanish installs the app and runs a full game session in English: creating a session, the operating and stock flows, confirmation cards, toasts, the History, the OR income summary, game results, settings and error messages all appear in English.

**Why this priority**: Today every word on screen is Spanish. English is the new default, so without this story the feature delivers nothing.

**Independent Test**: On a fresh install on a device whose language is not Spanish, start a session of each supported game, play through an SR and an OR set by touch, open History, end the game and view results. No Spanish text should appear apart from names that come from the game or the players.

**Acceptance Scenarios**:

1. **Given** a fresh install with no saved language on a device whose language is not Spanish, **When** the user opens the app, **Then** every screen, sheet, button, label, toast and message is in English.
2. **Given** an English session, **When** the user confirms an action (for example a dividend payout), **Then** the confirmation card summary, money flows and chip breakdown are in English, and the matching History entry reads in English.
3. **Given** an English session, **When** a money or share invariant breaks, **Then** the warning is shown in English.
4. **Given** an English session, **When** the user views round labels, company statuses and cycle labels (for example "OR 2.1" or "Cycle 2 of 6"), **Then** they use English terms.
5. **Given** an English session, **When** amounts are shown, **Then** they use the game's currency symbol with English number formatting (for example "$1,200").

---

### User Story 2 - Switch language from Settings (Priority: P1)

A Spanish-speaking player (the current user base) opens Settings, picks "Español", and the whole app switches to Spanish immediately. The choice is remembered across reloads and restarts.

**Why this priority**: Existing users play in Spanish. Moving the default to English must not take Spanish away from them, so this story is as critical as US1.

**Independent Test**: Change the language in Settings and check that visible text changes at once without a reload or losing the session, then reload the app and confirm the choice was kept.

**Acceptance Scenarios**:

1. **Given** the app is in English, **When** the user selects Spanish in Settings, **Then** all visible text switches to Spanish without a reload and without losing the open session or unsaved input.
2. **Given** the user chose Spanish, **When** the app is reloaded, put to sleep or restarted, **Then** it opens in Spanish.
3. **Given** the app is in Spanish, **When** the user reads any screen, **Then** the wording matches what the app shows today (Uruguayan/Rioplatense Spanish, e.g. "Completa"), so existing users notice no change.
4. **Given** the language selector, **When** the user looks at it, **Then** each option is written in its own language ("English", "Español"), so a user can find their language whatever language is currently shown.

---

### User Story 3 - History and past sessions follow the chosen language (Priority: P2)

A user switches language in the middle of a game, or opens a session played earlier in the other language. The History, the income summary and the results all show in the language now selected.

**Why this priority**: A switch that only affects new entries leaves a mixed-language History. That is confusing, but less central than the two stories above.

**Independent Test**: Play several actions in Spanish, switch to English and open History. Every app-generated entry should read in English. Text the players typed (names, notes) should be unchanged.

**Acceptance Scenarios**:

1. **Given** a session whose actions were recorded while the app was in Spanish, **When** the user switches to English and opens History, **Then** every app-generated description shows in English.
2. **Given** player names, session names or free-text notes typed by the users, **When** the language changes, **Then** that text shows exactly as typed, not translated.
3. **Given** a session exported in one language, **When** it is imported on a device set to the other language, **Then** it replays to the same state and its descriptions show in the importing device's language.

---

### User Story 4 - Voice commands in the display language (Priority: P3)

A player using the app in English presses push-to-talk and says "Pennsylvania pays 80, full dividend". The app listens in English, understands the command and shows the confirmation card in English. A player using the app in Spanish keeps the voice experience they have today.

**Why this priority**: Voice is a shortcut. Every capability can be reached by touch, so an English user can play a full game without voice. Voice still matters for keeping screen time low, so it follows once the display language works.

**Independent Test**: With English selected, run the English voice eval set and give a handful of live commands across stock, operating and query actions. Accuracy should meet the target in SC-007, and every card and reply should be in English. With Spanish selected, the Spanish eval set should score no worse than before this feature.

**Acceptance Scenarios**:

1. **Given** the app is in English, **When** the user presses push-to-talk, **Then** speech is recognized as English, using the English accent/region chosen in Settings.
2. **Given** the app is in English, **When** the user speaks a supported command in English, **Then** it resolves to the same proposed action a touch user would build, and the confirmation card is in English.
3. **Given** the app is in English, **When** the user asks a question (for example "how much cash does the B&O have?"), **Then** the answer comes from app state and is in English.
4. **Given** the app is in English, **When** the AI is unavailable or the command cannot be resolved, **Then** the user sees an English message, the transcript, and the touch fallback.
5. **Given** the app is in Spanish, **When** the user gives voice commands, **Then** behavior and accuracy are the same as today.
6. **Given** the user switches display language, **When** they next use voice, **Then** voice uses the new language with no extra setup beyond optionally picking an accent/region.

---

### Edge Cases

- A text has no translation in the selected language. The app shows the English text rather than an empty label or an internal key, and automated checks flag the missing translation before release.
- Text that comes from game definitions and is shown to users (custom payment labels such as RotLA's tunneling payment, manual float questions such as 1848's link question, availability notes such as 21Moon's) needs both languages. Company short names and full names are proper nouns and stay as they are.
- Longer English or Spanish strings must not break layouts on phone portrait or tablet landscape, overflow 48 px touch targets, or truncate company badges.
- The language is switched while a sheet or confirmation card is open. The card re-renders in the new language and its proposed action is unchanged.
- Older sessions whose History holds legacy entries (such as amends) still show readably in both languages.
- Bug reports and exports may include app-generated text. Whichever language is selected, they must keep enough meaning to diagnose a problem.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST offer two display languages: English and Spanish.
- **FR-002**: When the user has not chosen a language, including on fresh installs and on installs that predate this feature, the app MUST use the device's preferred language if it is Spanish (any Spanish variant) and English otherwise. Once the user picks a language in Settings, that choice MUST always win over the device language.
- **FR-003**: Users MUST be able to change the language from Settings. The change MUST apply to every visible screen at once, without a reload and without losing session state or in-progress input.
- **FR-004**: The selected language MUST be stored on the device and survive reloads, sleep and restarts. It is a device preference, not part of a session, and MUST NOT change a session's ledger or replay (see FR-015 for exports).
- **FR-005**: Every app-generated text MUST be available in both languages: screens, sheets, buttons, labels, placeholders, toasts, confirmation cards, History entries, the OR income summary, game results, round, status and cycle labels, warnings, invariant violations, validation messages and error messages (including AI-provider errors and the touch fallback).
- **FR-006**: Descriptions of recorded actions MUST be produced from the recorded events when shown, in the currently selected language, so past entries follow a language change. Event data MUST NOT store the display language. Warnings saved with an entry MUST show the current wording in the display language whenever the app can rebuild them. Their saved text, kept so older versions can still import the file, is shown only when a warning can't be rebuilt (entries saved before this feature).
- **FR-007**: Text typed by users (player names, session names, notes) MUST be shown exactly as entered in either language.
- **FR-008**: Text from game definitions that users see (custom payment labels, manual questions, availability notes, game-choice and player-count messages) MUST be available in both languages. Company names, short names and currency symbols stay unchanged.
- **FR-009**: Money MUST be formatted to the selected language's conventions (English: "," thousands separator; Spanish: "." thousands separator, as today), always with the game's currency symbol and whole numbers.
- **FR-010**: The Spanish text MUST keep today's wording (Uruguayan/Rioplatense usage) so existing users see no change in Spanish.
- **FR-011**: The language selector MUST list each language by its own name ("English", "Español").
- **FR-012**: When a translation is missing, the app MUST fall back to English and MUST NOT show internal identifiers. An automated check MUST fail when a text exists in one language but not the other.
- **FR-013**: The document's declared language MUST match the selected language, so assistive technologies and browser features treat the page correctly.
- **FR-014**: Voice MUST follow the display language. Speech recognition, the AI instructions, and the cards, replies and error messages the voice layer shows MUST all use the selected language. There is no separate voice-language setting.
- **FR-014a**: The voice accent/region choice in Settings MUST list the regions of the current display language (for example United States, United Kingdom and Australia for English, and the current Spanish regions for Spanish). Each language MUST keep its own region choice, so switching back and forth does not lose it.
- **FR-014b**: English and Spanish voice MUST resolve commands through the same action types and validation path that touch uses. A command's language MUST NOT change which actions are possible.
- **FR-014c**: The voice eval set MUST include English transcripts with expected actions, covering the same action categories as the Spanish set. Every provider/model pair offered in the app MUST be measured on both languages before release.
- **FR-014d**: Game-specific spoken names (company aliases such as "union"/"unión") MUST be recognized in the display language. Recognizing the other language's aliases as well is allowed.
- **FR-014e**: Voice MUST be offered only in languages enabled for voice. A language is enabled only after it has eval cases and every offered provider/model has been measured in it (constitution 2.1.0). Spanish is enabled from the start. English is enabled once its eval runs pass (SC-007). While the display language has no enabled voice, the mic is not shown and Settings says voice isn't available in that language yet. Development builds can enable a language early for testing.
- **FR-015**: The language choice MUST NOT be included in session exports. Exports MUST stay importable by both older and newer app versions as today.

### Key Entities

- **Display language**: The device-level preference (English or Spanish) that sets the language of all app-generated text and of voice. Stored with the other device settings. When unset, it comes from the device language (Spanish devices get Spanish, all others English).
- **Voice region**: The accent/region used for speech recognition, kept separately for each display language.
- **Voice eval case**: A transcript in one language (real, or written by players while the language is new), paired with the expected action(s). The set now holds Spanish and English cases.
- **Translated text**: Each piece of app-generated text the user can see, with a version in each supported language. Some are fixed labels; others are built from session data (names, amounts, companies) put into a sentence.
- **Game-definition display text**: Labels and messages that belong to a specific game and are shown to users, each with a version in each supported language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With English selected, a full session of each supported game (1830, 1848, 21Moon, RotLA), played by touch from setup to results, shows no Spanish text apart from proper nouns and user-typed text.
- **SC-002**: With Spanish selected, the same sessions show text identical to the current app on every screen checked, apart from intentional fixes.
- **SC-003**: Switching language takes effect on the visible screen in under 1 second, with no reload and no lost state.
- **SC-004**: 100% of app-generated texts exist in both languages, as checked by an automated test that fails on any gap.
- **SC-005**: No layout regressions in either language on phone portrait and tablet landscape: no clipped text, no overflowing touch targets, no horizontal scroll.
- **SC-006**: Sessions recorded before this feature replay to exactly the same state and show readable History in both languages.
- **SC-007**: For the default provider/model, accuracy on the English voice eval set is within 5 percentage points of its accuracy on the Spanish set, and Spanish accuracy does not drop compared with before this feature.
- **SC-008**: On a device whose preferred language is Spanish, the first launch with no saved choice opens in Spanish. On any other device it opens in English.

## Assumptions

- Only English and Spanish are offered now. Adding a third language later should mean adding translations, not reworking screens. All of a language's text lives together in one place, so a new language is one set of translations. The app must not build if any text is missing from it.
- There is a single Spanish variant: the current Uruguayan/Rioplatense wording. There is a single English variant, using the terms common in English-language 18xx rulebooks (e.g. "Stock Round", "Operating Round", "par", "float", "receivership").
- Round abbreviations follow each language's 18xx convention: SR/OR/MR in English, and the current Spanish abbreviations (RA/RO/RF in cycle labels) in Spanish.
- The language preference is per device, like the other settings. There are no user accounts.
- The existing Spanish text helpers in the domain layer are the starting point, but text is also spread across UI components, the app layer, game definitions and the voice layer, and all of it is in scope.
- Rulebook section references and developer-facing code comments are not user-visible and are out of scope.
- Product documentation (docs/spec.md) is updated to describe the language setting, as the constitution requires.
- **Dependency, constitution amendment (done)**: Constitution 2.1.0 (amended 2026-11-04) allows Spanish and English voice following the display language, and a bilingual eval set. It also forbids offering a voice language before it has eval cases and measurements, which is the reason for FR-014e. The app version for this feature is 0.2.0.
- Existing installs have the old Spanish regional voice setting. It carries over as the Spanish region choice, and English starts with a sensible default region (United States).
- The current user, who is in Uruguay, is assumed to have a Spanish device, so the app keeps opening in Spanish for them after the update. Anyone else can switch in Settings.
- Building the English eval set needs English transcripts. Where real recorded transcripts aren't available yet, phrasings written by an English-speaking 18xx player are acceptable as a starting set and will be replaced by real ones over time.
