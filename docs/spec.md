# 18xx Companion — Product Spec

Status: Draft v0.2 · 2026-10-07 · Detailed v1 requirements:
[specs/001-companion-mvp/spec.md](../specs/001-companion-mvp/spec.md)

## 1. Vision

A touch-first, voice-enabled companion app for 18xx board games, used on one phone or tablet
shared at the table. It takes care of the bookkeeping that slows games down: bank, player cash,
company treasuries, share ownership, dividends, and making change with poker chips. Players keep
their attention on the board.

The app is **not a rules engine**. It knows enough of each game's rules to do the money
correctly. Everything else (map, routes, tile placement legality, revenue calculation) stays on
the table. When the app and the table disagree, the table wins: every value can be overridden.

### Guiding principles

1. **Less screen time, not more.** Any common action takes ≤ 2 taps or one short voice command.
2. **Voice and touch are equal.** Both produce the same actions. Voice is a shortcut, never the
   only path.
3. **Nothing changes without confirmation.** AI-proposed actions are shown first and applied only
   after confirmation. Everything can be undone.
4. **Money is conserved.** Bank + players + companies always equals the starting total (unless
   the bank is unlimited). A broken invariant is a bug or a misheard command, and the app shows it.
5. **Rules as configuration.** Game differences live in data (game definitions), not in
   per-game code paths, wherever possible.

## 2. Scope

### 2.1 MVP (v1)

- Game selection from built-in definitions: **1830**, **1848**, **21Moon**, plus a **custom
  game** option (a copy of a built-in game with edited values).
- Local session on one device: players, companies, bank, chips.
- Player grid: each player's cash, in the style of Commander life-counter apps.
- Company grid: treasury, share price, president, shares in IPO/pool, trains (optional).
- Bank tracking with chip breakdown for every bank transaction, using configurable chip
  denominations and colors.
- Share ownership tracking (player, IPO/treasury, pool).
- Automated dividends: full payout, withhold, and half-pay where the game allows it, or
  revenue split into fixed-destination parts (21Moon), with
  correct routing of dividends for unowned shares.
- Stock market price tracking, with automatic standard moves and manual override.
- Turn tracking: current round (SR/OR n.m), current operating company, operating order.
- Event ledger with undo, amend, and history view.
- Voice commands in **Spanish**, resolved by Claude into structured actions with a confirmation
  card.
- Local persistence (survives reloads and app restarts). Installable PWA.

### 2.2 Later iterations (designed for, not built)

- Mergers, conversions, and company closures (18CZ, Railways of the Lost Atlas).
- Multi-device game rooms with private wallets.
- More games and voice languages.
- Loans for the 1817 family, beyond what 1848 needs in v1 (see §5.2).
- Custom games authored from scratch (new market grids, phases, dividend rules).
- Backend proxy for the AI key.
- Native wrapper (Capacitor) for hardware push-to-talk and offline speech recognition.

### 2.3 Non-goals

- Map, tile, and route modeling; revenue calculation.
- Enforcing rule legality (certificate limits, buy/sell restrictions). We may *warn*, never block.
- Online play.

## 3. Users & Context

- 2–7 players around a table (each game sets its own range; the app caps it at 7), often noisy, with one device in the middle or held by a "banker".
- Players know the game. The app needs no rules tutorials.
- Sessions last 3–6 hours, so state must survive the screen sleeping, a reload, or a dead
  battery followed by a restore.

## 4. Platform & Architecture

- **PWA**: React + TypeScript + Vite. Offline-capable, except for the AI call.
- **Storage**: IndexedDB. A session is stored as its event log plus periodic snapshots.
- **Speech-to-text**: Web Speech API (`es-ES` / configurable `es-*` locale). Push-to-talk only.
- **Command resolution**: Claude Messages API, called from the client with a user-provided API
  key stored locally. See §8.
- **No backend** in v1.
- **Responsive layouts** for phone (portrait) and tablet (landscape).

### 4.1 Core architecture: event-sourced ledger

All state is derived from an append-only list of **events**. UI components and the voice layer
never change state directly. They emit **actions**, which pass validation and become events.

```
 voice ─┐                         ┌─> validate ─> confirm ─> append Event ─> reduce ─> State
        ├─> Action[] (proposed) ──┤
 touch ─┘                         └─> (touch actions skip the card: applied at once, with undo)
```

