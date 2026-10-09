# Bug Assessment: A private already owned by a player can be "bought" again by another player

- **Slug**: private-company-ownership
- **Created**: 2026-10-09
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> there's currently a bug in the application that I noticed while testing 1848: Multiple players can
> buy the same private company, however, in reality players bid for the companies and only one of
> them can actually acquire it. It's ok to not have the bidding on the app, players can do that on
> the game, but the application shouldn't allow multiple players to buy the same private company

## Symptom

In 1848, after player A buys a private company, player B can also "buy" it through the Privates
sheet (or by voice). The app accepts the purchase: the private moves from A to B, and B's money goes
to A. Expected: once a player owns an 1848 private, no other player can buy it. 1848 rules §4.1 say
"Private Companies can not be traded, either between players or between companies."

## Reproduction

1. Start a new 1848 session with 3+ players (the session opens in the PRIVATES round).
2. Open the Privates sheet ("Comprar privada"), choose P1, choose player A, keep the price, and
   press "Comprar". The purchase succeeds.
3. Open the sheet again. P1 is still listed (its subtitle now shows player A as the holder). Choose
   P1, choose player B, and press "Comprar".
4. Observed: the action is accepted. P1 moves from A to B, and B pays A. Expected: the action is
   refused with a message that P1 already belongs to A.

The same flow works through the voice tool `buyPrivate` ("Bea compra la P1 por 30"), because both
paths dispatch the same action.

## Suspected Code Paths

