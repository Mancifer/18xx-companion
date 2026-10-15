# Contract: UI changes

**Feature**: [../spec.md](../spec.md) · **Research**: [../research.md](../research.md)

All labels are in Uruguayan Spanish (voseo). Touch targets are ≥ 48 px. Color is never the only
cue.

## 1. Player sheet (`PlayerSheet` + `HolderSheet`)

```text
┌ Ana ─────────────────────────── ✕ ┐
│ $420                              │
│ ┌ Jugada ───────────────────────┐ │
│ │ [Vender 1 PRR · $67] [Vender 1 B&O · $90] │  (SR only, one per holding with a price)
│ │ [Vender acciones] [Comprar acción] │
│ │ [Canjear privada…]            │ │  (only if she holds an exchangeable private)
│ └───────────────────────────────┘ │
│ ┌ Ajustes ──────────────────────┐ │
│ │ [Pagar…] [Cobrar del banco]   │ │
│ │ [Fijar dinero] [Mover acciones]│ │
│ │ [Ajustar deuda] [Declarar quiebra] │
│ └───────────────────────────────┘ │
└───────────────────────────────────┘
```

- "Vender acciones" is disabled when the player holds no shares with a price. Its `title` reads
  "No tiene acciones para vender".
- In an SR the stock buttons come first in "Jugada". In other rounds "Canjear privada…" comes
  first, and there are no quick-sell buttons.
- A quick-sell button dispatches `sellShares { count: 1 }` at once and closes the sheet on ok, so
  a sale takes 2 taps from the Table.

**Sell view** ("Vender · Ana"):

- Company buttons, one per holding with a price: badge + "PRR 30% · $67". The company is
  preselected when there is only one.
- Stepper (− N +), from 1 to the units held.
- Primary button: "Vender N · cobra $X". It dispatches `sellShares` and closes on ok.
- "← Volver" goes back to the menu.

**Buy view** ("Comprar · Ana"):

- Company buttons for open companies. The company is preselected when only one can be bought.
- Stepper (count).
- Source buttons, enabled per `availabilityOf(buyShare)`: "IPO $p", "Pool $p", and "Tesorería $p"
  (RotLA default source). A disabled button shows the reason in its `title`.
- One tap on a source dispatches `buyShare` and closes on ok.

**Accessible names** for tests: the buttons "Vender acciones" and "Comprar acción", the groups
"Jugada" and "Ajustes" (fieldset legends), and the confirm buttons by visible text.

## 2. Operating sheet trains line (`TrainsLine`)

Directly under the sheet title, above the revenue entry:

| State | Text |
|---|---|
| 2 trains, limit 4 | `Trenes 2/4 · 2, 3` |
| A rusted one kept | `Trenes 1/4 · 2 (oxidado), 3` |
| None | `Sin trenes` (warning style) |
| Over the limit | `Trenes 3/2 · 2, 3, 3 · sobre el límite` (warning style) |
| No limit in the phase | `Trenes 2 · 2, 3` |

- A trailing "Corregir…" button opens the train correction view for this company.
- `data-testid="trains-line"`.
- `CompanyCard` keeps its current look ("Trenes: 2 · 3"). It may reuse the formatter.

## 3. Train correction view ("Corregir trenes · PRR")

Reached from the company's "Ajustes" ("Corregir trenes…") or from the trains line.

```text
Quitar un tren
[Quitar el 2] [Quitar el 2] [Quitar el 3]
  ↳ after picking one:
    [Al banco (oferta) · devolver $80]  [✓ devolver] [editar…]
    [Al pool]            (only when the game discards to the pool)
    [Fuera de juego]
Dar un tren
[2 · $80] [3 · $180] …  amount: (Keypad, empty = sin pago)
```

- Choosing a destination dispatches `correctTrain` at once. Warnings show in the undo toast as
  for any action.
- Turning the refund off sends `amount: 0`. Editing it sends the typed amount. The default sends
  `null` (list price).

## 4. History (`History.tsx`)

```text
┌ 🚂 Ronda de operaciones 2.2 · en curso ┐   ← section header (class round-header)
│ 14:02 Siguiente compañía …            │
│ 13:58 PRR corre 240, paga …           │
└ Inicio · Ronda de operaciones 2.2 ────┘   ← start band (class round-start)
┌ 🚂 Ronda de operaciones 2.1 · terminada ┐
│ 13:40 Fin de la OR 2.1 · empieza la OR 2.2 … │
│ …                                     │
└ Inicio · Ronda de operaciones 2.1 ────┘
```

- Each section is a `<section aria-label="<title>">`, newest first. The entries inside are newest
  first, as today.
- The header shows the icon, the title, and "· en curso" or "· terminada".
- The start band reads "Inicio · <title>".
- An undone round-opening entry stays inside the earlier section, struck through, and opens
  nothing.
- Existing per-entry behavior is unchanged: undo, "Deshacer hasta acá", breakdown, badges.
- Round-end entries use the titles in
  [data-model §3](../data-model.md#3-round-end-title-for-nextcompany-derived).
