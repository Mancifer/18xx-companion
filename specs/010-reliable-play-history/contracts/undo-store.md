# Contract: Undo in the Session Store

Replaces `revert`, `amend` and `dependentsOf` on `SessionStore` and `useDispatch`. Shapes are in [data-model §1, §3, §4](../data-model.md).

## Operations

### `undoLast(): Promise<UndoResult>`

- **Target**: the newest effective group whose action is not `createSession`.
- **No target**: `{ ok: false, error: "notFound", messageEs: "No hay nada que deshacer" }`.
- **Otherwise**: appends `UndoEntry { groupIds: [target] }` with no confirmation (FR-004), then returns `{ ok: true, entry, undone: [target] }`.

### `undoTo(groupId: string, options?: { confirmed?: boolean }): Promise<UndoResult>`

The range is `undoRangeOf(log, groupId)`.

**Refusals** (nothing is written):

| Condition | Result |
|---|---|
| Unknown id | `notFound`, "Esa entrada no existe" |
| The group is already reverted | `notFound`, "Esa entrada ya está deshecha" |
| `createSession` | `notFound`, "Esa entrada no se puede deshacer" |
| `range.count > 1` and not `confirmed` | `{ ok: false, error: "confirmRange", messageEs: "Se van a deshacer N entradas", range }` |

**Success**: when `range.count === 1`, or `confirmed` is true, the store appends **one** `UndoEntry { groupIds: range.groups.map(g => g.id) }` (newest first) and returns `{ ok: true, entry, undone }`.

### Removed

`revert(groupId?)`, `amend(...)`, `dependentsOf(...)`, the `dependents` error, and `ConfirmOptions`.

## Guarantees

1. **Order**: no call can make a group reverted while a later group stays effective. The only exception is legacy entries that already were (FR-001, FR-006).
2. **Exact state**: after a successful `undoTo(g)`, `state` deep-equals the state the store held just before `g` was dispatched (SC-001). After `undoLast()`, it equals the state before the newest group.
3. **Atomic**: one `appendEntry` call per undo. A persist failure leaves the log, the state and the snapshots unchanged, and returns `persist`.
4. **Snapshots**: snapshots with `seq >= oldest.seq` are dropped in memory and in IndexedDB (`deleteSnapshotsFrom(oldest.seq)`). The rebuild starts from the newest remaining snapshot.
5. **Game end**: `gameEnd`, `autoEndGroups` and the Home `outcome` are recomputed from the rebuilt cursor and written in the same transaction, as for any entry (feature 007). Undoing past an automatic end reopens the game. Undoing past an end-of-round group undoes its end step, which is in that group's events (FR-007).
6. **Serialized**: like `dispatch`, both operations go through the store queue.

## `useDispatch` (`src/app/useSession.ts`)

```ts
undoLast(): Promise<UndoResult>          // pushes feedback { kind: "reverted", groups }
undoTo(groupId, { confirmed? }): Promise<UndoResult>
```

- On `confirmRange`, nothing is pushed. The caller opens `UndoRangeSheet`.
- On another error, `{ kind: "error", messageEs }` is pushed.
