# UI Contract: UI Layout Polish (016)

Spanish text shown; every string also exists in English (`src/i18n/en`). New strings go in the
catalogs, Uruguayan wording for Spanish.

## §1 Table action row and menu (US1)

- `.round-controls` **starts** with a **"Historial"** button in every round, finished games
  included (amended 2026-11-08: first, not last, since it is the one control in every round).
  Tap → History screen (`go({ name: "history" })`); back returns to the Table.
- No "Lote de acciones" in `.round-controls`.
- Menu (☰) during a stock round: **"Lote de acciones"** after "Historial", opens the same
  `BatchSheet`. Not shown in other rounds.
- Existing tests that find "Lote de acciones" on the Table open the menu first.

## §2 Player sheet holdings (US2)

Order inside the sheet: cash figure (unchanged) → holdings → "Jugada" → "Ajustes".

```
Acciones
 PRR   40% ★   3 cert.   [Vender 1 · $67]
 B&O   20%     2 cert.   [Vender 1 · $90]
 C&O   10%     1 cert.   no cuenta        [Vender 1 · $112]
Certificados: 11 / 16
```

- One row per `HoldingRow` (data-model). Company by `CompanyBadge` (short name, never color only).
- `%` followed by `★` when president; certificates as "N cert."; "no cuenta" text when
  `counts === false`.
- Stock round: the row ends with today's quick sell button (`sellShares`, count 1) labelled
  `sellOne` + price. Other rounds: the row ends with **"Vender…"**, which opens the existing
  sell view (count stepper) with that company preselected.
- Total line (**moved to the sheet header by US7, see §6**): `Certificados: {counted} / {limit}`; without a limit: `Certificados: {counted}`.
  When `total !== counted`, append `({total} en total)`.
  `level === "at"` → badge "en el límite" (warn); `"over"` → badge "sobre el límite" (danger).
  Text badges, never color alone; nothing disabled.
- No holdings: one muted line "Sin acciones"; no total line.
- "Vender acciones" (count picker) and "Comprar acción" stay in "Jugada"; the old row of quick-sell
  buttons in "Jugada" is removed.
- At 360 px wide no row overflows; long lists scroll with the sheet.

## §3 Microphone and Home notice (US3)

- Table: `MicButton` and `VoicePanel` render iff `voiceEnabled(lang)` and there is no setup issue
  (data-model `voiceSetupIssue`). Offline keeps today's disabled mic with its reason line; a
  disabled mic has `pointer-events: none` and ignores pointer events.
- Home, top of the screen, when there is a setup issue:
  `<p role="note">{reason}</p> <button>Abrir ajustes</button>` → Settings. Not a dialog; doesn't
  block "Continuar" or "Nueva partida". Updates on `SETTINGS_CHANGED`.
- Turning Whisper on with a key (or adding the missing key) and returning to the Table shows the
  mic, with no reload.

## §4 Side-by-side Table (US4, US6)

Breakpoint: `@media (orientation: landscape) and (min-width: 900px)` (existing).

- Players pane starts with `<h2 class="company-group-title">Jugadores</h2>`: hidden below the
  breakpoint, shown at it. First player card top = first company card top (± 2 px).
- Tabs hidden at the breakpoint (unchanged).
- Company cards with trains show a `Trenes` label before the train cards at the breakpoint
  only. Below it the card is unchanged.

## §5 Settings (US5)

Groups (`<section>` with `<h2>`), in order: **Idioma**, **Interpretación (IA)**, **Reconocimiento
de voz**, **Privacidad**, **Desarrollo** (dev builds only). Placement per research R7.

- Every on/off setting ("No recordar", the dev clips) is a plain checkbox:
  `<label class="checkbox"><input type="checkbox"/>{text}</label>`, help line(s) beneath; the
  whole label row is the tap target. Queried in tests as `getByRole("checkbox", { name })`. (A
  switch control was tried and dropped as too bulky, amendment 2026-11-08.)
- Short one-of-several choices are `.segmented` radiogroups; the speech region stays a `<select>`.
- The speech engine (where Whisper is offered) is a `.segmented` radiogroup labelled "Motor de
  reconocimiento": "Del navegador" (`whisper: false`) and "Whisper (Groq)" (`whisper: true`,
  disabled with the "no puede grabar" note where the browser can't record). Saves at once.
- Speech group order: status line, engine choice + its help line, region, then the Groq key block
  (`.settings-field`: key, link, billing note where Whisper is offered), unindented. The key stays
  editable whichever engine is chosen, and where Whisper isn't offered (feature 015 FR-003).
- Settings paragraphs have no margins (`.settings-body p`); the group's stack gap spaces them.
- "Reconocimiento de voz" begins with the current availability reason as a `role="status"`
  line, when not available.
- "Guardar" + "Guardado" in a sticky footer. Language and the engine choice keep saving at once.
- Labels used by tests stay: "Clave de Anthropic", "Modelo", "Variante de español",
  "No recordar las claves en este dispositivo", "Motor de reconocimiento", "Del navegador",
  "Whisper (Groq)".
- Stored values, defaults and save semantics: unchanged.

## §6 Certificates at a glance (US7)

Tile (`PlayerTile`), below the cash line:

```
┌──────────────────────────┐
│ ● Ana                    │
│ $420                     │
│ [PRR] 40%★     ╭───╮     │
│ [B&O] 20%     │ 11 │     │  ring = limit (16): arcs PRR 3, B&O 2, … ; dimmed arc = exempt
│ [C&O] 10%      ╰───╯     │
└──────────────────────────┘
```

- `.player-tile-body`: two columns, the company list (`.tile-holdings`, a deliberate column) and
  `<CertDonut>` aligned to the end. The old "N cert." text in `.player-meta` is removed (the donut
  carries it); the debt badge stays.
- `CertDonut` takes a `CertificateStatus` (data-model). Inline SVG, `viewBox="0 0 36 36"`, circle
  `r = 15.9155` (circumference 100, so arc lengths are percentages); a track circle; one circle per
  arc with `stroke = company.color`, `stroke-dasharray = "{len} {100 − len}"` and a running
  `stroke-dashoffset`, rotated −90° so it starts at 12 o'clock; a 1-unit gap between arcs when
  there are two or more. Exempt arcs at reduced opacity, after the counted ones.
- Scale: `max(limit ?? 0, total)`; when that is 0, track only.
- Center: `<text>` with `counted`.
- `level` "at" → class `at` (warn ring outline), "over" → class `over` (danger ring outline).
- `<svg role="img" aria-label={label}>`, arcs and text `aria-hidden`. Label:
  `"{counted} de {limit} certificados"` / `"{counted} certificados"` when there is no limit, plus
  `", en el límite"` / `", sobre el límite"`.
- At 360 px the two-column `.player-grid` doesn't overflow; donut about 56 px.

Sheet (`PlayerSheet` `info`), in the header:

```
$420            11 / 16 cert.  [en el límite]
                (12 en total)
```

- `.sheet-figures` row: the cash figure (unchanged, only in `appTruth`) and the certificate
  summary (smaller, muted; the badge `warn`/`danger` at/over the limit). Shown in "bank only" mode
  too. Removed from the bottom of `HoldingsTable`.

## §7 Company choices on two lines (US8)

- In `LaunchSheet` and `MergerSheet` choice buttons:
  `<span class="choice-company"><CompanyBadge size="sm"/><span class="choice-company-name">{name}</span></span>`.
- `.choice-company { display: flex; flex-direction: column; align-items: center; text-align: center; }`
  at every width; the name wraps inside the button, centered under the badge, with a tight line height.
