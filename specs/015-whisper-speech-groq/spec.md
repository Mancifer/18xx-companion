# Feature Specification: Whisper Speech Recognition (Groq)

**Feature Branch**: `015-whisper-speech-groq`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "The next big feature to implement in our application is whisper support to allow better voice command recognition with support for a wider variety of browsers. I understand we need to record audio and process it into a file before sending it to whisper in groq"

## Context

Today a voice command is turned into text by the browser's own speech recognition while the mic
button is held. That only works in browsers that ship it (mainly Chrome and Chromium-based ones);
in others (for example Firefox, and some in-app or privacy-focused browsers) the mic is
unavailable and the app is touch-only. The browser recognizer also struggles with table jargon:
player nicknames, company short names ("B&O", "PRR"), train names ("un 4", "diésel") and numbers
said quickly over table noise.

This feature adds a second way to turn speech into text: the app records the audio of the held
mic button itself and sends that recording to a hosted Whisper transcription service (Groq). The
returned transcript then follows the existing path unchanged: it is sent to the selected AI
provider, resolved into actions, and shown on a confirmation card.

## Clarifications

### Session 2026-11-07

- Q: When both engines are available, which one is used? → A: Saving a Groq key switches to
  Whisper automatically; the player can switch back to the browser engine in settings.
  *Superseded by the next answer.*
- Q: Should Whisper be opt-in? → A: Yes. A Whisper on/off toggle in settings, off by default, in
  every browser. A saved Groq key is kept but never used while the toggle is off, so the player
  can avoid Groq costs (e.g., on a paid plan) without clearing the key. Saving a key does not
  turn Whisper on by itself.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Voice commands in a browser without built-in speech recognition (Priority: P1)

A player opens the app in a browser that has no built-in speech recognition but does allow
microphone access. They turn on Whisper and enter their Groq key in settings. In the session, the mic button is now
available: they hold it, say "Ana compra una del B&O", release, and after a short wait the
transcript appears and the usual confirmation card follows.

**Why this priority**: This is the "wider variety of browsers" goal. Without it, players on those
browsers have no voice at all; with it, voice works anywhere the microphone does.

**Independent Test**: In a browser with no built-in speech recognition, turn on Whisper with a
Groq key, hold the mic, say a command, release, and confirm the resulting action. Delivers voice where it
was previously impossible.

**Acceptance Scenarios**:

1. **Given** a browser without built-in speech recognition, Whisper turned on and a saved Groq
   key, **When** the player opens a session, **Then** the mic button is shown and usable.
2. **Given** the same browser with Whisper off (or on but with no Groq key), **When** the player
   opens a session, **Then** the mic is not offered and a hint in settings explains that turning
   on Whisper with a Groq key enables voice in this browser.
3. **Given** the player holds the mic and speaks, **When** they release, **Then** the app shows a
   clear "transcribing" state, then the transcript, then the confirmation card, exactly as with
   the browser recognizer.
4. **Given** the first use of the mic, **When** the browser asks for microphone permission and
   the player denies it, **Then** the app explains that voice needs the microphone and touch
   keeps working.

---

### User Story 2 - Better recognition of table jargon in any browser (Priority: P2)

A player whose browser does have built-in speech recognition turns on Whisper in settings
because it hears their table better, and turns it off again when they'd rather not use Groq
(for example to avoid charges on a paid plan), without removing their key. Names of players and companies in the current session, train names
and amounts come out right more often, so fewer commands end in "No entendí" or need editing on
the confirmation card.

**Why this priority**: This is the "better voice command recognition" goal. It builds on the same
recording and transcription path as Story 1 and adds the choice of engine plus vocabulary hints.

**Independent Test**: In a browser that has both engines, say the same set of commands with each
engine selected and compare how many reach a correct confirmation card without edits.

**Acceptance Scenarios**:

1. **Given** a browser with built-in recognition and Whisper off, **When** the player saves a
   Groq key, **Then** the browser engine stays active and nothing is sent to Groq until they turn
   Whisper on.
2. **Given** Whisper on with a saved key, **When** the player turns Whisper off, **Then** the
   browser engine is used for the next command, the key stays saved (if keys are remembered), and
   turning Whisper on again needs no re-entry; the toggle state is remembered on the device.
3. **Given** Whisper is the active engine, **When** a command is transcribed, **Then** the session's
   player names, aliases and company short names, and the game's train names, are given to the
   transcription as vocabulary hints so they are spelled as the app knows them.
4. **Given** Whisper is the active engine, **When** the display language is Spanish or English,
   **Then** the transcription is requested in that language.

---

