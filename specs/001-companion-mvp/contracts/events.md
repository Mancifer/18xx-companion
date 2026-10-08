# Contract: Primitive Events

Source of truth: `src/domain/events/types.ts`. The reducer is `src/domain/events/reduce.ts`.
This vocabulary is closed. Adding a primitive needs a plan amendment (constitution I).

```ts
type PrimitiveEvent =
  | { t: "moneyTransfer"; from: HolderRef; to: HolderRef; amount: number }          // amount > 0, integer
  | { t: "shareTransfer"; company: CompanyId; from: HolderRef; to: HolderRef;
      units: number; presidency?: boolean }                                          // units > 0
  | { t: "marketMove"; company: CompanyId; to: CellRef;
      reason: "payout" | "withhold" | "half" | "sell" | "soldOut" | "poolPenalty" | "issue"
        | "loan" | "par" | "manual" | "receivership" }
  | { t: "companyStatus"; company: CompanyId;
      status: "unstarted" | "parred" | "floated" | "receivership" | "bankrupt" | "closed";
      parPrice?: number; floatConfirmed?: boolean; capitalPending?: boolean }
  | { t: "assetTransfer"; asset: AssetId; from: HolderRef; to: HolderRef }
  | { t: "turnAdvance"; round?: "PRIVATES" | "SR" | "CR" | "OR"; srNumber?: number; scheduleIndex?: number; orSet?: number;
      orIndex?: number; orsInSet?: number; operatingOrder?: CompanyId[];
      company?: CompanyId | null; phase?: string }
  | { t: "counterChange"; subject: HolderRef; key: "debt" | "eastWestTokens" | string; delta: number }
  | { t: "note"; text: string };
```

## Reducer guarantees

- Pure: `reduce(state, event) → state`. No I/O, clock, or randomness.
- It **never rejects** an event. Validation happens before append, and replay of a stored log
  must always succeed. An event that cannot be meaningful (for example, moving shares a holder
  does not have) still applies arithmetically and produces an invariant warning.
- `marketMove` into an already-occupied cell gives the company `stackOrder = max + 1`, which
  places it underneath (1848 §11.3).
- `shareTransfer` with `presidency: true` moves the presidency marker together with its units.
- Per-round fields are derived, not stored by a dedicated event (data-model §5): `runs`
  counters feed `hasOperated` / `operatedThisOR`, loan `assetTransfer`s feed `loansThisOR`,
  player→pool `shareTransfer`s during an SR feed `soldThisSR`, and a `turnAdvance` that changes
  the round, OR set/index or SR number clears the per-round sets. Standard `counterChange`
  keys: `debt`, `eastWestTokens`, `runs`, `bankrupt`, `nationalTakeovers`.

## Tests required (test-first)

- Every primitive: a positive case, plus a conservation property test (random sequences of
  transfers keep the totals).
- Replay determinism: `reduce(log)` twice gives deep-equal states, and snapshot + tail equals
  the full replay.
