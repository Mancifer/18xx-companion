# Bug Assessment: RotLA buy default still IPO in sessions saved before the fix

- **Slug**: rotla-buy-default-minor
- **Created**: 2026-10-10
- **Source**: pasted text (follow-up to `rotla-buy-default-treasury`)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> I was testing bug rotla-buy-default-treasury on my phone, while the automated tests worked fine, even the ones with eval against the LLM. The app on the phone is still complaining about the IPO. This is for a minor company and I'm using a match previously saved, although I think it shouldn't be a problem?

## Symptom

In a RotLA match created **before** the `rotla-buy-default-treasury` fix (commit 42fa1ce), a voice buy for a launched minor with no source named still becomes `source: "ipo"`. The app then rejects it with "No quedan acciones en la IPO". The expected result is `source: "treasury"`, as in a new match. The saved match does matter, contrary to the user's assumption. The minor company is incidental.

## Reproduction

1. On a build before 42fa1ce, create a RotLA session and launch a minor, for example Eastern Mining. This writes `meta.game` to IndexedDB without `defaultBuySource`.
2. Update to the current build and reopen that saved session.
3. In the stock round, say "Pablo compra una acción de Mining".
4. Observed: the proposal is blocked because the IPO is empty. In the same session, the StockSheet also shows the IPO button again once the treasury is sold out.

A new RotLA session created on the current build is expected to work, and the eval fixtures behave that way because they embed the new definition. [NEEDS CLARIFICATION: confirm that a match newly created on the phone works, to rule out a stale PWA bundle. See Open Questions.]

## Suspected Code Paths

- [src/domain/session.ts:8-9](src/domain/session.ts#L8-L9): `SessionMeta.game` is a "frozen copy with session options applied (FR-005)". It is written once at creation and never refreshed.
- [src/app/sessions.ts:36-50](src/app/sessions.ts#L36-L50): `applyOptions(input.game, …)` creates that frozen copy and persists it with `repo.createSession(meta)`.
- [src/persistence/sessionRepo.ts](src/persistence/sessionRepo.ts) `loadSession()` and [src/app/SessionStore.ts:91-92](src/app/SessionStore.ts#L91-L92) `SessionStore.open()`: these return the stored `meta` unchanged. They do not reconcile it with the current built-in definition.
- [src/app/useVoice.ts:98](src/app/useVoice.ts#L98): the voice session receives `snap.meta.game`, which is the old frozen copy.
- [src/voice/prompt.ts:35-41](src/voice/prompt.ts#L35-L41): when `defaultBuySource` is absent, the prompt follows the `else` branch and tells the model explicitly «buyShare sin origen dicho = source ipo». For old sessions this is now worse than before the fix: the prompt actively steers the model to the IPO, against the snapshot's `acciones tesorería 3`.
- [src/ui/sheets/StockSheet.tsx:132-133](src/ui/sheets/StockSheet.tsx#L132-L133): `showIpo` reads `meta.game.defaultBuySource`, so old sessions also get the old button behaviour.
- [src/persistence/exportImport.ts:58](src/persistence/exportImport.ts#L58) / [exportImport.ts:161](src/persistence/exportImport.ts#L161): exported files carry the same frozen `game`, so importing an older export has the same problem.

## Root Cause Hypothesis

The fix added a new field to `GameDefinition` and read it from `meta.game`. Sessions keep a frozen copy of the definition from when they were created (FR-005), so sessions saved earlier lack the field. They fall back to the `"ipo"` default, which the new prompt line now states outright. The automated tests and evals only use freshly built definitions and fixtures, so none of them exercise a stored pre-fix `meta.game`. Confidence: **high**. A stale PWA bundle is a much less likely contributor: `registerType: "autoUpdate"` in [vite.config.ts:33-34](vite.config.ts#L33-L34) can serve the old bundle on the first launch after a deploy.

## Proposed Remediation

**Preferred**: derive the default buy source from rules a frozen definition already has, and stop relying only on the new field. Add a helper, for example `defaultBuySource(game)` in `src/domain/games/`. It returns `game.defaultBuySource` when set. Otherwise it returns `"treasury"` when the `auctionLaunch` mechanic is enabled, because that mechanic always empties the IPO at launch ([auctionLaunch.ts:30-33](src/domain/mechanics/custom/auctionLaunch.ts#L30-L33)). In all other cases it returns `"ipo"`. Use the helper in `prompt.ts` and `StockSheet.tsx` instead of reading the field directly. This fixes old sessions, old exports and custom games that use `auctionLaunch`, with no data migration.

**Alternatives**:
- *Backfill on load*: in `SessionStore.open()` (and `importSession`), when `meta.game.id` matches a built-in game and fields added later are missing, copy them in from `builtInGames`, and optionally persist the result through `updateMeta`. This is general-purpose for future schema additions. The trade-offs: it weakens the FR-005 "frozen copy" contract, it must not overwrite option-applied values, and it does nothing for custom games.
- *Resolver fallback*: when a `buyShare` has `source: "ipo"`, the IPO is empty and the treasury holds shares, rewrite it to `"treasury"`. This is deterministic and model-independent, but it silently overrides what the model said. It is a reasonable extra safety net, not a replacement.

**Files likely to change**:
- `src/domain/games/` (new helper, for example in `index.ts` or a small `buySource.ts`)
- `src/voice/prompt.ts`
- `src/ui/sheets/StockSheet.tsx`
- `tests/voice/prompt.test.ts`, `tests/ui/rotla.test.tsx`

**Tests to add or update**:
- Prompt test: a RotLA definition with `defaultBuySource` deleted (simulating a pre-fix frozen copy) still produces the treasury-default line.
- Unit test for the helper: explicit field wins; `auctionLaunch` with no field gives treasury; 1830 gives ipo.
- StockSheet test: a RotLA session whose `meta.game` lacks the field still hides the IPO button.
- Optional: an import test that uses a pre-fix exported RotLA session.

## Risks & Considerations

- Tying the default to `auctionLaunch` is an inference. A future custom game could use auction launch and still keep IPO shares. The explicit field still wins, so such a game can opt out.
- Prompt file snapshots should not change for new sessions; the RotLA output is identical. Re-check them.
- If backfill-on-load is chosen instead, persisting the patched meta changes stored data and the export content. Take care with option-applied fields.

## Resolution

**Won't fix (2026-10-10)**: the user decided that the app is a first version, so sessions saved before a schema change don't need to be supported. They will start a new match. Revisit this if keeping saved sessions working across schema changes becomes a requirement. The preferred helper or backfill-on-load above are the starting points.

## Open Questions

- [NEEDS CLARIFICATION: Does a RotLA match **newly created** on the phone with the current build buy from the treasury correctly? If not, a stale PWA bundle or service worker is also involved. Force-close and reopen the app, or check the build version.]
- [NEEDS CLARIFICATION: Do you prefer the general backfill-on-load approach (it helps with future schema additions) over the targeted helper?]