### User Story 3 - Graceful failure and fallback (Priority: P3)

During a game the Groq service is slow, out of quota, or the network drops. The player is told
what happened in plain words, nothing is applied, and touch keeps working. Where the browser has
its own recognizer, the player can switch to it from the error without leaving the session.

**Why this priority**: Required by the "never an error dead end" rule, but it only matters once
Stories 1–2 exist.

**Independent Test**: Simulate each failure (bad key, rate limit, timeout, no connection, empty
audio) and check the message, that no state changes, and that touch input remains available.

**Acceptance Scenarios**:

1. **Given** Whisper is active and the Groq key is invalid, **When** the player records a command,
   **Then** the app shows a "Groq key is invalid" message (in the display language) pointing to
   settings, and no action is proposed.
2. **Given** Whisper is active and the service rate-limits or times out, **When** the player
   records a command, **Then** the app shows the matching shared message and the player can retry
   or use touch.
3. **Given** the recording contains no speech (released immediately, or silence), **When** it is
   released, **Then** nothing is sent to the AI provider and the app shows a short "didn't hear
   anything" hint.
4. **Given** the browser also has built-in recognition, **When** a Whisper error is shown,
   **Then** the message offers turning Whisper off to use the browser engine.

---

### Edge Cases

- The player holds the mic for a very long time (forgets to release): recording stops on its own
  at a maximum length and is transcribed as usual, with a hint that it was cut.
- The player taps the mic for a fraction of a second: treated as an empty recording; nothing is
  uploaded.
- The player cancels while the recording is being transcribed: the result is discarded and
  nothing is proposed.
- The app goes to the background or the screen locks mid-recording: the recording is cancelled
  and the microphone released.
- Voice confirmation ("sí" / "confirm") on the confirmation card uses the active engine, so it
  also works through Whisper.
- The browser can record audio but only in a format the service doesn't accept: the app converts
  or the engine is reported unavailable in that browser; it never uploads a file that will fail.
- The display language has no voice yet: the mic stays hidden whatever engine is selected.
- Whisper returns text in a different language or a known hallucination on near-silence
  (e.g., "Thank you for watching"): treated as "didn't hear anything" when it can be recognized as
  such, otherwise passed on and resolved normally (the confirmation card still protects state).
- The player has the Groq key but the AI provider key is missing: voice is disabled as today
  (both are needed); the message names the missing one.
- "Don't remember keys on this device" is on: the Groq key follows the same rule as the AI
  provider keys; the Whisper toggle is still remembered, so after a restart Whisper is on but
  asks for the key again.

## Requirements *(mandatory)*

### Functional Requirements

**Engine and settings**

- **FR-001**: The app MUST support two speech engines: the browser's built-in recognizer and
  Whisper transcription via Groq.
- **FR-002**: Settings MUST let the player enter, change and remove a Groq key. It MUST be stored
  only on the device, follow the existing "don't remember keys" option, and MUST NOT appear in
  exports, logs or bug reports.
- **FR-003**: Settings MUST offer a Whisper on/off toggle, off by default in every browser and
  remembered on the device. Whisper is the active engine only while the toggle is on; otherwise
  the browser engine is used where available. Saving, changing or removing the Groq key MUST NOT
  change the toggle, and while the toggle is off the app MUST NOT send anything to Groq, even
  with a saved key. Settings MUST say that Groq use may be billed depending on the player's Groq
  plan.
- **FR-004**: The mic MUST be offered only when the active engine is usable (engine supported by
  the browser, needed keys present, voice offered in the display language). Otherwise settings
  MUST say what is missing; with Whisper on and no Groq key, the mic is not offered (the app
  does not silently fall back to the browser engine) and settings asks for the key. In a browser
  without built-in recognition, settings MUST suggest turning on Whisper.
- **FR-005**: The settings privacy note MUST say, for the active engine, where audio goes: to the
  browser's speech service, or to Groq.

**Recording and transcription**

- **FR-006**: With Whisper active, holding the mic MUST record audio and releasing it MUST end the
  recording and send it for transcription; push-to-talk behavior (hold, release, cancel) MUST stay
  the same as today.
- **FR-007**: While recording, the app MUST show that it is listening (with a sign that audio is
  being picked up); after release and until the transcript arrives, it MUST show a distinct
  "transcribing" state that can be cancelled.
- **FR-008**: Recordings MUST be limited to a maximum length (default 30 seconds); at the limit
  the recording ends and is transcribed, with a hint.
- **FR-009**: Recordings shorter than a minimum length or without detectable speech MUST NOT be
  uploaded and MUST show a "didn't hear anything" hint.
