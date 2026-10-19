# Data Model: UI Readability Polish and RotLA Major Names

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Nothing is persisted or changed in the ledger. Every shape below is **derived** at render time
from the game definition and session state. The one data change is the RotLA definition (R6).

## Mention (R1)

A company named inside a sentence.

| Field | Type | Notes |
|---|---|---|
| `company` | `CompanyId` | Resolved against `game.companies`. If it is unknown, the text renders as plain text. |
| `text` | `string` | The words the plain sentence has at that spot: a short name or a full name. |

**Encoding** inside a string: `"\uE000" + company + "\uE002" + text + "\uE001"`.

**Rules**:
- Produced only when `SummaryContext.marks === true`.
- `stripMentions(s)` replaces each mention with its `text`, giving exactly the plain string.
- `splitMentions(s)` returns `(string | Mention)[]`. Adjacent plain parts are merged, and empty
  strings are dropped.
- A malformed marker (no terminator) runs to the end of the string. If it has the U+E002
  separator, its shown text (after the separator) is kept as plain text. Otherwise only the
  private-use characters are removed. Markers are never shown raw.

## Train card (R4)

`companyTrains(game, state, company)` returns:

| Field | Type | Notes |
|---|---|---|
| `cards` | `{ asset: string; label: string; rusted: boolean }[]` | `label` is the train type's `displayName`. The list is sorted by definition order, then train number. |
| `count` | `number` | Trains counting toward the limit (`countedTrains`). |
| `limit` | `number` | `trainLimitFor`. It is `Infinity` when there is no limit. |
| `over` | `boolean` | `count > limit`. |

`trainsLineEs` is defined on top of it and returns the same text as today.

## Share source (R5)

`shareSources(ctx, company)` returns an ordered `ShareSource[]`:

| Field | Type | Notes |
|---|---|---|
| `source` | `"ipo" \| "treasury" \| "pool"` | The display order is the order listed here. |
| `units` | `number` | `unitsOf` for the matching holder (`ipo:X`, `company:X`, `pool`). |
| `price` | `number \| undefined` | `sharePrice(game, state, company, source)`. |

**Visibility**:
- `ipo`: hidden when `defaultBuySource === "treasury"`, or when the IPO is empty and the
  treasury holds shares. These are today's rules.
- `treasury`: shown when it holds shares, or always when `defaultBuySource === "treasury"`.
- `pool`: always shown.

**Empty source**: when `units === 0`, the UI shows the source as "agotada".

## Major identity pair (R6)

These are the existing `CompanyDef` fields, with values changed for INT, FED, EXM, AUT and LGE.

| Field | Change |
|---|---|
| `name`, `shortName`, `color`, `textColor`, `aliases` | unchanged |
| `altName` | becomes the real second name (R6 table) |
| `altAliases` | becomes the real aliases. The "… dos" placeholders are removed. |

`GameDefinition.verification.companies` for RotLA changes from `"unverified"` to `"verified"`.
