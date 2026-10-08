# Research: 18xx Companion MVP

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-10-07

Each section records a decision, the reason for it, and the alternatives considered. Rule
values carry a verification status:

- ✅ **verified**: read from the rulebook in this repo.
- ⚠ **unverified**: from secondary sources or memory. Must be checked against the rulebook
  before the game definition ships (constitution III, open item G-2).

---

## R1. Application stack

**Decision**: React 19 + TypeScript 5 (strict) + Vite, delivered as an installable PWA with
`vite-plugin-pwa` (Workbox precache of the app shell). Single-page app. Screens are switched
by app state, not by a router library.

**Rationale**: The constitution fixes React + TS strict + Vite + PWA. There are only eight
screens and no deep links, so a router adds a dependency without benefit.
`vite-plugin-pwa` is the standard way to create the manifest and the offline service worker
in Vite. Hand-written service workers are error-prone around cache versioning.

**Alternatives considered**: React Router (rejected: not needed for 8 screens with no URLs to
share). Hand-written service worker (rejected: precache manifest and update flow are easy to
get wrong).

## R2. State management

**Decision**: No state library. A small `SessionStore` holds the log and the derived state,
and exposes `subscribe/getSnapshot` for React's `useSyncExternalStore`. All writes go through
`store.dispatch(action)` → validate → expand → append group → persist → reduce.

**Rationale**: Under constitution I, state is a pure function of the log. A store that owns
the log and a reducer is all that is needed. Zustand, Redux and similar libraries would
duplicate the reducer pattern and make it easier to write state outside the event pipeline.

**Alternatives considered**: Zustand (rejected: small, but encourages ad-hoc `set()` calls
that bypass the ledger). Redux Toolkit (rejected: heavy, and its action log would duplicate
ours).

## R3. Ledger design: undo, amend, dependencies

**Decision**:
- The log holds **entries** of three kinds, all append-only:
  - `group`: one user intent. It stores the high-level `action` and the primitive `events` it
    expanded to at the time.
  - `revert { groupId }`: marks a group reverted.
  - `amend { groupId, action, events }`: replaces a group's effects. The new events are
    expanded against the state *at the original group's position*.
- **Effective log** = groups in order, skipping reverted ones and swapping in each group's
  latest amendment. State = reduce(effective log). Reverted and amended originals stay visible
  in History (FR-013).
- Later groups keep their **stored primitive events** after an earlier group is amended. They
  record what physically happened at the table, so they are not re-expanded. If replay then
  breaks an invariant, the warning shows (FR-015). Nothing is auto-corrected.
- **Dependency detection** (FR-014): a later effective group *depends on* group G if it
  touches an entity whose value G changed (holder money, company shares, market position,
  asset owner, turn). Each group records the set of entities it touched; the warning lists
  the dependent groups.
- **Snapshots**: a full `SessionState` every 50 groups, keyed by log position. A `revert` or
  `amend` aimed before a snapshot invalidates the later snapshots. The store then rebuilds from
  the nearest earlier snapshot.

**Rationale**: Satisfies "events are never deleted or rewritten" (constitution I) while
keeping undo O(replay). A 6-hour game is roughly 1,500 groups and 10k primitives, and a full
replay of those is well under 50 ms. Snapshots are an optimization for load time, not a
correctness requirement.

**Alternatives considered**:
- Re-expand all later actions after an amend (rejected: it silently rewrites what happened at
  the table, for example a later sale at a price that the amend changed. That breaks
  "the table wins").
- Inverse events for undo (rejected: the inverse of a payout depends on state, and the log
  would no longer show what was undone).

## R4. Primitive event vocabulary

**Decision**: Eight primitives, close to the constitution's list:

| Primitive | Notes |
|---|---|
| `moneyTransfer {from, to, amount}` | as in constitution |
| `shareTransfer {company, from, to, units, presidency?}` | as in constitution |
| `marketMove {company, to: CellRef, reason}` | as in constitution. `reason` drives History text |
| `companyStatus {company, status, parPrice?, …}` | adds `receivership` and `bankrupt` statuses and sets par on parring |
| `assetTransfer {asset, from, to}` | **generalizes** `trainTransfer`. Assets are trains (including the 1830 open market in `pool`), private companies, and loan markers |
| `turnAdvance {round?, orSet?, orIndex?, company?, phase?, operatingOrder?}` | phase change folded in; rounds include `CR` |
| `counterChange {subject, key, delta}` | **new**: non-money tallies, namely bank debt (1848 director, 1830 Base receivership) and 21Moon East-West bonus tokens |
| `note {text}` | as in constitution |

**Rationale**: Privates (FR-026), trains (FR-034) and 1848 loan markers (FR-112) are all
countable things that change owner between holders. One `assetTransfer` covers all three
instead of three separate events. Bank debt is **not money**: when the Bank lends, physical
money leaves the Bank (a normal `moneyTransfer`), and the IOU is tracked separately. One generic
`counterChange` covers debt and the 21Moon bonus tokens, instead of a dedicated debt event per
debtor type. Both are recorded in Complexity Tracking.

**Alternatives considered**: separate `trainTransfer`, `privateTransfer`, `loanTaken`
(rejected: three near-identical events with the same reducer logic). A counter on the company
for loans (rejected: the Bank of England loan supply of 20 markers must also be conserved and
counted, so markers as assets give a conservation check for free).

## R5. Shared action schemas: one validation path for touch and voice

