---

description: "Task list for feature 016 — UI Layout Polish"
---

# Tasks: UI Layout Polish

**Input**: Design documents from `specs/016-ui-layout-polish/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui.md](contracts/ui.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle VI requires test-first domain logic (`certificateStatus`, `voiceSetupIssue`); UI tests follow the project's existing Testing Library suites. Write each test task first and see it fail before its implementation task.

**Organization**: One phase per user story, in the delivery order from plan.md (US3 bug first). Each story is shippable alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 from spec.md

## Path Conventions

Single project: `src/`, `tests/`, `e2e/` at repo root. Spanish catalogs in `src/i18n/es/`, English in `src/i18n/en/` (same keys; `tests/ui/catalog.test.ts` checks parity). Spanish text uses Uruguayan wording.

---

## Phase 1: Setup

**Purpose**: Baseline before changes.

- [X] T001 Run `npm run typecheck`, `npm run lint` and `npm test` on the clean tree and note any pre-existing failures in specs/016-ui-layout-polish/tasks.md (Notes section) so they are not attributed to this feature

---

## Phase 2: Foundational

**Purpose**: None blocking. Each story owns its files; shared pieces (`Switch`, `HoldingsTable`, `certificateStatus`, `voiceSetupIssue`) belong to the single story that needs them.

**Checkpoint**: Stories can start in any order after T001.

---

## Phase 3: User Story 3 — No microphone overlay when voice cannot work (Priority: P1) 🎯 MVP (bug fix)

**Goal**: With a setup issue (no recognizer and Whisper off, no recorder, missing AI or Groq key) the Table renders no mic and no voice panel; Home shows the reason with "Abrir ajustes". Offline keeps today's disabled mic, which no longer does work on tap.

**Independent Test**: quickstart.md §3 — no recognizer + Whisper off: board has no mic, every control tappable; Home shows the notice; enable Whisper with a key → mic is back without reload.

### Tests for User Story 3

- [X] T002 [P] [US3] Add failing unit tests for `voiceSetupIssue(availability)` in tests/app/voiceAvailability.test.ts: returns the reason for `voice.noSpeech`, `voice.noSpeechTryWhisper`, `voice.noRecorder`, `voice.noKey`, `voice.noGroqKey`; returns `undefined` for `{ ok: true }` and for `voice.offline`
- [X] T003 [P] [US3] Update tests/ui/whisper.test.tsx "US1-2" case: with no recognizer and the toggle off, the Table has no button named "Mantén pulsado para hablar" and no text "Este navegador no reconoce la voz…"; add a case that turning Whisper on with a Groq key (via Settings, `SETTINGS_CHANGED`) makes the mic appear on the Table without remounting the app
- [X] T004 [P] [US3] Add failing tests in tests/ui/home.test.tsx (new `describe("Home: voice notice (016 US3)")`): with a setup issue Home shows a `role="note"` line with the reason message and an "Abrir ajustes" button that navigates to Settings; with voice available or only offline, no notice; with `voiceEnabled(lang)` false, no notice

### Implementation for User Story 3

- [X] T005 [US3] Implement `export function voiceSetupIssue(a: VoiceAvailability): Message | undefined` in src/app/useVoice.ts per data-model.md ("Returns the reason when it is a setup issue: `voice.noSpeech`, `voice.noSpeechTryWhisper`, `voice.noRecorder`, `voice.noKey`, `voice.noGroqKey`. Returns `undefined` when voice is available or the reason is transient (`voice.offline`).") — makes T002 pass
- [X] T006 [US3] In src/ui/screens/Table.tsx render `VoicePanel` and `MicButton` only when `voiceEnabled(lang) && !voiceSetupIssue(voice.availability)` (replace the current `voiceEnabled(lang)` gate)
- [X] T007 [US3] In src/ui/components/MicButton.tsx make `onPointerDown`/`onPointerUp`/`onPointerCancel` return early when the button is disabled (`!availability.ok || busy`), and in src/ui/styles/components.css add `.mic-button:disabled { pointer-events: none; }` so taps on a disabled (offline) mic pass through (research R4)
- [X] T008 [P] [US3] Add Home notice strings to src/i18n/es/ui/screens.ts and src/i18n/en/ui/screens.ts under `home`: `voiceNoticeOpenSettings: "Abrir ajustes"` / `"Open settings"` (the reason itself reuses the existing voice messages)
- [X] T009 [US3] In src/ui/screens/Home.tsx compute availability with `voiceAvailability(useContext(VoiceDepsContext), await settings.get(), lang)`, re-read on the `SETTINGS_CHANGED` window event, and when `voiceEnabled(lang) && voiceSetupIssue(...)` render at the top `<p role="note">{plainText(reason)}</p>` plus a button `t.home.voiceNoticeOpenSettings` → `go({ name: "settings" })`; not a dialog, does not block "Continuar"/"Nueva partida" (contracts/ui.md §3) — makes T004 pass
- [X] T010 [P] [US3] Update e2e/offline.spec.ts: accept either a hidden mic (setup issue in headless Chromium without speech recognition) or a disabled mic with `.mic-reason` "Sin conexión"; keep the assertion that touch still works offline
- [X] T011 [P] [US3] Update e2e/security.spec.ts: after reload with "no recordar la clave", assert no mic on the Table and that Home shows the notice mentioning the Anthropic key (or the no-recognizer reason)

**Checkpoint**: US3 complete — `npm test` green; quickstart §3 can be checked.

---

## Phase 4: User Story 1 — History one tap away on the board (Priority: P1)

**Goal**: "Historial" is the last button of the Table's action row in every round; "Lote de acciones" leaves the row and appears in ☰ during stock rounds.

**Independent Test**: quickstart.md §1.

### Tests for User Story 1

- [X] T012 [P] [US1] Update tests/ui/stock.test.tsx (line ~109): open the menu (button "Menú") before clicking "Lote de acciones"; add assertions that `.round-controls` contains no "Lote de acciones" button in SR and that the menu has no "Lote de acciones" outside SR
- [X] T013 [P] [US1] Add a test in tests/ui/history.test.tsx: on the Table in SR and in OR, a button "Historial" outside any sheet opens the History screen in one click, and its back button returns to the Table

### Implementation for User Story 1

- [X] T014 [US1] In src/ui/screens/Table.tsx remove `{round === "SR" ? <button …>{t.shareBatch}</button> : null}` from `.round-controls` and append, as the row's last child in every round, `<button onClick={() => go({ name: "history" })}>{t.history}</button>` (contracts/ui.md §1); the row may wrap to one more line on a 360 px phone but no control may be covered or pushed off-screen (FR-002, checked in T039 / quickstart §1)
- [X] T015 [US1] In the menu `Sheet` of src/ui/screens/Table.tsx add `{round === "SR" ? <button onClick={() => setOpen({ kind: "batch" })}>{t.shareBatch}</button> : null}` right after the "Historial" entry; keep "Historial" in the menu (FR-005) — makes T012/T013 pass

**Checkpoint**: US1 complete.

---

## Phase 5: User Story 2 — Holdings table with certificate counts (Priority: P1)

**Goal**: The player sheet lists one row per held company (badge, %, ★, "N cert.", "no cuenta", a sell button: quick sell in SR, "Vender…" with the company preselected otherwise) and a "Certificados: counted / limit" line with "en el límite"/"sobre el límite" badges, from one tested domain function shared with the limit warning.

**Independent Test**: quickstart.md §2.

### Tests for User Story 2 (write first, see them fail)

- [X] T016 [P] [US2] Add failing tests for `certificateStatus(game, state, player, playerCount)` in tests/domain/limits.test.ts using the 1830 definition: president (20%) + two 10% shares → row `{ percent: 40, certificates: 3, president: true, counts: true }`; a company in the yellow/orange/brown zone → `counts: false` and excluded from `counted` but included in `total`; 4 players → `limit: 16`; `level` is `"at"` iff `counted === limit`, `"over"` iff `counted > limit`, else `"under"`; a definition with no entry for the player count (plain RotLA) → `limit` absent and `level: "under"`; rows in game-definition order, only companies with `units > 0`
- [X] T017 [P] [US2] Update tests/ui/playerSheet.test.tsx: with holdings in 4+ companies, each company has its own row showing "%", "★" for the presidency and "N cert."; in SR each row has "Vender 1 · $X" that dispatches `sellShares` count 1 for that company; outside SR each row has "Vender…" that opens the sell view with that company already selected (its count stepper visible, no company choice needed); "Vender acciones" and "Comprar acción" remain; the total reads "Certificados: N / L" and shows "en el límite" / "sobre el límite" at/over the limit; with a zone-exempt company (1830 yellow zone) its row shows "no cuenta" and the total line adds "(T en total)"; a player without shares sees "Sin acciones" and no total line

### Implementation for User Story 2

- [X] T018 [US2] Implement `certificateStatus` and its `HoldingRow`/`CertificateStatus` types in src/domain/actions/limits.ts per data-model.md: `certificates` = "`1 + max(0, units − presidencyUnits)` if president, else `units`"; `counts` false "when the company's market zone exempts it from the limit (1830 yellow/orange/brown)"; "`total = Σ rows.certificates`; `counted = Σ rows.certificates where counts`"; "`level = "over"` iff `limit` defined and `counted > limit`; `"at"` iff `counted === limit`"; `limit` = `game.limits.certificates[String(playerCount)]` — makes T016 pass
- [X] T019 [US2] Refactor `holdingWarnings` in src/domain/actions/limits.ts to take `counted`/`limit` from `certificateStatus` and delete `limitedCertificates`; existing tests in tests/domain/limits.test.ts must stay green (warning fires exactly when `level === "over"` after the action)
- [X] T020 [P] [US2] Add strings to src/i18n/es/ui/stock.ts and src/i18n/en/ui/stock.ts under `player`: `holdingsTitle` ("Acciones"/"Shares"), `certs: (n) => \`${n} cert.\`` / `` `${n} cert.` ``, `notCounted` ("no cuenta"/"not counted"), `certTotal: (counted, limit?) => …` ("Certificados: 11 / 16" / "Certificates: 11 / 16"), `certAll: (total) => …` ("(N en total)"/"(N in all)"), `atLimit` ("en el límite"/"at the limit"), `overLimit` ("sobre el límite"/"over the limit"), `noHoldings` ("Sin acciones"/"No shares"), `sellRow` ("Vender…"/"Sell…")
- [X] T021 [US2] Create src/ui/components/HoldingsTable.tsx: props `{ playerId, inSR, onSellOne(company), onSellSome(company) }`; reads `certificateStatus(meta.game, state, playerId, meta.players.length)` and `priceOf`; renders a heading `t.holdingsTitle` and a labelled list (`role="table"` with `role="row"`/`role="cell"`, or a list with an `aria-label`) of rows: `CompanyBadge` (size "sm"), `percent%` + "★" when president, `t.certs(n)`, `t.notCounted` when `!counts`, and at the row's end in SR a button `t.sellOne[0]` + badge + `t.sellOne[1]` + price (→ `onSellOne`), otherwise a button `t.sellRow` (→ `onSellSome`); then the total line `t.certTotal(counted, limit)`, followed by `t.certAll(total)` when `total !== counted`, with `.badge warn` `t.atLimit` for "at" and `.badge danger` `t.overLimit` for "over"; `t.noHoldings` and no total line when there are no rows (contracts/ui.md §2)
- [X] T022 [US2] In src/ui/sheets/PlayerSheet.tsx render `<HoldingsTable>` inside `info` under the cash figure, wiring `onSellOne` to `run({ type: "sellShares", seller: ref, company, count: 1 })` and `onSellSome` to open the sell view with that company preselected (add an `initialCompany?: CompanyId` prop to `SellView`, used as the initial `company` state, and keep the chosen company in `PlayerSheet` state alongside `mode`); remove the `holdings.map(...)` quick-sell buttons from `stock`; keep "Vender acciones" (opens `SellView` with no preselection, as today) and "Comprar acción" — makes T017 pass
- [X] T023 [P] [US2] Add `.holdings-table` styles in src/ui/styles/components.css: a 4-column grid (`auto auto auto 1fr`, sell button right-aligned) with `min-width: 0` and wrapping so rows never overflow at 360 px; row buttons keep the 48 px `--tap` minimum. Add e2e/holdings.spec.ts at a 360×740 viewport: give a player shares in 8 companies (1830 fixture or touch actions), open their sheet, and assert the sheet's `scrollWidth <= clientWidth` and every row's sell button is fully inside the viewport (FR-011, SC-002)

