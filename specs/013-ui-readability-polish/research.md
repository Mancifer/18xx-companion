# Research: UI Readability Polish and RotLA Major Names

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-15

## R1. Getting company badges into summary sentences (FR-001–FR-006)

History, income and toast lines are plain strings built in `src/domain/i18n/es.ts`
(`summaryEs`, `effectsEs`, `movementLineEs`, `balanceLineEs`, `undoneEs`). Company names enter
them through three internal helpers: `name` (via `holderName`), `companyName` (short name) and
`fullName` (the name, or the second identity after a merger). The same strings also feed the
voice snapshot (`src/voice/snapshot.ts`), the voice proposal (`src/voice/resolve.ts`) and
aria/plain contexts, which must stay plain (FR-005).

**Decision**: inline **mention markers**, opt-in per call.

- `SummaryContext` gains an optional `marks?: true`. Without it nothing changes: every existing
  caller (voice, snapshot, tests) gets the same strings as today.
- With it, the three helpers wrap each company mention as
  `U+E000 <companyId> U+E002 <shown text> U+E001`, private-use code points that never occur in
  game data or user input. The shown text is the short name, or the full name where the
  sentence uses one today.
- A new pure module `src/domain/i18n/mentions.ts` exports `splitMentions(text)` (segments of
  plain text and `{ company, text }`) and `stripMentions(text)` (the plain string).
- A new UI component `RichText` renders segments: a mention becomes a `CompanyBadge` sized to
  the running text, showing exactly the shown text. An id not in the game definition falls back
  to the plain shown text (spec edge case).

Since a badge shows the same text the plain string had, `textContent` is unchanged. Existing UI
tests that read text keep passing, and screen readers read the same words.

**Rationale**: the domain knows exactly which words are companies, so there are no false
positives. The change is three helpers plus one flag, not a rewrite of about 40 summarizers into
a structured type.

