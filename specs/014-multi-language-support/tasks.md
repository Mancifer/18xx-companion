---

description: "Task list for feature 014 — Multi-Language Support (English and Spanish)"
---

# Tasks: Multi-Language Support (English and Spanish)

**Input**: Design documents from `specs/014-multi-language-support/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/catalogs.md](contracts/catalogs.md), [contracts/ui.md](contracts/ui.md), [contracts/voice.md](contracts/voice.md), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution VI requires test-first domain logic, and SC-001, SC-002, SC-004 and SC-008 are checked by tests. Write each test task first, and see it fail before doing the matching implementation task. A task that only moves strings (Spanish catalog) has no failing test of its own: its proof is that the Spanish-pinned suite and the golden snapshot (T001) stay green.

**Organization**: Tasks are grouped by user story in spec priority order:
- **US1 (P1)**: English everywhere, reached by device detection.
- **US2 (P1)**: the language switch in Settings.
- **US3 (P2)**: History and past sessions follow the language.
- **US4 (P3)**: voice and the eval set.

US1 is the MVP. US2 can be built alongside US1 once Phase 2 is done.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)

## Path Conventions

Single-project PWA: `src/`, `tests/`, `docs/`, `eval/` and `e2e/` at the repository root.

## Testing notes

- **Spanish pin**: jsdom reports `navigator.language = "en-US"`. T009 stubs `navigator.languages`
  to `["es-ES"]` in `tests/setup.ts`, so **every existing UI test stays Spanish with no edits**.
  English tests override the stub, or seed `settings: { language: "en" }` through
  `openSeededTable` in `tests/ui/helpers.tsx`.
- **Spanish strings never change.** When a test asserts Spanish text and fails after a refactor,
  the refactor is wrong, not the test. The only allowed test edits are mechanical:
  - imports of `src/domain/i18n/es` move to `domainText("es")`;
  - assertions on `messageEs`/`reasonEs` become assertions on
    `renderMessage(x.message, ctx, "es")`, with **the same expected string**.
- **Domain tests** use `TestSession` and `makePlayers` from `tests/helpers/dispatch.ts`, plus
  `tests/helpers/stock.ts`, `tests/helpers/seed.ts` and `tests/helpers/rotla.ts`.
- **UI tests** use `openSeededTable({ game, actions, settings })` and `openMenuItem` from
  `tests/ui/helpers.tsx`. Whole-line text in lines that contain company badges needs `byLine()`
  (feature 013).
- **Voice snapshots** live in `tests/voice/__snapshots__/` (`prompt-<fixture>.txt`,
  `tools-<fixture>.json`). The Spanish files must stay byte-identical. English files get the
  suffix `.en`.
- **Catalog layout for parallel work**: the UI and domain-message catalogs are split into one
  module per area inside each language folder (`src/i18n/{en,es}/ui/<area>.ts` and
  `src/i18n/{en,es}/messages/<area>.ts`) and combined in the language's `index.ts`. Tasks on
  different areas then don't touch the same file (research R2, clarified 2026-11-04: one folder
  per language).
- **Import rule**: code under `src/domain/` must not import `src/i18n/*/ui/**` or
  `src/i18n/*/voice.ts`. T003 adds the ESLint rule that enforces it.
- **No auto-commit**: leave changes uncommitted for review. Ignore any "commit after each task"
  habit.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: record today's Spanish output and replay results first, then the folder move.
The golden snapshot and the legacy replay snapshot run **before** any code change.

- [X] T001 Create `tests/ui/spanishGolden.test.tsx` and run it **on the unchanged code**, so it
  records the current Spanish as the golden snapshot (SC-002, FR-010).
  - For each of 1830, 1848, 21Moon and RotLA, seed a session with `openSeededTable`: a par, a
    buy, an OR payout, a train buy and, for RotLA, a merger.
  - Record the `textContent` and all `aria-label`s of: Table, History, Market, the OR income sheet,
    Results after `endGame`, Settings, Home and NewSession.
  - Write them to a Vitest file snapshot, `tests/ui/__snapshots__/spanishGolden.test.tsx.snap`.
- [X] T002 Keep reference copies of the 0.1.0 session files, so the legacy test (T055) doesn't
  depend on eval fixtures that get regenerated (analyze I1, I2).
  - Copy `eval/voice/fixtures/*.json` to `tests/fixtures/legacy-0.1.0/` (same names). These copies
    are never regenerated.
  - Create `tests/persistence/legacyReplay.test.ts`. It imports each copy, replays it, and writes
    a Vitest snapshot of the final balances (bank, every player and company), share holdings, the
    market cells and the conservation result. Run it **on the unchanged code** so the snapshot is
    the reference, and the eval fixtures stay free to be regenerated later.
- [X] T003 Create the language-first layout (research R2) and move the existing text files into
  it, with **no content change**:
  - `git mv src/domain/i18n/format.ts src/i18n/format.ts`, `git mv src/domain/i18n/mentions.ts
    src/i18n/mentions.ts`, and `git mv src/domain/i18n/es.ts src/i18n/es/domain.ts`. Then update
    every import in `src/`, `tests/` and `eval/` (including the 6 test files listed in T022), and
    remove the empty `src/domain/i18n/`.
  - Create these empty modules so imports resolve. Each index exports an empty object for now.
    - `src/i18n/contract/{domain,ui,voice,games}.ts`
    - `src/i18n/{es,en}/index.ts`
    - `src/i18n/{es,en}/messages/index.ts`
    - `src/i18n/{es,en}/ui/index.ts`
    - `src/i18n/{es,en}/games/index.ts`
    - `src/i18n/index.ts`
  - In `eslint.config.js`, add a `no-restricted-imports` rule for `src/domain/**` that forbids
    `**/i18n/*/ui/**` and `**/i18n/*/voice`.
  - `npm run typecheck && npm run lint && npm test` stays green.
- [X] T004 [P] Set the Spanish eval baseline for SC-007: copy
  `eval/voice/results/2026-10-19-gemini-3.6-flash.json` (the latest full run: all 93 cases,
  97.8%) into `eval/voice/results/baseline/`, and record its name and accuracy under
  "Baselines" at the end of this file. The older `baseline/2026-10-10-gemini-3.6-flash.json`
  only covers 83 cases and is not used.
---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the language type, settings, provider, Spanish pin, money formatting, and the
`Message` type. Everything else depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Phase 2 ⚠️

- [X] T005 [P] Write `tests/domain/lang.test.ts` for `src/i18n/lang.ts` (data-model §1,
  §3).
  - `LANGUAGES` equals `[{ id: "en", nativeName: "English" }, { id: "es", nativeName: "Español" }]`
    in that order, and `DEFAULT_LANG` is `"en"`.
  - `isLang` accepts only `"en"` and `"es"`.
  - `detectLanguage`:
    - `["es"]`, `["es-UY"]`, `["es-419", "en"]` → `"es"`;
    - `["en-US", "es"]`, `["pt-BR"]`, `["fr"]`, `[]` → `"en"`;
    - only the first entry counts, and matching is case-insensitive (`["ES-uy"]` → `"es"`).
- [X] T006 [P] Write `tests/persistence/settingsLanguage.test.ts` for `SettingsRepo` in
  `src/persistence/settingsRepo.ts` (data-model §2), using `openCompanionDb(freshDbName())`.
  - A fresh DB reads `language: undefined` and `voiceLocales: { en: "en-US", es: "es-ES" }`.
  - `set({ language: "es" })` persists. An invalid stored `language` (`"fr"`) reads as `undefined`.
  - Legacy migration:
    - a stored `voiceLocale: "es-UY"` reads as `voiceLocales.es = "es-UY"`;
    - a stored `"en-GB"` reads as `voiceLocales.en = "en-GB"`;
    - the legacy row is deleted on the next `set`.
  - `set({ voiceLocales: { en: "en-AU" } })` keeps `es` unchanged (per-language merge).
  - A stored `voiceLocales.es = "en-US"` (wrong primary subtag) or `""` falls back to `"es-ES"`.
    A valid unlisted tag such as `"es-VE"` is kept.
  - Neither key appears in a session export (`tests/domain/export.test.ts` pattern).
- [X] T007 [P] Write `tests/domain/formatMoney.test.ts` for `formatMoney(amount, game, lang)` in
  `src/i18n/format.ts` (R8).
  - `"es"`: `1200` → `"$1.200"`, `-40` with `₡` → `"−₡40"`, `630` with `£` → `"£630"`,
    `1234567` → `"$1.234.567"`.
  - `"en"`: `"$1,200"`, `"−₡40"`, `"£630"`, `"$1,234,567"`.
  - `0` → `"$0"` in both.
- [X] T008 [P] Write `tests/app/language.test.tsx` for `src/app/language.tsx`.
  - `LanguageProvider initial="en"` gives `useLang().lang === "en"`.
  - `setLang("es")` re-renders consumers in one act, sets `document.documentElement.lang` to
    `"es"`, and calls the injected save function with `{ language: "es" }`.
  - A rejected save keeps `"es"` active and reports the failure through the callback.

### Implementation for Phase 2

- [X] T009 Pin Spanish for the existing suite in `tests/setup.ts`: when `navigator` exists, define
  `navigator.languages` as `["es-ES"]` with `Object.defineProperty` (configurable). Export a
  helper `setNavigatorLanguages(list)` from `tests/helpers/session.ts` that English tests use and
  restore in `afterEach`.
- [X] T010 [P] Implement `src/i18n/lang.ts`: `Lang`, `LANGUAGES`, `DEFAULT_LANG`, `isLang`,
  `detectLanguage(preferred)`, and `navigatorLanguages()`. The last returns `navigator.languages`
  if non-empty, else `[navigator.language]`, else `[]`, and is safe when `navigator` is undefined.
  Makes T005 pass.
- [X] T011 [P] Change `formatMoney` in `src/i18n/format.ts` to
  `formatMoney(amount, game, lang: Lang)`. English uses `","` and Spanish `"."`, with the same
  `−` sign and symbol position. Update every caller, passing `"es"` where no language is in reach
  yet; later tasks thread the real language. Makes T007 pass.
- [X] T012 Extend `src/persistence/settingsRepo.ts` (data-model §2).
  - `Settings` gains `language?: Lang` and `voiceLocales: { en: string; es: string }`, and loses
    `voiceLocale`.
  - `SettingsPatch` gains `language?: Lang` and
    `voiceLocales?: Partial<Record<Lang, string>>`, merged per language.
  - Read rules:
    - "missing or invalid → undefined" for `language`;
    - a `voiceLocales[lang]` must be "a non-empty BCP 47 tag whose primary subtag equals `lang`",
      otherwise the default (`en-US` / `es-ES`);
    - the legacy `voiceLocale` maps by its primary subtag;
    - add `"voiceLocale"` to the legacy rows deleted on save.
  - `DEFAULT_SETTINGS` replaces `voiceLocale` with `voiceLocales`.
  - Makes T006 pass.
- [X] T013 Implement `src/app/language.tsx` with `LanguageProvider`, `useLang`, and a
  `LanguageContext` value `{ lang, setLang }` (data-model §3).
  - `setLang` does four things, in order: updates state, sets `document.documentElement.lang`,
    saves through an injected `save(patch)`, and dispatches `SETTINGS_CHANGED`.
  - Add stubs for `useText()` and `useDomainText()` that return the catalogs once T015/T022 exist.
  - Makes T008 pass.
- [X] T014 Wire the language into `src/app/AppProvider.tsx`.
  - While opening the DB, before setting `services`, read the settings and compute
    `initial = settings.language ?? detectLanguage(navigatorLanguages())`.
  - Set `document.documentElement.lang = initial`, then render `<LanguageProvider initial save>`
    around the existing providers.
  - Change `index.html` to `<html lang="en">`.
- [X] T015 Create the domain `Message` type and the `DomainText` contract in
  `src/i18n/contract/domain.ts`, and the render helper declarations in `src/i18n/render.ts`
  (data-model §4, contracts/catalogs.md).
  - The type: `Message = { code: string; params?: Record<string, string | number> }`.
  - `MessageContext`: game, players and optional state.
  - The `DomainText` interface with every field in contracts/catalogs.md.
  - **The contract owns the message codes** (analyze U1): create
    `src/i18n/contract/messages/{stock,operating,flow,mechanics,game,store,import,voice}.ts`, each
    a map of `code → param type`. Combine them into `MessageCode` and `MessageParams<C>` in
    `contract/domain.ts`. Each language's area module is typed against its area map, so a language
    can't add or drop a code. The maps start empty and fill as T027–T032 convert each area.
  - `renderMessage`, `renderWarning` (the data-model §4 rule) and `renderNote` (the §5 rule) as
    declared functions. Their bodies come in T033 and T035.
- [X] T016 Extend `WarningSchema` in `src/domain/actions/schemas.ts` with
  `params: z.record(z.string(), z.union([z.string(), z.number()])).optional()`.
  - Change the `warning()` helper in `src/domain/actions/context.ts` to
    `warning(ctx, code, params, severity?)` (contracts/catalogs.md). It fills `messageEs` from
    `DOMAIN_TEXT.es.messages[code](params, ctx)`.
  - Change `unavailable()` to `unavailable(code, params)`, returning
    `{ ok: false, reason: Message }`.
  - Keep the old string signatures as deprecated overloads until T027–T032 have moved every call
    site, so the build stays green.

**Checkpoint**: `npm run typecheck && npm test` is green, the Spanish golden (T001) is unchanged,
and the app still renders in Spanish under the test pin.

> **Implementation notes (2026-11-04)**:
> - **Transition helpers.** Legacy call sites were renamed to `warningEs(code, text)` and
>   `unavailableEs(text)`, so `grep -rn "warningEs\|unavailableEs" src` lists what T027–T032 still
>   convert. `unavailableEs` wraps its text as a `_text` message, which `renderMessage` returns
>   as is.
> - **Wrapping reasons.** `Message` gained an optional `inner` message (never stored) for reasons
>   like "Acción 2: …". `messageWith(code, params, inner)` builds one, and the inner text arrives
>   as the `reason` param.
> - **`reasonEs` readers.** UI readers use `useMessageText()` (`src/ui/useMessage.ts`). Domain
>   tests use `TestSession.reasonEs(action)`.
> - **Settings event.** `SETTINGS_CHANGED` moved to `src/app/settingsEvents.ts`, which avoids an
>   import cycle with `useVoice`. `useText()` and `useDomainText()` land with the catalogs
>   (T022, T034).
> - **New warnings** always store `params` (`{}` when there are none). A stored warning without
>   `params` is pre-0.2.0 and shows its stored Spanish text (data-model §4).

---

## Phase 3: User Story 1 - Use the whole app in English (Priority: P1) 🎯 MVP

**Goal**: on a device whose first language isn't Spanish, every screen, sheet, card, toast,
History entry, label and message is in English, and money uses `,` thousands separators.

**Independent Test**: with `setNavigatorLanguages(["en-US"])`, seed each of the four games, play
an SR and an OR set by touch, open History, end the game and open Results. No Spanish text is
present apart from proper nouns and seeded user text (quickstart §3).

### Tests for User Story 1 ⚠️

- [X] T017 [P] [US1] Write `tests/domain/summariesEn.test.ts`.
  - Mirror the action types covered in `tests/domain/summaries.test.ts`, asserting
    `domainText("en").summary(...)`, `.proposalSummary`, `.effects`, `.movementLine`,
    `.balanceLine` and `.undone` produce English. Glossary in research R12: "pays out",
    "withholds", "half pays", "the bank", "the pool", "IPO", "treasury".
  - Mentions: with `ctx.marks` set, the English output, after `stripMentions`, equals the plain
    English output.
  - Add the plain/marked equivalence property for `"en"` to `tests/domain/randomGames.test.ts`.
- [X] T018 [P] [US1] Write `tests/domain/labelsEn.test.ts` for the English labels.
  - `roundLabel`: `"Privates"`, `"SR 3"`, `"OR 2.1"`, `"CR 1"`, `"MR 2"`.
  - `cycleRoundLabel` for 21Moon: `"Cycle 2 of 6 · OR 1/2"`, `"Cycle 3 of 6 · MR"`.
  - `status` for all six `CompanyStatus` values: "not started", "parred", "floated",
    "in receivership", "bankrupt", "closed".
  - `holderName`: "the bank", "the pool", "out of the game", "the IPO of PRR".
  - `endTriggerLabels`, `counterLabels`, and the `income`, `undoRange` and `gameEnd` groups.
- [X] T019 [P] [US1] Write `tests/domain/messages.test.ts`.
  - For every `MessageCode`, `renderMessage` in both languages returns a non-empty string with no
    `{`, `undefined`, `NaN` or raw holder ref (`player:`, `company:`) in it, given the sample
    params declared next to each code.
  - For at least ten real warnings produced by dispatching actions, the stored `messageEs` equals
    `renderMessage({ code, params }, ctx, "es")`. Cover a sell-limit warning, a train-limit
    warning, a float warning, a cash shortfall, a payment-amount warning and an end-trigger notice.
- [X] T020 [P] [US1] Write `tests/domain/gameText.test.ts` for `gameText(game, lang)` (data-model
  §6).
  - For each built-in game, every user-visible text field in the definition has an entry in both
    languages of its pack. The fields are option labels, choice labels, `revenueParts[].label`,
    payment `labelEs`, `manualFloatCondition.question` and schedule `note` texts.
  - Each Spanish entry equals the definition's current string, and there are no orphan pack keys.
  - A custom game (no pack) returns its own strings in both languages.
  - A missing English entry falls back to the definition string, never to an id.
- [X] T021 [P] [US1] Write `tests/ui/englishLeak.test.tsx` (SC-001).
  - With `setNavigatorLanguages(["en-US"])`, use the same seeds and screens as T001, and also
    open every sheet reachable from the Table menu.
  - Fail on any text node or `aria-label` containing `[áéíóúñ¿¡]`, or a whole word from this list:
    `de, del, la, el, los, las, y, con, sin, para, por, una, uno, compra, vende, paga, retiene,
    ronda, banco, jugador, compañía, acciones, tren, trenes, deshacer, confirmar, cancelar,
    editar, guardar, partida, historial, nota, ingresos, fase`.
  - Allowlist: company, private, train and player names from the seed, and user-typed text.
  - The test also asserts money renders with `,` (for example `$1,200`) somewhere on the Table.

### Implementation for User Story 1

- [X] T022 [US1] Turn `src/i18n/es/domain.ts` (today's `es.ts`, moved in T003) into the Spanish
  `DomainText`.
  - Move every function and table verbatim into an object `es` that `satisfies DomainText`.
  - The functions take the `SummaryContext`. `formatMoney` gets `"es"`, and `holderName` is
    called through the catalog.
  - Export `DOMAIN_TEXT` and `domainText(lang)` from `src/i18n/index.ts`.
  - Drop the `Es` suffix from the exported names. Update the 6 test files that import from
    `src/i18n/es/domain` (moved there in T003) to call `domainText("es")`, with the same assertions:
    - `tests/domain/companyTrains.test.ts`
    - `tests/domain/randomGames.test.ts`
    - `tests/domain/summaries.test.ts`
    - `tests/domain/turns.test.ts`
    - `tests/games/rotla.playthrough.test.ts`
    - `tests/ui/income.test.tsx`
  - The suite and T001 stay green.
- [X] T023 [US1] Update the remaining domain and app importers of the old `es.ts` exports to
  `domainText(lang)`. For now, pass `"es"` where no language is in reach:
  - `src/domain/actions/expand/flow.ts`
  - `src/domain/actions/expand/stock.ts`
  - `src/domain/ledger/rounds.ts`
  - `src/domain/queries.ts`
  - `src/app/voiceController.ts`
  - `src/voice/resolve.ts`
  - `src/voice/snapshot.ts`
- [X] T024 [US1] Write the English `DomainText` in `src/i18n/en/domain.ts`, following research R12.
  - It covers every summary, effect, movement and balance line, label, the end-trigger and counter
    labels, `income`, `undoRange`, `gameEnd`, `exportInfo` and `systemNotes` (`gameOver: "Game
    over"`, `gameReopened: "Game reopened"`).
  - Mention markers go in the same places as in Spanish.
  - Makes T017 and T018 pass.
- [X] T025 [P] [US1] Write the game text packs (data-model §6). Spanish values are copied
  verbatim from each definition into `src/i18n/es/games/<game>.ts`. English goes in
  `src/i18n/en/games/<game>.ts`, following the rulebooks in `docs/rules/`.
  - `g1830.ts`: option "Rules"/"Base game"/"1830 Classic", revenue part
    "Revenue".
  - `g1848.ts`: revenue part, and the `manualFloatCondition.question` "Is
    there a Sydney–Adelaide link?".
  - `g21moon.ts`: the "Company available from SR3" option, revenue parts
    "Local base"/"Space port", and the notes at `OR3.1`/`OR5.1` ("The space port is worth 30"/"40").
  - `grotla.ts`: all options and choices from `grotla.ts` lines 209–300, and
    the payments `expansiveToken` "Extra token", `tunneling` "Mountain", `headquarters`
    "Headquarters".
  - Register them in `src/i18n/{es,en}/games/index.ts`.
- [X] T026 [US1] Implement `gameText(game, lang)` in `src/i18n/gameText.ts`.
  - Order of preference: the pack in `lang`, then the pack in `en`, then the definition string.
    Custom games always use their own strings.
  - Route every display of definition text through it: `src/i18n/{es,en}/domain.ts` (payment and
    revenue part labels), `src/ui/sheets/OperateSheet.tsx` (payment labels lines ~674–781),
    `src/ui/screens/NewSession.tsx` (options), `src/ui/sheets/StatusSheets.tsx` (float question),
    and `src/domain/games/index.ts` (option messages).
  - Makes T020 pass.
- [X] T027 [P] [US1] Convert the messages in `src/domain/actions/expand/stock.ts`,
  `src/domain/actions/expand/compound.ts` and `src/domain/actions/limits.ts` to coded messages.
  - Declare each code and its params in `src/i18n/contract/messages/stock.ts`, keeping the
    existing warning codes. Give `unavailable` sites new `stock.*` codes. T028–T031 do the same in
    their own contract area files.
  - Move each Spanish string verbatim into `src/i18n/es/messages/stock.ts`, keyed by its code.
  - Write the English in `src/i18n/en/messages/stock.ts`.
  - `params` hold only raw ids, amounts and counts (data-model §4: "Never names or formatted
    money").
  - Update the matching test assertions, keeping the same expected Spanish strings.
- [X] T028 [P] [US1] Same conversion for `src/domain/actions/expand/operating.ts`,
  `src/domain/actions/expand/setup.ts` and `src/domain/actions/expand/status.ts`, with message
  modules `src/i18n/{es,en}/messages/operating.ts`.
- [X] T029 [P] [US1] Same conversion for `src/domain/actions/expand/flow.ts`,
  `src/domain/actions/expand/manual.ts`, `src/domain/actions/availability.ts`,
  `src/domain/actions/resolve.ts` and `src/domain/actions/triggers.ts`, with message modules
  `src/i18n/{es,en}/messages/flow.ts`. In `flow.ts`, the `note` texts come from exported
  constants `SYSTEM_NOTE_TEXT.gameOver` (`"Fin de la partida"`) and `.gameReopened`
  (`"Partida reabierta"`) in `src/i18n/render.ts`. The strings are unchanged (R4).
- [X] T030 [P] [US1] Same conversion for `src/domain/mechanics/custom/*.ts` (`corporateBankruptcy`,
  `corporateRound`, `privateGrants`, `mergers`, `landmarks`, `loans`, `nationalTakeover`,
  `bankDebt`, `auctionLaunch`), with message modules
  `src/i18n/{es,en}/messages/mechanics.ts`.
- [X] T031 [P] [US1] Convert `messageEs` to `message: Message` in `src/domain/mechanics/endTriggers.ts`
  (fired triggers), `src/domain/mechanics/{chips,chipSetup,capitalization,market,scores}.ts`,
  `src/domain/games/index.ts` (option warnings) and `src/domain/games/validateDefinition.ts`. Use
  message modules `src/i18n/{es,en}/messages/game.ts`.
- [X] T032 [US1] Convert the app-layer failures and feedback.
  - `src/app/SessionStore.ts`: failures carry `message: Message`, with new codes `store.nothingToUndo`,
    `store.confirmRange` (params `count`), `store.persistFailed` and `store.invalidAction`.
  - `src/app/AppProvider.tsx`: `Feedback { kind: "error"; message }`.
  - `src/app/sessions.ts`: the thrown error renders in `"es"` for logs only.
  - `src/persistence/exportImport.ts` (analyze G1): `upgradeExport` and the import result return
    `error: Message` instead of `errorEs`, with codes `import.notCompanion`,
    `import.unknownVersion`, `import.newerVersion` (params `version`), `import.cannotConvert`
    (params `version`) and `import.damaged` (params `path`, `issue`). Spanish text moved verbatim
    into `src/i18n/es/messages/import.ts`, English in `src/i18n/en/messages/import.ts`. Add English
    and Spanish assertions for each to `tests/domain/export.test.ts`.
  - Remove the deprecated string overloads from T016. Makes T019 pass.
- [X] T033 [US1] Implement `renderMessage` and `renderWarning` in `src/i18n/render.ts`.
  The rule: "if the catalog has `w.code`, and the message needs no params or `w.params` is
  present, use the catalog text in `lang`; otherwise use `w.messageEs`". An unknown code from a
  newer version shows `messageEs`, never the code.
- [X] T034 [US1] Create the UI catalog contract in `src/i18n/contract/ui.ts`.
  - `UiText`, assembled from per-area modules: `common`, `home`, `newSession`, `customGame`,
    `table`, `history`, `market`, `results`, `settings`, `sheets`, `components`.
  - Export `UI_TEXT`. Finish `useText()` and `useDomainText()` in `src/app/language.tsx`.
- [X] T035 [US1] Implement `renderNote(text, game, lang)` in `src/i18n/render.ts` (data-model
  §5).
  - If `text` matches a `SYSTEM_NOTES` stored text, use the catalog text.
  - Else, if it matches a schedule note of the game pack in Spanish, use that note in `lang`.
  - Else, return `text` unchanged.
  - Use it wherever `note` events are summarized (`effects` and the `note` summary in
    `src/i18n/{es,en}/domain.ts`).
  - Add cases to `tests/domain/messages.test.ts`, including a user note "Fin de la partida?" that
    stays unchanged.
- [X] T036 [P] [US1] Move the literals of `src/ui/screens/Home.tsx`, `src/ui/screens/NewSession.tsx`
  and `src/ui/screens/CustomGame.tsx` into `src/i18n/es/ui/{home,newSession,customGame}.ts`
  (verbatim) and `src/i18n/en/ui/…` (English). Read them with `useText()`, and render option
  warnings with `renderMessage`. On Home, the import error (`Home.tsx` ~122) renders
  `renderMessage(parsed.error, …)` (analyze G1). Add an English case for a bad import file to
  `tests/ui/home.test.tsx`.
- [X] T037 [P] [US1] Same for `src/ui/screens/Table.tsx`, `src/ui/components/TopBar.tsx`,
  `src/ui/components/RoundIndicator.tsx`, `src/ui/components/PlayerTile.tsx`,
  `src/ui/components/CompanyCard.tsx`, `src/ui/components/TrainCards.tsx` and
  `src/ui/components/TrainsLine.tsx`, using area `table`.
  - End-trigger notices (`Table.tsx` ~264 and ~476) render `t.message`.
- [X] T038 [P] [US1] Same for `src/ui/screens/History.tsx`, `src/ui/components/UndoToast.tsx` and
  `src/ui/components/UndoRangeSheet.tsx`, using area `history`.
  - Warnings render with `renderWarning(w, ctx, lang)`, summaries with `useDomainText()`.
  - Error feedback renders `feedback.message`.
- [X] T039 [P] [US1] Same for `src/ui/screens/Market.tsx` and `src/ui/screens/Results.tsx`, using
  areas `market` and `results`.
- [X] T040 [P] [US1] Same for `src/ui/sheets/OperateSheet.tsx` (the largest, about 48 strings), using
  area `sheets.operate`. The payment reason quick-picks come from `gameText` or the catalog. A
  picked reason is still stored as the text the user sees (user text, FR-007).
- [X] T041 [P] [US1] Same for `src/ui/sheets/StockSheet.tsx`, `src/ui/sheets/PlayerSheet.tsx`,
  `src/ui/sheets/HolderSheet.tsx`, `src/ui/sheets/BatchSheet.tsx` and
  `src/ui/sheets/ExchangeSheet.tsx`, using areas `sheets.stock`, `sheets.player`,
  `sheets.holder`, `sheets.batch` and `sheets.exchange`.
- [X] T042 [P] [US1] Same for `src/ui/sheets/TurnSheet.tsx`, `src/ui/sheets/StatusSheets.tsx`,
  `src/ui/sheets/LaunchSheet.tsx`, `src/ui/sheets/MergerSheet.tsx`,
  `src/ui/sheets/PrivatesSheet.tsx`, `src/ui/sheets/TrainCorrectionSheet.tsx`,
  `src/ui/sheets/CompanySheet.tsx` and `src/ui/sheets/IncomeSheet.tsx`.
- [X] T043 [P] [US1] Same for `src/ui/components/ConfirmationCard.tsx` (warnings via
  `renderMessage`/`renderWarning`), `ChipStrip.tsx`, `ChipSetupPlan.tsx`, `ChipSetEditor.tsx`,
  `StartChipsNotice.tsx`, `Keypad.tsx`, `Sheet.tsx`, `MicButton.tsx`, `ClarifyButtons.tsx`,
  `VoicePanel.tsx`, `src/ui/sheets/ChipsSheet.tsx`, `src/ui/actionFields.ts`, `src/ui/useExport.ts`
  and `src/ui/App.tsx`.
- [X] T044 [US1] Thread the active language through every remaining domain text call in `src/ui/`
  and `src/app/`, so no caller is left with the `"es"` placeholder from T011/T023.
  - This includes `formatMoney` in components, `holderName`, round labels, chip color names
    (`colorNameEs`), `exportInfo` and the default session name in `src/app/sessions.ts`.
  - `grep -rn '"es")' src/ui src/app` must return only intentional cases (the `messageEs` writer
    and logs).
- [X] T045 [US1] Write `tests/ui/catalog.test.ts` (SC-004, FR-012).
  - Walk `UI_TEXT`, `DOMAIN_TEXT` (fixed strings and zero-param messages) and the game packs in
    both languages. Fail on an empty string, or on an English string identical to its Spanish one
    unless it's on the allowlist: `IPO, OR, SR, CR, MR, Pool, Landmarks, Micro 2/3 labels, No, OK,
    1830 Classic` and proper nouns.
  - Run T021 and fix any leak it finds in the owning area module.

**Checkpoint**: T017–T021 and T045 pass, and the full suite and T001 are green. On a machine set
to English, `npm run dev` opens the app in English.

> **Implementation notes (2026-11-04, domain half of US1)**:
> - **T035 (notes) isn't needed.** Note *events* are never shown: the History breakdown drops
>   them, and "Fin de la partida" is the `endGame` action's own summary, which comes from the
>   catalog. The app keeps writing `SYSTEM_NOTE_TEXT` (`src/i18n/systemNotes.ts`) unchanged. User
>   notes show as typed.
> - **T018: cycles are RotLA's, not 21Moon's.** The test uses RotLA. `holderName` for an IPO reads
>   "the PRR IPO".
> - **Shared codes with different texts** got a variant param, so stored codes stay the same:
>   - `trainLimit` gets `merger`;
>   - `notEnoughShares` gets `held` or `side`;
>   - `landmarkUsed` gets `landmark`;
>   - `presidentShort` gets `trigger`;
>   - `forcedPurchase` gets `difference`;
>   - `tradeIn` gets `kind`.
>
>   `forceWithhold` hooks and `tradeInProblem` now return messages or params instead of Spanish
>   text.
> - **Subset warning code.** The New Session size warning is now `subsetSize`; it used to be the
>   option id. It isn't stored.
> - **`messageEs` / `errorEs` copies.** Store failures and import results keep a Spanish copy
>   alongside `message` / `error`, for logs and tests only; the UI renders the message.
>   `renderPlain` / `usePlainMessageText()` render messages that name nothing from a session
>   (import errors) without one.
> - **Phase names** (RotLA colors) are in the game text packs too (`phases`).
> - **T023** was done in part: `rounds.ts` takes `lang`, and `DomainText.setup` was added. The
>   voice importers (`queries.ts`, `voiceController.ts`, `resolve.ts`, `snapshot.ts`) move in
>   T065–T069.
> - **The eval fixtures** were regenerated (`npx tsx eval/voice/buildFixtures.ts`) because new
>   warnings carry `params`. The 0.1.0 copies stay in `tests/fixtures/legacy-0.1.0/`.

---

## Phase 4: User Story 2 - Switch language from Settings (Priority: P1)

**Goal**: the user picks "English" or "Español" in Settings. It applies at once, saves, survives
reloads, and keeps unsaved provider edits. The voice region list follows the language.

**Independent Test**: in Settings, type a key without saving, switch language, and check that
the text changes at once, the key is still in its field, and `html[lang]` changes. Reload, and the
choice is kept (quickstart §4, contracts/ui.md).

### Tests for User Story 2 ⚠️

- [X] T046 [P] [US2] Extend `tests/ui/settings.test.tsx`.
  - A language section comes first, with two options labelled exactly "English" and "Español" in
    both languages (FR-011).
  - With nothing saved, the detected language is selected: Spanish under the test pin, English
    under `setNavigatorLanguages(["en-US"])`.
  - Selecting "English":
    - switches the screen's headings in the same act;
    - sets `document.documentElement.lang` to `"en"`;
    - keeps an unsaved API key in its input;
    - stores `language: "en"`, readable through a fresh `SettingsRepo` on the same DB;
    - doesn't save the provider draft.
  - The region select lists the 8 Spanish regions in Spanish and the 7 English regions (United
    States, United Kingdom, Australia, Canada, Ireland, India, New Zealand) in English, with
    values `voiceLocales[lang]`.
  - Saving a region writes only that language's entry.
- [X] T047 [P] [US2] Write `tests/ui/languageSwitch.test.tsx`.
  - Seed a session and open the Table, History and a confirmation card. Change the language
    through `useLang().setLang` from a test harness component rendered inside the App.
  - Each surface re-renders in the new language. The card's proposed action, flows and chips are
    unchanged (spec edge case).
  - Remount on the same DB: the app opens in the saved language even when `navigator.languages`
    says otherwise (FR-002, SC-008).
- [X] T048 [P] [US2] Write `e2e/language.spec.ts` (Playwright), with
  `test.use({ locale: "en-US" })`, on the phone and tablet projects.
  - First launch is English.
  - Switch to Español in Settings: the text changes and `html[lang="es"]`. Reload: still Spanish.
  - On Table, History and an open sheet, in both languages: no horizontal scroll, and every
    `button` is at least 48 px high and wide (SC-005).
  - Timing (SC-003): from the click on the other language to the Settings heading showing the new
    text takes under 1,000 ms (`performance.now()` around `expect(...).toHaveText`).
  - With `locale: "es-UY"` and a fresh context, first launch is Spanish (SC-008).

- [X] T049 [P] [US2] Write `tests/ui/voiceGate.test.tsx` (FR-014e, contracts/voice.md, analyze C1).
  - With the gate at its default (`["es"]`) and the display in English:
    - the Table has no mic button and no voice panel;
    - the injected recognizer factory is never called;
    - Settings shows "Voice isn't available in English yet." in place of the region select, and
      still shows the provider key and model fields.
  - The same session in Spanish shows the mic, and it starts with `voiceLocales.es`.
  - With `vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en")`, English shows the mic, and it starts with
    `voiceLocales.en`.
  - Add `voiceLanguages()` cases to `tests/domain/lang.test.ts`:
    - unset → `["es"]`; `"es,en"` → both; `"en"` → both (Spanish is always on);
    - `"fr, ,en"` → `["es","en"]`.

### Implementation for User Story 2

- [X] T050 [US2] Add the language section to `src/ui/screens/Settings.tsx`, following
  contracts/ui.md.
  - A radio group of `LANGUAGES`, showing `nativeName`, with 48 px targets, placed above the
    provider section.
  - Selecting calls `setLang` straight away, outside the `Draft` and its save button.
  - The heading comes from `useText().settings.language`.
  - Provider help text (analyze G2): `keyHelpEs`, the free-plan notes, and the key labels "Clave
    de …"/"Añade tu clave de … en Ajustes" from `src/voice/providers/index.ts` move into
    `src/i18n/{es,en}/ui/settings.ts`, keyed by provider id, and `providers/index.ts` keeps only
    ids, models and short labels. Spanish moved verbatim.
- [X] T051 [US2] Replace the fixed `LOCALES` list in `src/ui/screens/Settings.tsx` with
  per-language region lists.
  - Spanish: the current 8 tags. English: `en-US`, `en-GB`, `en-AU`, `en-CA`, `en-IE`, `en-IN`,
    `en-NZ`.
  - Region names come from `useText().settings.regions`.
  - The draft holds `voiceLocales[lang]`. Saving writes `voiceLocales: { [lang]: value }`.
  - The unlisted-value fallback keeps working: a valid stored tag that isn't in the list is still
    shown.
- [X] T052 [US2] In `src/app/useVoice.ts`, read the speech locale as
  `settings.voiceLocales[lang]` (from `useLang()`) instead of `settings.voiceLocale`, and reload on
  `SETTINGS_CHANGED`. The `"es-ES"` fallback becomes `DEFAULT_SETTINGS.voiceLocales[lang]`. This
  applies only when `voiceEnabled(lang)` (T053). Otherwise no recognizer is created.
- [X] T053 [US2] Implement the voice-language gate (FR-014e, contracts/voice.md). Makes T049 pass.
  - Add `voiceLanguages()` and `voiceEnabled(lang)` to `src/i18n/lang.ts`. They read
    `import.meta.env.VITE_VOICE_LANGUAGES` as a comma-separated list, drop unknown entries, always
    include `"es"`, and default to `["es"]`.
  - In `src/ui/screens/Table.tsx` and `src/ui/components/MicButton.tsx`/`VoicePanel.tsx`, don't
    render voice when `!voiceEnabled(lang)`.
  - In `src/ui/screens/Settings.tsx`, show `useText().settings.voiceUnavailable` in place of the
    region select in that case.
  - Declare `VITE_VOICE_LANGUAGES` in `src/vite-env.d.ts`.
  - The production build leaves it unset until the release task after T073.

**Checkpoint**: T046–T049 pass. US1 and US2 together are a releasable display-language feature:
Spanish voice is unchanged, and under an English display the mic is hidden behind the gate.

---

## Phase 5: User Story 3 - History and past sessions follow the chosen language (Priority: P2)

**Goal**: entries recorded in Spanish, sessions from before this feature, and imported sessions
all read in the current language. User-typed text never changes.

**Independent Test**: play actions in Spanish, switch to English, and open History. Every
app-written line is English, and notes and names are as typed. Import a 0.1.0 export, which
replays identically and reads in both languages (quickstart §4–5).

### Tests for User Story 3 ⚠️

- [X] T054 [P] [US3] Write `tests/domain/legacyText.test.ts`.
  - A `GroupEntry` warning without `params`, for a code that needs params, renders its stored
    `messageEs` in `"en"`.
  - The same code with `params` renders English.
  - A zero-param code without `params` renders English.
  - An unknown code renders `messageEs`.
  - Note events `"Fin de la partida"`, `"Partida reabierta"` and the 21Moon `"El puerto espacial
    vale 30"` render as "Game over", "Game reopened" and "The space port is worth 30" in English.
- [X] T055 [P] [US3] Write `tests/persistence/crossLanguageImport.test.ts`.
  - Import each file in `tests/fixtures/legacy-0.1.0/*.json` (the 0.1.0 copies from T002).
  - The replay state matches the T002 reference snapshot in
    `tests/persistence/legacyReplay.test.ts`: same balances, holdings and market cells, and
    conservation clean (SC-006). Reuse that test's helper rather than a second snapshot.
  - Every History summary in `"en"` and `"es"` is non-empty and free of raw ids.
  - Export with the new code: the file has the same `version`, `appVersion: "0.2.0"`, no
    `language` or `voiceLocales` key anywhere, and it parses with a copy of the 0.1.0
    `WarningSchema` (without `params`).
- [X] T056 [P] [US3] Extend `tests/ui/history.test.tsx` with an English case.
  - Seed a session in Spanish with a note "Mi nota", a payment reason "Túnel" and an `endGame`.
  - Under `settings: { language: "en" }`, History shows English summaries, "Game over", and
    "Mi nota" and "Túnel" exactly as typed (FR-007).
  - Player names are unchanged.

### Implementation for User Story 3

- [X] T057 [US3] Make every `warning(...)` call write `params` (T027–T031 did this for new code).
  Check with `grep -rn "warning(\"" src/domain` that no call passes a pre-formatted string. Make
  `renderWarning` and `renderNote` in `src/i18n/render.ts` pass T054.
- [X] T058 [US3] Check `src/persistence/exportImport.ts`.
  - Exports carry `appVersion` from `APP_VERSION` and no settings.
  - Imports accept entries with and without warning `params`.
  - Make T055 pass, fixing any place that serializes rendered text instead of data.
- [X] T059 [US3] Make sure the History, Results and income views build all text at render time
  from `useLang()`, with no `useMemo` keyed without `lang`. Fix any memo in
  `src/ui/screens/History.tsx`, `src/ui/screens/Results.tsx` and `src/ui/sheets/IncomeSheet.tsx`
  whose dependency list lacks `lang`. Makes T056 and T047 pass.
- [X] T060 [US3] Run `tests/domain/perf.test.ts` and the History perf cases with the language set
  to `"en"` as well as `"es"` (a `describe.each`), keeping the existing budget. Summarize the timing
  output with a haiku subagent before reading it (project habit).

**Checkpoint**: T054–T056 pass, and the full suite and T001 are green.

---

## Phase 6: User Story 4 - Voice commands in the display language (Priority: P3)

**Goal**: speech, prompt, tools, snapshot, answers and errors follow the display language. The
Spanish prompt and tools stay byte-identical. The eval set covers both languages, with
per-language reports.

**Independent Test**: with English selected, the English prompt and tool snapshots are produced,
and English `resolve` cases give the same actions as their Spanish twins. `npm run eval:voice --
--lang en` runs. The user's paid runs meet SC-007 (quickstart §6–7, contracts/voice.md).

### Tests for User Story 4 ⚠️

- [X] T061 [P] [US4] Extend `tests/voice/prompt.test.ts` and `tests/voice/tools.test.ts`.
  - For every fixture, `systemPrompt({ ...session, lang: "es" })` and the Spanish tool specs equal
    the existing `prompt-<fixture>.txt`/`tools-<fixture>.json` **byte for byte**.
  - New English snapshots `prompt-<fixture>.en.txt`/`tools-<fixture>.en.json` are written.
  - Tool names, parameter names, types and enums are identical between `es` and `en` (FR-014b).
    Only `description` strings differ.
- [X] T062 [P] [US4] Extend `tests/voice/resolve.test.ts` with English twins of at least one case
  per category: payout, stock, trains, flow, corrections, costs, compound, loans, queries,
  clarification, notUnderstood.
  - Each twin uses the same model tool calls and expects the same proposal action as its Spanish
    case.
  - The rendered summary, query answer, `notUnderstood` reason and provider-error texts are
    English when `lang: "en"`.
  - Add a snapshot test for `snapshotAndTranscript` in English.
- [X] T063 [P] [US4] Extend `tests/ui/voice.test.tsx`.
  - Under English, the mic starts the recognizer with `lang: "en-US"`, or the saved
    `voiceLocales.en`.
  - A failed interpreter shows the English error, the transcript and the touch fallback
    (Principle IV).
  - After a switch to Spanish, the next command uses `voiceLocales.es`.
- [X] T064 [P] [US4] Extend `tests/eval/voice.test.ts`.
  - Every case's `lang` is absent, `"es"` or `"en"`. English ids start with `en-`.
  - Every category with Spanish cases has English cases, every fixture is used by English cases,
    and 15–25% of English cases are `heldout`.
  - The loader defaults `lang` to `"es"`.

### Implementation for User Story 4

- [X] T065 [US4] Add `lang: Lang` to `VoiceSession` in `src/voice/tools.ts`.
  - `useVoice` (`src/app/useVoice.ts`) and `VoiceController` (`src/app/voiceController.ts`) build
    sessions with the current language.
  - `eval/voice/load.ts` and `eval/voice/buildFixtures.ts` build them with the case's language
    (default `"es"`).
- [X] T066 [US4] Create the voice text: the `VoiceText` contract in `src/i18n/contract/voice.ts`
  and the texts in `src/i18n/{es,en}/voice.ts` (contracts/catalogs.md).
  - Move the body of `systemPromptEs` from `src/voice/prompt.ts` verbatim into `es.systemPrompt`,
    and make `prompt.ts` export `systemPrompt(session)`, which dispatches on `session.lang`.
  - Write `en.systemPrompt` following contracts/voice.md: English number words ("two hundred
    forty" = 240), "buy a 4 and pay 290", "undo" / "undo back to X" / "no, it was 260", "yes" /
    "confirm".
  - Update `src/voice/providers/anthropic.ts`, `src/voice/providers/gemini.ts` and
    `eval/voice/probeCache.ts` to call `systemPrompt`.
- [X] T067 [US4] Move the tool and parameter descriptions in `src/voice/tools.ts` into
  `VoiceText.toolDescriptions`, with the Spanish moved verbatim and English written.
  `buildToolSpecs(session)` reads `session.lang`. Makes T061 pass.
- [X] T068 [US4] Move the snapshot line texts in `src/voice/snapshot.ts` into `VoiceText.snapshot`.
  - Spanish moved verbatim. English per contracts/voice.md: "Round:", "Bank:", "Players:",
    "Latest entries (id in brackets, newest last):", "Transcript:".
  - Use `domainText(session.lang).summary` and `formatMoney(…, session.lang)`.
- [X] T069 [US4] Make the voice output follow the display language.
  - `src/domain/queries.ts`: `answerQuery` returns structured data or a `Message`.
    `VoiceText.queryAnswer` renders it.
  - `src/voice/resolve.ts`:
    - drop `summaryEs` from the proposal result, because the card renders the summary;
    - `notUnderstood` carries `reason: Message` and `hint?: Message`;
    - provider error kinds map to `VoiceText.providerError`.
  - `src/app/voiceController.ts` and `src/ui/components/VoicePanel.tsx` render with the display
    language.
  - `src/app/useVoice.ts` (analyze G3): the unavailable reasons ("Este navegador no reconoce la
    voz", "Sin conexión: la voz no está disponible") and the "Sin clave de API" error become
    `Message` values with codes `voice.noSpeech`, `voice.offline` and `voice.noKey`, declared in
    `src/i18n/contract/messages/voice.ts`. Spanish moved verbatim.
  - Makes T062 and T063 pass. Those tests set `vi.stubEnv("VITE_VOICE_LANGUAGES", "es,en")` so
    English voice is reachable.
- [X] T070 [P] [US4] Alias audit: add the missing common English spoken forms to the `aliases`
  lists in `src/domain/games/g1830.ts`, `g1848.ts`, `g21moon.ts` and `grotla.ts`.
  - Examples: "pennsy", "b and o", "c and o", "new york central", "erie", "boston and maine" for
    1830 companies; the English names of privates; "commonwealth" for 1848.
  - Keep the existing Spanish aliases.
  - Re-run `tests/games/*.test.ts`. Regenerate **only** the snapshots of the fixtures whose
    definitions changed, both `es` and `en`, and record in this task which Spanish snapshots
    changed and why (alias lines only).
  - Done 2026-11-05. English forms added to 1830 (PRR, NYC, CPR, C&O, NNH, B&M and every private),
    1848 (BoE, QR, COM, FED, VR, WA, NSW) and 21Moon (SWP, HMQ, VH). RotLA's names are English
    already, so it's unchanged. The eval fixtures were regenerated. Spanish snapshots changed:
    `prompt-1830-or.txt`, `prompt-1830-sr.txt`, `prompt-1848-or.txt`, `prompt-1848-sr.txt`,
    `prompt-21moon-or.txt`, `prompt-21moon-cr.txt`, only in the `Privadas:` line and the company
    lines (the new aliases). Every Spanish `tools-*.json` is unchanged.
- [X] T071 [US4] Add the per-language eval runner to `eval/voice/run.ts`, `eval/voice/cli.ts`,
  `eval/voice/grade.ts` and `eval/voice/compare.ts`.
  - A `--lang es|en|all` flag (default `all`).
  - The report gets one section per language, with accuracy overall, by category and held-out,
    and cost per command.
  - `compare.ts` compares per language.
  - The baseline is written per language under `eval/voice/results/baseline/`.
  - Cases with no `lang` count as `es`.
- [X] T072 [US4] Draft the English eval cases in `eval/voice/cases.jsonl` (contracts/voice.md):
  80–95 cases with ids `en-…` and `"lang": "en"`, tag `written`.
  - Spread them across the same categories and fixtures as the Spanish 93: payout 16, stock 18,
    trains 16, flow 11, corrections 9, costs 7, compound 5, loans 3, queries 4, clarification 2,
    notUnderstood 2.
  - About 20% `heldout`.
  - Use the expected-action shapes of the matching Spanish cases.
  - Makes T064 pass.
  - **The user reviews the transcripts for natural table phrasing before the paid run.**
- [X] T073 [US4] **User task (paid)**: run `npm run eval:voice -- --lang all` for the default
  provider/model, and for each other allowlisted provider/model, and run
  `npm run eval:voice:compare` against the T004 baseline. The SC-007 gate:
  - English accuracy ≥ Spanish − 5 points for the default model;
  - Spanish ≥ the pre-014 baseline;
  - a report for both languages for every allowlisted pair.

  Record the results in `specs/014-multi-language-support/tasks.md` under "Baselines".
  - Done 2026-11-07 for the default pair (gemini / gemini-3.6-flash); the gate passes. The Claude
    pair (claude-sonnet-5) was not run; see "Baselines".
- [X] T074 [US4] **After T073 passes**: turn English voice on in production by setting
  `VITE_VOICE_LANGUAGES=es,en` in the production build (`.env.production` and the Cloudflare
  build settings). Note the date and the T073 report names under "Baselines". If T073 fails, leave
  the gate at `es` and record why, so the display-language release isn't blocked.

**Checkpoint**: T061–T064 pass, and the Spanish voice snapshots are byte-identical (apart from
T070's recorded alias lines). English voice is turned on (T074) only after T073 passes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: docs, static shell, version and final validation.

- [X] T075 [P] Update `docs/spec.md`, in the same change as the constitution requires:
  - the language setting and detection (FR-001–FR-004);
  - bilingual voice and per-language regions (FR-014–FR-014d);
  - the eval set in two languages;
  - §8.3 example commands in both languages.
- [X] T076 [P] Update the static shell and product text.
  - The `vite.config.ts` manifest: `lang: "en"` and the description "Keeps the money for your 18xx
    games, by touch and by voice."
  - `README.md` and the `package.json` `description`: drop "Spanish voice" and say English and
    Spanish.
- [X] T077 [P] Set the version to `0.2.0` in `package.json` and `src/app/version.ts` (keep them in
  step). Run `npm install --package-lock-only` so `package-lock.json` matches. The eval fixtures
  keep their recorded `"appVersion": "0.1.0"`, because they are 0.1.0 exports by design (T055).
- [X] T078 Run the full gates: `npm run typecheck`, `npm run lint`, `npm test`, then
  `npm run build && npm run test:e2e`. Build first, because the :4173 preview server can serve a
  stale `dist`. Summarize long outputs with a haiku subagent. T001 must be unchanged except for
  intentional fixes, each listed in this task.
  - Intentional golden change (T050, 2026-11-05): Settings gains the "Idioma · English · Español"
    section above "Voz". Everything else on the screen is byte-identical.
  - Gates run 2026-11-05: typecheck and lint clean; `npm test` 110 files, 2266 tests passed;
    `npm run build` OK (the main chunk is 978 kB, 282 kB gzipped, over Vite's 500 kB advisory);
    `npm run test:e2e` 44 passed on phone and tablet.
- [X] T079 Remove the "Sync Impact Report" comment block from the top of
  `.specify/memory/constitution.md` before the constitution amendment is committed (its own
  commit, as agreed).
- [X] T080 **Manual check (user)**: walk `specs/014-multi-language-support/quickstart.md` §2–§6
  on a phone and a tablet. Cover first launch in `en-US` and `es-UY`, a full English session of
  each game, a mid-game switch, a 0.1.0 import, and voice in both languages.
  - Done 2026-11-07 by the user: English text across the app, device-language detection,
    mid-game switch, 0.1.0 import, and voice in Spanish and English on the deployed site (English
    after the Cloudflare `VITE_VOICE_LANGUAGES=es,en` build variable).

---

## Baselines

_Filled in by T004 and T073._

- **Spanish baseline (T004, 2026-11-04)**: `eval/voice/results/baseline/2026-10-19-gemini-3.6-flash.json`
  (gemini / gemini-3.6-flash, 93 cases, 1 run): overall **97.8%**, held-out 100%. By category:
  payout 100%, trains 93.8%, costs 85.7%, stock 100%, loans 100%, flow 100%, compound 100%,
  corrections 100%, queries 100%, clarification 100%, notUnderstood 100%. `eval/voice/results/` is
  git-ignored, so this copy is local to this machine.
- **Bilingual run (T073, 2026-11-07)**: `eval/voice/results/2026-11-07-gemini-3.6-flash-cache.json`
  (gemini / gemini-3.6-flash, cache on, 186 cases = 93 es + 93 en, 1 run): overall **98.9%**,
  held-out 100%, OR subset 98.3%, p95 latency 2.0 s, cache reads 100%, all four gates pass.
  - Spanish **98.9%** (≥ 97.8% baseline ✓); held-out 100%; trains 93.8%, every other category 100%.
  - English **98.9%** (≥ Spanish − 5 ✓); held-out 100%; trains 93.8%, every other category 100%.
  - Failures: `en-rl-or-inf-01` (the ∞ train's trade-in) and `tr-corr-03` (a train correction).
  - Cost: $0.37 total, about $0.0014 per case per language.
  - The text of the English cases was reviewed by the user before the run.
  - Not run: the Claude pair (claude-sonnet-5) in either language, which leaves part of the SC-007
    report requirement open. Claude evals have been open since feature 005.
- **English voice on (T074, 2026-11-07)**: `VITE_VOICE_LANGUAGES=es,en` in `.env.production`,
  committed through a `!.env.production` exception in `.gitignore` because the file holds no
  secrets. The Cloudflare Pages build variable must match; the user sets it.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies. The golden snapshot and the legacy replay snapshot
  (the first two tasks) must run on the **unchanged** code, before the folder move and any
  Phase 2 change.
- **Foundational (Phase 2)**: depends on Phase 1. It blocks every story.
- **US1 (Phase 3)**: depends on Phase 2.
- **US2 (Phase 4)**: depends on Phase 2. Its tests and Settings work can run alongside US1, but its
  English assertions (T046's English headings, T047's surfaces) need US1's catalog entries for
  the screens they check (T034, T038, T043).
- **US3 (Phase 5)**: depends on US1 (T033, T035, the message conversion) for the render rules it
  tests.
- **US4 (Phase 6)**: depends on Phase 2 and on T022–T024 (the domain catalog used by the snapshot),
  and T052 (the speech locale). It's independent of the UI conversion (T036–T043), except T069's
  `VoicePanel`.
- **Polish (Phase 7)**: after the stories you ship. T073 (paid eval) gates only the T074 switch
  that turns English voice on. Everything else can ship before it, behind the gate.

### Within each story

- Tests first, and see them fail.
- Spanish move (verbatim), then English, then wiring.
- Finish the story before its checkpoint.

### Parallel Opportunities

- **Phase 2**: T005–T008 are four test files, all [P]. T010 and T011 are [P] after their tests.
- **US1**:
  - T017–T021 (tests) are all [P].
  - T025 and T027–T031 work on different files and message modules.
  - T036–T043 work on different screens and catalog area modules.
- **US2**: T046–T048 and T049 [P].
- **US3**: T054–T056 [P].
- **US4**: T061–T064 [P]. T070 (aliases) can run alongside T066–T069.
- **Polish**: T075–T077 [P].

---

## Parallel Example: User Story 1

```text
# Tests together:
T017 tests/domain/summariesEn.test.ts
T018 tests/domain/labelsEn.test.ts
T019 tests/domain/messages.test.ts
T020 tests/domain/gameText.test.ts
T021 tests/ui/englishLeak.test.tsx

# Message conversion together (one message module each):
T027 stock + compound + limits      → messages/{es,en}/stock.ts
T028 operating + setup + status     → messages/{es,en}/operating.ts
T029 flow + manual + availability   → messages/{es,en}/flow.ts
T030 mechanics/custom/*             → messages/{es,en}/mechanics.ts
T031 endTriggers + games            → messages/{es,en}/game.ts

# UI conversion together (one catalog area each):
T036 home/newSession/customGame   T037 table   T038 history   T039 market/results
T040 sheets.operate               T041 stock/player/holder/batch/exchange
T042 remaining sheets             T043 shared components
```

## Parallel Example: User Story 4 alongside US1's UI work

```text
T066 voice prompt catalog   T067 tool descriptions   T068 snapshot   T070 alias audit
# while T036–T043 convert the UI
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1, with T001 on unchanged code.
2. Phase 2.
3. Phase 3 (US1).
4. **Stop and validate**: run T021 in English and T001 in Spanish, and open `npm run dev` with an
   English browser.

### Incremental Delivery

1. Setup + Foundational: the app is unchanged in Spanish, and the plumbing is in place.
2. US1: English on English devices (MVP).
3. US2: the user can switch. This is releasable as display-language support.
4. US3: old sessions and imports follow the language.
5. US4: English voice. It ships after the T073 eval gate.
6. Polish: docs, manifest, 0.2.0, final gates, manual check.

---

## Notes

- [P] tasks touch different files and have no dependencies on incomplete tasks.
- Spanish strings move verbatim. Any Spanish text change must be intentional and listed in T078.
- No auto-commit. The constitution amendment is committed on its own (T079), then the spec, then
  the implementation.
- Paid eval runs (T073) and the manual check (T080) are the user's.
