# Research: Multi-Language Support (English and Spanish)

Phase 0 for [plan.md](plan.md). Each entry records a decision, why it was made, and what else was
considered. Code facts come from a survey of the repository on 2026-11-04 (branch
`add_english_text_and_voice_support`, same tree as `main` at `429ccb5`).

## Survey: where the text lives today

| Layer | Where | Rough size | How it is built |
|---|---|---|---|
| Domain summaries and labels | `src/domain/i18n/es.ts` (789 lines) | ~90 functions/tables | Built at render time from action + events + context |
| Domain messages | `warning(code, messageEs)` in actions/mechanics; `unavailable(reasonEs)`; `messageEs` on end triggers, option checks, store errors | 52 warning codes, ~77 `unavailable` sites, ~40 other `messageEs` | Built when the action is checked or expanded, as Spanish strings |
| UI | 45 files under `src/ui/` and `src/app/AppProvider.tsx` | ~360+ literals (JSX text, `aria-label`, `placeholder`, `title`) | Hard-coded in components |
| Game definitions | `g1830.ts`, `g1848.ts`, `g21moon.ts`, `grotla.ts`, `games/index.ts` | ~45 strings (option labels, revenue parts, payments `labelEs`, a float question, schedule notes) | Data. **Copied into every session's `meta.game`.** |
| Voice | `prompt.ts`, `tools.ts` (43 description lines), `snapshot.ts`, `resolve.ts`, `queries.ts` answers, provider error messages | ~150 strings | Built per command |
| Static shell | `index.html` (`lang="es"`), PWA manifest in `vite.config.ts` (Spanish description, `lang: "es"`) | 3 | Static |

Spanish text stored in saved data, which matters for FR-006 and SC-006:

1. **`GroupEntry.warnings[].messageEs`**: warnings are saved with each ledger entry and shown in
   History and the undo toast.
2. **`note` events written by the app**: `"Fin de la partida"` and `"Partida reabierta"`
   (`expand/flow.ts`), and the game-schedule notes in 21Moon (`"El puerto espacial vale 30"`/`40`).
3. **The game definition copied into `meta.game`**: option labels, revenue part labels, payment
   `labelEs`, and the 1848 float question are frozen in each saved session.
4. **User-typed text**: player names, session names, `note` action text, `payCost`/`bankPays`
   reasons, voice transcripts. These stay as typed (FR-007).

Two things already work in our favor:

- Summaries are computed at render time from actions and events, so they can follow a language
  change with no data change.
- `AppProvider` renders nothing until the database is open, so the stored language can be loaded
  before the first paint.

---

## R1. Translation mechanism: typed in-house catalogs, no library

**Decision**: Each language is a TypeScript object that `satisfies` a shared catalog interface. A
fixed text is a `string`. Text with values in it is a function, for example
`(company: string, amount: string) => string`. Plurals are written out in each function (the two
languages need at most a singular and a plural). No i18n library is added.

**Rationale**:
- **Missing translations fail at build time**: a key missing from `en` or `es` is a type error,
  and the existing `tsc --noEmit` gate rejects it before tests run. This covers FR-012 and SC-004
  without a runtime key-diff tool.
- **Domain sentences need code**: summaries choose words from game state, call `holderName`,
  insert mention markers (feature 013) and format money for the game. Functions do this directly.
  ICU message strings would push that logic out of the catalogs.
- **No new dependency**, as the constitution prefers (Platform constraints, YAGNI). About 700
  strings in two languages adds a few tens of KB to the bundle.
- **No string keys at call sites**: code uses `t.history.title`, not `t("history.title")`, so a
  typo can't compile and rename tools work.

**Alternatives considered**:
- *i18next + react-i18next*: mature and has plurals and fallback, but it is a runtime dependency,
  missing keys only show up at runtime, and its value is greater with many languages or
  translators working in JSON. Rejected.
- *FormatJS / react-intl*: ICU plurals and gender aren't needed for two languages, and it's a
  larger dependency. Rejected.
- *Lingui*: compile-time extraction is attractive but needs a Babel/SWC macro step in the Vite
  build. Rejected as tooling weight.