**Decision**: Every high-level action is a **Zod 4** schema in `src/domain/actions/`. The same
schema is used:
1. by touch UI builders (type-safe payloads),
2. to generate the Claude tool `input_schema` through `z.toJSONSchema()`, with `strict: true`
   and `additionalProperties: false`,
3. to parse and validate every model tool call before it reaches the confirmation card,
4. to validate imported session files.

Entity references in tool schemas are **enums of the session's ids**: player ids, company ids,
train types and private ids. Strict tool use then guarantees the model can only name entities
that exist. Optional fields are written as `nullable` and required, not omitted, to stay inside
strict-schema limits.

**Rationale**: Constitution V asks for "the same action types through the same validation
path". One schema source removes drift between touch and voice. Zod 4 has native JSON Schema
export, so a second library is not needed. Session-specific enums are stable for the whole
session, so they live in the cached prefix (R9).

**Alternatives considered**: hand-written JSON Schemas plus TS types (rejected: they drift).
TypeBox (rejected: Zod also covers import-file validation more ergonomically, and is the
schema library the Anthropic TS SDK helpers support).

## R6. Persistence

**Decision**: IndexedDB through **`idb`** (a ~1 kB promise wrapper). Database `companion`, v1:

- `sessions` (key `id`): metadata such as name, game, createdAt, updatedAt, entryCount.
- `entries` (key `[sessionId, seq]`): log entries, append-only.
- `snapshots` (key `[sessionId, seq]`).
- `settings` (key `key`): AI key, locale, model, last session id.
- `games` (key `id`): custom game definitions (FR-007).

Each dispatch writes its entry in one `readwrite` transaction with `durability: "strict"`. The
UI shows the new state only after the transaction resolves (FR-090, SC-007). An unconfirmed
voice proposal lives only in memory and is discarded on reload, as the spec's edge case
requires.

**Export** (FR-091): JSON `{format: "18xx-companion/session", version: 1, session, entries}`.
`settings` are never read by the exporter, so the AI key cannot leak (FR-092). A test asserts
this. **Import** validates with the Zod schema, replays the log, and checks that the replayed
state equals the state the export recorded (a hash).

**Rationale**: The constitution fixes IndexedDB. `idb` removes callback boilerplate without
adding an ORM. `durability: "strict"` gives the strongest flush guarantee browsers offer, so a
device sleeping right after a tap does not lose the event.

**Alternatives considered**: Dexie (rejected: larger, and its query and live-query features
are unused). localStorage (rejected: synchronous, a 5 MB cap, and no transactions).

## R7. Voice capture

**Decision**: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with
`interimResults: true`, `continuous: true` while the button is held, `lang` from Settings
(default `es-ES`; options `es-ES`, `es-MX`, `es-AR`, `es-US`, …). Release calls `stop()`, and
the final transcript is sent to the interpreter. The mic is shown as unavailable when the API
is missing, `navigator.onLine` is false, or no AI key is set (FR-075).

**Rationale**: Fixed by the constitution. Recognition in Chrome is server-backed anyway, so
voice is an online feature in both halves, which matches FR-093.

**Alternatives considered**: on-device Whisper/WebGPU (rejected for v1: large download, slow
on phones; listed as a later iteration under the native wrapper).

## R8. Calling Claude from the browser

**Decision**: Official **`@anthropic-ai/sdk`** with `new Anthropic({ apiKey,
dangerouslyAllowBrowser: true })`. The key is read from IndexedDB `settings` at call time.
One **non-streaming** `messages.create` call per command:

- `tools`: one strict tool per voice-reachable action (~30 in total, see voice-tools.md), plus `askClarification`, `query`,
  `undo`, `amendLast`, `notUnderstood`.
- `tool_choice: {type: "auto"}`, with the system prompt requiring at least one tool call.
  Forced `any`/`tool` returns a 400 on some current models (Opus 5.5, Fable 5.1), and the model
  is user-configurable, so `auto` keeps every model usable. `strict: true` still guarantees
  schema-valid arguments. A reply with no tool call is treated as `notUnderstood`.
- Parallel tool calls stay **on**. A compound command ("compra un 4 y paga 290") arrives as
  several `tool_use` blocks in one response. They are applied as **one** group per
  confirmation (FR-071, US5-2).
- `max_tokens: 1024`, because output is a few small tool calls.
- Handle `stop_reason` `refusal` and `max_tokens`, typed SDK errors (auth → "clave inválida",
  rate limit, connection), and timeouts (8 s client timeout, `maxRetries: 1`). All of them
  degrade to "No entendí" with the transcript and touch entry (constitution IV).
- There is no multi-turn loop. A clarification answer re-runs resolution with the original
  transcript plus the chosen option appended to the user message.

**Rationale**: The constitution fixes a client-side call with a user-supplied key. The SDK's
`dangerouslyAllowBrowser` is the supported way to do this, and the risk is accepted because
the key belongs to the user and lives only on their device. The threat analysis and mitigations are in R17. Non-streaming keeps validation
simple: the card needs complete tool inputs, and the output is tiny.

**Alternatives considered**: raw `fetch` (rejected: the skill guidance and the constitution
prefer the SDK, which also gives typed errors and retries). Streaming (rejected: no latency
benefit for under 200 output tokens of tool JSON). The tool runner (rejected: the app must
confirm before anything runs, so there is no automatic loop).

## R9. Prompt caching and model choice

**Decision**:
- Request layout: `tools` (session-stable, with id enums) → `system` (instructions in Spanish,
  examples, the game definition summary, and players/companies/aliases), with a
  `cache_control: {type: "ephemeral"}` breakpoint at the end of `system` → a `user` message
  holding the **volatile snapshot** (round, operating company, cash, holdings, trains on sale,
  last 5 groups) and the transcript.