- **Undo**: marks the last event (or group) as reverted. Reverted events stay in the log.
- **Amend**: replaces an event's payload ("no, it was 260") by reverting it and appending a
  corrected event in the same group.
- **Event groups**: one user intent (e.g. a dividend payout) produces one group of atomic
  transfers. Undo works on whole groups.
- **Invariant check** after every reduce: total money is conserved, and each company's share
  count matches its total certificates.

## 5. Domain Model

### 5.1 Entities

- **Session**: id, game definition (snapshot copied at creation), players, companies, chip
  set, settings, event log.
- **Holder** (anything that can hold money and/or shares): `bank`, `player:<id>`,
  `company:<id>`, `ipo:<companyId>`, `pool`. Treasury shares use `company:<id>` as the holder.
- **Player**: id, name, aliases (for voice), color, seat order.
- **Company**: id, short name, full name, aliases, color, share count (5/10/…, variable to allow
  future conversions), par price, current market position, status
  (`unstarted | parred | floated | closed`), trains (optional list).
- **Private company**: id, name, owner holder, income per OR, closed flag.
- **Certificate holdings**: map of holder → company → percent (or share units). The president's
  certificate is tracked separately.
- **Market**: game-defined grid (1D or 2D), with company tokens at positions.
- **Turn state**: round type (`SR | OR`), OR set number and index (e.g. OR 2.1), operating
  order, current company, phase.

### 5.2 Game definition (data, not code)

Every built-in game is one JSON/TS object. Fields marked ⚠ must be checked against the
rulebook for each game before implementation.

| Field | Description |
|---|---|
| `bank` | Total amount, or `unlimited` |
| `startingCash` | Per player count |
| `companies[]` | Name, short name, color, share count, home info (cosmetic) |
| `privates[]` | Name, price, income |
| `capitalization` | `full` (company receives N × par on float) or `incremental` (receives par per share sold from IPO/treasury) |
| `floatPercent` | % sold needed to float |
| `unownedDividends.ipo` | Who receives dividends for IPO/treasury shares: `company`, `bank`, `none` ⚠ |
| `unownedDividends.pool` | Same, for pool shares ⚠ |
| `playerCount` | Supported range (min–max), never more than 7 |
| `payoutModes` | Subset of `full`, `withhold`, `half` |
| `revenueParts` | Optional: revenue parts with fixed destinations (treasury or dividends), e.g. 21Moon local base and Space Port base |
| `roundingRule` | How per-share amounts and half-pays are rounded ⚠ |
| `market` | Grid cells with prices plus movement rules: payout, withhold, sell (per share / per sale), sold-out ⚠ |
| `phases[]` | Name, triggering train, ORs per set, rusting/obsolescence events, private closure |
| `trains[]` | Type, cost, count, rusts-on |
| `loans` | Optional block (amount, lender, interest, repayable, limits, market effect). 1848: £100 from the Bank of England, no interest, never repaid |
| `endTrigger` | e.g. bank broken, plus how the final OR set is handled |
| `customRules` | Escape hatch: named flags handled by small per-game code hooks, used sparingly |

**v1 games.** The values for each game come from its rulebook. They are not written from memory.
- **1830**: classic baseline. 10-share companies, full capitalization, finite bank, privates
  with income.
- **1848**: full support in v1, including loans, the special entities (Bank of England,
  Commonwealth Railway), and receivership. Exact rules and capitalization come from the
  rulebook ⚠.
- **21Moon**: verify capitalization, payout options, and anything unusual about its structure ⚠.

**G-1 (resolved 2026-10-07)**: 1848 ships with full support. Mechanics that don't fit the config
are built as named, reusable mechanics (via `customRules`) that other games can enable later,
not as one-off 1848 logic.

### 5.3 Designing ahead for mergers (not implemented in v1)

These choices keep mergers possible later without a rewrite:
- Share count per company is a mutable property that changes through events.
- Companies can be `closed`, and their remaining assets transferred by explicit events.
- Every transfer of money or shares between any two holders is a single event type, so merges
  can be built from existing transfers.

## 6. Events & Actions

The event vocabulary is small. Higher-level actions expand into groups of primitive events.