- *Keep `es.ts` and add `en.ts` with the same function names and no shared interface*: nothing
  would enforce that they match. Rejected.

## R2. Where the catalogs live

**Decision** (clarified 2026-11-04): **one folder per language**, holding all of that language's
text, beside one folder of shared contracts. The current `src/domain/i18n/` moves into
`src/i18n/`. Adding a language means copying `src/i18n/es/` and translating it; `tsc` then refuses
to build until every entry is filled.

```text
src/i18n/
├── lang.ts              Lang, LANGUAGES, DEFAULT_LANG, detectLanguage, navigatorLanguages
├── format.ts            formatMoney(amount, game, lang)
├── mentions.ts          moved unchanged from src/domain/i18n/mentions.ts (feature 013)
├── render.ts            renderMessage, renderWarning, renderNote, SYSTEM_NOTES, SYSTEM_NOTE_TEXT
├── gameText.ts          gameText(game, lang) lookup
├── index.ts             DOMAIN_TEXT, UI_TEXT, VOICE_TEXT, GAME_TEXT keyed by Lang
├── contract/            what every language must provide (no text)
│   ├── domain.ts        DomainText, Message, MessageCode, MessageParams, MessageContext
│   ├── ui.ts            UiText
│   ├── voice.ts         VoiceText
│   └── games.ts         GameTextPack
├── es/                  all Spanish text
│   ├── index.ts         assembles the language: { domain, ui, voice, games }
│   ├── domain.ts        summaries, effects, lines, labels, income/undo/game-end texts, system notes
│   ├── messages/        one file per area: stock, operating, flow, mechanics, game, store
│   ├── ui/              one file per area: common, home, newSession, customGame, table, history,
│   │                    market, results, settings, sheets, components
│   ├── voice.ts         system prompt, tool descriptions, snapshot lines, answers, errors
│   └── games/           g1830, g1848, g21moon, grotla text packs
└── en/                  the same files, in English
```

**Import rules**, so layers keep pointing one way (domain ← voice ← ui):
- Domain code imports only `src/i18n/{lang,format,mentions,render,gameText}.ts`,
  `src/i18n/contract/{domain,games}.ts`, and the `domain`, `messages` and `games` modules of a
  language. It **never** imports `ui/` or `voice.ts`. An ESLint `no-restricted-imports` rule for
  `src/domain/**` enforces this.
- Voice code may also import `contract/voice.ts` and each language's `voice.ts`.
- UI code may import everything.
- Language files may import domain and voice **types** (`import type`) to type their functions.

The current `es.ts` becomes `src/i18n/es/domain.ts`, with its strings **moved verbatim**
(FR-010). Its exported names (`summaryEs`, `roundLabel`, …) are replaced by language-neutral
functions reached through `DOMAIN_TEXT[lang]` (contracts/catalogs.md). The `Es` suffix on
identifiers goes away, except on fields stored in saved data (R3).

**Alternatives considered**:
- *Per layer, per language* (catalogs next to the domain, UI and voice code): the first draft of
  this plan. Rejected in clarification, because a language's text would live in four places.
- *A single file per language*: over 2,000 lines each, since many entries are sentence-building
  functions, and every task would edit the same file. Rejected.
- *JSON per language with a library*: see R1. Rejected.

## R3. Domain messages become structured; stored warnings stay readable everywhere

**Decision**:
- A domain message is a value `{ code, params }` (`Message`). `params` holds only plain JSON:
  numbers, strings, company ids, holder refs. The catalog turns it into text in the chosen
  language, resolving names at that point.
- **Transient** messages (`unavailable` reasons, end-trigger notices, option warnings,
  `SessionStore` errors, voice `notUnderstood` reasons) carry a `Message` instead of a Spanish
  string. These are never saved.
- **Stored warnings** (`GroupEntry.warnings`) keep their current shape and gain an optional
  `params`. New entries still write `messageEs` (Spanish text, built from the Spanish catalog).
  This keeps exports importable by older app versions, whose `WarningSchema` requires `messageEs`
  (FR-015), and keeps the `code` already stored.