- Serialization is deterministic (sorted keys, no timestamps in the prefix). The eval harness
  checks `usage.cache_read_input_tokens > 0` on the second call.
- Changing a player alias changes the prefix and causes one cache miss, which is acceptable.
- **Default model**: chosen by the AI-2 eval, measuring accuracy (≥ 90%, SC-003) and p95
  latency (< 3 s, SC-004). Candidates are `claude-haiku-4-5`, `claude-sonnet-5` (thinking
  disabled or effort `low`), and `claude-opus-5` (effort `low`). The default is
  `claude-sonnet-5` with effort `low` (user decision; the eval in R18 confirms or replaces it). Settings lets the user pick any model
  id (FR-076).
- The prefix (~25 tools plus system) will be well over 4,096 tokens, which is above the cache
  minimum on every candidate (512 to 4,096 depending on the model).

**Rationale**: Latency is dominated by input processing of a large stable prefix, and caching
cuts it sharply. Constitution VI requires the default to be chosen by measurement, not
assumption.

**Alternatives considered**: a two-call family router (rejected in the product spec §8.2).
API tool search with deferred loading (kept as the first fallback if the tool count grows).

## R10. Testing and tooling

**Decision**:
- **Vitest** for unit and integration tests (the domain is pure TS, and Vitest shares Vite's
  config). **@testing-library/react** for component behavior (2-tap flows, toasts).
  **fake-indexeddb** for persistence tests.
- **Playwright** for a small E2E suite: create a session, pay out, reload, verify (SC-007);
  check that offline touch actions still work (FR-093).
- **ESLint** (typescript-eslint, react-hooks) plus a custom lint rule or grep check: no imports
  of `SessionStore` internals outside `src/app/`, and no mutation of state objects (states are
  `readonly` types and are frozen in dev).
- **Voice eval**: `eval/voice/cases.jsonl` (transcript, fixture session, expected actions)
  and `eval/voice/run.ts` (Node, reads `ANTHROPIC_API_KEY`). It reports exact-match accuracy, per
  tool accuracy, and p50/p95 latency. Required for changes touching `src/voice/`
  (constitution VI, AI-2).
- **Rule tests per game**: `tests/games/<game>.test.ts` covers payouts, unowned-share routing,
  rounding, market moves, phases, and (for 1848) loans and receivership, using rulebook
  examples where they exist.

**Rationale**: Constitution VI requires test-first domain logic, per-game tests, and a
measured voice eval.

**Alternatives considered**: Jest (rejected: needs separate TS and ESM config next to Vite).
Cypress (rejected: Playwright handles offline emulation and mobile viewports better).

## R11. Chip change-making

**Decision**: A bounded change-making DP over `amount ≤ bank total`, minimizing chip count and
respecting `countAvailable` when set. When no counts are set and the set is canonical (checked
once per chip set with the Kozen–Zaks test up to the two largest denominations), use greedy.
"Paid with a larger chip" is a payment chip choice on the toast or card, and the change is
computed as the breakdown of `chipValue − amount`. Impossible exact change returns `null`,
shown as "no hay cambio exacto" (US6-3).

**Rationale**: Amounts are at most around 12,000 with 6 to 10 denominations, so the DP is
trivially fast (~100k cells). Greedy is minimal only for canonical sets, so the check keeps it
correct.

**Alternatives considered**: greedy only (rejected: fails for non-canonical sets and for
limited counts).

## R12. Screen wake lock and responsive layout

**Decision**: Screen Wake Lock API (`navigator.wakeLock.request("screen")`), re-acquired on
`visibilitychange` while a session is open (FR-102). It is a silent no-op where unsupported.
Layout uses CSS grid with two breakpoints: phone portrait (player grid with 2 columns,
companies in a tab) and tablet landscape (players and companies side by side). Touch targets
are at least 48 px through a shared `--tap` token (FR-101). Company chips always render the
short name over the color.

## R13. Game rules: 1848 Australia (rulebook in `docs/rules/1848-RULES-11a.pdf`) ✅