**Checkpoint**: US2 complete.

---

## Phase 6: User Story 4 — Aligned panes on large screens (Priority: P2)

**Goal**: In the side-by-side layout the players pane starts with a "Jugadores" title matching the company group titles, so the first cards align.

**Independent Test**: quickstart.md §4.

- [X] T024 [US4] In src/ui/screens/Table.tsx add `<h2 className="company-group-title players-pane-title">{t.playersTab}</h2>` as the first child of `section[data-pane="players"]`, before `.player-grid`
- [X] T025 [US4] In src/ui/styles/layout.css hide `.players-pane-title` by default and show it inside the existing `@media (orientation: landscape) and (min-width: 900px)` block; verify both panes have the same top padding so the first player card and first company card tops match (± 2 px) whether the first company group is "En juego" or "Disponibles"
- [X] T026 [P] [US4] Add a Playwright check in e2e/a11y.spec.ts (or a new e2e/layout.spec.ts) at a 1280×800 landscape viewport: no visible `[role=tablist]`, and the bounding-box `y` of the first `.player-tile` equals that of the first `.company-card` within 2 px, for a new session and for one with a floated company

**Checkpoint**: US4 complete.

---

## Phase 7: User Story 6 — "Trenes" label on large screens (Priority: P3)

**Goal**: Company cards with trains show the "Trenes" label in the side-by-side layout only.

