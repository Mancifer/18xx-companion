# Research: Reliable Play History

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-12

Every unknown from the plan's Technical Context is resolved here. Code references point at the state of `master` on 2026-10-12.

## R1. How an undo is recorded

**Decision**: Add one new ledger entry kind, `undo`, that lists the groups it undoes:

```ts
interface UndoEntry { kind: "undo"; seq: number; at: string; groupIds: readonly GroupId[] }
```

- One user intent writes exactly one `undo` entry. A normal undo lists one group. "Undo back to here" lists the chosen group and every later active group, newest first.
- `track()` in `src/domain/ledger/effectiveLog.ts` marks every listed group `reverted`, whatever its versions. An amended group from an older session is undone as a whole, not "un-corrected".
- The store never writes `revert` or `amend` entries again. Both kinds stay readable, with today's semantics, so older logs replay unchanged (R7).

**Rationale**:
- A single entry keeps "undo back to here" atomic with the existing one-entry `appendEntry` transaction. It needs no new repository method.
- The legacy `revert` pops an amendment before it reverts a group. Reusing it would turn "undo" on a corrected entry into "undo the correction", which the spec rules out ("can be undone like any other entry").
- The primitive event vocabulary does not change. `undo` is ledger bookkeeping, like `revert` (constitution I).

**Alternatives considered**:
- *N `revert` entries in one transaction*: needs a new `appendEntries` write path, and inherits the amendment-popping semantics above.
- *A `revert` entry with an optional `whole: true` flag*: still one entry per group. It mixes two meanings in one kind and makes legacy reading conditional on a flag.
- *Truncating the log*: violates constitution I (events are never deleted) and FR-017 (undone entries stay visible).

## R2. Enforcing undo order (FR-001 to FR-006)

**Decision**: The store exposes two operations and drops `revert(groupId)`, `amend` and `dependentsOf`:

- `undoLast()`: undoes the newest active group that is not setup. No confirmation (FR-004).
- `undoTo(groupId, { confirmed })`: the range is the target plus every later active group.
  - If the range has one group (the target is the newest), it behaves like `undoLast()`.
  - Otherwise, without `confirmed`, it returns `{ ok: false, error: "confirmRange", range }`, and nothing is written (FR-003).
  - The target must be an active, non-setup group. Otherwise it returns `notFound` ("Esa entrada ya está deshecha" or "Esa entrada no se puede deshacer").

The range comes from `effectiveLog`: every group with `seq >= target.seq`. Groups that an older session already reverted out of order are not in the effective log, so they are skipped. The resulting effective log is exactly the prefix before the target. That is "the state before that entry" by construction.

**Rationale**: Order is enforced in the store, the only writer (constitution I), so the toast, History and voice cannot bypass it. The `confirmRange` error mirrors today's `dependents` handshake, so callers keep the same "ask, then call again with `confirmed`" pattern.

**Alternatives considered**: Enforcing order only in the UI. Rejected: the voice path and any stale toast could still undo out of order and bring back the stale-market bug.

## R3. Why in-order undo fixes the stale-market bug

**Decision**: There is no change to `marketMove` or the reducer. The bug ([assessment](../../.specify/bugs/undo-stale-market-move/assessment.md)) needs a later active group whose stored events were computed from a state that a revert then removed. With newest-first undo, no group stays active after an undone one. Every remaining group was expanded against exactly the state it now replays on.

