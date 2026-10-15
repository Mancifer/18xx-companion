# Data Model: Action Menus UX

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

There are no new stored entities, no new primitive events, and no IndexedDB or export change. The
feature adds one action type and two derived (never stored) views.

## 1. Action `correctTrain` (new, recorded)

A correction that moves one train between a company and the supply, the pool, or out of the game,
with optional money. Full schema, events and summaries: [contracts/actions.md](contracts/actions.md).

| Field | Type | Rules |
|---|---|---|
| `type` | `"correctTrain"` | |
| `company` | CompanyId | Must exist. |
| `train` | string | An asset id (`train:2:3`) or a train type (`2`). For `add`, it must be a type. |
| `op` | `"remove"` \| `"add"` | |
| `to` | `"bank"` \| `"pool"` \| `"removed"` \| null | Required for `remove`. Must be null for `add`. `"pool"` only when `game.discardedTrainsTo === "pool"`. |
| `amount` | integer ≥ 0 \| null | remove → bank: the refund (null = list price, 0 = none). add: the payment (null or 0 = none). remove → pool/removed: the UI sends null; an amount > 0 (voice) is recorded with the `refundOffSupply` warning. |

**Train chosen when `train` is a type**:

- remove: the company's highest-numbered train of that type (the latest purchase).
- add: the bank's lowest-numbered train of that type. For unlimited types, the next number is
  minted.

**Expansion** (one group; triggers below):

| Case | Events |
|---|---|
| remove → `to` | `assetTransfer(train, company → to)` · `counterChange(company, rusted:<train>, −1)` if it had one · `moneyTransfer(bank → company, refund)` if refund > 0 (to bank: `amount ?? list price`; to pool or removed: `amount ?? 0`) |
| add | `assetTransfer(train, bank → company)` · `moneyTransfer(company → bank, amount)` if amount > 0 |

**Triggers**: `phaseTrigger` and `privateClosingTrigger` add nothing for `correctTrain`
(`CORRECTION_ACTIONS`). Float and presidency triggers are unaffected, since no shares move.

**Invariants (Principle II)**: money moves only through `moneyTransfer` between the bank and the
company, so the totals are conserved. Shares are untouched.

**State transitions of the train asset**:

```text
company ──remove/to=bank──▶ bank (buyable again)
company ──remove/to=pool──▶ pool (buyable from the pool)
company ──remove/to=removed──▶ removed (out of the game)
bank ──add──▶ company
```

## 2. Round section (derived, History only)

Computed by `roundSections(game, history)` ([research R7](research.md#r7-history-round-sections-fr-018-to-fr-021)).
It is never stored.

| Field | Type | Meaning |
|---|---|---|
| `key` | string | `SR:3`, `OR:2.1`, `MR:4`, `CR:2`, `PRIVATES`, or `SETUP`. Stable across renders. |
| `round` | `Round` \| `"SETUP"` | Round type, for the icon and title. |
| `title` | string | "Ronda de operaciones 2.1", "Ciclo 2 · Ronda de operaciones 1/2", "Preparación"… |
| `icon` | string | 📜 💼 🚂 🔀 🏛, or ⚙ for setup. |
| `startGroupId` | GroupId \| undefined | The active group that opened the round. Undefined for SETUP. |
| `groupIds` | GroupId[] | Every group (active or reverted) in this section, oldest first. |
| `finished` | boolean | A later section exists. |

**Rules**:

- Only active groups' `turnAdvance` events move the round. A reverted group stays in the section
  of its position and never opens one.
- Sections are contiguous and in seq order, and every group belongs to exactly one.
- An empty round (a start with no other entries) still has a section with one group.
- Equal keys that are not adjacent (for example a `setTurn` back to an earlier round) form
  separate sections. Each one is labeled with its own title.

## 3. Round-end title for `nextCompany` (derived)

Derived from the group's events at display time ([research R8](research.md#r8-titles-for-round-ending-nextcompany-entries-fr-022-fr-023)):

| Events contain | Title |
|---|---|
| `turnAdvance` with `round: "OR"`, `orSet: S`, `orIndex: I` | Fin de la OR S.(I−1) · empieza la OR S.I |
| same, in a game played in cycles (`cycleCount(game)` defined; `orsInSet: N`) | Fin de RO (I−1)/N · empieza RO I/N |
| `turnAdvance` with `company: null` and no `round` | Fin de las rondas de operaciones (the next round is not named: it is an SR or, in RotLA from green on, an MR) |
| neither | Siguiente compañía |

When the group also recorded a zero run, the title is prefixed: "PRR no corrió · …".

## 4. Player sheet sections (UI state only)

| Section | Contents (in order) |
|---|---|
| Jugada | SR: one "Vender 1 <company> · $p" per holding with a price, then Vender acciones…, Comprar acción…, Canjear privada (if any). Other rounds: Canjear privada (if any), Vender acciones…, Comprar acción… (no quick-sell buttons). |
| Ajustes | Pagar…, Cobrar del banco, Fijar dinero, Mover acciones, Ajustar deuda, Declarar quiebra |

The sell and buy forms keep local state only (company, count, source) until dispatch.
