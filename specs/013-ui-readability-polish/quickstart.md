# Quickstart: Validate Feature 013

**Contracts**: [contracts/ui.md](contracts/ui.md), [contracts/game-data.md](contracts/game-data.md)

## Automated

```bash
npm run typecheck && npm run lint && npm test
npm run build && npm run test:e2e     # build first: the preview server may serve an old dist
```

What the tests should prove:

| Check | Where |
|---|---|
| `stripMentions(marked) === plain` for every summarizer, over the random games | `tests/domain/mentions.test.ts`, `tests/domain/randomGames.test.ts` |
| No markers without `marks` (the voice prompt snapshots are unchanged apart from the RotLA names) | `tests/voice/prompt.test.ts` snapshots |
| `companyTrains` ordering, rusted flag, `over` | `tests/domain/companyTrains.test.ts` |
| `shareSources` visibility per game (1830 IPO+pool, RotLA treasury+pool, an empty IPO) | `tests/domain/shareSources.test.ts` |
| History, Income, Operate and Toast render badges (`.company-badge` with the right background) and keep the same `textContent` | `tests/ui/history.test.tsx`, `income.test.tsx`, `operate.test.tsx` |
| The trains line shows one `listitem` per train, plus "oxidado" and "sobre el límite" | `tests/ui/operate.test.tsx` |
| The stock sheet shows `source-ipo` and `source-pool` with count and price, and "agotada" on an empty one | `tests/ui/stock.test.tsx` |
| All 8 RotLA identity pairs | `tests/games/rotla.test.ts` |
| The Market hides closed companies (on a cell and unplaced), and undo brings them back (US5) | `tests/ui/market.test.tsx` |

## Voice eval (paid; needs the user's API key)

```bash
npx tsx eval/voice/buildFixtures.ts
npm run eval:voice
```

Expected: the merger alt-identity cases ("…en Firm", "…en Inc", "…en Conglomerate") resolve to
the right `into` and `identity: "alt"`, and overall accuracy is no lower than the last run
(`eval/voice/results/2026-10-13-gemini-3.6-flash.json`).

## Manual check (phone portrait and tablet landscape, both themes)

1. **1830, a few SR and OR actions**:
   - Open History. Every company in summaries, movements and balances is a colored badge, and
     reverted entries still look struck.
   - Find all entries for one company by color in under 10 s (SC-002).
2. **Income summary at the end of the ORs**: dividend lines show badges.
3. **Table**:
   - Each company card shows its trains as cards, and the count is readable at a glance (SC-003).
   - Open the operate view and check that "Trenes n/limit", the cards, the over-limit warning
     and "Corregir…" are there.
4. **SR, tap a floated company with shares in the IPO and the pool**:
   - Separate IPO and Pool tiles show the count and price.
   - Buy until the IPO is empty and check that it shows "0 agotada".
   - Buying still takes 2 taps from the Table (SC-006).
5. **RotLA with Landmarks**:
   - Merge into Federation with the second identity. The card reads "Firm".
   - The merger sheet lists all eight pairs, with no "… II" anywhere.
   - Authority's light badge is readable in the light theme, and League's dark badge in the dark
     theme.
6. **A RotLA session saved before this change** that has a second-identity merger shows the new
   name after a reload.
7. **Market without closed companies (US5)**: in 1830, close a floated company from its details ("Cerrar compañía"). The Market no longer shows its token, and undoing the close shows it again on its cell. In RotLA, after a merger, the two minors are gone from the Market, and the "Cerrada" cell is still drawn.