- **To render a stored warning**: if the catalog knows `code` and either the message takes no
  params or `params` is present, render it from the catalog in the current language. Otherwise
  show the stored `messageEs`.

**Rationale**:
- History has to re-render old entries in the new language (FR-006), and only structure allows
  that. Everyone agrees on the `code` already.
- Writing `messageEs` as well costs a few bytes per warning. Without it, an older app couldn't
  import a newer export.
- zod strips unknown keys by default, so older versions ignore `params`.

**Known limit (accepted)**: a warning stored *before* this feature whose code needs params has no
`params`, so in English it shows its original Spanish text. Every session recorded before this
feature was played in Spanish, so this only affects someone who switches a pre-014 session to
English. Warnings that take no params do translate. This keeps SC-006 ("readable History") true,
with that caveat recorded.

**Alternatives considered**:
- *Re-run `validate` on the state before each group to recompute its warnings*: deterministic,
  but the costs outweigh the gain. It is expensive across a 160-entry History, warnings from
  triggers and compound actions don't come from `validate`, and a later rule fix would rewrite
  what the table was actually warned about. Rejected.
- *Store warnings in both languages*: doubles the stored text, still needs a fallback for legacy
  entries, and breaks when a third language is added. Rejected.
- *Pass the language into `ActionContext` and build text at expand time*: saved text would be
  frozen in whatever language was active, which contradicts FR-006. Rejected.

## R4. App-generated `note` events

**Decision**: The events stay as they are. The app keeps writing exactly `"Fin de la partida"` and
`"Partida reabierta"`, and 21Moon's schedule keeps its Spanish note text. When rendering, a note
whose text matches a **known system note** (a closed table in the domain catalog) or a schedule
note of the session's game (looked up through the game text, R5) shows that note's text in the
current language. Any other note is user text and shows as typed.

**Rationale**:
- Constitution I forbids rewriting events. Old logs already hold these exact strings, so matching
  on them covers new and legacy sessions the same way.
- The primitive event vocabulary is unchanged, so no plan amendment is needed for it.
- A user is very unlikely to type exactly "Fin de la partida" as their own note, and if they did,
  translating it would be harmless.

**Alternatives considered**: adding a `key` field to `note` events (an event shape change for no
gain, and legacy events would still need text matching); writing English text in new events
(would mix languages in the stored data and still need matching). Rejected.

## R5. Display text from game definitions: text packs by game id and element id

**Decision**:
- Built-in games get a **game text pack** (`src/i18n/{en,es}/games/*.ts`): for each language, the
  option labels and choice labels (by option id and value), revenue part labels (by part id),
  payment labels (by payment id), the custom-rule texts (by rule id: the 1848 `manualFloatCondition`
  question) and the schedule notes (by slot).
- Every place that shows definition text goes through one lookup:
  `gameText(game, lang).option(optionId)`, `.revenuePart(id)`, `.payment(id)`, `.ruleText(ruleId,
  field)`, `.note(slot)`.
- The lookup uses `game.id` and the element id. The session's copy of the definition, which may
  be old, is used only as the fallback.
- Custom games (made in the Custom Game screen) have no pack, so their labels show as their author
  wrote them, like user text.
- Definition fields such as `labelEs` and `label` keep their names and Spanish values, so the game
  schema, saved sessions and exports don't change.

**Rationale**:
- Saved sessions hold a frozen copy of the definition, so translating the definition itself would
  not reach old sessions. A lookup by id does, because ids are stable (they are what events and
  actions already reference).
- It keeps rules as data (Principle III): text packs are data, with no per-game code.

**Alternatives considered**: making each field `{ en, es }` in the schema (needs a schema
migration plus a read-time upgrade of every embedded copy, and custom-game JSON gets more complex);
keeping only the Spanish strings and translating with a lookup by Spanish text (fragile). Rejected.

