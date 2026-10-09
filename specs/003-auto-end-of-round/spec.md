# Feature Specification: Automatic End-of-Round Step

**Feature Branch**: `003-auto-end-of-round`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Remove the "Fin de ronda de acciones" and "Fin de ronda corporativa" buttons. Today they apply end-of-round effects that starting the next round does not: capital owed to 1830 companies that floated during the SR, sold-out share price moves, and the 21Moon pool penalty. If a table skips the button and taps "Empezar OR", those moves are silently lost. If it taps the button twice, they're applied twice. Instead, "Empezar OR" and "Empezar ronda corporativa" should first apply the end-of-round step of the round being left, at most once per round (a voice "fin de la ronda" already counts), as one undoable step together with starting the new round. Leaving an OR or the private auction has no end step. Skipping the corporate round in 21Moon runs only the stock round's end step."

## Background

A round's **end step** is the set of effects the rules apply when that round ends:

- **End of the stock round (SR)**: the capital owed to 1830 companies that floated during the SR, then the sold-out share price moves of games that check sold-out at the end of the SR (1830, 1848).
- **End of the corporate round (CR, 21Moon only)**: sold-out moves (shares held by players and companies) and the pool penalty (down 1 with shares in the pool, once the company has operated).
- **End of an operating round (OR)** and **end of the private auction**: no end step.

Today the end step is a separate action, reached by the "Fin de ronda de acciones" and "Fin de ronda corporativa" buttons or by voice. Starting the next round does not run it. So a table that forgets the button loses money and price moves without any notice, and a table that taps it twice applies them twice. Both break the game's money and market silently.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Starting the OR closes the stock round (Priority: P1)

At the end of a stock round the table taps "Empezar OR" (or says "empieza la ronda de operaciones"). The app first applies the SR's end step (1830 capital for companies that floated this SR, sold-out moves) and then starts the OR. The table never has to remember a separate "end of round" tap.

**Why this priority**: This is the defect that loses money and price moves today. It is the most common transition in every game (SR → OR).

**Independent Test**: In an 1830 game, float a company during the SR and buy out another company to players only, then tap "Empezar OR". The floated company has its capital, the sold-out company moved up 1, and the OR has started, without any other tap.

**Acceptance Scenarios**:

1. **Given** an 1830 SR where a company floated during the round and its capital is still owed, **When** the table taps "Empezar OR", **Then** the company receives its capital from the bank and the first OR starts.
2. **Given** an 1830 or 1848 SR where a company's shares are all held by players, **When** the table taps "Empezar OR", **Then** that company moves up 1 on the market (highest price first when several qualify) and the first OR starts.
3. **Given** an SR where no company is owed capital and none is sold out, **When** the table taps "Empezar OR", **Then** only the OR starts, and nothing else changes.
4. **Given** the screen during an SR or a CR, **When** the table looks at the round controls, **Then** there is no "Fin de ronda de acciones" and no "Fin de ronda corporativa" button.

---

### User Story 2 - The end step can never run twice (Priority: P1)

A round's end step is applied at most once, whichever way the round ends. If the table already said "fin de la ronda de acciones" by voice, starting the OR does not repeat it. A second "fin de la ronda" in the same round changes nothing.

**Why this priority**: Applying the step twice is the other half of the defect: doubled capital and doubled price moves. It is as harmful as missing it.

**Independent Test**: In an SR with a sold-out company, say "fin de la ronda de acciones" and confirm, then tap "Empezar OR". The company moved up exactly once and its capital (if owed) was paid exactly once.

**Acceptance Scenarios**:

1. **Given** an SR whose end step was already applied by a voice "fin de la ronda de acciones", **When** the table taps "Empezar OR", **Then** only the OR starts; no capital or price move is applied again.
2. **Given** an SR whose end step was already applied, **When** the table says "fin de la ronda de acciones" again, **Then** the app tells the table the end of the round was already applied and nothing changes.
3. **Given** an SR whose end step was applied and then undone, **When** the table taps "Empezar OR", **Then** the end step is applied (because it no longer counts as applied) and the OR starts.