- [src/domain/actions/expand/stock.ts:235-258](../../../src/domain/actions/expand/stock.ts#L235-L258)
  — `buyPrivate.available` only refuses an unknown private, a closed one (`removed`), or one the
  buyer already owns. It does not check whether another player holds the private. `expand` then
  pays the current holder (`to: holder`) and moves the asset from that holder. This means any buy
  of an owned private becomes a player-to-player sale.
- [src/ui/sheets/PrivatesSheet.tsx:20](../../../src/ui/sheets/PrivatesSheet.tsx#L20) — the sheet
  lists every private that is not `removed`, including privates players already own. Its doc
  comment ("the initial sale … and later deals") shows that player-to-player resale was a deliberate
  feature, but no game rule limits it.
- [src/domain/games/schema.ts:112-127](../../../src/domain/games/schema.ts#L112-L127) and
  [schema.ts:225-245](../../../src/domain/games/schema.ts#L225-L245) — `GameDefinition` and
  `PrivateDef` have no field that says whether players may trade privates with each other, so the
  handler cannot tell 1848 apart from 1830.
- [src/voice/tools.ts:71](../../../src/voice/tools.ts#L71) — the voice tool description is generic.
  It relies on the domain `available` check, so it gets the fix automatically.
- Related, not the reported bug:
  [src/domain/actions/expand/operating.ts:242-272](../../../src/domain/actions/expand/operating.ts#L242-L272)
  — `buyPrivateByCompany` lets a company buy a private from any holder, including another company.
  1848 §4.1 only allows a company to buy P1–P4 from its own Director, and never from another
  company.

## Root Cause Hypothesis

`buyPrivate` was designed as one action for two cases: the initial sale from the bank, and later
player-to-player deals, which 1830 §4.1 allows "at any time during the buyer's or the seller's turn
of a stock round (other than the first)". The game definition has no rule to turn the second case
off, and nothing checks which round it is. So in 1848, where privates can never change hands between
players, and in the PRIVATES round of any game, a second purchase silently becomes a resale instead
of being refused. Confidence: **high**. The behavior follows directly from the `available`/`expand`
code above, and the rulebook text was checked in `docs/rules/1848-RULES-11a.pdf` §4.1 and
`docs/rules/1830-Rules-V1_0.pdf` §4.1.

## Proposed Remediation

**Preferred**: Add a game-level rule for private trading between players, for example
`privateTrading: "none" | "players"` on `GameDefinitionSchema`. Use an optional field with a
documented default (`"players"`), so saved custom games still load. Set 1848 and 21Moon to
`"none"` (confirmed by the user for 21Moon) and 1830 to `"players"`. Then make
`buyPrivate.available` refuse when the private's current holder is not `bank`, and either:
- the game's rule is `"none"` (message such as "La P1 ya es de Ana; en 1848 las privadas no se
  traspasan"), or
- the round is not a stock round after the first, i.e. not
  (`turn.round === "SR"` && `turn.srNumber >= 2`). This covers the PRIVATES round (each private
  goes to one buyer only), and 1830 §4.1's "at any time during … a stock round (other than the
  first)".

The Privates sheet should hide privates owned by players, or show them as disabled with the owner
name, when resale is not allowed. That way the user can't even pick one. The `available` check stays
the source of truth for both voice and UI.

**Alternatives**:
- *Always refuse buying an owned private (no per-game rule).* Smallest change, and it fixes 1848.
  But it removes the legal 1830 player-to-player sale, which is a regression for 1830 users.
- *Use a warning instead of making the action unavailable.* Keeps the escape hatch for house rules,
  but the user explicitly asked that the app "shouldn't allow" it. Other hard rule violations in the
  codebase use `unavailable(...)`.

**Files likely to change**:
- `src/domain/games/schema.ts` (new `privateTrading` field)
- `src/domain/games/g1848.ts`, `src/domain/games/g1830.ts`, `src/domain/games/g21moon.ts` (set the
  value)
- `src/domain/games/customGame.ts` / `src/ui/screens/CustomGame.tsx` (default and, optionally, an
  editor toggle)
- `src/domain/actions/expand/stock.ts` (`buyPrivate.available`)
- `src/ui/sheets/PrivatesSheet.tsx` (filter or disable privates owned by players)
- `tests/games/1848.test.ts`, `tests/domain/privateGrants.test.ts` or a new
  `tests/domain/privates.test.ts`

**Tests to add or update**:
- 1848: p1 buys P1 from the bank; p2's `buyPrivate` of P1 is unavailable, and state (owner, both
  cash balances) is unchanged.
- 21Moon: same as the 1848 case. A player can't buy a private another player owns.
- 1830, PRIVATES round and SR1: a second buyer of an already sold private is refused.
- 1830, SR2 or later: a player-to-player sale still works, with money going to the seller
  (protects the existing feature).
- Buying from the bank stays available in every game, and the "Ya es suya" and closed-private
  messages still apply.
- Optional: a UI test that the Privates sheet does not offer an owned 1848 private.
- Optional: a voice eval case where "B compra la P1" after A owns it gets a refusal and no
  mis-dispatch.

## Risks & Considerations

- **Saved sessions / custom games**: adding a required schema field would fail to parse stored
  custom game definitions. The field must be optional with a default, or covered by a migration in
  `src/persistence/gamesRepo.ts`.
- **Event-sourced replay**: existing 1848 sessions may already hold a resale event. The fix only
  changes `available` and the events that get emitted, not reducers, so replay of recorded events
  is not affected. Check that replay does not re-validate actions.
- **Undo/correction flows**: if users currently fix a wrong buyer by "re-buying" the private for the
  right player, that workaround goes away. They should use undo instead. Confirm undo covers this.
- **stockBatch**: batch items are only `buyShare | sellShares | parCompany`, so no extra path needs
  changes. Re-check if `buyPrivate` is ever added to batches.
- **Out of scope**: the related `buyPrivateByCompany` gap (1848 only from the Director, never from
  another company) stays as is. The user decided it isn't blocking.

## Open Questions

All resolved by the user on 2026-10-09:

- **21Moon**: players can't trade privates with each other; only corporations can buy privates.
  → `g21moon.ts` gets `privateTrading: "none"`.
- **1830 first stock round**: block it, as §4.1 says ("other than the first"). → In 1830,
  player-to-player sales are allowed only when `turn.round === "SR"` and `turn.srNumber >= 2`.
  They're refused in the PRIVATES round, SR1, and every OR.
- **`buyPrivateByCompany` Director-only restriction (1848)**: out of scope. It's not a blocking
  issue, since players know the rule from the rulebook. Don't change it in this fix.