**Alternatives considered**:
- *Match short names in the rendered string at display time.* No domain change, but custom games
  let users pick any short name (for example "la" or a player's name), which would badge the
  wrong words. Rejected.
- *Summarizers return segment arrays.* The cleanest typing, but it touches every summarizer and
  every plain caller for no user-visible gain. Rejected (YAGNI).

**Risks and guards**:
- String operations on marked text: `capitalize` acts on U+E000, a no-op. That is harmless
  because company short names already start with a capital, and non-company holders ("el
  banco") are not marked.
- The `effects.filter(e => e !== "OR x.y")` comparison involves no company.
- A property test over the random-games suite asserts
  `stripMentions(summaryEs(a, {…ctx, marks: true}, ev)) === summaryEs(a, ctx, ev)`, and the
  same for movement and balance lines, so marked and plain output can never drift.

## R2. Inventory of plain-text company mentions (FR-001, SC-001)

Two kinds of call site:

- **Sentence sites**: these switch to `marks: true` and `RichText`.
  - `History.tsx` (summary, movements, balances).
  - `IncomeSheet.tsx` (movement labels).
  - `OperateSheet.tsx` (recent entries).
  - `UndoToast.tsx`.
  - `UndoRangeSheet.tsx`.
  - `BatchSheet.tsx`.
  - `ConfirmationCard.tsx`. It recomputes `proposalSummaryEs(proposal.action, {…, marks: true}, proposal.events)` from the session. `proposal.summaryEs` stays plain for the voice layer.
- **Direct sites**: these render `CompanyBadge` instead of `shortName` text.
  - `Table.tsx`: the sheet titles "Administración de X", "Quiebra de X" and "Cerrar X", and the "Operar X" button.
  - `Results.tsx`: the company column.
  - `Market.tsx`: the move prompt.
  - `OperateSheet.tsx`: the out-of-turn notice.
  - `StockSheet.tsx`: company traders in a CR.
  - `MergerSheet.tsx`: the "into" choices.

`aria-label`s stay plain strings.

**Out of scope**:
- `actionFields.ts` `<option>` labels. Native options cannot hold markup; this is a spec
  assumption.
- Voice replies and the voice snapshot (FR-005).
- `CustomGame.tsx` inputs. They are editable text.

## R3. Badge legibility in text and in both themes (FR-004, edge cases)

**Decision**:
- **Size**: a new `CompanyBadge` size `inline`. It uses `font-size: 0.9em`, `padding: 0 0.35em`,
  `line-height: 1.3` and `vertical-align: baseline`, so it follows the surrounding font and does
  not stretch the line.
- **Struck-through entries**: these are `<s>` in History. The badge keeps its colors and the
  strike still draws over it, so the entry still reads as reverted (spec scenario US1-3).
- **Contrast**: every badge gets `box-shadow: inset 0 0 0 1px` with a translucent neutral
  (`color-mix(in srgb, currentColor 25%, transparent)`). This separates near-background colors
  (Authority `#e0e0e0` on light, League `#424242` and Overnight `#212121` on dark) without
  changing company colors (FR-019).

**Alternatives**: a per-theme outline color token. It adds a token for one rule, and the
`currentColor` mix adapts on its own.

## R4. Train cards (FR-007–FR-011)

Today:
- `trainsLineEs` builds "Trenes 2/4 · 2, 3 (oxidado)" in the operate view.
- `CompanyCard` shows the raw types ("Trenes: 2 · 3"). These are not display names, and they are
  not sorted the same way.

**Decision**:
- **Domain**: a new pure `companyTrains(game, state, company)` in `src/domain/i18n/es.ts`, next
  to `trainsLineEs`. It returns `{ cards: { asset, label, rusted }[], count, limit, over }` and
  uses the ordering `trainsLineEs` already uses: definition order, then train number.
  `trainsLineEs` is rebuilt on top of it, so the text stays the same for any plain caller.
- **UI**:
  - A new `TrainCards` component renders one card per train: a small portrait rectangle with a
    border, a raised background and the bold train label.
  - A rusted card gets a dashed border, muted label and the word "oxidado" under the label.
    That is a text cue (FR-008, Principle V).
  - Cards wrap with `flex-wrap` (FR-011). A long label such as "2 (Manufacturing)" wraps inside
    its card (`max-width` plus normal wrapping).
- **Operate view**: `TrainsLine` becomes the header "Trenes 2/4", then the cards, then
  "sobre el límite" (warn style) and "Corregir…". It keeps `data-testid="trains-line"`. "Sin
  trenes" stays as text when the company has none (FR-010).
- **Company card**: compact cards (`size="sm"`) replace the "Trenes: …" text. The card is a
  `<button>`, so the cards are `<span role="list">` and `<span role="listitem">`. A list element
  is not allowed inside a button.
- **Neutral style** (spec assumption): cards do not take per-type colors. Phase colors are not
  modeled per train type, and that would be new data for no requested gain.

## R5. Buy-shares view (FR-012–FR-014)

Today `StockSheet` shows one muted line, "IPO 4 · Pool 1 · Tesorería 2 · IPO a $90", and a
separate "Pool a $X" line under the trader list.

**Decision**:
- **Domain**: a new pure `shareSources(ctx, company)` in `src/domain/actions/expand/stock.ts`
  (next to `sharePrice`). It returns, in display order, `{ source: "ipo" | "pool" | "treasury",
  units, price }` for the sources the view offers. It moves the visibility rules out of the
  sheet:
  - The IPO shows unless the game buys from the treasury by default, or the IPO is empty and the
    treasury holds shares.
  - The treasury shows when it holds shares, or always when `defaultBuySource === "treasury"`.
  - The pool always shows.
- **UI**: a `share-sources` row of tiles above the stepper. Each tile has:
  - a label ("IPO", "Pool", "Tesorería");
  - the shares left, large;
  - the price per share ("a $90"), or "—" when there is no price.
- **Empty source**: the tile is muted, with "agotada" next to "0" (FR-013, a text cue). The
  per-player buttons are unchanged, so taps are unchanged (FR-014, SC-006). The trailing
  "Pool a $X" line goes away because its price now sits in the Pool tile.
- **Units**: the tiles show the same unit count the line shows today (`unitsOf`). Changing the
  count to certificates or percent is not requested.

## R6. RotLA second identities (FR-015–FR-019)

**Decision**: these are data changes in `src/domain/games/grotla.ts`. Short names, colors and
default identities are unchanged.

| Major | Default (unchanged) | Second identity | Alt aliases |
|---|---|---|---|
| CON | Consortium | Conglomerate (unchanged) | conglomerate, conglomerado |
| UNI | Union | Unlimited (unchanged) | unlimited, ilimitada |
| SYS | System | Syndicate (unchanged) | syndicate, sindicato |
| INT | International | **Inc.** | inc, ink, incorporated |
| FED | Federation | **Firm** | firm, firma |
| EXM | Experiment | **Enterprise** | enterprise, empresa |
| AUT | Authority | **Alliance** | alliance, alianza |
| LGE | League | **LLC** | llc, ele ele ce |

- **Verification**: `verification.companies` changes from `"unverified"` to `"verified"`, and
  the R14 comments go away. `specs/004-railways-lost-atlas/research.md` R14 moves the identities
  row to "Resolved by the user (2026-10-15)".
- **Stored sessions**: names are read from the definition at display time (`displayName`,
  `traits.ts`). Saved sessions show the new names on reload with no migration. The merger events
  store only `identity: "alt"`.
- **Voice (Constitution VI)**: the prompt embeds names and aliases, so this is a prompt change.
  The steps are:
  1. Regenerate the prompt snapshots and `eval/voice/fixtures/rotla-*.json` (`npx tsx
     eval/voice/buildFixtures.ts`).
  2. Add eval cases for a new second name: "Express y Tunneling se fusionan en Firm" →
     `into: FED, identity: alt` (held out), and one for "Inc." (in set).
  3. Run `npm run eval:voice` with the current default model. This needs the user's API key.
- **"Inc." spelling**: the period is kept, as on the card. Voice aliases drop it, since
  transcripts have no punctuation.

## R7. Docs

`docs/spec.md` is the product reference. It needs short notes on company badges in text, train
cards and the share-source tiles, plus the RotLA identity table.

## R8. Market without closed companies (FR-020–FR-022)

*Added 2026-10-15, after testing.*

The Market screen (`src/ui/screens/Market.tsx`) shows two kinds of token:
- `tokensAt(cell)` lists every company whose `position` is that cell, whatever its status;
- `unplaced` lists every company with no position that is not `unstarted`.

A closed company keeps its last position, or has none, so it shows up in one of them. That
includes a RotLA minor after its merger, a dissolved company and a company closed by hand.

**Decision**: a single predicate in the screen, `shown(c) = state.companies[c.id]?.status !==
"closed"`, applied to both `tokensAt` and `unplaced`.
- **Selection**: if the selected token's company is closed (for example, by a voice command while
  the screen is open), the selection is cleared. The prompt then goes back to the default text.
- **Stack order**: stack order is unchanged for the companies that remain, because it is read
  from state.

**Rationale**: the status already says the company is out of play, so it is the same rule in every
game. Nothing is recorded, so undo restores the token (FR-021). Receivership and bankrupt
companies stay visible: they can still hold a price, and in some games they operate (FR-022).

**Alternatives considered**:
- *A domain query such as `marketCompanies(state)`.* It would be one more export for a filter used
  by one screen. Rejected (YAGNI).
- *A greyed-out token instead of hiding it.* The user asked for closed companies not to be shown.
  Rejected.

**Voice**: unchanged. Voice can still name a closed company in `setMarket`, the only route left for
a correction (Principle III). That is acceptable.
