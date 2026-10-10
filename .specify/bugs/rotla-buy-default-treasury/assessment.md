# Bug Assessment: RotLA voice share buys default to the IPO

- **Slug**: rotla-buy-default-treasury
- **Created**: 2026-10-10
- **Source**: pasted text (one of four issues found while testing RotLA; the others are `toast-obscures-voice-button`, `voice-start-latency-feedback` and `companies-tab-status-order`)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> There's no real IPO in this game aside from the auctioning phase, since minor company starts with their shares in the treasury, yet buyin from IPO is treated as the default option in this game, when you say "Pablo compra 1 accion de mining" during the share round you get an error saying that there are no shares left in the IPO, which is correct to an extent, but it's not useful for this game. There's also buying from the bank, but that should be the exception not the rule, I would say "Pablo compra una accion de mining del banco"

## Symptom

In a RotLA stock round, a voice buy that does not name a source ("Pablo compra 1 acción de Mining") becomes `buyShare { source: "ipo" }`, which is blocked with "No quedan acciones en la IPO". In RotLA the IPO is always empty after launch, so a buy with no source named should come from the company's **treasury**. "del banco" should mean the **pool**.

## Reproduction

1. Start a RotLA session and launch a minor (e.g. Eastern Mining) in SR1 with `launchCompany`. The president gets 2 units and the other 3 go to `company:EMN` ([auctionLaunch.ts:30-33](src/domain/mechanics/custom/auctionLaunch.ts#L30-L33)); the IPO is now empty.
2. In the same SR, say "Pablo compra una acción de Mining".
3. The interpreter returns `buyShare { buyer: player:Pablo, company: EMN, source: "ipo", count: 1 }`, and `buyAvailable` rejects it with "No quedan acciones en la IPO".

Expected: `source: "treasury"`. With "… del banco", expected `source: "pool"`.

Touch is **not** affected. [StockSheet.tsx:128-131](src/ui/sheets/StockSheet.tsx#L128-L131) shows a "Tesorería" button when the treasury holds shares. It still shows a disabled "IPO" button when both the IPO and the treasury are empty, for example for a major after a merger. That is a cosmetic issue.

## Suspected Code Paths

- [src/voice/tools.ts:76](src/voice/tools.ts#L76): the `buyShare` description is generic to every game ("Comprar acciones de la IPO, del pool o de la tesorería"), and both examples name the IPO or the pool. Nothing says which source is the default when none is spoken, so the model falls back to "IPO".
- [src/voice/prompt.ts:28-33](src/voice/prompt.ts#L28-L33): the system prompt adds per-game hints for `auctionLaunch` ("«abre X por N» = launchCompany"). There is no matching hint for the default buy source or for "banco" = pool.
- [src/voice/snapshot.ts:45-54](src/voice/snapshot.ts#L45-L54): the per-company snapshot line shows status, cash, price and trains. It does not show how many shares are in the IPO, the treasury or the pool, so the model cannot infer the source from the state either.
- [src/domain/actions/schemas.ts:210](src/domain/actions/schemas.ts#L210): `source` is required, so the model has to pick one. Nothing in the domain chooses a default.
- [src/domain/actions/expand/stock.ts:120-128](src/domain/actions/expand/stock.ts#L120-L128): `buyAvailable` correctly rejects an empty IPO. This is the error the user saw.
- [src/domain/games/grotla.ts](src/domain/games/grotla.ts): the game data does not say that RotLA buys come from the treasury. Only `market.moves.issue.from: "treasury"` hints at it.
- [eval/voice/cases.jsonl](eval/voice/cases.jsonl): `rl-sr-buy-01` always says "de la tesorería" explicitly. No case covers a RotLA buy with no source, or "del banco".

## Root Cause Hypothesis

The voice layer has no per-game notion of the default share source. The `buyShare` tool description, its examples and the snapshot all assume the 1830/1848 model, where the IPO is the normal place to buy from. In RotLA, `auctionLaunch` empties the IPO at launch, so the model's "IPO" default always fails. The model also has no hint that "banco" means the pool in this game. Confidence: **high**. The domain logic is correct, and the gap is entirely in the prompt context the interpreter receives.

## Proposed Remediation

**Preferred**: Give the game definition an optional `defaultBuySource` (`"ipo" | "treasury"`, default `"ipo"`) and set it to `"treasury"` in `grotla`.

- In `systemPromptEs`, add a line when it is `"treasury"`: «Sin origen dicho, buyShare compra de la tesorería (source treasury). "del banco" / "del pool" = source pool. Esta partida no tiene IPO para comprar.» For other games, add a short default line: «Sin origen dicho = IPO; "del banco" = pool».
- In `snapshot.ts`, list each started company's share locations (IPO / tesorería / pool counts) so the model can also reason from the state.
- In `StockSheet.tsx`, hide the IPO button when `defaultBuySource === "treasury"`.

**Alternatives**:
- *Resolver fallback*: after interpretation, rewrite `source: "ipo"` to `"treasury"` when the IPO is empty and the treasury is not. This is deterministic and needs no prompt change. The cost is that it silently overrides what the model said, and it does not fix "del banco" → pool. It can still be added as a second line of defence.
- *Prompt-only*: change the `buyShare` description examples without a game field. This is cheaper, but the description is shared by every game and would need to stay neutral.

**Files likely to change**:
- `src/domain/games/schema.ts` (new optional field), `src/domain/games/grotla.ts`
- `src/voice/prompt.ts`, `src/voice/snapshot.ts`, possibly `src/voice/tools.ts` (description wording)
- `src/ui/sheets/StockSheet.tsx` (hide the IPO button)
- `eval/voice/cases.jsonl` (+ regenerated fixtures if the snapshot changes), `eval/voice/fixtures/rotla-sr.json`

**Tests to add or update**:
- `tests/voice/prompt*.test.ts`: the RotLA prompt contains the treasury-default line and "banco" = pool; the 1830 prompt does not.
- `tests/voice/snapshot*.test.ts`: a launched minor's line shows its treasury count.
- Eval cases: "Pablo compra una acción de Mining" → `source: treasury`; "… del banco" → `source: pool`.
- Recorded-response interpreter test for the same transcript, if the Gemini recordings pattern is used ([tests](tests)).
- `StockSheet` component/e2e test: RotLA shows no IPO button.

## Risks & Considerations

- A snapshot change alters the prompt for every game, so eval fixtures must be regenerated (see memory: regenerate fixtures after expander/snapshot changes). The token cost per call grows a little.
- "banco" means the Bank, not the pool, in other contexts (`payCost`, `bankPays`, `transferMoney`, train purchases). The hint must be limited to share purchases.
- The schema must stay backward-compatible: custom games without the field default to IPO.

## Open Questions

- [NEEDS CLARIFICATION: For majors after a merger (all 10 units handed out, treasury empty), should a buy with no source named default to the pool, or should the app ask?]