**Rationale**: Re-expansion (the assessment's preferred fix) and relative market moves are only needed when later entries survive an earlier undo. The clarified spec removes that case.

**Tests**: The assessment's RotLA reproduction (issue → run and pay out → undo back to the issue → price 80) becomes SC-002's test. An 1830 variant covers sell → payout → undo back to the sell.

## R4. Snapshots and performance of a long undo (SC-004)

**Decision**: Keep the current `persist` path. `invalidatedBy` treats an `undo` entry like a `revert` aimed at its **oldest** group (`min seq` of `groupIds`). `rebuild` then replays from the newest snapshot still valid, which is the one at or before the target. Undoing back to the first entry of a 300-entry game replays at most 300 groups from the start.

**Rationale**: `tests/domain/perf.test.ts` already replays 1,500 groups within budget. A 300-group replay is a fraction of that. A new perf case measures `undoTo` back to the first group of a 300-group game through `SessionStore` (fake-indexeddb). The budget is 500 ms in Node, which leaves headroom for SC-004's 2 s on a mid-range phone.

**Alternatives considered**: Caching per-group cursors in memory. Not needed at this scale (YAGNI).

## R5. Deriving the breakdown (FR-010 to FR-016)

**Decision**: Add a pure function `entryBreakdown(game, players, log, groupId)` in a new `src/domain/ledger/breakdown.ts`. It is computed on demand when an entry is expanded, never stored.

1. **Timeline**: which log the entry belonged to.
   - An active group belongs to the current effective log.
   - An undone group belongs to the effective log as of the entry that undid it: `effectiveLog(log.filter(e => e.seq < undoer.seq))`. The undoer is the first `undo` or `revert` entry that marked it reverted.
   - Under in-order undo, that timeline is exactly the game in which the group was applied. For legacy out-of-order reverts it is the closest faithful view.
2. **Before state**: replay the timeline's groups with `seq < group.seq`. **After state**: reduce the group's events (its version in that timeline) on the before state.
3. **Movements**: one line per primitive event, in event order.
   - Money: payer, recipient, amount. Repeated same-direction transfers between the same pair are summed, but opposite directions are never netted, so no step is hidden.
   - Shares: company, from, to, units, presidency.
   - Trains and privates: asset, from, to.
   - Price: company, old price (from the before state), new price, reason.
   - Status: company, old status, new status.
   - Counters: key, holder, delta.
   - Turn and phase markers appear as one effect line, as `effectsEs` does today. Notes are skipped.
4. **Balances**: for each holder whose cash differs between the before and after states, show before → after and the difference. In unlimited-bank games the bank shows only the net amount moved (FR-011).
5. **Totals for payouts** (FR-012): the summary line already carries the total and per-share amount (`summaryEs` with events). The breakdown adds one money line per recipient, from the existing per-recipient `moneyTransfer` events (`src/domain/mechanics/payout.ts`), including the company's own treasury shares.

**Rationale**:
- Everything comes from stored events plus a replay, so older sessions get the breakdown without migration (spec assumption, FR-018).
- Amounts are the events' own integers, so they match the state unit for unit (FR-016).
- One replay of at most a few hundred groups per expanded entry is milliseconds.

**Alternatives considered**:
- *Storing before/after balances in each group*: needs a schema change, does not help older sessions, and duplicates derivable data.
- *Precomputing every entry's breakdown when History opens*: unneeded work. Lazy computation keeps History's first render as fast as today.

## R6. One-line summaries carry the amount (FR-013, FR-014)

**Decision**:
- Audit `summaries` in `src/domain/i18n/es.ts` with a table-driven test. For every action type whose expansion yields exactly one money flow, the line must contain `formatMoney(amount)`.
- `adjustMoney` with `setTo` gains the difference from its event: "Ana: dinero fijado en $520 (+$40)". The previous amount and the bank side are in the breakdown balances, for example "Ana: $480 → $520 (+$40, del banco)".
- Lines that already state the amount stay as they are.

**Rationale**: The summary is the one place every entry is read. A table test makes FR-014 durable as action types are added.

## R7. Sessions saved before this feature (FR-018, edge cases)

**Decision**:
- `track()` keeps reading `revert` (pops an amendment, else reverts) and `amend` (pushes a version), in seq order, exactly as today. `undo` entries are applied in the same walk.
- History status stays `active | reverted | amended`. "amended" shows the badge "corregida", the original line struck through and the latest version, as today. Its actions are the same as for an active entry (no "Corregir").
- Legacy out-of-order reverts stay reverted. A later group of such a session can be undone normally: the range only counts active groups.
- No IndexedDB migration. The entries store holds plain objects, and a new `kind` needs no index change.

**Rationale**: Replaying an older log must give the same state as before the feature (SC-006). Only new writes change.

## R8. Export and import (FR-019)

**Decision**: Bump `EXPORT_VERSION` from 1 to 2 and add the `undo` entry to `EntrySchema`.
- The upgrade step from 1 to 2 is the identity: version-1 files have no `undo` entries.
- A version-2 file opened in an older app is refused by the existing "versión más nueva" check, instead of failing on an unknown entry kind.
- The state hash check is unchanged, because replay defines the state.

**Alternatives considered**: Keeping version 1. An older app would then reject the file with a confusing schema error rather than the clear "update the app" message.

## R9. Voice: undo back to an entry, and requests to correct (FR-005, FR-008)

**Decision**:

- **Snapshot**: the volatile context lists the last **15** active entries with their ids: `- [g42] La EXP compra un tren 3 por $180`. Today it lists 5 without ids. This list is the volatile suffix, so the cached prefix is unaffected (feature 009).
- **`undo` tool**: the schema already has `groupId: string | null`, which is not used today. Its description becomes «deshacer» → `groupId` null; «deshacé hasta la compra del tren de A» → that entry's id.
- **`resolveResponse`**:
  - A `groupId` that is null or names the newest active entry gives `kind: "undo"`, as today.
  - An older active, non-setup id gives a new `kind: "undoTo"` with the range (count, oldest, newest).
  - An unknown, undone or setup id gives `notUnderstood` "No encontré esa entrada. Usá el historial." (touch fallback, constitution IV).
- **Voice controller**: `undoTo` shows the same range-confirmation sheet as touch. Only "Confirmar" calls `undoTo(groupId, { confirmed: true })`.
- **`amendLast`**: the tool name and schema stay, so the voice has a target for "no, eran 260" instead of guessing an action. Its description changes to "Pedido de corregir una entrada anterior". It now resolves to `notUnderstood` with "Para corregir, deshacé hasta esa entrada y volvé a anotarla." Nothing is applied.
- **Prompt**: the line about undo and amend changes to describe both. The voice eval set gets new cases for "undo back to" with an id, and the existing `amendLast` cases keep their expected tool.
- **Re-runs**: eval fixtures must be regenerated, because the snapshot text changes (feature-003 note). The eval must be re-run on the default provider/model before merging (constitution VI).

**Rationale**: Ids in the snapshot let the model point at an exact entry, and the app never trusts model text: the id is validated against the log. Keeping `amendLast` avoids misreading corrections as new actions.

**Alternatives considered**:
- *Matching the entry by summary text in the app*: fuzzy and error-prone.
- *Removing `amendLast`*: "no, eran 260" would then likely map to `adjustMoney` or a payout, and become a confusing proposal.

## R10. History UI (FR-002, FR-003, FR-010, FR-017, SC-003)

**Decision**:
- Each entry is a row with a time, a source icon, badges and the one-line summary. Tapping the row expands it with `<details>`, which is one tap, and shows the movements, the balances, the transcript and the warnings. With History open from the table, every recipient's amount and balance is two taps away (SC-003).
- The newest active non-setup entry shows "Deshacer" on the row.
- Every other active non-setup entry shows "Deshacer hasta acá" inside its expanded panel. Keeping it out of the row avoids accidental taps while scrolling.
- Undone entries keep their breakdown and their "deshecha" badge, and offer no actions.
- The setup entry (`createSession`) offers no undo.
- **`UndoRangeSheet`** replaces `DependentsDialog`, and is shared by History and voice.
  - Title: "¿Deshacer N entradas?"
  - Body: "Desde: <oldest summary>" and "Hasta: <newest summary>", with a note that they stay in the history marked as undone.
  - Buttons: "Cancelar" and a primary "Deshacer N".
- **Removed**: `AmendSheet`, the "Corregir" and "Deshacer corrección" buttons, `isAmendable`, `buildAmend`, `dependentsOf` and `DependentsDialog`.
- **Toast after a range**: "Deshechas N entradas: desde <oldest> hasta <newest>".
- **Strings**: new strings use the Uruguayan voseo and "acá", like the spec's own examples (FR-020).

**Rationale**: Keeping the latest undo one tap away preserves constitution IV for the common case, and the confirmation protects long jumps.

## R11. Every state change has an entry (FR-009)

**Decision**: No new code path. The store's `dispatch` is already the only writer of game state, and `updateMeta` only changes table configuration (chips, name, bank pins), never game state. FR-009 is made durable by a test. For every action type in `ActionSchema` with a fixture, dispatching through `SessionStore` appends exactly one group, and the state equals the replay of the log. A lint-style test also asserts that no module outside `src/app/SessionStore.ts` calls `appendEntry`.

**Rationale**: The guarantee exists by design (constitution I). A test keeps it from eroding.

## R12. Constitution wording

**Decision**: Constitution I ("amend reverts and appends a corrected event in the same group") and IV ("Every applied action MUST be undoable in one tap. Undo and amend operate on whole event groups") describe amend and one-tap undo of any action. This feature removes amend and makes only the latest action one-tap undoable. Older actions are undone with "undo back to here" plus a confirmation.

The deviation was recorded in the plan's Complexity Tracking and resolved before implementation: the constitution was amended to v2.0.0 (MAJOR, 2026-10-12), rewording I and IV (undo marks groups as reverted, newest first; one tap undoes the latest action; older actions go back with a confirmed range; amend is retired).

**Rationale**: The table chose in-order undo for correctness (spec clarifications), which is the purpose of principles II and IV.