**Primitive events**
- `moneyTransfer { from, to, amount }`
- `shareTransfer { company, from, to, units, isPresidency? }`
- `marketMove { company, toPosition, reason }`
- `companyStatus { company, status }`
- `trainTransfer { train, from, to }` (optional tracking)
- `turnAdvance { round, orIndex, company? }`
- `note { text }` (free-form, for anything the app doesn't model)

**High-level actions** (what touch and voice produce)

| Family | Action | Expands to |
|---|---|---|
| Operating | `runAndPayout(company, revenue, mode)` | money transfers to holders by ownership plus a market move |
| Operating | `buyTrain(company, trainType, from, price?)` | money and train transfer, possible phase change |
| Operating | `payCost(company, amount, reason)` | company → bank |
| Operating | `privateIncome()` | bank → owners, at the start of each OR |
| Stock | `parCompany(player, company, price)` | shares + money + status |
| Stock | `buyShare(player, company, source, count?)` | shares + money (+ capitalization) |
| Stock | `sellShares(player, company, count)` | shares + money + market move |
| Stock | `buyPrivate(player/company, private, price)` | |
| Loans | `takeLoan(company, n)` | only if the game defines loans. Repayment and interest are definition fields for future games; v1 builds no repay action |
| Flow | `nextCompany / startSR / startOR / endSR` | turn events, sold-out market moves at the end of the SR |
| Manual | `adjust(holder, amount)` / `setPrice(company, position)` | overrides, recorded as events |

### 6.1 Stock round entry modes

- **Live**: each buy or sell is logged as it happens, at the current price. Correct even when
  sells move the price.
- **Batch**: one end-of-round statement ("Ana compró dos PRR, Bruno vendió tres B&O…") is broken
  into the same actions and shown on one summary card. Actions run in the order spoken. If price
  changes make the order ambiguous, the card shows the assumed prices so you can edit them.

## 7. Chips & Bank

- **Chip set**: list of `{ value, color, label?, countAvailable? }`, configured per session
  (with presets per game). Colors use a picker.
- **Pay view**: every confirmed transaction that moves money into or out of the bank shows the
  chips to hand over, as colored discs with counts.
  - Bank pays X: breakdown of X.
  - Someone pays the bank X with a given chip: the breakdown of the change is shown too.
- **Algorithm**: greedy works for canonical denomination sets. If `countAvailable` is set, or
  the set isn't canonical, use bounded change-making (small dynamic programming). Fewest chips
  wins.
- **Bank view**: remaining bank total, and "bank broken" status when it reaches 0.
- **Wallet mode setting**:
  - *App is the source of truth*: players' money lives in the app. Chips are only for the bank,
    or not used at all.
  - *Bank only*: players hold physical chips. The app tracks bank and companies, and player
    totals are hidden.

## 8. Voice Command Resolution

### 8.1 Flow

1. The user **holds** the mic button (large, thumb-reachable). Release ends capture.
2. Speech-to-text produces a Spanish transcript, shown live.
3. The transcript and a compact **context snapshot** are sent to Claude.
4. Claude replies with one or more **tool calls** (actions), a **clarification** request, or a
   **query** answer request.
5. The app validates the actions against state. It shows a **confirmation card** with a
   plain-language summary in Spanish, the money flows, and the chip breakdown.
6. The user confirms (tap, or say "sí" / "confirmar"), edits a field, or cancels.

### 8.2 Model call design

- **Single call, all action tools.** Each high-level action in §6 is one tool with a strict
  JSON schema (`strict: true`), around 20–30 tools in total. One round trip keeps latency low.
  It also lets compound commands ("compra un 4 y paga 290") span families in one response.
  - *Considered*: two calls, first picking the family and then the command. Rejected for v1: it
    doubles latency, and compound commands cross families. Number extraction is already reliable
    with strict schemas. Revisit only if the tool count grows large enough to hurt accuracy.
    Even then, the API's tool search is the first option to try before splitting the call.
- **Context snapshot** in each request: players and aliases, companies and aliases, cash,
  holdings, current round, operating company, available trains and prices, and the last N
  events (for "no, era 260").
- **Prompt caching**: the system prompt, game definition, and tool list form a stable prefix and
  get cached. The volatile snapshot goes last.
- **Clarification tool**: `askClarification(question, options[])`, rendered as tap buttons.
- **Queries** ("¿cuánto tiene Ana?") produce a `query` tool call. The app answers from state,
  never from model text.
- **Model**: configurable in settings. Default to be chosen by measuring latency and accuracy on
  an eval set of real Spanish commands (see §11, open item **AI-2**).
- **Failure modes**: no network or no key means voice is disabled and touch still works. A model
  refusal or an invalid tool input produces a "No entendí" message with the transcript shown for
  manual entry.

### 8.3 Example commands (Spanish, v1 target set)

| Command | Resolves to |
|---|---|
| "240, paga" | `runAndPayout(current, 240, full)` |
| "retiene 180" | `runAndPayout(current, 180, withhold)` |
| "media paga 300" | `runAndPayout(current, 300, half)` |
| "compra un tren 3" | `buyTrain(current, "3", bank)` |
| "la Pennsy le compra el 4 a la B&O por 300" | `buyTrain(PRR, "4", B&O, 300)` |
| "paga 120 de montaña" | `payCost(current, 120, "terrain")` |
| "Ana abre la NYC a 82" | `parCompany(Ana, NYC, 82)` |
| "Bruno compra una B&O del pool" | `buyShare(Bruno, B&O, pool)` |
| "Carla vende dos Erie" | `sellShares(Carla, Erie, 2)` |
| "deshacer" / "no, eran 260" | undo / amend last |
| "¿cuánto tiene Ana?" | query |
| "siguiente compañía" | `nextCompany()` |

## 9. UI

### 9.1 Screens

1. **Home**: resume session, new session, settings (API key, voice locale, model).
2. **New session**: pick game → players (names, colors, aliases) → chip set (preset +
   colors) → wallet mode.
3. **Table** (main screen):
   - Top bar: round indicator (SR / OR 2.1), current company, bank remaining.
   - **Player grid**: large tiles with name, cash, and share summary. Tap opens a detail sheet;
     ± gestures allow quick adjustments.
   - **Company grid** (tab or second row): treasury, price, president, trains.
   - Floating **mic button** (push-to-talk) and **undo** button.
4. **Operate sheet** (touch path for an OR turn): revenue keypad, Pay / Withhold / Half,
   buy-train picker, pay-cost.
5. **Stock sheet**: player → company → buy (IPO/pool) / sell n / par.
6. **Confirmation card**: summary, flows, chips, Confirm / Edit / Cancel.
7. **History**: grouped ledger. Undo or amend any group, with a warning when later events depend
   on it.
8. **Market view**: grid with company tokens (read-only in v1, plus manual move).

### 9.2 Touch & accessibility

- Minimum touch target 48 px. Primary actions within thumb reach.
- High contrast. Company colors always paired with short names (so color is never the only cue).
- Screen wake lock while a session is open.

## 10. Persistence & Data

- Event log and snapshots in IndexedDB, saved on every event.
- Export/import session as JSON (backup, bug reports, moving devices).
- API key stored locally on the device, never exported.

## 11. Open Items

| Id | Item |
|---|---|
| G-1 | ~~1848 special entities and loans: fit them in the config or reduce scope (§5.2)~~ **Resolved**: full support, built as reusable mechanics |
| G-2 | Fill in and verify all ⚠ fields for 1830, 1848, 21Moon from the rulebooks |
| G-3 | Market movement edge cases (multiple sells in one action, ceiling/floor cells) |
| AI-1 | Confirm the current Claude API features to use (strict tools, caching), and the browser-side SDK setup for a user-supplied key |
| AI-2 | Build a small eval set (~50 Spanish transcripts with expected actions) and use it to choose the default model on latency and accuracy |
| AI-3 | Decide whether to evaluate the "decisions API" the user mentioned (not yet identified; needs a link) |
| UX-1 | ~~Whether touch actions also show the confirmation card, or apply immediately with undo~~ **Resolved**: apply immediately, with one-tap undo |
| UX-2 | Voice confirmation ("sí") vs tap-only confirmation |

## 12. Success Criteria (v1)

- A full 1830 game can be played with the app handling all money, without manual corrections
  other than misheard commands.
- Common OR commands are resolved correctly ≥ 90% of the time on the eval set, with
  transcript-to-card latency under 3 s on a typical connection.
- Any action can be undone in one tap.
- Money is conserved at all times in a full playthrough.