**Independent Test**: quickstart.md §5.

- [X] T027 [US6] In src/ui/components/CompanyCard.tsx, inside `.company-trains` when `hasTrains`, render `<span className="label company-trains-label">{text.table.trains.label}</span>` before `<TrainCards>` (use the existing `trains.label` string; no new text)
- [X] T028 [US6] In src/ui/styles/layout.css hide `.company-trains-label` by default and show it in the `@media (orientation: landscape) and (min-width: 900px)` block
- [X] T029 [P] [US6] Extend the layout check from T026: at 1280×800 a company card with trains shows a visible "Trenes" label; at 360×740 it is not visible, and (FR-019) the tabs are visible and the "Jugadores" pane title is not

**Checkpoint**: US6 complete.

---

## Phase 8: User Story 5 — Clear, consistent Settings screen (Priority: P2)

**Goal**: Five titled groups, one `Switch` for every on/off setting, segmented controls for short choices, Groq key nested under Whisper, sticky Guardar; stored behavior unchanged.

**Independent Test**: quickstart.md §6.

### Tests for User Story 5

- [X] T030 [P] [US5] Update tests/ui/whisper.test.tsx lines ~160 and ~175: query the Whisper toggle with `getByRole("switch", { name: "Usar Whisper (Groq) para reconocer la voz" })`
- [X] T031 [P] [US5] Extend tests/ui/settings.test.tsx: headings appear in order Idioma, Interpretación (IA), Reconocimiento de voz, Privacidad (Desarrollo only in dev); "No recordar las claves en este dispositivo" and Whisper are `role="switch"`; "Clave de Groq" is inside the Whisper subsetting block, and with Whisper not offered in the display language "Clave de Groq" is still present; existing label-based tests ("Clave de Anthropic", "Modelo", "Variante de español") stay green unchanged; saving still persists the same values

