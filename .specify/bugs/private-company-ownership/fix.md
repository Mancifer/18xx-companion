# Bug Fix: A private already owned by a player can be "bought" again by another player

- **Slug**: private-company-ownership
- **Fixed**: 2026-10-09
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Added a per-game `privateTrading: "none" | "players"` rule. It is optional and defaults to `"players"`. `buyPrivate` now refuses a private that someone other than the bank holds, unless the game allows player trading and the turn is a stock round after the first (1830 §4.1). 1848 and 21Moon never allow it. The Privates sheet hides privates that are already held while resale isn't allowed, so the touch UI and voice both follow the same rule.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/domain/games/schema.ts` | modified | New optional `privateTrading` enum on `GameDefinitionSchema`, with documented default `"players"` |
| `src/domain/games/g1848.ts` | modified | `privateTrading: "none"` (§4.1), plus a `verification` entry |
| `src/domain/games/g21moon.ts` | modified | `privateTrading: "none"` (confirmed by the user), plus a `verification` entry |
| `src/domain/games/g1830.ts` | modified | `privateTrading: "players"` (§4.1), plus a `verification` entry |
| `src/domain/actions/expand/stock.ts` | modified | New exported `privateResaleOpen(game, state)`. `buyPrivate.available` refuses a non-bank holder when resale is closed, and the message names the owner |
| `src/ui/sheets/PrivatesSheet.tsx` | modified | Lists only bank-held privates unless `privateResaleOpen`. Doc comment updated |
| `tests/domain/privates.test.ts` | added test | 18 cases covering 1848, 21Moon, 1830 and the default |
| `tests/ui/stock.test.tsx` | added test | The Privates sheet in 1848 does not offer an owned private |
| `eval/voice/fixtures/*.json` (6 files) | regenerated | The exported game definition now includes `privateTrading`. Additions only (see Deviations) |

## Diff Highlights

```ts
// stock.ts
export function privateResaleOpen(game: GameDefinition, state: SessionState): boolean {
  if ((game.privateTrading ?? "players") === "none") return false;
  return state.turn.round === "SR" && state.turn.srNumber >= 2;
}

// buyPrivate.available
if (holder !== "bank" && !privateResaleOpen(ctx.game, ctx.state)) {
  const owner = holderName(holder, ctx.game, ctx.players);
  return unavailable(
    ctx.game.privateTrading === "none"
      ? `La ${a.private} ya es de ${owner}; en ${ctx.game.name} las privadas no se traspasan`
      : `La ${a.private} ya es de ${owner}; solo se traspasa en una ronda de acciones a partir de la segunda`,
  );
}
```

## Tests Added or Updated

- `tests/domain/privates.test.ts` › "1848 / 21moon: players never trade privates" checks that p2's purchase of P1 after p1 owns it is unavailable in the PRIVATES round, SR1, SR2 and SR5, that state is unchanged, and that the message names the owner.
- `tests/domain/privates.test.ts` › "1830: player-to-player sales…" checks that the PRIVATES round, SR1 and an OR refuse the sale, and that SR2 allows it with the money going from p2 to p1.
- `tests/domain/privates.test.ts` › "unchanged refusals and bank sales" checks that bank sales still work in the PRIVATES round and SR1 in every game, that the "Ya es suya" and "Esa privada está cerrada" messages are unchanged, and that a definition without `privateTrading` behaves like `"players"`.
- `tests/ui/stock.test.tsx` › "PrivatesSheet (bug private-company-ownership)" checks that in 1848, once P1 (Melbourne) is owned, it isn't offered and P2 still is.

## Local Verification

- `npx vitest run` → 50 files, 552 tests, all passed.
- `npm run typecheck` → clean.
- `npx eslint` on the changed files → clean.
- Replay and undo: `effectiveLog`/`replay` re-apply stored events and don't re-run `available`, so saved sessions that already contain a resale still load. `buildAmend` does re-run the pipeline. That means amending an *old* resale entry is now refused, which is correct. Fixing a wrong buyer still works through undo, or by amending the original bank purchase.
- Manual UI check: not done (covered by the UI test above).

## Deviations from Assessment

- **Scope expansion: eval fixtures regenerated.** `tests/eval/voice.test.ts` compares `eval/voice/fixtures/*.json` against a fresh build, and the export includes the game definition. I regenerated them with `npx tsx eval/voice/buildFixtures.ts`. The diff only adds `privateTrading` lines (12 insertions, no other changes).
- `customGame.ts` / `CustomGame.tsx` were not changed. Custom games copy their base definition, so they inherit `privateTrading`. Stored definitions without the field fall back to the `"players"` default. I didn't add an editor toggle (it was optional).
- The optional voice eval case was not added.

## Follow-ups

- In 1830 SR2+, a player can still "buy" a private that a **company** holds, because the check only looks at whether the holder is the bank. 1830 doesn't allow companies to sell privates to players. Consider limiting resale to `player:` holders.
- `buyPrivateByCompany` in 1848 (Director-only, never from another company) is still out of scope, as the user decided.
- Optional: a voice eval case where "Bruno compra la P1" after Ana owns it should get a refusal.
- Optional: an editor toggle for `privateTrading` in the custom game screen.
