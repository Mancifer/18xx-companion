# Bug Fix: RotLA voice share buys default to the IPO

- **Slug**: rotla-buy-default-treasury
- **Fixed**: 2026-10-10
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Games can now declare `defaultBuySource` (`"ipo" | "treasury"`, absent = `"ipo"`), and RotLA sets it to `"treasury"`. The voice system prompt states the default buy source per game and says that «del banco» / «del pool» means `source: pool` for share purchases. The snapshot lists where each started company's shares are. The StockSheet no longer shows an IPO button in RotLA.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/domain/games/schema.ts` | modified | New optional `defaultBuySource` field; backward-compatible |
| `src/domain/games/grotla.ts` | modified | `defaultBuySource: "treasury"` |
| `src/voice/prompt.ts` | modified | Default-source line: treasury for RotLA, IPO elsewhere; «del banco» = pool limited to share purchases |
| `src/voice/snapshot.ts` | modified | Each started company line adds `acciones IPO n · tesorería n · pool n` (only the non-empty locations; `ninguna libre` if none) |
| `src/ui/sheets/StockSheet.tsx` | modified | `showIpo` is false when `defaultBuySource === "treasury"` |
| `tests/voice/prompt.test.ts` | added tests | Prompt default line (RotLA vs 1830) and snapshot share locations |
| `tests/ui/rotla.test.tsx` | added test | No IPO button once the treasury is sold out |
| `tests/voice/__snapshots__/prompt-*.txt` | updated | One new line per game prompt |
| `eval/voice/cases.jsonl` | added cases | `rl-sr-buy-02` (no source → treasury), `rl-sr-buy-03` («del banco» → pool) |
| `eval/voice/fixtureSpecs.ts` | modified | `rotla-sr` now has one AGR share in the pool (Carla buys from treasury and sells one) so `rl-sr-buy-03` is valid |
| `eval/voice/fixtures/rotla-*.json` | regenerated | They embed the game definition (new field) and the rotla-sr state |
| `tests/eval/voice.test.ts` | modified | Stock case count 16 → 18 |

## Diff Highlights

```ts
// prompt.ts
if (game.defaultBuySource === "treasury") {
  lines.push("buyShare sin origen dicho = source treasury (la tesorería de la compañía); esta partida no tiene IPO para comprar. En compras de acciones, «del banco» / «del pool» = source pool.");
} else {
  lines.push("buyShare sin origen dicho = source ipo; en compras de acciones, «del banco» / «del pool» = source pool.");
}
```

```ts
// StockSheet.tsx
const showIpo =
  meta.game.defaultBuySource !== "treasury" && (unitsOf(state, `ipo:${companyId}`, companyId) > 0 || treasuryShares === 0);
```

## Tests Added or Updated

- `tests/voice/prompt.test.ts` › "the prompt makes the treasury the default buy source and «del banco» the pool": the RotLA prompt has the treasury default and the pool hint; the 1830 prompt defaults to the IPO and never mentions the treasury default.
- `tests/voice/prompt.test.ts` › "the snapshot lists where each started company's shares are": a launched TUN shows `acciones tesorería 3` and no IPO count.
- `tests/ui/rotla.test.tsx` › "never shows an IPO button, even once the treasury is sold out": this is the regression for the disabled IPO button. Only Pool is offered.
- Eval cases `rl-sr-buy-02` and `rl-sr-buy-03`: these pass the golden-response validity check in `tests/eval/voice.test.ts`.

## Local Verification

- `npx tsx eval/voice/buildFixtures.ts` → all fixtures regenerated. Only the RotLA fixtures changed.
- `npx vitest run -u tests/voice/tools.test.ts` → the 10 prompt file snapshots were updated. Each gained exactly one line, and I reviewed them.
- `npx vitest run` → 72 files, 1240 tests passed.
- `tsc --noEmit` and `eslint` on the changed paths → clean.
- No live model eval run (it needs an API key and network).

## Deviations from Assessment

- The rotla-sr eval fixture had to change. «del banco» → pool is only a valid expectation when the pool holds a share. The added purchase and sale use Carla, the AGR president, so the other rotla-sr cases (Ana and Bruno launches and buys) keep their context.
- The assessment used "Pablo" as the example, but the eval players are Ana, Bruno and Carla, so the new cases use those names.
- `src/voice/tools.ts` was not changed. The `buyShare` description stays game-neutral, and the per-game default lives in the system prompt.
- Recorded-response interpreter test: not added. Recordings require a live Gemini call; see the follow-ups.
- Open question (majors after a merger, treasury empty): no special rule was added. The snapshot now shows the share locations (for example, `pool 1` only), so the model can see where shares are. A treasury buy with an empty treasury is still blocked by `buyAvailable` with a clear reason. **Resolved by the user (2026-10-10)**: this is fine, because majors work like any normal 18xx company.

## Follow-ups

- Run the voice eval (Gemini default model) and check `rl-sr-buy-02`/`03`. Then record Gemini responses for the new transcripts if the recordings pattern is extended.
- Manual check: in RotLA, say "Ana compra una acción de Mining" in SR1 after launching Mining.
