# Data Model: Reliable Play History

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Only the ledger gains a stored shape (`UndoEntry`). Everything else here is derived on demand and never persisted. Primitive events, actions, game definitions and session meta do not change.

## 1. Ledger entries (`src/domain/ledger/entries.ts`)

```ts
type LogEntry = GroupEntry | RevertEntry | AmendEntry | UndoEntry;

/** New (R1). Written for every undo from this feature on. */
interface UndoEntry {
  readonly kind: "undo";
  readonly seq: number;
  readonly at: string;              // ISO time of the undo
  readonly groupIds: readonly GroupId[]; // newest first; length ≥ 1
}
```

| Kind | Written after this feature? | Read semantics |
|---|---|---|
| `group` | yes (dispatch) | unchanged |
| `revert` | **no** (legacy only) | unchanged: pop latest amendment, else mark reverted |
| `amend` | **no** (legacy only) | unchanged: push a version unless reverted |
| `undo` | yes (undoLast, undoTo) | mark every listed group reverted, whatever its versions |

**Validation (store, before writing)**:

- `groupIds` is non-empty and equals the target plus every later effective group, in descending seq.
- Each listed group is currently effective (active or amended), and none is setup (`action.type === "createSession"`).
- `seq` is greater than every existing entry's seq (`nextSeq`).

**Snapshot invalidation**: an `undo` entry invalidates every snapshot with `seq >= min(seq of groupIds)` (R4).

## 2. Group status (`effectiveLog.ts`)

`GroupStatus = "active" | "reverted" | "amended"`. The values are unchanged.

```text
active ──undo──▶ reverted        (terminal: no redo)
amended ──undo──▶ reverted       (whole group, all versions; new in this feature)
amended ──legacy revert──▶ active/amended (pops one version; old logs only)
```

`GroupHistory` gains `undoneBy?: number`: the seq of the `undo` or `revert` entry that reverted the group. It is used to find the group's timeline (§5).

## 3. Undo range (derived)

```ts
interface UndoRange {
  readonly targetId: GroupId;
  readonly groups: readonly EffectiveGroup[]; // newest first
  readonly count: number;                     // groups.length
  readonly oldest: EffectiveGroup;            // the target
  readonly newest: EffectiveGroup;
}
```

`undoRangeOf(log, targetId)` returns `undefined` when the target is not effective or is setup. With `count === 1`, the range is a plain undo, and no confirmation is needed (FR-004).

## 4. Store results (`src/app/SessionStore.ts`)

```ts
type UndoResult = { ok: true; entry: UndoEntry; undone: readonly EffectiveGroup[] } | StoreError;

type StoreError =
  | { ok: false; error: "invalid" | "unavailable" | "persist" | "notFound"; messageEs: string; ... }
  | { ok: false; error: "confirmRange"; messageEs: string; range: UndoRange }; // replaces "dependents"
```

**Removed**: `AmendStoreResult`, `RevertResult`, `ConfirmOptions` (renamed `UndoOptions { confirmed?: boolean }`), the `dependents` error and `dependentsOf`.

## 5. Entry breakdown (derived, `src/domain/ledger/breakdown.ts`)

```ts
interface EntryBreakdown {
  readonly groupId: GroupId;
  readonly status: GroupStatus;
  readonly movements: readonly Movement[]; // event order
  readonly balances: readonly BalanceChange[]; // holders whose cash changed, players → companies → bank/pool/other
}

type Movement =
  | { kind: "money"; from: HolderRef; to: HolderRef; amount: number }  // same-direction repeats summed
  | { kind: "shares"; company: CompanyId; from: HolderRef; to: HolderRef; units: number; presidency: boolean }
  | { kind: "asset"; asset: AssetId; from: HolderRef; to: HolderRef }   // trains, privates
  | { kind: "price"; company: CompanyId; from: number | null; to: number | null; reason: MarketMoveReason }
  | { kind: "status"; company: CompanyId; from: CompanyStatus; to: CompanyStatus }
  | { kind: "counter"; subject: HolderRef; key: string; delta: number }
  | { kind: "turn"; text: string }; // round/phase/turn markers, as effectsEs words them

interface BalanceChange {
  readonly holder: HolderRef;
  readonly before: number | null; // null: unlimited bank (amount only, FR-011)
  readonly after: number | null;
  readonly delta: number;
}
```

**Derivation rules** (R5):

- **Timeline**: an effective group uses the current effective log. A reverted group uses `effectiveLog(log entries with seq < undoneBy)`.
- **Before state**: replay the timeline's groups with `seq < group.seq`, from `startCursor`.
- **After state**: `reduceAll(before, version.events)`, where the version is the group's latest version in that timeline.
- **Price**: `from` is the price at the company's position in the before state, and `to` is the price of the event's cell. `null` is used when there is no price, for example a closed or receivership cell. The UI labels it as `effectsEs` does.
- **Invariants**: `Σ money movements into h − Σ out of h === balance.delta` for every non-bank holder. Unit tests assert this for random games (FR-016).

## 6. Voice result (`src/voice/resolve.ts`)

```ts
type VoiceResult =
  | ...existing kinds except "amend"...
  | { kind: "undoTo"; transcript: string; groupId: GroupId; range: UndoRange };
```

- **Removed**: `kind: "amend"`. `amendLast` now resolves to `notUnderstood` with the instruction to undo back to the entry (R9).
- **Snapshot change**: the recent-entries block lists up to 15 effective, non-setup groups, each as `- [<id>] <summaryEs>`.

## 7. Feedback (`src/app/AppProvider.tsx`)

```ts
type Feedback =
  | ...
  | { kind: "reverted"; groups: readonly GroupEntry[] }; // was: group; length > 1 → range toast
```

The `amended` feedback kind is removed.

## 8. Export file (`src/persistence/exportImport.ts`)

- `EXPORT_VERSION` changes from 1 to 2.
- `EntrySchema` adds `{ kind: "undo", seq, at, groupIds: string[] (min 1) }`.
- Version 1 → 2 upgrade: identity.
- `revert` and `amend` entries stay importable.
