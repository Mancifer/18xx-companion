# Bug Assessment: Chip breakdown missing from toasts for transfers that don't involve the bank

- **Slug**: toast-chips-non-bank
- **Created**: 2026-10-11
- **Source**: pasted text
- **Verdict**: valid (as a requirement change; current behavior is by original design, not a regression)
- **Severity**: low

## Report (verbatim or summarized)

> Chips are not shown in toast notifications for some transactions. I think I know this happens when you make a transaction that doesn't involve the bank, and I think it's related to a recent change that introduced some new features to handle bank creation. They should show up in all transactions regardless of who is involved, this information is useful for players to get an idea of what chips they can use and we're currently not enforcing rules related to the bank and the number of chips during play so I don't see any reason to hide it

## Symptom

When an action moves money only between players and companies (e.g. in RotLA, a player buying a share from a company's treasury pays the company, not the bank), the undo toast and the voice confirmation card show no chip breakdown. Expected: every money transfer in the group gets a chip breakdown, whoever the payer and payee are.

## Reproduction

1. Start a RotLA session with a non-empty chip set.
2. Launch a company, then record `buyShare` with `source: "treasury"` (player → `company:X`).
3. The undo toast shows the summary but no chip strip. A bank-involving action (e.g. `issueShares`, bank → company) does show one.

The same applies to any player ↔ company or company ↔ company transfer in any game, and to voice proposals (`ConfirmationCard`), which use the same flow list.

## Suspected Code Paths

- [src/domain/ledger/flows.ts:15](src/domain/ledger/flows.ts#L15) `bankFlows()`: keeps only transfers with `from === "bank"` or `to === "bank"`. The doc comment says so: "Transfers that do not involve the bank (player ↔ company) need no chips from the bank and are left out."
- [src/domain/ledger/flows.ts:5](src/domain/ledger/flows.ts#L5) `MoneyFlow`: modelled as `counterparty` + `direction: "fromBank" | "toBank"`, so it cannot describe a non-bank transfer.
- [src/ui/components/UndoToast.tsx:83-94](src/ui/components/UndoToast.tsx#L83-L94): renders one `ChipStrip` per `bankFlows(group.events)` entry, labelled "El banco paga a X" / "X paga al banco".
- [src/ui/components/ChipStrip.tsx:56](src/ui/components/ChipStrip.tsx#L56): takes a `MoneyFlow`; "pagó con…" change is only offered when `direction === "toBank"`.
- [src/ui/components/ConfirmationCard.tsx:69-85](src/ui/components/ConfirmationCard.tsx#L69-L85): voice proposals render `proposal.flows`, which come from `bankFlows` in [src/voice/resolve.ts:139](src/voice/resolve.ts#L139) and [src/app/voiceController.ts:148](src/app/voiceController.ts#L148).
- [tests/domain/flows.test.ts:23](tests/domain/flows.test.ts#L23): the test "transfers between players and companies are not bank flows" locks in the current behavior.

## Root Cause Hypothesis

This is intended behavior from the original implementation (FR-081 / US6), not a regression. `flows.ts` has one commit (`38f936b`, the initial import). Feature 008 (`f4ca8a8`) changed `breakdown()` and `ChipStrip` rendering but not which flows are shown. The design assumed chips only matter when the bank makes change. RotLA makes the gap obvious because share purchases there go player → company treasury, so a common transaction shows no chips. Confidence: **high**.

## Proposed Remediation

**Preferred**: Generalize the flow model from "bank flows" to "money flows":
- Replace `MoneyFlow` with `{ from: HolderRef; to: HolderRef; amount: number }`.
- Add `moneyFlows(events)` (or rename `bankFlows`), which nets each unordered `{from, to}` pair within the group: A→B 100 and B→A 30 become A→B 70. Drop zero nets and self-transfers, and keep first-appearance order. Bank flows come out the same as today, just in the new shape.
- `ChipStrip`: label from `from`/`to` ("El banco paga a Ana", "Ana paga al banco", "Ana paga a TUN"). Offer "pagó con…" whenever the payer is not the bank, since any payer may need change.
- Update `UndoToast`, `ConfirmationCard`, `voice/resolve.ts`, `voiceController.ts` and the hard-coded launch strips (`LaunchSheet`, `ConfirmationCard` launch case) to the new shape.
- Update the FR-081 wording in `docs/spec.md` and the `flows.ts` doc comment.

**Alternatives**:
- Keep `bankFlows` for bank transfers and add a second list for non-bank pairs in `UndoToast` only. This is a smaller diff, but voice proposals stay inconsistent and there would be two flow concepts.
- Show chips only for non-bank transfers *in addition to* the existing `multiStep` list in the toast. This duplicates the information, so it is not recommended.

**Files likely to change**:
- `src/domain/ledger/flows.ts`
- `src/ui/components/ChipStrip.tsx`
- `src/ui/components/UndoToast.tsx`
- `src/ui/components/ConfirmationCard.tsx`
- `src/ui/sheets/LaunchSheet.tsx`
- `src/voice/resolve.ts`, `src/app/voiceController.ts` (type of `flows`)
- `docs/spec.md` (FR-081)
- `tests/domain/flows.test.ts`, `tests/ui/chips.test.tsx`

**Tests to add or update**:
- `flows.test.ts`: replace "player↔company are not bank flows" with a test that a player → company transfer yields a flow, plus a pair-netting test (A→B and B→A in one group).
- `chips.test.tsx`: toast after a RotLA `buyShare` from treasury shows a chip strip labelled "Ana paga a …".
- Voice resolve/controller tests that assert on `flows`, if any, updated to the new shape.

## Risks & Considerations

- Toast height: payouts in 1830/1848 (bank → each player and the company) already produce several strips. Adding company → player transfers (e.g. RotLA dividends paid from a treasury) may make toasts taller. The toast-obscures-voice-button fix (`.specify/bugs/toast-obscures-voice-button`) should be rechecked.
- In `multiStep` groups (takeovers/bankruptcies) the toast already lists every transfer as text. Decide whether chip strips replace that list or only appear when not `multiStep`, to avoid showing everything twice.
- Voice eval fixtures / recorded responses serialize proposals. Check whether `flows` is part of any snapshot before changing its shape.
- No persistence impact: flows are derived from stored events, never stored.

## Open Questions

- [NEEDS CLARIFICATION: For `multiStep` groups (bankruptcy, receivership), should chip strips be shown for every transfer, or is the existing text list enough?]
- [NEEDS CLARIFICATION: Should company ↔ company transfers (e.g. merger cash, private sales between companies) also get chips? Assumed **yes**, per "regardless of who is involved".]
