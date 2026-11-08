# Research: UI Layout Polish (016)

No open unknowns in the Technical Context; this records the design decisions made while reading
the current code, one per story.

## R1 — Where the History control lives (US1)

- **Decision**: A "Historial" button is the last item of the Table's action row
  (`.round-controls`), always rendered in every round. The "Lote de acciones" button leaves that
  row and moves into the general menu (`☰`), shown only while `round === "SR"`. History also stays
  in the menu (FR-005).
- **Rationale**: The action row already wraps and is always visible, and it is the spot the batch
  button had. One tap from the board, and it keeps the ≤2-tap rule for the batch (☰ → Lote).
- **Alternatives considered**: An icon in the top bar's `right` slot. Rejected: on a 360 px phone
  the top bar already holds ☰, the round indicator (which can be long: "RO 2.1 · fase 3 · Turno:
  …"), the bank and sometimes the ⚠ badge; one more 48 px target would squeeze the round text.
  A floating button was rejected because it would cover content, the very problem US3 fixes.

## R2 — Certificate counts and the limit (US2)

- **Decision**: One pure domain function, `certificateStatus(game, state, player, playerCount)` in
  `src/domain/actions/limits.ts`, returns per-company rows (units, certificates, president,
  counts toward the limit) plus `counted`, `total` and `limit`. `holdingWarnings` is refactored to
  use it, so the sheet and the warning can never disagree. Written test-first (Principle VI).
- **Counting rule** (unchanged, moved): a holder's certificates in a company are
  `1 + max(0, units − presidencyUnits)` if they hold the presidency, else `units`. This is the
  rule `certificateCount` and `limitedCertificates` already use. Every current game has
  1-unit ordinary certificates (`certificates: [2, 1, 1, …]`), so the rule matches the cards on
  the table; the edge case "multi-share ordinary certificates" does not arise in shipped games
  and stays out of scope (YAGNI).
- **Limit**: `game.limits.certificates[String(playerCount)]` (RotLA's bank-break variant patches
  it in; plain RotLA has none, so the total shows without a limit). Zones that don't count
  (1830 yellow/orange/brown) are excluded from `counted` and their rows say so in text.
- **Alternatives considered**: Computing in the component. Rejected: it would be a second copy of
  a rule-dependent calculation, untested, that could drift from the warning.

## R3 — The holdings table and sell actions (US2)

- **Decision**: A `HoldingsTable` in the player sheet's info area (under the cash figure): one
  row per held company with badge, percentage (+ ★ when president), certificates, and a sell
  button at the row's end in every round: in a stock round the existing one-tap
  "Vender 1 · $X" quick sell; in any other round "Vender…", which opens the existing `SellView`
  (choose how many) with that company preselected. "Vender acciones" (choose how many, any
  company) stays in "Jugada". Below the rows: "Certificados: 11 / 16", with a text badge
  "en el límite" / "sobre el límite".
- **Rationale**: Keeps today's 2-tap sell-one in stock rounds (open player → Vender 1), so no
  regression against Principle V; gives every row a sell action as requested; removes the
  side-by-side buttons that overflowed.
- **Alternatives considered**: "Vender…" on every row, also in stock rounds. Rejected: it adds a
  tap to the most common sell. No row button outside stock rounds. Rejected: the user asked for
  the sell option beside each holding. A real `<table>` element was considered; a CSS grid list with
  row semantics (`role="table"` or a labelled list) is used instead so the row fits 360 px.
  Final markup is an implementation choice within contracts/ui.md §2.

## R4 — Hiding the microphone (US3)

- **Decision**: Split the existing `voiceAvailability` reasons into two kinds with a small pure
  helper `voiceSetupIssue(availability)`:
  - **setup** (fixed in Settings or by the browser): `voice.noSpeech`, `voice.noSpeechTryWhisper`,
    `voice.noRecorder`, `voice.noKey`, `voice.noGroqKey` → the Table renders neither `MicButton`
    nor `VoicePanel`; the Home screen shows a one-line notice with the reason and an
    "Abrir ajustes" button.
  - **transient** (`voice.offline`) → today's disabled mic with its reason line stays: it tells
    the table why voice stopped mid-game and goes away by itself.
- **Lag**: The reported lag (Firefox for Android, tapping the disabled mic) can't be reproduced
  in tests. Not rendering the control removes the path for setup issues. For the remaining
  disabled case (offline), the disabled mic gets `pointer-events: none` and its pointer handlers
  return early, so a tap passes through without work. Verified manually (quickstart §3).
- **Home availability**: `voiceAvailability` is already pure (`deps`, `settings`, `lang`); Home
  calls it with `VoiceDepsContext` and `settings.get()`, without the session-bound `useVoice`.
  It re-reads on `SETTINGS_CHANGED`. Only shown when `voiceEnabled(lang)`.
- **Alternatives considered**: Hiding on every non-ok reason including offline. Rejected: a mic
  that silently vanishes when Wi-Fi drops is confusing. A dismissible banner on the Table.
  Rejected by the user's request ("keep the button out of the UI while using the app").

## R5 — Aligning panes (US4)

- **Decision**: The players pane gets its own group title ("Jugadores", same
  `company-group-title` class), hidden on phones (the tab already names it) and shown in the
  side-by-side layout. Same class means same height and margins, so the first player card lines
  up with the first company card no matter which company group comes first.
- **Tabs**: already hidden at the side-by-side breakpoint
  (`@media (orientation: landscape) and (min-width: 900px)` in `layout.css`); no change.
- **Alternatives considered**: A top padding equal to the title height on the players pane.
  Rejected: fragile with font scaling and translations.

## R6 — Train label (US6)

- **Decision**: `CompanyCard` renders the existing `t.trains.label` ("Trenes") inside
  `.company-trains`, hidden by default and shown at the side-by-side breakpoint. Cards without
  trains keep showing no train section (consistent with today).
- **Alternatives considered**: A width-based container query. Rejected for now: one breakpoint
  already defines "large screen" for the whole Table (spec assumption).

## R7 — Settings layout (US5)

- **Decision**: Five titled groups, in order:
  1. **Idioma** — display language (segmented, saves at once).
  2. **Interpretación (IA)** — provider (segmented), its key (+ Mostrar), one help line, model
     (text input with the default as placeholder), the free-tier limits note when Gemini. The
     provider notes become named (`data`, `limits`) instead of a positional array, so each can be
     placed in its group without depending on order.
  3. **Reconocimiento de voz** — a status line at the top (current availability reason, if any);
     "Usar Whisper (Groq)" switch, with the Groq key and "conseguir clave" link indented under it
     as its subordinate settings, help and billing as short lines; the browser speech region
     (select). Unsupported note when the browser can't record.
  4. **Privacidad** — audio line, what is sent, the Gemini free-tier data note, and the
     "No recordar las claves" switch (it is a privacy choice).
  5. **Desarrollo** (dev builds only) — "Grabar clips de control" switch and the Android note.
  "Guardar" sits in a sticky footer so it stays visible; language and Whisper still save at once,
  as today.
- **Controls**: a shared `Switch` component — a native `<input type="checkbox" role="switch">`
  inside its label, styled as a switch — for every on/off setting (Whisper, No recordar,
  clips). Short one-of-several choices (language, provider) use the existing `.segmented`
  radiogroup. The 8-option speech region keeps a `<select>`: a segmented row of 8 wraps into
  three rows on a phone. Spec FR-022 is worded to allow a list picker for long lists.
- **Rationale**: Label + control first, help under it, dependent settings visually inside their
  parent. Stored settings, defaults, and save semantics untouched (FR-026), so persistence tests
  stay as they are.
- **Alternatives considered**: Collapsible sections (`<details>`). Rejected: hides settings people
  are looking for and adds taps. Turning the model input into a choice list. Rejected: models are
  free text by design (feature 005).

## R8 — Tests affected

- Unit/UI: `tests/ui/stock.test.tsx` (batch button), `tests/ui/playerSheet.test.tsx` (quick sell
  markup), `tests/ui/whisper.test.tsx` (checkbox → switch role; US1-2 now expects no mic and a Home
  notice), `tests/ui/settings.test.tsx` (labels kept; role queries if any).
- E2E: `e2e/offline.spec.ts` and `e2e/security.spec.ts` assert `.mic-reason` text. In headless
  Chromium without speech recognition, or with no key, the mic is now hidden; both specs must
  accept "hidden" as the unavailable state and the security spec checks the Home notice.
- No eval run: no prompt, tool schema, provider or model change (Principle VI gate not triggered).
