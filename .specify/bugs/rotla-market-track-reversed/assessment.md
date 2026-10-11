# Bug Assessment: RotLA market strip is drawn highest-price-first

- **Slug**: rotla-market-track-reversed
- **Created**: 2026-10-10
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: low

## Report (verbatim or summarized)

> For RotLA, the market track is backwards, 500 (max) is on the left while closed is on the right
> (min), it works fine it's displayed backwards, not so important

## Symptom

On the Market screen for Railways of the Lost Atlas, the 1-D stock track strip starts with $500 at
the left/top and ends with the "Cerrada" (closed, 0) cell at the right/bottom. The user expects the
opposite reading order: closed on the left, rising to 500 on the right (as on the physical track).
Movement and all game logic are correct; only the display order is reversed.

## Reproduction

1. Start a new RotLA session (any variant) and launch at least one company.
2. Open the menu → "Mercado".
3. Observe the strip: the first cell is $500, the last cell is "Cerrada".

## Suspected Code Paths

- `src/ui/screens/Market.tsx:131-145` — the `shape === "1d"` branch iterates `game.market.cells` in
  row order with `flatMap`; the comment explicitly says "highest price first".
- `src/domain/games/grotla.ts:121,325` — `TRACK` is declared 500 → 10 and the closed cell is appended
  last, so row 0 = 500, row 26 = closed. This order is load-bearing (research R1: `up`/`down` moves
  rely on row 0 being the top) and must **not** change.
- `specs/004-railways-lost-atlas/research.md` (R1, "UI:" paragraph) — design says "one horizontal
  strip … presentation only", without fixing a direction; the implementation chose highest-first.
- `tests/ui/market.test.tsx:46-69` — the T102 test asserts `inRange` equals
  `["$90", "$80", "$70", "$60"]`, which encodes the current descending DOM order.

## Root Cause Hypothesis

The Market screen renders the 1-D grid rows in data order, and the data model deliberately stores
the track top-down (row 0 = 500) so that the generic `up`/`down` market moves work. The display was
never reversed to match the physical board's low-to-high reading direction. Confidence: high.

## Proposed Remediation

**Preferred**: In the `1d` branch of `Market.tsx`, keep the row index `r` (the `CellRef` must stay
`{ row: r, col: c }`) but emit the cells in reverse order — e.g. map rows to `[r, row]` pairs and
`.reverse()` before rendering, or build the array as today and reverse it. The `aria-label`
"posición N" should keep using the data row (or be recomputed so position reads 1 = closed if
preferred — pick one and test it). Update the code comment ("lowest price first; closed on the
left"). No domain/data change.

**Alternatives**:
- CSS-only: `flex-direction: row-reverse` / `wrap-reverse` on `.market-strip`. Cheaper, but visual
  order then differs from DOM/tab/screen-reader order (an a11y smell), and wrapping rows would start
  from the right. Not recommended.

**Files likely to change**:
- `src/ui/screens/Market.tsx`
- `tests/ui/market.test.tsx`
- possibly `e2e/rotla.spec.ts` (only counts/finds by name today, so likely unaffected)

**Tests to add or update**:
- In the T102 UI test, assert the first cell of the strip is "Casilla cerrada" and the last is
  "Casilla $500"; flip the `inRange` expectation to `["$60", "$70", "$80", "$90"]`.
- Keep the existing assertions that tapping/dragging to a cell dispatches `setMarket` with the
  correct `{ row, col }` (the reversal must not change the cell refs).

## Risks & Considerations

- Must not reverse `market.cells` in `grotla.ts` — that would invert every up/down move.
- Drag-and-drop reads `data-cell` from the element, so it stays correct as long as the cell ref is
  taken from the original row index.
- Token stacking inside a cell is unaffected.

## Open Questions

- Should the "posición N" in the accessible label count from the closed end (1 = Cerrada) after the
  flip, or keep the data-row numbering? Suggest counting from the left as displayed.