**Proper nouns and aliases**: company names, short names, private names, train names and currency
symbols don't change (FR-008). Voice aliases stay as one list per company with both languages'
spoken forms. RotLA already mixes them (`"union", "unión"`), and FR-014d allows recognizing both.
An alias audit (R9) adds missing English spoken forms.

## R6. Language preference: storage, detection, migration, applying it

**Decision**:
- **Storage**: a new device setting, `language: "en" | "es"`, saved only when the user picks one.
  When it is absent, the language is detected each launch.
- **Detection** (FR-002): `detectLanguage(navigator.languages ?? [navigator.language])`. If the
  first entry's primary subtag is `es`, use `"es"`; otherwise use `"en"`.
  - Only the first entry counts, because it is the user's top preference.
  - A non-Spanish first entry gives English even if Spanish is listed later. This is the spec's
    "English otherwise".
- **Voice region per language** (FR-014a): `voiceLocales: { es?: string; en?: string }`.
  - At read time, the legacy `voiceLocale` (for example `"es-UY"`) becomes `voiceLocales.es` when
    it starts with `es`.
  - Defaults: `es-ES` for Spanish (as today) and `en-US` for English.
  - The legacy row is deleted on the next save, like the feature 005 key migration.
- **Applying the language**:
  - `AppProvider` reads the settings while opening the database, before the first render, so
    there's no flash of the wrong language.
  - The language goes into a `LanguageContext`.
  - Choosing a language in Settings **applies and saves at once** (FR-003). It is not part of the
    existing provider/key draft and its "Guardar" button, because a selector that only works after
    "Save" would read as broken.
- **Document language** (FR-013): on every change, set `document.documentElement.lang`.
  `index.html` ships `lang="en"` as the default until the script runs.
- **PWA manifest**: the manifest is a static file and only takes one language. It uses English
  (`lang: "en"` and an English description). The installed app's name, "18xx Companion", is the
  same in both languages.

**Rationale**: these choices match the spec's clarifications Q1 and Q2, keep the settings device-local
and out of exports (Principle VII, FR-015), and reuse the existing read-time migration pattern in
`SettingsRepo`.