---

### User Story 3 - One undo reverts both the end step and the round start (Priority: P1)

The end step and the start of the new round are one entry in the history. One undo puts the table back in the round it left, with the money and prices as they were before.

**Why this priority**: Constitution IV: every applied action undoes in one tap. A table that tapped "Empezar OR" too early (someone still wanted to buy) must be able to go back cleanly.

**Independent Test**: Tap "Empezar OR" from an SR with pending capital and a sold-out company, then tap undo once. The game is back in the same SR, the capital is unpaid and the price is unmoved.

**Acceptance Scenarios**:

1. **Given** the table tapped "Empezar OR" and the SR's end step was applied with it, **When** the table undoes once, **Then** the round is the SR again, the capital is back with the bank and every price is where it was.
2. **Given** the table undid an "Empezar OR" that included the end step, **When** the table taps "Empezar OR" again, **Then** the end step is applied once more, exactly once.
3. **Given** the table tapped "Empezar OR", **When** the table opens the history, **Then** it sees a single entry for the start of the OR that lists the end-of-round effects it included (capital paid, price moves).

---

### User Story 4 - 21Moon corporate round (Priority: P2)

In 21Moon the table goes SR → CR → OR. "Empezar ronda corporativa" closes the SR (its end step) and starts the CR. "Empezar OR" from the CR closes the CR (sold-out moves, pool penalty) and starts the OR. If the table skips the CR and goes SR → OR, only the SR's end step runs; the CR's does not, because the CR never happened.

**Why this priority**: Only one of the supported games has a CR, but the pool penalty and its sold-out moves are only ever applied at the end of the CR, so 21Moon loses them entirely without this.

**Independent Test**: In 21Moon, start a CR, issue shares of an operated company to the pool, then tap "Empezar OR". The pool penalty moves that company down 1 and the OR starts.

**Acceptance Scenarios**:

1. **Given** a 21Moon SR, **When** the table taps "Empezar ronda corporativa", **Then** the SR's end step (if any for 21Moon) is applied and the CR starts, as one entry.
2. **Given** a 21Moon CR where an operated company has shares in the pool, **When** the table taps "Empezar OR", **Then** that company moves down 1 and the OR starts, as one entry.
3. **Given** a 21Moon CR where a company's shares are all held by players and companies, **When** the table taps "Empezar OR", **Then** that company moves up 1 and the OR starts.
4. **Given** a 21Moon SR, **When** the table taps "Empezar OR" directly (skipping the CR), **Then** only the SR's end step runs; no CR sold-out move or pool penalty is applied.

---

### User Story 5 - Rounds without an end step (Priority: P3)

Starting a round after an OR or after the private auction applies nothing extra: there is no end step to run.

**Why this priority**: It confirms the scope boundary; no new behavior is needed beyond not adding effects.

**Independent Test**: At the end of an OR set, tap "Empezar ronda de acciones"; only the SR starts. In the private auction, tap "Empezar ronda de acciones" or "Empezar OR"; only that round starts.

**Acceptance Scenarios**:

1. **Given** an OR, **When** the table starts the next OR or the next SR, **Then** no end-of-round effect is applied.
2. **Given** the private auction, **When** the table starts the SR or the OR, **Then** no end-of-round effect is applied.

---

### Edge Cases