- **FR-010**: Transcription MUST be requested in the display language and MUST include vocabulary
  hints built from the current session (player names and aliases, company short names and
  aliases, train names of the game).
- **FR-011**: The Whisper transcript MUST enter the same path as a browser transcript: shown to
  the player, sent to the selected AI provider, validated, and presented on a confirmation card.
  No new route to state is created.
- **FR-012**: Audio MUST be kept only in memory for the duration of one command and discarded
  after transcription or cancellation; it MUST NOT be persisted, exported or included in history.
  The only exception is in development builds: the developer may explicitly save a clip for the
  audio check set (FR-018). That path doesn't exist in production builds.
- **FR-013**: The microphone MUST be released (indicator off) as soon as recording ends or is
  cancelled, and when the app is hidden.

**Errors and fallback**

- **FR-014**: Groq failures (invalid key, no permission, rate limit or quota, timeout, no
  connection, server error, unsupported audio) MUST map to the shared voice error messages in the
  display language, name Groq as the source, propose nothing, and leave touch available.
- **FR-015**: A transcription request MUST time out after a bounded wait (default 8 seconds) and
  MAY be retried once automatically on a temporary failure.
- **FR-016**: When the browser has built-in recognition, a Whisper error MUST offer turning
  Whisper off (switching to the browser engine) in one tap.
- **FR-017**: Denied microphone permission MUST produce an explanatory message, not a silent
  failure.

**Measurement**

- **FR-018**: Before Whisper is offered in a voice language, it MUST be checked on a set of
  recorded spoken commands in that language, reporting how many reach the expected action, next
  to the browser engine on the same recordings where available, plus the added wait per command.
  Until a language passes, production builds MUST NOT offer the Whisper toggle in it. Development
  builds offer it in every voice language, so the check can be run.

### Key Entities

- **Whisper toggle**: whether Whisper is turned on (off by default), stored on the device with
  the other voice settings, independent of the Groq key.
- **Groq key**: the player's credential for the transcription service; device-only, same storage
  rules as AI provider keys.
- **Recording**: the audio of one mic hold; transient, in memory only, discarded after use.
- **Vocabulary hint**: the list of session-specific names and game terms sent with a recording to
  guide spelling; derived from session state, never stored.
- **Audio check set**: recorded spoken commands per language with their expected actions, used to
  compare engines (FR-018).
- **Whisper languages**: the build setting listing the voice languages where Whisper has passed
  its audio check and may be offered (FR-018).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Voice commands work in at least the current releases of Chrome, Edge, Firefox and
  Safari on desktop, and Chrome and Safari on mobile, when Whisper is on with a Groq key set.
- **SC-002**: On the audio check set, in each voice language, Whisper reaches the expected action
  on no fewer than 10 percentage points below the browser engine's rate, and on the commands that
  include player or company names, no fewer than 15 points below it. (Relaxed on 2026-11-07 from
  "at least as many, and 10 points more on names". Whisper is for browsers that have no recognizer
  of their own, so it has to be close to Chrome, not better. On desktop Chrome with the vocabulary
  hint, names already score 88–94%, so "+10 points" couldn't be reached.)
- **SC-003**: Time from releasing the mic to seeing the confirmation card stays under 4 seconds on
  a typical connection for 90% of commands with Whisper (the existing 3-second target covers the
  step after the transcript).
- **SC-004**: Every listed failure (FR-014, FR-017, empty recording) ends in a readable message
  with touch still usable; none leaves the player on a blank or stuck screen.
- **SC-005**: No audio, Groq key or transcript is found in session exports, history or bug reports.

## Assumptions

- Groq is the only Whisper host in scope; other transcription services are later iterations. The
  player brings their own Groq key, as with the AI provider keys (no backend, no proxy).
- The Groq call is made directly from the device, like the existing AI provider calls.
- Live interim text while speaking is not expected with Whisper: the transcript appears after
  release. The listening state shows that audio is being picked up instead.
- The Whisper model used on Groq is fixed by the app (chosen by the audio check), not a player
  setting, in this first version.
- Voice language rules stay as today: Whisper is offered only in languages that already have voice
  (Spanish, English) and that pass FR-018.
- The audio check set will be recorded by the user at a real or simulated table (a modest number
  per language, e.g. 20–30 commands); grading is manual or semi-automatic and does not need to
  run in CI.
- The constitution was amended to 2.2.0 (2026-11-07) for this feature: two speech engines,
  Whisper on Groq as an opt-in toggle, the Groq key under the device-only key rule, audio never
  stored, and the audio check gate.
- `docs/spec.md` (voice flow, settings, privacy note, failure modes) will be updated with the
  change.