**Alternatives considered**: mirroring the language in `localStorage` for a synchronous first
read (not needed, since the provider already waits for IndexedDB); detecting from `Intl` (gives the
formatting locale, not the user's preferred language). Rejected.

## R7. React wiring and render-time text

**Decision**:
- `LanguageContext` provides `{ lang, setLang }`.
- `useText()` returns the UI catalog for `lang`, and `useDomainText()` returns the domain catalog
  (or the summary functions with `lang` already bound).
- Components replace their literals with catalog reads.
- **Text is always built at render time**: confirmation cards (touch and voice), toasts and
  feedback keep the action, events and `Message` values, not finished strings.
  - The voice proposal's `summaryEs` field is removed, and its summary is built where it is shown.
  - `Feedback { kind: "error", messageEs }` becomes `{ kind: "error", message: Message }`.
  - This is what lets an open card or sheet re-render in the new language without changing its
    proposed action (spec edge case).

**Rationale**: one mechanism serves every surface. A switch re-renders the tree from context, so
no reload is needed, which is how SC-003 is met.

**Alternatives considered**: a global mutable "current language" read by domain functions
(hidden state that makes domain functions impure, against Principle VI's testability); reloading
the page on switch (fails FR-003). Rejected.

## R8. Money and number formatting

**Decision**: `formatMoney(amount, game, lang)`. English uses a `,` thousands separator
(`$1,200`). Spanish keeps `.` (`$1.200`). The `−` sign, the currency symbol before the number and
whole numbers stay the same. It remains a small hand-written function. Other numbers in sentences
(counts, percentages, round numbers) are integers below 1,000 and are written without separators,
as today.

**Rationale**: the current output is exact and tested. `Intl.NumberFormat` would vary by engine
and could add non-breaking spaces or other symbols, which would change the Spanish output
(FR-010).

## R9. Voice in the display language

**Decision**:
- `VoiceSession` gains `lang`, and three parts of the voice request take it:
  - `systemPrompt(session)`: the text comes from the voice catalog. The Spanish prompt is
    byte-identical to today's, which the current snapshot test checks. The English prompt follows
    the same structure, with English number words and English command examples ("buy a 4 and pay
    290").
  - `buildToolSpecs(session)`: tool and parameter descriptions come from the catalog. Tool names,
    parameter names and enum values (ids) are the same in every language, so validation and
    resolution don't change (FR-014b).
  - `snapshotAndTranscript(input)`: the snapshot lines come from the catalog, and so do the
    recent-entry summaries.
- **Caching**: the language is part of the stable prefix. Anthropic's cache works on the prefix
  content, so a language change starts a new cache. In the Gemini cache, a new `stable` string
  removes the old cache entry, as it does today. No cache code changes.
- **Speech**: `useVoice` passes `voiceLocales[lang]` to `SpeechCapture`.
- **Settings**: the region list shows the current language's regions.
  - Spanish: the current 8 regions.
  - English: United States (`en-US`), United Kingdom (`en-GB`), Australia (`en-AU`), Canada
    (`en-CA`), Ireland (`en-IE`), India (`en-IN`), New Zealand (`en-NZ`).
- **Query answers** (`answerQuery`) return `Message` values or structured data that the catalog
  turns into text. Answers still come only from app state (Principle IV).
- **Errors**: provider error kinds map to catalog messages. The touch fallback and transcript
  display are unchanged.
- **Aliases**: audit each built-in game's company and private aliases for the forms English
  speakers say ("Pennsy", "B and O", "C and O", "New York Central"). Add missing ones to the
  definitions' `aliases` lists. This changes definition data, so the game tests and prompt
  snapshots are re-run.

**Rationale**: everything the model sees comes from one session-scoped value, so voice and touch
stay on the same path in both languages. Keeping the Spanish prompt byte-identical is the
cheapest proof that Spanish accuracy can't regress (SC-007, second half).

**Alternatives considered**:
- *Keep the Spanish prompt and tools for English speech*: models handle mixed-language input, but
  the instructions would describe Spanish phrasing, and cards and errors would need a separate
  language path. Rejected.
- *Translate the transcript to Spanish first*: an extra call per command, against the
  one-call-per-command rule. Rejected.

## R10. A bilingual voice eval set

**Decision**:
- **Cases** in `eval/voice/cases.jsonl` gain `lang: "es" | "en"`. A missing value reads as `"es"`,
  so the 93 existing cases don't change.
- **English cases** are added per existing category (payout, stock, trains, flow, corrections,
  costs, compound, loans, queries, clarification, notUnderstood). They are spread across the same
  fixtures, with about the same held-out share (~20%), to around **80–95 cases**.
- **Where English transcripts come from**: written by the user as an English-speaking 18xx table
  would say them, following the constitution's 2.1.0 allowance for a newly added language. Real
  transcripts replace them as they are collected.
- **Fixtures** stay language-neutral (they are sessions). The runner builds each case's
  `VoiceSession` with the case's `lang`.
- **Runner**:
  - `eval:voice` takes `--lang es|en|all` (default `all`).
  - The report gains a per-language section (accuracy by category, cost per command).
  - `compare.ts` compares per language.
  - The baseline is written per language.
- **Gate (SC-007)**: for the default provider/model, English accuracy must be within 5 points of
  Spanish, and Spanish must be no lower than the latest pre-014 baseline.
  - Every provider/model in the allowlist must have a report for both languages before English
    voice ships.
  - These are paid runs, so the user runs them.

**Rationale**: these are the constitution 2.1.0 requirements (Principle VI and Platform
constraints), with no change to fixtures or grading.

## R11. Test strategy

**Decision**:
- **Existing tests pin Spanish.** `openSeededTable`, the other UI helpers and the domain summary
  tests default to `lang: "es"` (or seed `language: "es"`). Every current assertion then stays
  valid without edits, and that **is** the proof of SC-002 and FR-010. jsdom reports `en-US`, so
  without pinning, the whole UI suite would switch to English.
- **New English tests**:
  - Domain: English summaries, `formatMoney` in English, `detectLanguage`, settings migration,
    and message rendering, including the legacy-warning fallback and system-note matching.
  - UI: the language switch (immediate, persisted, unsaved input kept, `html[lang]`), an English
    smoke test per screen, and the region list following the language.
- **Spanish-leak sweep (SC-001)**: render the main screens and sheets of a seeded session of each
  of the four games in English. Fail on any text node or `aria-label` with Spanish-only
  characters (`áéíóúñ¿¡`) or with any word from a short list of common Spanish words, apart from
  proper nouns and seeded user text.
- **Catalog checks (SC-004)**: completeness is enforced by the types. A test also walks both
  catalogs and fails on empty strings, and on English entries left identical to their Spanish
  ones (with a short allowlist of words that really are the same, such as "IPO", "OR", "Pool" and
  "Landmarks").
- **Voice**: the prompt and tool snapshot tests run in both languages. The Spanish snapshots must
  not change. `resolve.test.ts` gets English cases.
- **Playwright** already uses `locale: "es-ES"`, so the existing specs stay Spanish. Add one
  `en-US` spec covering the first-launch default, switching to Spanish and back, and a layout check
  on phone and tablet (SC-005).
- **Perf**: History render perf tests run in English as well as Spanish.

## R12. English terminology

**Decision**: use the terms of the English 1830 and 1848 rulebooks. Main glossary for the
English catalogs:

| Spanish (today) | English |
|---|---|
| Ronda de acciones / RA, SR | Stock Round / SR |
| Ronda de operaciones / RO, OR | Operating Round / OR |
| Ronda de fusiones / RF, MR | Merger Round / MR |
| Ronda de compañías (CR, 21Moon) | Company Round / CR |
| Privadas | Privates / Private auction |
| Ciclo 2 de 6 | Cycle 2 of 6 |
| abierta (parred) / flotada / administrada / en quiebra / cerrada / sin abrir | parred / floated / in receivership / bankrupt / closed / not started |
| paga / retiene / media | pays out / withholds / half pays |
| tesorería / caja | treasury |
| pool / IPO / el banco | pool / IPO / the bank |
| presidencia / presidente | presidency / president |
| tren oxidado | rusted train |
| préstamo | loan |
| Fin de la partida / Partida reabierta | Game over / Game reopened |
| Deshacer / Deshacer hasta aquí | Undo / Undo back to here |
| Confirmar / Editar / Cancelar | Confirm / Edit / Cancel |
| Completa (sesión) | Finished |

RotLA-specific terms (Landmarks, Merger Round, minors/majors) use the English rulebook wording
in `docs/rules/`.

## R13. Order of migration

**Decision**: change one layer at a time, keeping the app working and the Spanish UI unchanged
after each step:

1. **Foundations**: `Lang`, detection, settings (`language`, `voiceLocales`, migration),
   `LanguageContext`, `html[lang]`, `formatMoney(lang)`.
2. **Domain catalog**: move `es.ts` into the catalog structure, write `en.ts`, and make the
   summary functions take the language.
3. **Domain messages**: convert `warning(...)`, `unavailable(...)` and the other `messageEs`
   sources to `Message`, add `params` to stored warnings, and add the render fallback and note
   matching.
4. **Game text packs** and the lookup.
5. **UI catalog**, one screen or sheet at a time, plus the Settings language selector.
6. **Voice catalog**, `VoiceSession.lang`, regions, alias audit.
7. **Eval**: `lang` field, English cases, runner per language. Then the user's paid runs.
8. **Docs and release**: `docs/spec.md`, README, `package.json` description, manifest, version
   0.2.0.

**Rationale**: each step is testable on its own. The Spanish-pinned suite catches any Spanish
regression as soon as it happens.

## R14. Product docs and version

**Decision**:
- `docs/spec.md` describes the language setting, detection, bilingual voice and the eval set. The
  constitution requires this update in the same change.
- `package.json` `version` and `APP_VERSION` move to **0.2.0**, as the user asked. The value is
  recorded in exports. Importing accepts both older and newer versions, as today.
- The `package.json` description and the README stop saying "Spanish voice".
