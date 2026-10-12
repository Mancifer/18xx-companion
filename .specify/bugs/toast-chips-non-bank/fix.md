# Bug Fix: Chip breakdown missing from toasts for transfers that don't involve the bank

- **Slug**: toast-chips-non-bank
- **Fixed**: 2026-10-11
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The flow model is now "money flows" instead of "bank flows". Every pair of holders in a group gets a netted `{ from, to, amount }` flow. So the undo toast and the voice confirmation card show a chip breakdown for every transfer: player ↔ company, company ↔ company and player ↔ player, as well as bank transfers. The "pagó con…" change picker is offered whenever the payer is not the bank.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/domain/ledger/flows.ts` | modified | `MoneyFlow` is now `{ from, to, amount }`. `bankFlows` is replaced by `moneyFlows`, which nets each unordered pair, drops zero nets and self-transfers, and keeps first-appearance order. |
| `src/ui/components/ChipStrip.tsx` | modified | New `flowLabel()` ("El banco paga a Ana" / "Ana paga al banco" / "Ana paga a Bruno"). "pagó con…" now shows when `flow.from !== "bank"`. |
| `src/ui/components/UndoToast.tsx` | modified | Uses `moneyFlows` + `flowLabel`. In multi-step groups (receivership/bankruptcy), the plain-text transfer list shows only when no chip set is configured; otherwise the chip strips replace it. |
| `src/ui/components/ConfirmationCard.tsx` | modified | New flow shape and `flowLabel`. The no-chips fallback text is `A → B: $n`. The launch strip is now player → company. |
| `src/ui/sheets/LaunchSheet.tsx` | modified | The launch strip uses the new shape (player → company). |
| `src/voice/resolve.ts`, `src/app/voiceController.ts` | modified | `bankFlows` → `moneyFlows`. |
| `specs/001-companion-mvp/spec.md` | modified | FR-081 now covers every money transfer, whoever pays and receives. |
| `tests/domain/flows.test.ts` | updated | Rewritten for `moneyFlows`. |
| `tests/ui/chips.test.tsx` | added test | Player → player payment toast shows chips and change. |
| `tests/voice/resolve.test.ts`, `__snapshots__/resolve.test.ts.snap` | updated | Flow shape only. The snapshot diff has the same flows and amounts. |

## Diff Highlights

```ts
// flows.ts — net per unordered pair
const pair = net.get(`${e.from}|${e.to}`) ?? net.get(`${e.to}|${e.from}`);
if (!pair) net.set(`${e.from}|${e.to}`, { a: e.from, b: e.to, amount: e.amount });
else pair.amount += pair.a === e.from ? e.amount : -e.amount;
```

```tsx
// ChipStrip.tsx
{flow.from !== "bank" && larger.length > 0 ? ( /* pagó con… */ ) : null}
```

## Tests Added or Updated

- `tests/domain/flows.test.ts` › "transfers that do not involve the bank are flows too": player → company and company → company yield flows.
- `tests/domain/flows.test.ts` › "nets each pair within the group, in either direction": p1 → p2 30 and p2 → p1 100 net to p2 → p1 70, and bank pairs still net.
- `tests/domain/flows.test.ts` › "ignores self-transfers".
- `tests/ui/chips.test.tsx` › "a payment between players shows chips and offers change too": the toast for Ana → Bruno $30 shows "Ana paga a Bruno $30", discs 1×25 + 1×5, and "pagó con" 100 gives change.
- `tests/voice/resolve.test.ts`: flows assertion and recorded-response snapshots moved to the new shape.

## Local Verification

- `npx tsc --noEmit -p .` → clean.
- `npx eslint` on the changed files → clean.
- `npx vitest run` → 1529 passed, 10 failed. All 10 failures are in `tests/eval/voice.test.ts` › "eval fixtures (T135) … on disk matches a fresh build". They are **not caused by this fix**: with these changes stashed, the same 10 fail (the fixture on disk has the old chip preset; a fresh build has the feature 008 preset).
- Manual checks: none. A RotLA `buyShare` from treasury on a device is still worth checking (see follow-ups).

## Deviations from Assessment

- **Open question: multi-step groups.** I decided that when a chip set is configured, the chip strips replace the plain-text transfer list in receivership/bankruptcy toasts, so nothing shows twice. The text list stays when there are no chips. Pairs are netted, so a strip shows the net between two holders, not each separate event.
- **Open question: company ↔ company.** Yes, these get chips, as the assessment assumed.
- **Spec location**: FR-081 is in `specs/001-companion-mvp/spec.md`, not `docs/spec.md` as the assessment listed.
- **Launch strips**: the hard-coded launch flow is now player → company (it was modelled as "to bank"). The label "X entrega" and the "pagó con…" behavior are unchanged.

## Follow-ups

- Regenerate the eval fixtures (`tests/eval` T135). They are out of date since the feature 008 chip preset change. This is not related to this bug.
- On a phone, recheck toast height for RotLA dividends and 1830/1848 payouts, where more strips may now appear. Also recheck the `toast-obscures-voice-button` fix.
- Run a manual RotLA check: buy a share from treasury and confirm the toast shows "Ana paga a <compañía>" with chips.
