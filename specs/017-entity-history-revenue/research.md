# Research: Player and Company History, Last Run Revenue

**Feature**: [spec.md](./spec.md) | **Date**: 2026-11-09

There were no open NEEDS CLARIFICATION items in the Technical Context. Each decision below was
settled by reading the current code (ledger, events, expansions).

## R1. Deciding which entries involve a subject

**Decision**: Use a pure function `involves(subject, events)` over a group's stored primitive
events. It checks every version of the group, so legacy amended groups match on any of their
versions.

| Event | Player `player:pN` involved when | Company `C` involved when |
|---|---|---|
| `moneyTransfer` | `from` or `to` is the player | `from` or `to` is `company:C` |
| `shareTransfer` | `from` or `to` is the player | `company === C`, or `from`/`to` is `company:C` (C's treasury holding another company's shares) |
| `assetTransfer` (trains, privates, loans) | `from` or `to` is the player | `from` or `to` is `company:C` |
| `marketMove` | never | `company === C` |
| `companyStatus` | never | `company === C` |
| `counterChange` | `subject` is the player | `subject` is `company:C` |
| `turnAdvance` | never | `company === C` (the turn passes to it) |
| `note` | never | never |

**Rationale**: since feature 010 the events hold every movement, and they never change after they
are stored. An undone group is therefore judged by the movements it had while active, as the spec
requires. The existing `touches` keys are not enough: `shares:<company>` drops the holders, so it
cannot answer "did this player's shares move?".

**Alternatives considered**:
- Match on action fields (`buyer`, `seller`, `company`). Rejected: a null `company` means "the
  operating company" and would need the turn at that time. Compound actions hide their steps.
  Every effect already shows up in the events.
- Match notes by name in their text. Rejected: free text gives false hits. The spec edge case was
  updated to say notes are never matched.

## R2. Where the filtered history lives

**Decision**: Reuse the `History` screen with an optional subject. The screen becomes
`{ name: "history"; subject?: HistorySubject; focus?: GroupId; back?: Screen }`. With a subject it:
- shows only involved groups, and only the round sections that hold at least one;
- hides "Deshacer" and "Deshacer hasta acá";
- puts "Ver en el historial completo" in every entry's panel;
- shows the subject in the title.

Round sections are still computed from the full history, so section titles and boundaries match
the full view (folding the turn needs every active group). Only then are they filtered.

**Rationale**: one layout, one item component, one breakdown (FR-005). The screen already derives
everything from `log`, so FR-010 (live updates) comes free.

**Alternatives considered**: a separate `EntityHistory` screen, or a sheet on the Table. Rejected:
either one duplicates the sections, items and breakdown, and a sheet is cramped for a long list.

## R3. Returning to the sheet

**Decision**: The `table` screen gets an optional `reopen?: { kind: "player" | "company"; id }`.
The Table seeds its `open` state from it. "Historial" in a sheet calls
`go({ name: "history", subject, back: { name: "table", reopen } })`. "Ver en el historial
completo" calls `go({ name: "history", focus, back: <the filtered screen> })`. The back arrow goes
to `back ?? { name: "table" }`.

**Rationale**: there is no router (nav research R1), and today the Table's open sheet is lost
when it unmounts. One optional field restores it without a navigation stack.

**Alternatives considered**: a general history stack in `NavContext`. Rejected: YAGNI. Only these
two hops need it.

## R4. Focusing an entry in the full History

**Decision**: When `focus` is set, the full History opens that item's `<details>` and scrolls it
into view once on mount. Items already carry `data-group={id}`.

**Rationale**: it needs no new state beyond the screen parameter.

## R5. Finding a company's last run

**Decision**: `lastRun(game, effective, company)` folds the effective groups in seq order, event by
event:
- `turnAdvance` events go through the reducer's `advanceTurn`. This tracks the OR (`orSet`,
  `orIndex`) and the operating company, the same way `rounds.ts` and `operatingPhase.ts` do.
- Each `counterChange` with `key: "runs"`, `delta > 0` and subject `company:C` marks a run of C in
  that group, at the current OR. The last such mark wins.

Every run already writes this counter:
- `runAndPayout` (operating.ts);
- the automatic run of 0 when the turn passes with no run (flow.ts `nextCompanyEvents`);
- the national payout (nationalBank.ts).

So the counter is the single, version-proof signal. Undo is handled because only effective groups
are folded (FR-015).

**Revenue and parts** come from the group's action:
- `runAndPayout`: its `parts`, total = sum.
- `compound`: the last `runAndPayout` item whose `company` is C, or whose `company` is null while C
  was the operating company just before C's `runs` event (the in-group turn fold).
- Any other action with a `runs` mark (`nextCompany` with no recorded run): a run of 0. Its parts
  are the game's `revenueParts` at 0, and its mode is that of `zeroRunAction`.
- If no item can be matched (a malformed legacy compound), the run is shown with no amount rather
  than a wrong one. The domain returns `revenue: null`, and the UI shows nothing.

**National companies** (`kind: "national"`, the 1848 BoE) are excluded. Their `runs` mark only
means "operated" (flow.ts comment), and `nationalPayout` stores just the `extra`, not a revenue.
The spec edge case was updated to match.

**Mergers (FR-017)**: in RotLA the merged major is `unstarted` before the merger and gets no
`runs` counter from it (mergers.ts writes status, share, money, asset and market events, plus the
`identity` counter). It has no runs, so it shows no revenue until it runs. A test pins this down.

**Alternatives considered**:
- Store the revenue in state (a new counter or field). Rejected: FR-019 says no new recorded
  events. Replaying already gives the answer.
- Sum the bank's payout transfers. Rejected: unowned IPO shares in 1830 pay nobody, so the sum is
  not the revenue.
- Read the state's `runs` counter. Rejected: it is a count, not an amount.

## R6. How the run was paid

**Decision**: Take it from the company's run-related `marketMove` in that group: reason `payout`
or `restack` → full, `withhold` → withheld, `half` → half. With no such move, fall back to the
item's `mode`: null means full when the game has a payout choice, and none when its parts are
fixed (21Moon). In 21Moon the sheet lists the parts instead of a mode.

**Rationale**: the move reflects what really happened, including a forced withhold
(receivership) and "a full payout of 0 is a withhold" (payout.ts). The action's `mode` alone
would miss both.

## R7. Highlighting the subject's movements (FR-006)

**Decision**: A pure helper `focusBreakdown(breakdown, subject)` stably reorders `movements` and
`balances`, putting the subject's entries first and marking them (`mine: true`). The UI gives
marked lines a `.history-mine` class (bold, with a leading marker, so color is not the only cue).

## R8. Performance

**Decision**: Compute `involves` per group with `useMemo` on `[log, subject]`, and `lastRun` with
`useMemo` on the effective log, once per company card render pass.

A ~160-action game folds in well under a millisecond. `operatingPhase` already does the same fold
on the Table. `tests/domain/perf.test.ts` gets a case to guard it.

## R9. Text

**Decision**: New keys go in `src/i18n/contract/ui.ts`, with es (Uruguayan) and en values:
- `history.subjectTitle`
- `history.emptyFor`
- `history.showInFull`
- `sheets.history` (button)
- `table.companyCard.lastRun`
- `sheets.company.lastRun(amount, or)`
- the mode labels `full` / `withheld` / `half`

Spanish labels: "Historial", "Ver en el historial completo", "Última corrida", "repartió",
"retuvo", "mitad". The OR label reuses `domainText.orHeading`.