### Implementation for User Story 5

- [X] T032 [P] [US5] Create src/ui/components/Switch.tsx: `{ label, checked, onChange, disabled?, hint?, children? }` rendering `<label className="switch-row"><span>{label}</span><input type="checkbox" role="switch" …/></label>`, then `hint` lines as `.muted` and `children` inside a `.subsetting` block (contracts/ui.md §5); add `.switch-row`, a switch-styled `input[role="switch"]` (≥48 px target), and `.subsetting` (indented, left border) styles to src/ui/styles/components.css
- [X] T033 [P] [US5] Add group titles to src/i18n/es/ui/settings.ts and src/i18n/en/ui/settings.ts: `groups: { language: "Idioma"/"Language", ai: "Interpretación (IA)"/"Interpretation (AI)", speech: "Reconocimiento de voz"/"Speech recognition", privacy: "Privacidad"/"Privacy", dev: "Desarrollo"/"Development" }`; keep existing labels unchanged (tests depend on them). In both catalogs, replace the positional `notes: Record<ProviderId, readonly string[]>` with named notes `notes: Record<ProviderId, { data?: string; limits?: string }>` (Gemini: `data` = the free-tier data-use note, `limits` = the per-minute/per-day limits note; Anthropic: `{}`), text unchanged, so Settings never depends on array order
- [X] T034 [US5] Restructure src/ui/screens/Settings.tsx into the five `<section>`s per research R7: Idioma (language segmented); Interpretación (IA) (provider segmented, key + Mostrar, `keyHelp`, model input, the provider's `notes[provider.id].limits` when present); Reconocimiento de voz (availability reason as `role="status"` at top when not ok; Whisper `Switch` with `help`/`billing` as hints and the Groq key input + get-key link as its children; when Whisper isn't offered in the display language (`!whisperOffered(lang)`, so no switch), render the Groq key input + get-key link unindented in the same group so a saved key stays reachable (feature 015 FR-003); `unsupported` note when it can't record; the region `<select>` or `voiceUnavailable` note); Privacidad (`audio`/`audioWhisper`, `sent`, the provider's `notes[provider.id].data` when present, "No recordar" `Switch`); Desarrollo (dev only: clips `Switch` + Android note). No change to `Draft`, `save`, `saveWhisper` or what is stored (FR-026) — makes T030/T031 pass
- [X] T035 [US5] Move the Guardar button and "Guardado" status into a `.settings-footer` at the end of src/ui/screens/Settings.tsx, styled `position: sticky; bottom: 0` with the screen background in src/ui/styles/layout.css so it stays visible while scrolling and doesn't cover the last field

