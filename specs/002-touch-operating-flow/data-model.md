# Data Model: Touch-First Operating Flow

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

This feature adds **no new persisted state, event types or action types**. Everything below is
either derived from the existing event log or temporary UI state.

## Existing state used (unchanged)

| Field | Where | Use here |
|-------|-------|----------|
| `turn.round` | `TurnState` | Which controls to show (OR / SR / PRIVATES). |
| `turn.currentCompany` | `TurnState` | The company whose turn is open; target of the primary control. |
| `turn.operatedThisOR` | `TurnState` | "Run recorded" for the current company (FR-003). Set by any `runs` counter increase. |
| `turn.operatingOrder` | `TurnState` | Snapshot of the order. Display uses the live `operatingOrder()`. |
| `assets["private:<id>"]` | `SessionState` | Holder of each private, for purchasability. |
| `group.warnings` | ledger entry | Carries the new `outOfTurn` and `noRunRecorded` warnings into History. |

## Derived entities (pure queries, `src/domain/queries.ts`)

### Operating turn — `turnActivity(effective, state, company)`

| Field | Type | Rule |
|-------|------|------|
| `company` | `CompanyId` | The input. |
| `runRecorded` | `boolean` | `state.turn.operatedThisOR.includes(company)`. |
| `groups` | `Group[]` | Effective groups after the latest group containing an OR `turnAdvance` (`orIndex` set) whose `action.company === company`. Stored operating actions already name the company: the pipeline fills `null` with the current company (`withCurrentCompany`, `src/domain/actions/resolve.ts`). |
| `canFinish` | `boolean` | `round === "OR"`, `company === currentCompany`, and `runRecorded`. |

State transitions of a company's turn within one OR:

```text
waiting ──(becomes current)──▶ open ──(run / no run recorded)──▶ run-recorded ──(finish turn = nextCompany)──▶ done
   ▲                              │                                    │
   └──────────── undo ────────────┴──────────────── undo ──────────────┘
open ──(nextCompany by voice, confirmed)──▶ done   [records "no run", warning noRunRecorded]
```

Optional actions (train, cost, bank payment, private, loan, discard) may happen in `open` or
`run-recorded` and do not change the turn state.

### Upcoming companies — `upcomingCompanies(game, state, n = 2)`

`operatingOrder(game, state)` without `currentCompany`, without `operatedThisOR`, first `n`. This
is recomputed on every render, so price moves within the OR are reflected (spec Story 3,
scenario 4).

### Purchasable private — `purchasablePrivates(game, state)`

A private `p` is purchasable when all of these hold:

- its holder is not `removed`, and the private is not closed;
- the holder is `bank`, **or** `privateResaleOpen(game, state)` is true.

The control is shown when `round ∈ {PRIVATES, SR}` and the result is non-empty.

## UI-only state (never logged)

### Turn draft — held in `OperateSheet`

| Field | Type | Lifetime |
|-------|------|----------|
| `amounts` | `Record<partId, number \| null>` | While the sheet for this company is mounted. Cleared after a successful payout. Dropped when the sheet closes. |
| `editingPart` | `string` | Same. |
| `view` | `"run" \| "train" \| …` | Same. Returns to `"run"` after any successful sub-view action. |

### Out-of-turn mode — `OperateSheet` prop

`outOfTurn: boolean`, true when opened from the details sheet for a company that is not current.
It shows a banner and hides "finish turn" and "no run".

## Warnings added (codes)

| Code | Severity | Raised by | Message (es) |
|------|----------|-----------|--------------|
| `outOfTurn` | `warn` | operating actions in OR when company ≠ current | `{X} opera fuera de turno (le toca a {Y}).` |
| `noRunRecorded` | `warn` | `nextCompany` when current company has no run | `No se registró la operación de {X}: cuenta como que no corrió y su acción baja.` |