- **Voice "fin de la ronda" then more SR actions**: the table says "fin de la ronda de acciones", then records a late purchase in the same SR. The end step counts as applied, so "Empezar OR" does not run it again. The late purchase does not trigger a new sold-out check; the table can fix any price by hand.
- **Leaving the CR toward a new SR** (21Moon, the table taps "Empezar ronda de acciones" from the CR): the CR's end step runs first, as for any round that is left.
- **Voice "empieza la ronda de operaciones"**: behaves exactly like the "Empezar OR" button, and its confirmation card lists the end-of-round effects it includes.
- **Manual turn override** ("Turno / Fase" control) changes the round without applying any end step; it is a correction, not a round transition.
- **An OR started automatically** at the end of a company's turn (the next OR in the set) leaves an OR, so it applies nothing extra.
- **A sold-out company already at the top of the market** (or a penalized one at the bottom) does not move, as today.
- **Saved games from before this change** whose current SR already had its end step applied by the old button: that application counts, and starting the next round does not repeat it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The round controls MUST NOT show "Fin de ronda de acciones" or "Fin de ronda corporativa".
- **FR-002**: Starting a new round (by button or by voice) MUST first apply the end step of the round being left, when that round has one and its end step has not yet been applied, and then start the new round.
- **FR-003**: The end step of the SR MUST consist of the capital owed to companies that floated during that SR (games that pay capital at the end of the SR, i.e. 1830) followed by the game's end-of-SR sold-out moves (1830, 1848), in the same order and amounts as the current end-of-SR action.
- **FR-004**: The end step of the CR (21Moon) MUST consist of the game's end-of-CR sold-out moves and pool penalty, in the same order and amounts as the current end-of-CR action.
- **FR-005**: Leaving an OR or the private auction MUST NOT apply any end-of-round effect.
- **FR-006**: A round's end step MUST be applied at most once per round. An end step applied earlier in the same round, by voice "fin de la ronda" or by the old button in a saved game, MUST count as applied.
- **FR-007**: An end step that was applied and later undone MUST no longer count as applied.
- **FR-008**: A repeated voice "fin de la ronda" in a round whose end step was already applied MUST change nothing and MUST tell the table the end of the round was already applied.
- **FR-009**: The end step and the start of the new round MUST form a single history entry, undone together by one undo.
- **FR-010**: That history entry and, for voice commands, the confirmation card MUST list the end-of-round effects it includes (capital paid, price moves with their reason), so the table can see them.
- **FR-011**: In 21Moon, going from the SR directly to the OR MUST apply only the SR's end step, never the CR's.
- **FR-012**: The manual turn override MUST NOT apply any end step.
- **FR-013**: The voice commands "fin de la ronda de acciones" and "fin de la ronda corporativa" MUST keep working, subject to FR-006 and FR-008.
- **FR-014**: The product reference (`docs/spec.md`) MUST be updated to describe round transitions this way.

### Key Entities

- **Round end step**: the effects a round applies when it ends (SR: pending capital, sold-out moves; CR: sold-out moves, pool penalty). Each round instance has at most one applied end step.
- **Round transition**: one history entry that contains, in order, the end step of the round being left (when owed) and the start of the new round.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every supported game, going from any round to the next with only the start-of-round control leaves money and share prices identical to what the rulebook's end-of-round procedure gives, in 100% of the tested transitions.
- **SC-002**: No sequence of taps and voice commands applies a round's end step more than once (tested: voice end then start; start, undo, start; repeated voice end).
- **SC-003**: Moving from the SR to the OR takes one tap, down from two.
- **SC-004**: One undo after starting a round restores the previous round, money and prices exactly, with the money invariant holding throughout.

## Assumptions

- "Starting a round" covers every start control and its voice equivalent: "Empezar OR", "Empezar ronda corporativa" and "Empezar ronda de acciones" (the last only matters when leaving the CR, since leaving an OR or the auction has no end step).
- Starting the next OR from within an OR (including the automatic start at the end of a company's turn) leaves an OR and so never applies an end step.
- The voice "fin de la ronda" commands stay available; only the buttons are removed. They stay useful for a table that wants to apply the end step before the last SR actions are settled.
- 21Moon has no end-of-SR effects today (its capital is incremental and its sold-out check is at the end of the CR), so its SR end step is normally empty; the rule still applies if the game definition adds some.
- No new confirmation prompt is added to the touch "Empezar …" buttons; they apply immediately as today, and undo is the recovery path (constitution IV).
- Existing end-to-end tests that tap the removed buttons will be updated as part of this change.
