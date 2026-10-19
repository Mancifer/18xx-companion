# UI Contract: Badges, Train Cards, Share Sources

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

All labels are in Uruguayan Spanish.

## Domain functions (pure, test-first)

```ts
// src/domain/i18n/mentions.ts
type Mention = { readonly company: CompanyId; readonly text: string };
function markMention(company: CompanyId, text: string): string;
function splitMentions(text: string): readonly (string | Mention)[];
function stripMentions(text: string): string;

// src/domain/i18n/es.ts
type SummaryContext = Pick<ActionContext, "game" | "players"> &
  Partial<Pick<ActionContext, "state">> & { readonly marks?: true };
function companyTrains(game, state, company): { cards: TrainCard[]; count: number; limit: number; over: boolean };

// src/domain/actions/expand/stock.ts
function shareSources(ctx: ActionContext, company: CompanyId): readonly ShareSource[];
```

**Invariants (tested)**:
- For every summarizer, `stripMentions(fn(a, { ...ctx, marks: true }, ev)) === fn(a, ctx, ev)`.
  This covers `summaryEs`, `proposalSummaryEs`, `movementLineEs`, `balanceLineEs` and
  `undoneEs`.
- Without `marks`, no output contains U+E000, U+E001 or U+E002. The voice prompt, snapshot and
  replies are byte-identical to before.

## Components

### `CompanyBadge` (extended)

```tsx
<CompanyBadge company={def} size="sm" | "md" | "lg" | "inline" name?={string} label?={string} />
```

- `label` overrides the visible text, which defaults to `shortName`. Mentions of a full name pass
  it.
- `inline` sizes the badge to the surrounding text (research R3).
- Every size gets the translucent inset outline.
- `title` shows the full name (or the second identity), as today (FR-006).

### `RichText` (new, `src/ui/components/RichText.tsx`)

```tsx
<RichText text={string} game?={GameDefinition} />
```

- Renders `splitMentions(text)`. Plain parts render as text. Each mention renders as
  `<CompanyBadge size="inline" label={m.text} />` if the company is in the game, and as plain
  `m.text` otherwise.
- `game` defaults to the open session's `meta.game`. Passing it lets tests render the component
  without a session.
- `textContent` equals `stripMentions(text)`.

**Used by**:
- `History` (summary, struck original, movements, balances).
- `IncomeSheet` movement labels.
- `OperateSheet` recent entries.
- `UndoToast`.
- `UndoRangeSheet`.
- `BatchSheet`.
- `ConfirmationCard`. Its text is recomputed with `marks: true` from `proposal.action` and
  `proposal.events`.

### Direct badge sites

`CompanyBadge size="sm"` replaces the short-name text at these sites:
- **Table**:
  - the sheet titles "Administración de [X]", "Quiebra de [X]" and "Cerrar [X]";
  - the "Operar [X]" button.
- **Results**: the company column.
- **Market**: the move prompt.
- **OperateSheet**: the out-of-turn notice.
- **StockSheet**: the CR company traders.
- **MergerSheet**: the "into" buttons, which show `[X] Name / AltName`.

`aria-label`s keep plain text.

### `TrainCards` (new, `src/ui/components/TrainCards.tsx`)

```tsx
<TrainCards company={CompanyId} size?="sm" | "md" />
```

- Rendered as `<span role="list" aria-label="Trenes" class="train-cards">`.
- Each card is `<span role="listitem" class="train-card[ rusted]">`. It holds the label and, when
  rusted, `<span class="train-card-note">oxidado</span>`.
- The cards wrap and never scroll horizontally.

### `TrainsLine` (operate view, reworked)

- `data-testid="trains-line"` is kept.
- With no trains it shows "Sin trenes" in warn style, as today.
- Otherwise it shows, in order:
  - "Trenes {count}/{limit}". When there is no limit it shows "Trenes {count}".
  - `<TrainCards size="md" />`.
  - "sobre el límite" in warn style when `over`.
  - The "Corregir…" button when `onCorrect` is set.

### `CompanyCard`

- `<TrainCards size="sm" />` replaces "Trenes: 2 · 3".
- "Préstamos: N" stays as text.

### `StockSheet`: share sources

- Shown above the count stepper as `<ul class="share-sources" aria-label="Acciones disponibles">`.
- Each item is `<li class="share-source[ empty]" data-testid="source-{ipo|pool|treasury}">` and
  holds three parts:
  - a label: "IPO", "Pool" or "Tesorería";
  - a value: the units, plus " agotada" when 0;
  - a price: "a $90", or "—" when there is no price.
- The old inline "IPO n · Pool n · …" line and the trailing "Pool a $X" line are removed.
- The trader rows and buttons are unchanged.

### `Market`: companies in play only (US5, added 2026-10-15)

- **Hidden tokens**: tokens of companies with `status === "closed"` are not rendered, on any cell
  or in the "Sin ficha en el mercado" section. If none remain there, that section is not shown.
- **Unchanged**: every other status shows as before, and every cell, including RotLA's "Cerrada",
  is still drawn.
- **Selection**: if the selected company becomes closed, the selection is cleared, and the prompt
  returns to "Arrastra una ficha, o tócala y después toca una casilla."