**Checkpoint**: US5 complete.

---

## Phase 9: User Story 7 — Certificates at a glance (Priority: P2) *(added 2026-11-08)*

**Goal**: The player tile shows a certificate donut beside its company column (ring = limit, arcs per company sized by certificates, counted number in the center). The sheet shows the certificate summary in its header next to cash. Tile and sheet both read `certificateStatus`.

**Independent Test**: quickstart.md §7.

### Tests for User Story 7 (write first, see them fail)

- [X] T040 [P] [US7] Add failing unit tests for the pure helper `donutArcs(status: CertificateStatus)` in tests/ui/certDonut.test.ts: `scale = max(limit ?? 0, total)`; one arc per row in row order with `{ company, length: certificates, exempt: !counts }`; counted arcs before exempt ones; no rows → `[]` with scale = limit; over the limit (17 / 16) → scale 17 and the arcs fill the ring; no limit → scale = total
- [X] T041 [P] [US7] Add tests/ui/playerTile.test.tsx: the tile has `getByRole("img", { name: "11 de 16 certificados" })` (es) and "11 of 16 certificates" (en); at the limit the name ends ", en el límite", over it ", sobre el límite"; without a limit (plain RotLA) "N certificados"; a player without shares → "0 de 16 certificados"; **regression**: with an 1830 yellow-zone holding the tile's center number equals the sheet's counted total (today the tile uses `certificateCount`, which includes exempt shares); the old " cert." text in `.player-meta` is gone and the debt badge remains
- [X] T042 [P] [US7] Update tests/ui/playerSheet.test.tsx: the summary "11 / 16 cert." is rendered next to the cash figure (inside `.sheet-figures`), with "(N en total)" when some are exempt and "en el límite" / "sobre el límite" badges; it is present in "bank only" wallet mode; the holdings table no longer ends with a total line

### Implementation for User Story 7