| Field | Value | Rule § |
|---|---|---|
| Bank | £10,000. The Bank of England holds a **separate** £2,000 plus 20 loan markers. Total money = £12,000 | 2.4.1, 5.4.1 |
| Starting cash | 3p £840 · 4p £630 · 5p £510 · 6p £430 | 2.3 |
| Companies | QR (5 tokens), COM (2 homes: Sydney and Adelaide, 5 tokens), FED (4), VR (3), SAR (4), WA (5), NSW (4), CAR (4). One 20% director's certificate plus eight 10% shares each | 1.3, 5.1 |
| Par prices | 70 / 80 / 90 / 100. CAR is always 100 | 5.2.1 |
| Float | 60% sold → launched | 5.2.2 |
| Capitalization | **Full**: 10 × par on launch | 5.2.2, 5.3.4 |
| Unowned dividends | Unsold (IPO) and pool shares: **not paid, retained by the Bank** | 5.1.5 |
| Payout modes | **Pay or withhold only** (no half) | 10.3.3 |
| Payout move | Right 1. At the end of a row, up 1 | 11.1 |
| Withhold move | Left 1. Entering the hatched area triggers **receivership** | 11.2, 5.5.1 |
| Sell move | Down 1 **per sale** (not per share). No effect at the bottom of a column | 12.5.1 |
| Sold-out move (end of SR) | Up 1 if all shares are in player hands. No effect at the top | 12.6.1 |
| OR order | By share price, highest first. Same cell: the marker on top goes first (new arrivals go underneath). Same price in different cells: the rightmost goes first | 7.2, 11.3 |
| ORs per set | 1. After the first 3/3+: 2. After the first 5/5+: 3 | 7.1 |
| Trains | 2/2+ ×6 £100/£120 (rust: 4) · 3/3+ ×5 £200/£230 (rust: 6) · 4/4+ ×4 £300/£340 (rust: 8) · 5/5+ ×3 £500/£550 · 6/6+ ×2 £600/£660 · 8/D ×∞ £800/£1100 (D £800 when trading in a 4/4+) · 2E "The Ghan" ×∞ £200 (from phase 5) | 8.2, table p.12 |
| Train limit | 4 at the start · **3** from the first 4/4+ (phase 4) · **2** from the first 5/5+ (phase 5 onward). The 2E does not count | 9.1, 9.4, user-confirmed |
| Phases | Start · 2 · 3 (green, loans, private sales, train trading, BoE minimum £100) · 4 (2s rust, limit 3) · 5 (brown, 2E, BoE £200, privates close, limit 2) · 6 (3s rust, COM link no longer needed) · 8/D (gray, 4s rust, BoE £300) | 9.x |
| Privates | P1 £30 inc 5 (company max 40) · P2 £70 inc 10 (80) · P3 £110 inc 15 (140) · P4 £170 inc 20 (220) · P5 £170 inc 25, **grants 10% QR** · P6 £230 inc 30, **grants CAR director's share, par 100**. All close at the first 5/5+. P6 also closes when CAR buys a train. Companies may buy P1–P4 from phase 3 | 4.x |
| Loans | From phase 3. Each loan: £100 from the **BoE treasury** plus one loan marker. **No interest, never repaid.** Company price left 2 (left 3 for the 2nd and later loans in the same OR). BoE price rises to the next value on its loan track. Up to 5 voluntary loans, more for a compulsory train purchase | 5.6 |
| Bank of England | 10 shares of 10%, no director. Shares are bought and sold at the indicated price, with **no** price change on sales or sell-outs. Sale money goes to the normal Bank. It pays a phase minimum (£0/100/200/300 in total) **plus** the city values of receivership stations (entered by the user), 10% per share | 5.4 |
| Receivership | Triggered when the price enters the hatched area, or when there are no BoE loans left during a compulsory train purchase. The company pays **par × each non-director player share** as compensation. A shortfall is paid by the director, who sells shares or **borrows from the Bank interest-free and must repay from their next income**. Remaining treasury goes to the Bank. Trains are removed. Status becomes receivership. The 2nd and 5th receivership each remove the cheapest permanent train in the Bank. The 5th ends the game after the current OR set | 5.5, 8.4 |
| End triggers | Bank broken · a price reaches the top cell · the BoE has issued ≥ 16 loans · ≥ 5 companies in receivership. The current OR set completes (one more full set if the Bank breaks during an SR) | 13.1 |

✅ **Share price chart**: transcribed from the fwtwr.com 1848 chart
(<http://www.fwtwr.com/18xx/info/sm-1848aus.asp>). That site lists the 2007 Double-O edition,
so it was used **only for the market grid**. Names, counts and rules follow the 2021 GMT
rulebook. Cell colours were checked by pixel sampling. `RCV` = the receivership column (pale
yellow; entering it triggers `nationalTakeover`), `*` = a start cell (red), `!` = the end-game
cell (pink, 450):

```
col:  0    1   2   3   4   5    6   7   8   9  10  11  12  13  14  15  16
row0: RCV  70  80  90 100 110  120 140 160 190 220 250 280 320 360 400 450!
row1: RCV  60  70  80  90 100* 110 130 150 180 210 240 270 310 350 390 440
row2: RCV  50  60  70  80  90* 100 120 140 170 200 230 260 300
row3: RCV  40  50  60  70  80*  90 110 130 160 190
row4: RCV  30  40  50  60  70*  80 100 120
row5: RCV  20  30  40  50  60   70
```
Edges follow the rules (11.1, 11.2, 12.5, 12.6): payout at the right end of a row moves up
(no move at the top); withhold moves left into `RCV`; sales and sold-out moves have no effect
at the bottom or top of a column.

✅ **BoE price track** (provided by the user, 2026-10-07; confirmed against the BoE charter
photo on rulebook p. 3, which also prints **"Starting Price of Shares: £70"**, the basic income
0/100/200/300, and the certificate-limit table):

| Loans issued | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | **16** | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BoE price (£) | **70** (start) | 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160 | 170 | 180 | 195 | 210 | 225 | 240 | **260** | 280 | 300 | 320 | 340 |

Taking loan *n* removes marker *n* (in ascending order, 5.6.1) and reveals the price under it.
The track marks 260 as the end-game trigger, which agrees with rule 13.1 ("16 or more loans").
So `price(n) = track[n − 1]`, and the `endGame` tag sits on index 15.

Each loan marker shows its value under a "£100"-style BoE note design, but the loan itself is
always £100 to the company (5.6.1). The marker value is only the BoE share price that becomes
visible.

✅ **Confirmed by the user (2026-10-07)**: BoE dividends are **paid by the normal Bank**. The
BoE's £2,000 (20 × £100 notes) is only the loan reserve that funds company loans.

✅ **Confirmed by the user (2026-10-07)**, not stated in the rulebook: the train limit drops to 2
with the first 5/5+ and stays there, and per-share dividends are **always rounded down**. The
remainder stays with the Bank.

**Spec impact**: US3 scenario 6 says interest is "charged in later operating rounds as the game
defines". For 1848 the definition has `interest: 0` and `repayable: false`, so no interest is
charged and no repay action is offered. Interest and repayment remain `LoanDef` fields for
future games, but v1 builds no logic for them (constitution VII). The scenario and FR-112 were
reworded accordingly (SPEC-1, resolved).

## R14. Game rules: 1830 (rulebook: `docs/rules/1830-Rules-V1_0.pdf`, Mayfair 2011) ✅

The rulebook has a **Base Game** (pp. 7–24) and **1830 Classic** (pp. 25–27). Both use the same
6 privates, 8 railroads and 26 trains. The ruleset is a **session option**: Base (default) or
Classic. Only forced train purchases differ in a way the app tracks (see below).

| Field | Value | Rule § |
|---|---|---|
| Bank | $12,000 | Components |
| Players / starting cash | **2–7**: 2p $1200 · 3p $800 · 4p $600 · 5p $480 · 6p $400 · 7p $350 ($2400 split; $2450 for 7) | 1.2 |
| Companies | PRR, NYC, CPR, B&O, C&O, Erie, NNH, B&M. One 20% president's certificate plus eight 10% shares | Components |
| Par | 67, 71, 76, 82, 90, 100. The president's certificate costs 2 × par | 5.2, 6.2 |
| IPO / pool price | IPO shares at **par**. Pool shares at the market price | 5.1 |
| Float | 60% bought **from the IPO** (shares later sold to the pool still count; shares from the CA, BO and MH privates count) | 6.3 |
| Capitalization | **Full, 10 × par, paid at the end of the SR in which the company floats** (not at the moment it floats) | 6.3 |
| Dividends | Players 10% per share. **Pool shares → company treasury. IPO shares → no payment** (stays in the Bank). Example: 50% player / 30% IPO / 20% pool on $50 → $25 player, $10 treasury, $15 stays in the Bank | 7.5 |
| Payout modes | Pay or withhold (no half) | 7.5 |
| Payout move | Right 1. At the right end of a row, up 1. **No move up at 350** | 5.5 |
| Withhold move | Left 1. At the left end, down 1 | 5.5 |
| Sell move | **Down 1 per share sold**, applied after the player sold all certificates of that company (same price for each) | 5.5, 6.1 |
| Sold out (end of SR) | Up 1 if all shares are owned by players. Moved in descending price order | 5.5 |
| Unfloated companies | Price never moves in ORs | 5.5 note |
| Pool limit | At most 5 certificates of one company in the pool (sale warning) | 5.3 |
| Certificate limit | 2p 28 · 3p 20 · 4p 16 · 5p 13 · 6–7p 11. 60% per company. **Yellow/orange/brown market zones** relax these limits (warnings only) | 5.3, 5.4 |
| OR order | Highest price first. Same cell: top of the stack first (new arrivals go underneath). Same price: the rightmost column first, then the highest row | 7.0 |
| Trains | 2 ×6 $80 · 3 ×5 $180 · 4 ×4 $300 · 5 ×3 $450 · 6 ×2 $630 · **D ×6** $1100, or $800 trading in a 4/5/6 (the traded train goes to the open market). Diesels can be bought once the first 6 is bought | T-03, 7.6 |
| Open market | Discarded trains go to the **bank pool**. They are bought there at face value, paid to the Bank | 7.6 |
| Company-to-company trains | Any agreed price ≥ $1 | 7.6 |
| Phases / limits / ORs | 2: limit 4, 1 OR · 3: limit 4, 2 ORs, companies may buy privates · 4: limit 3, **2s rust** · 5: limit 2, privates close, 3 ORs · 6: 3s rust, diesels available · D: **4s rust** | 3.x |
| ORs per set | Fixed at the SR before the set (2 "starting after the stock round following" the first 3-train) | 3.3 |
| Privates | SV $20/5 · CS $40/10 · DH $70/15 · MH $110/20 (**exchangeable for a 10% NYC share** from the IPO or pool, closing the MH) · CA $160/25 (**grants 10% PRR**) · BO $220/30 (**grants the B&O president's certificate**, the owner sets par; closes when the B&O buys its first train). All close at the first 5-train. Companies buy them in phases 3–4 at ½× to 2× face value | 4.x |
| Initial private sale | Base: groups by player count plus a bid for the choice order. Classic: buy-bid waterfall. **Both are recorded as `buyPrivate` at the paid price** | 1.3, C-2.2 |
| Forced train purchase | **Base**: the company and its president pay what they can, and the **Bank lends the rest**. The company enters *receivership*: no dividends, and revenue (and the manager's income) repays the loan; the presidency is frozen. **Classic**: the president sells shares, and if still short they go **bankrupt and the game ends** | 7.6.2, 7.7, C-2.3–2.5 |
| End | Bank broken → finish the current OR set (or the SR plus one more OR set). Payouts continue on paper. Classic only: bankruptcy ends the game | 8.0, C-2.5 |
| Chip preset | Rulebook money: $500, $100, $50, $20, $10, $5, $1 | T-04 |

✅ **Stock market**: from the image the user provided, which matches
<http://www.fwtwr.com/18xx/info/sm-1830.asp>. Zone colours were checked by pixel sampling.
`*` = par cell (red); `y` = yellow (ignored for the certificate limit); `o` = orange (yellow
plus may hold > 60%); `b` = brown (orange plus may buy several pool shares in one turn). Edges
follow rule 5.5: right end → up, left end → down, each "if possible" (only when the cell exists),
and no upward move at 350.

```
col:   0    1    2    3    4    5    6    7   8   9  10  11  12  13  14  15  16  17  18
row0:  60y  67   71   76   82   90  100* 112 126 142 160 180 200 225 250 275 300 325 350
row1:  53y  60y  66   70   76   82   90* 100 112 126 142 160 180 200 220 240 260 280 300
row2:  46y  55y  60y  65   70   76   82*  90 100 111 125 140 155 170 185 200
row3:  39o  48y  54y  60y  66   71   76*  82  90 100 110 120 130
row4:  32o  41o  48y  55y  62   67   71*  76  82  90 100
row5:  25b  34o  42o  50y  58y  65   67*  71  75  80
row6:  18b  27b  36o  45o  54y  63   67   69  70
row7:  10b  20b  30b  40o  50y  60y  67   68
row8:   -   10b  20b  30b  40o  50y  60y
row9:   -    -   10b  20b  30b  40o  50y
row10:  -    -    -   10b  20b  30b  40o
```

## R15. Game rules: 21Moon (rulebook: `docs/rules/21Moon_Rules.pdf`) ✅

The rulebook overturns most of the secondary-source assumptions recorded earlier.

| Field | Value | Rule § |
|---|---|---|
| Bank | **Unlimited** ("at least ₡6,000; in practical terms unlimited"). The money invariant is skipped; share and asset invariants still apply | 2.13 |
| Players / starting cash | **2–5**: 2p ₡600 · 3p 540 · 4p 410 · 5p 340 | 2.15 |
| Own treasury shares | Paid dividends to the company (user-confirmed) | 11.5 |
| Companies | SWP (blue, 2 depots), HMQ (red, 4), VH (yellow, 3), ITC (purple, 4), SSF (orange, 2), LG (green, 3), KR (brown, 4). One 20% president's certificate plus eight 10% shares. **One company, chosen at random at setup, cannot be started until SR3** | 2.4, 6.2 |
| Par | Start price 60, 70, 80 or 90 (red cells). The president's certificate costs 2 × price | 9.2.1 |
| Capitalization | **Incremental at the current market price**: IPO purchases pay the **company**, pool purchases pay the Bank. Issuing in a CR also pays the company | 9.2, 10.1.2 |
| Float | 50% of the shares have **left the IPO** (purchases or issuance) | 9.2.1 |
| Revenue | **Two bases.** The local base's earnings always go to the **treasury**. The Space Port base's earnings are always paid **as dividends**, 10% per share. **IPO and pool shares are not paid. Company-held shares of other companies are paid to the holding company's treasury** (the rulebook example: SSF holds 10% of VH and receives 35). No withhold or half choice | 11.5 |
| Payout move (Space Port earnings E vs price P) | E = 0 → **left 1** · 0 < E < P/2 → no move · E ≥ P/2 → **right 1** · E ≥ 2P → **right 2**. Local earnings never move the price | 11.5 |
| Sell move | Down 1 **per sale** (per selling turn), **only if the company has already operated** | 9.1, 14 |
| Stock round | Sell, then buy **or swap** one certificate. **Swap**: the president exchanges one of their certificates 1-for-1 with any certificate in the company's treasury, with no money involved | 9.2, 9.2.2 |
| Corporate round (CR) | In descending price order, each started company may sell treasury stock (to the pool, the Bank pays the company), **issue** stock (IPO → pool, the Bank pays the company; limited by the pool rules), and buy **one** certificate (another company's IPO, paid to that company, or from the pool, including its own shares). Issuing moves a floated company down 1, however many shares are issued | 10 |
| End of CR moves | 100% held by players or company treasuries → **up 1**. Any shares in the pool → **down 1** (unless the company has not operated yet). Applied in descending price order | 10.3 |
| Limits | Certificates: 2p 15 · 3p 15 · 4p 12 · 5p 10. 50% per company (60% with 2 players). Pool ≤ 50%. A company can never hold a president's certificate, and company holdings never change the presidency | 9.3, 10.2 |
| Market | Staggered 2-D grid transcribed from the board image (rulebook p. 3); see below. The **Closed** cell → company **bankrupt** | 5, p. 3 |
| OR order | Descending price; ties: rightmost first, then the top of the stack. **Recomputed after each company operates** | 5.2, 11 |
| Transports | 2 ×5 ₡120 · 3 ×4 ₡150 · 4 ×3 ₡240 · 5 ×2 ₡500 · 6 ×2 ₡540 · 10 ×∞ ₡730. Each base holds 2 (4 per company). Company-to-company price is ≥ 1 and at most the buyer's cash. P2 can add or remove one 3/4/5/6 transport (5 UN cards) | 11.6, 6.1.2 |
| Phases | 2 (start) · 3 · 4 · 5 (**2s removed**) · 6 (**3s removed**) · 10 (**4s removed**), each triggered by the first purchase of that type | 7 |
| Round schedule | **Fixed**: Initial SR (private waterfall auction) → for n = 1..5: SR n, CR n, OR n.1, OR n.2 (plus **OR 5.3**, "Final Liftoff"). Events: SR3 the 7th company becomes available · OR3.1 Space Port value 30 · **OR4.1 all privates close** (before paying) · OR5.1 Space Port 40. The game ends after OR 5.3 | 3, 11, 13 |
| Privates | P1 OLS 30/0 (sold to a company only for exactly 1; closes) · P2 UN Contract 30/5 (1–45) · P3 Space Bridge 40/10 (1–60; the Bank pays the company **60 once**) · P4 Research Lab 60/10 (1–90) · P5 Terminal 80/15 (1–120) · P6 Tunnel 100/15 (1–150; **take one pool share for free**, closing it). Companies buy at 1 to 1.5× face value, any time in their OR turn | 6.1 |
| Receivership | No player holds ≥ 20% after a president's bankruptcy → presidentless and operated by the Bank. **All earnings withheld, left 1 every run**, may buy a transport only from its treasury, otherwise bankrupt | 11.8.2 |
| Bankruptcy | Company: assets removed, **shares removed from the game**, treasury to the Bank, shares it holds in other companies go to the pool. Player: money to the Bank, stock to the pool (beyond the limit), privates removed | 11.8.1, 12 |
| End scoring | Share value = price + 50 per East-West bonus token held (a per-company counter) | 13 |

✅ Confirmed by the user (2026-10-07): the CR comes after the SR and before the first OR of the
set, and a company's **own** treasury shares receive dividends (`unownedDividends.treasury:
"company"`).

**21Moon market** (from the board image; `→` marks the end of a row; `↓` at the left edge means
"moving left at the edge goes down"; `↑` at the right edge means "moving right goes up";
`*` marks a red start cell; columns aligned):

```
col:   0    1   2    3   4   5   6   7   8   9  10  11  12  13  14   15  16  17
row0:                                                           330↓ 360 395 430
row1:          100↓ 110 120 130 140 150 160 175 195 215 240 265 295 325 360 395↑
row2:  70↓  80  90* 100 110 120 130 140 150 160 175 190 215 235 260 285 315 345↑
row3:  60↓  70  80*  90 100 110 120 130 140 150 160 175 190 200 220 250 275 300↑
row4:  50↓  60  70*  80  90 100 110 120 130 140 150 160 175 190↑
row5:  40↓  50  60*  70  80  90 100 110 120 130 140 150↑
row6: CLOSED 40  50  60  70  80  90 100 110 120↑
```

## R16. Reusable mechanics (`customRules`) (FR-113), revised after reading all three rulebooks

Each mechanic is a named module enabled by a game definition. It plugs into documented
extension points (action availability, action expansion, post-event triggers, round types). None
of them is keyed on a game id.

| Mechanic | What it does | Used by |
|---|---|---|
| `loans` | `takeLoan`. Loan markers are assets from a configured lender holder. Market effect per loan. `interestPerOR` and `repayable` are schema fields only: v1 builds no interest charging or repay action, since no v1 game uses them (constitution VII) | 1848 |
| `nationalBank` | A director-less company with a loan-driven price track, a phase-based minimum dividend plus a user-entered extra, and buy/sell without price moves. Operates before the other companies | 1848 |
| `nationalTakeover` | Triggered by a cell tag or manually: compensation at par for non-director shares, director liability (via `bankDebt`), treasury to the Bank, trains removed, status `receivership`, train removal at the Nth takeover, end-game threshold | 1848 |
| `bankDebt` | Interest-free debt to the Bank for a **player or a company**. Repayment is added automatically to any group that pays the debtor. When a company is the debtor: status `receivership`, payouts become withhold-and-repay, presidency frozen | 1848 (director), 1830 Base (forced train) |
| `forcedWithhold` | A company in `receivership` cannot pay dividends; it moves left 1 each run | 1830 Base, 21Moon |
| `corporateBankruptcy` | Triggered by a cell tag (`closed`) or manually: shares → `removed`, treasury → Bank, held shares → pool, assets removed. Optional end-game flag | 21Moon, 1830 Classic |
| `manualFloatCondition` | Float needs the percentage **and** a user confirmation. Dropped at a configured phase | 1848 (COM) |
| `privateGrants` | A private grants shares or a presidency on purchase, **or can be exchanged** for a share from the IPO or pool (closing the private) | 1830 (CA, BO, MH), 1848 (P5, P6), 21Moon (P6) |
| `corporateRound` | The CR round type: treasury sales, issuance, company purchases of other companies' shares, end-of-CR moves | 21Moon |

Data (not mechanics) also covers: two-part revenue (`revenueParts`), threshold payout moves,
per-cell edge arrows, per-sale sell moves gated on "has operated", certificate swaps, fixed round
schedules with scheduled events, IPO price (`par` vs `market`), capitalization timing (`onFloat`
vs `endOfSR`), the game's player-count range, and the 1830 ruleset option (Base/Classic, which
toggles `bankDebt`+`forcedWithhold` vs `corporateBankruptcy`).

## R17. Security of the client-side Claude call

**Threats**, ranked by impact:

1. **Key theft by injected script.** Any JS on the app's origin (an XSS bug or a compromised npm
   dependency) can read IndexedDB and exfiltrate the key. *Mitigations*: a strict CSP
   (`default-src 'self'; connect-src 'self' https://api.anthropic.com; script-src 'self';
   object-src 'none'; base-uri 'none'`), no third-party scripts or analytics, React escaping
   only (no `dangerouslySetInnerHTML`), a small reviewed dependency set with a lockfile, and
   `npm audit` in CI.
2. **Spend blast radius.** A leaked key can spend money on the owner's account.
   *Mitigation* (the most effective): the setup guide tells users to create the key in a
   **dedicated Console workspace with a monthly spend limit**, so a leak is capped and easy to
   rotate.
3. **Shared device.** Anyone using the table device could read the key from DevTools.
   *Mitigations*: the key is masked in Settings, there is an option "no recordar la clave en
   este dispositivo" (kept in memory only for the session), and the key is never written to
   logs, exports, or bug reports (FR-092).
4. **Prompt injection** through transcripts or player names. Low impact by design: the model
   can only produce schema-validated actions that the user must confirm, which are the same
   things the user can already do by touch (constitution IV).
5. **Privacy.** Audio goes to the browser's speech service, and transcripts plus game state go
   to Anthropic. This is acceptable for board-game data, and Settings states it.

**Decision**: Keep the direct browser call for v1, with the mitigations above. **Move to a
proxy** (for example a small serverless function holding the key, with per-user authentication
and rate limits) **only if the app is ever distributed with a key the user does not own**. At
that point direct browser calls would expose the owner's key to every user, which is not
acceptable. A proxy that holds the user's own key adds a backend, deployment, an authentication
problem, and latency for little security gain, because the proxy credential would sit on the
same device.

## R18. Voice eval set (AI-2)

**Default model**: `claude-sonnet-5` (user decision, 2026-10-07). The eval decides whether it
stays the default, and gates every change to `src/voice/` (constitution VI).

**What a case is**: a transcript as the **speech recognizer outputs it**, a fixture session
state, and the expected result. Cases go in `eval/voice/cases.jsonl`, with fixtures in
`eval/voice/fixtures/*.json` (session exports, see [export-format](./contracts/export-format.md)).

```json
{ "id": "or-pay-03", "fixture": "1830-or", "transcript": "doscientos cuarenta paga",
  "expect": { "kind": "actions", "actions": [{ "action": "runAndPayout", "company": null,
              "parts": [{ "part": "revenue", "amount": 240 }], "mode": "full" }] },
  "tags": ["or", "numbers-as-words"] }
```
`expect.kind` is one of `actions` | `clarification` (with `candidates`) | `query` | `undo` |
`amend` | `notUnderstood`.

**Fixtures** (6): `1830-or` (OR 2.1, PRR operating, 4 players, one player alias shared with a
company nickname) · `1830-sr` · `1848-or` (phase 3, loans available, a company near
receivership) · `1848-sr` (BoE shares on sale) · `21moon-or` (two revenue parts) ·
`21moon-cr` (corporate round). Two players with confusable names (for example Ana and Anabel)
in at least two fixtures.

**Composition (~60 cases, v1)**:

| Category | Cases | Examples |
|---|---|---|
| OR payout (pay, withhold, half, 21Moon parts) | 14 | "240, paga" · "retiene 180" · "local 120, puerto 240" |
| Train purchases | 8 | "compra un tres" · "la Pennsy le compra el 4 a la B&O por 300" · "diésel entregando el cuatro" |
| Costs, bank bonuses, private income | 4 | "paga 120 de montaña" · "cobran las privadas" |
| Stock: par, buy, sell, swap, issue | 10 | "Ana abre la NYC a 82" · "Carla vende dos Erie" · "la VH emite una" |
| 1848 loans and BoE | 3 | "la Victoria pide un préstamo" · "compro una del Banco de Inglaterra" |
| Flow | 3 | "siguiente compañía" · "empieza la ronda de operaciones" |
| **Compound** | 5 | "compra un 4 y paga 290" |
| Corrections | 4 | "deshacer" · "no, eran 260" |
| Queries | 4 | "¿cuánto tiene Ana?" · "¿quién preside la Erie?" |
| Ambiguity → clarification | 3 | "Ana compra una" (Ana vs Anabel; company missing) |
| Should fail → notUnderstood | 2 | table chatter, a loan request in 1830 |

**Realistic noise** (tag each case): numbers as words and digits ("doscientos cuarenta",
"240"), recognizer slips ("B and O", "be y o", "la erie"/"la iri"), nicknames ("la Pennsy"),
fillers ("eh… paga 240"), and the user's regional variant.

**Sourcing**: (1) **Seed**: write the ~60 cases above, 2–3 per row phrased by the user as they
would actually speak. (2) **Real**: a dev-only "Guardar para eval" button on the confirmation
card and on "No entendí" saves the raw recognizer transcript, the fixture and the confirmed (or
manually entered) action as a candidate case. After a real game, the user reviews the
candidates and promotes the good ones. Over time real cases should replace most synthetic ones,
because recognizer output is what the model actually sees.

**Grading** (deterministic; no LLM judge): parse the model's tool calls with the same Zod
schemas and compare with `expect` after normalizing (resolving `null` to its default, ignoring
field order). A compound command passes only if every action matches, in order. Clarification
passes if `askClarification` is called and its options include every expected candidate. A
query passes on the correct `kind` and entity.

**Metrics and gates**: overall exact-match accuracy; **OR subset ≥ 90%** (SC-003); per-category
accuracy (no category below 80%); p50/p95 **API latency** (p95 < 2.5 s, which leaves about 0.5 s
for recognizer finalization and rendering within SC-004's 3 s); cache read rate after the first
call (> 0 or the prefix is broken); tokens and cost per case.

**Process**: about 20% of cases are kept as a held-out set that is never looked at while tuning
prompts, and results are reported for both sets. `npm run eval:voice -- --model <id> [--runs 3]`
(3 runs per case expose nondeterminism). Compare `claude-sonnet-5` with `claude-haiku-4-5` once
the seed set exists. Haiku stays the default candidate only if it clears the same gates. A run is
~60 calls with a cached ~6k-token prefix, which costs well under $1.