- [X] T043 [P] [US7] Add strings in src/i18n/es and src/i18n/en: `table.playerTile.certLabel(counted, limit?, level)` ("11 de 16 certificados" / "11 of 16 certificates", "N certificados" without limit, appending ", en el límite" / ", sobre el límite"; en ", at the limit" / ", over the limit") and `sheets.player.certSummary(counted, limit?)` ("11 / 16 cert." / "11 / 16 certs"); reuse existing `atLimit`/`overLimit`/`certAll`; remove `table.playerTile.certs` if unused after T045
- [X] T044 [US7] Create src/ui/components/CertDonut.tsx per contracts/ui.md §6: export `donutArcs` (makes T040 pass) and `CertDonut({ status, companies })` rendering inline SVG (`viewBox 0 0 36 36`, `r=15.9155`, track circle, one stroked circle per arc with `stroke-dasharray`/`stroke-dashoffset`, rotated −90°, 1-unit gaps when ≥2 arcs, exempt arcs dimmed), center `<text>` with `counted`, class `at`/`over` by level, `role="img"` + `aria-label={certLabel(...)}`, children `aria-hidden`
- [X] T045 [US7] In src/ui/components/PlayerTile.tsx compute `certificateStatus(meta.game, state, player.id, meta.players.length)` instead of `certificateCount`; wrap the company list and `<CertDonut>` in `.player-tile-body` (company column `.tile-holdings`, donut at the end); drop the "N cert." text from `.player-meta`, keep the debt badge; always render the donut (empty track + "0" without shares) — makes T041 pass. If `certificateCount` in src/domain/events/state.ts has no callers left, delete it and its tests
- [X] T046 [US7] Fix the `.holdings` class collision in src/ui/styles/components.css (line ~170 tile rules vs line ~1477 sheet rules; the sheet's column rule is what currently makes the tile list vertical): rename the sheet wrapper in HoldingsTable.tsx to `.holdings-sheet`, give the tile its own deliberate `.tile-holdings { flex-direction: column }`, and add `.player-tile-body` (grid `1fr auto`, `min-width: 0`) and `.cert-donut` styles (≈56 px; track `var(--border)`; `.at` ring outline warn, `.over` danger, using existing color tokens for both themes)
- [X] T047 [US7] In src/ui/sheets/PlayerSheet.tsx render a `.sheet-figures` row in `info`: the cash figure (unchanged, `appTruth` only) and the certificate summary `certSummary(counted, limit)` + `certAll(total)` when `total !== counted` + `.badge warn`/`.badge danger` at/over (shown in every wallet mode); remove the total `<p className="holdings-total">` from src/ui/components/HoldingsTable.tsx; style `.sheet-figures` (baseline-aligned, wraps at 360 px, summary at `--text-md`, muted unless at/over) — makes T042 pass
- [X] T048 [P] [US7] Extend e2e/holdings.spec.ts at 360×740: with the 8-company player, every `.player-tile` has `scrollWidth <= clientWidth` and its `.cert-donut` box lies inside the tile; the sheet header shows the summary next to cash

**Checkpoint**: US7 complete — quickstart §7.

---

## Phase 10: User Story 8 — Company choices on two lines (Priority: P3) *(added 2026-11-08)*

**Goal**: In "Abrir menor" and the merger sheet, each company choice shows the badge on top and the name below at every width.

**Independent Test**: quickstart.md §8.

- [X] T049 [P] [US8] Add a test (tests/ui/launchSheet.test.tsx, 1848 fixture in SR): each minor choice button contains a `.choice-company` whose children are the badge and a `.choice-company-name` with the full name; same structure check for the merger sheet's choices in its existing suite (or a new tests/ui/mergerSheet.test.tsx)
- [X] T050 [US8] In src/ui/sheets/LaunchSheet.tsx (line ~67) and src/ui/sheets/MergerSheet.tsx (line ~65) replace `<CompanyBadge … /> {c.name}` with `<span className="choice-company"><CompanyBadge company={c} size="sm" /><span className="choice-company-name">{c.name}</span></span>`; add `.choice-company { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0 }` and `.choice-company-name { overflow-wrap: anywhere }` in src/ui/styles/components.css — makes T049 pass. Leave HolderSheet's badge + count choices (line ~186) inline: short values, not names
- [X] T051 [P] [US8] Add to e2e/layout.spec.ts: open "Abrir menor" in an 1848 session at 1280×800 and at 360×740; for every choice, the badge's bounding box bottom ≤ the name's top

**Checkpoint**: US8 complete — quickstart §8.

---

## Phase 11: Polish & Cross-Cutting

- [X] T036 [P] Update docs/spec.md (product reference) for: History button on the Table and batch in the menu; player holdings table with certificate total and limit; mic hidden on voice setup issues with the Home notice (offline unchanged); "Jugadores" title and "Trenes" label on large screens; Settings groups
- [X] T037 [P] Run tests/ui/catalog.test.ts and tests/ui/englishLeak.test.tsx to confirm every new string exists in es and en and no English leaks into the Spanish UI
- [X] T038 Run `npm run typecheck`, `npm run lint`, `npm test`, then `npm run build && npm run test:e2e` (build first: the :4173 preview may serve a stale dist); all green
- [X] T052 [P] Update docs/spec.md for US7/US8 and the 2026-11-08 amendments (History first in the action row; certificate donut on the tile; summary in the sheet header; two-line company choices)
- [X] T053 Re-run T037 and T038 after Phases 9–10 (catalog parity, English leak, typecheck, lint, `npm test` including the Spanish golden snapshot, then `npm run build && npm run test:e2e`); all green
- [X] T039 Manual check of quickstart.md §1–§8 on a phone (portrait) and a tablet (landscape), including the 360 px action-row check in §1 (FR-002), §3 on Firefox for Android, and the screen-reader label in §7 (needs user) — checked by the user 2026-11-08 in a browser and on a phone, portrait and landscape

---

## Dependencies & Execution Order

- **Setup (T001)** → any story.
- **Stories are independent** of each other. Shared files, so do not run their edits to the same file in parallel:
  - src/ui/screens/Table.tsx: T006 (US3), T014–T015 (US1), T024 (US4)
  - src/ui/styles/layout.css: T025 (US4), T028 (US6), T035 (US5)
  - src/ui/styles/components.css: T007 (US3), T023 (US2), T032 (US5)
  - tests/ui/whisper.test.tsx: T003 (US3), T030 (US5)
  - e2e layout spec: T026 (US4) before T029 (US6), then T051 (US8)
  - src/ui/styles/components.css: also T046 (US7), T050 (US8)
  - src/ui/components/HoldingsTable.tsx: T046 then T047 (US7)
- **Within a story**: tests → implementation (domain before UI in US2: T016 → T018 → T019 → T021 → T022; US7: T040 → T044 → T045/T046 → T047).
- **Polish (T036–T039, T052–T053)** after the stories to ship; T039 last.

## Parallel Examples

- **US3**: T002, T003, T004 together; then T005; then T006, T007, T008 in parallel; T009; T010 and T011 together.
- **US2**: T016 and T017 together; T018 → T019; T020 and T023 in parallel with T018; then T021 → T022.
- **US5**: T030, T031, T032, T033 together; then T034 → T035 (T034 needs T033's named `notes`).
- **Across stories** (different files): US2 domain work (T016–T019) can run alongside US3 (T002–T005).

## Implementation Strategy

1. **MVP**: Phase 1 + Phase 3 (US3). It fixes the overlay and the lag, the only bug in the set. Validate quickstart §3 and ship.
2. **Increment 2**: US1 (History, small, high-frequency gain).
3. **Increment 3**: US2 (holdings and certificates, the largest piece, with domain tests).
4. **Increment 4**: US4 + US6 (same breakpoint; one layout e2e spec).
5. **Increment 5**: US5 (Settings).
6. **Increment 6** (added 2026-11-08): US7 (donut + header summary) and US8 (two-line choices); independent of each other.
7. Polish: docs/spec.md, catalogs, full gates, manual check.

## Notes

- Leave changes uncommitted for review (project practice); no per-task commits.
- No voice eval run needed: no prompt, tool schema, provider or model change.
- Pre-existing failures (from T001): none — typecheck, lint and 2473 tests green on 2026-11-07.
