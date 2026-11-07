# Implementation Plan: Multi-Language Support (English and Spanish)

**Branch**: `add_english_text_and_voice_support` (feature dir `014-multi-language-support`) | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-multi-language-support/spec.md`

## Summary

The app gets English as well as Spanish, and English is the default. Both the display and voice
follow one device setting. When nothing is saved, a Spanish device opens in Spanish and every
other device in English.

The approach is **typed in-house catalogs** with no new dependency. All of a language's text lives
in one folder (`src/i18n/es/`, `src/i18n/en/`), covering domain sentences, messages, UI, voice
and per-game text. Adding a language means copying a folder, and a missing translation fails `tsc`
([R1](research.md#r1-translation-mechanism-typed-in-house-catalogs-no-library),
[R2](research.md#r2-where-the-catalogs-live)).

All text is **built at render time** from data:
- **Summaries**: these already are; they now take the language.
- **Domain messages** become `{ code, params }` values
  ([R3](research.md#r3-domain-messages-become-structured-stored-warnings-stay-readable-everywhere)).
- **Stored warnings** keep writing their Spanish `messageEs` (so older versions can still import),
  gain optional `params`, and are re-rendered in the current language.
- **System notes and game-definition text** are matched by stable text or id, so sessions
  recorded before this feature also follow the language
  ([R4](research.md#r4-app-generated-note-events),
  [R5](research.md#r5-display-text-from-game-definitions-text-packs-by-game-id-and-element-id)).

Where the setting lives and how it's applied:
- **Storage**: the language is a device setting, with per-language voice regions and a read-time
  migration from the old `voiceLocale`.
- **First render**: it is loaded before the first render, applied immediately from Settings, and
  mirrored to `<html lang>` ([R6](research.md#r6-language-preference-storage-detection-migration-applying-it),
  [R7](research.md#r7-react-wiring-and-render-time-text)).
- **Money**: formatted per language ([R8](research.md#r8-money-and-number-formatting)).

Voice uses the display language end to end:
- the speech locale, the prompt, tool descriptions and the state snapshot;
- answers and errors;
- the same tools, ids and validation path in both languages.

The Spanish prompt and tools stay byte-identical
([R9](research.md#r9-voice-in-the-display-language)). The eval set gains English cases and
per-language reports ([R10](research.md#r10-a-bilingual-voice-eval-set)).

The existing test suite is pinned to Spanish and must pass unchanged. That's the regression proof
for Spanish. New English tests, a catalog check and a Spanish-leak sweep cover English
([R11](research.md#r11-test-strategy)). Work goes layer by layer
([R13](research.md#r13-order-of-migration)) and ends with the docs and the 0.2.0 version bump
([R14](research.md#r14-product-docs-and-version)).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), ES2022. Node.js 24 for tooling.

**Primary Dependencies**: the existing react 19, zod 4, idb 8 and @anthropic-ai/sdk. **No new
dependency** (R1).

**Storage**: IndexedDB `settings` store:
- new rows `language` and `voiceLocales`;
- the legacy `voiceLocale` row is migrated at read time and deleted on the next save.

Session data has one change: an optional `params` on stored warnings. The export `version` is
unchanged, and `appVersion` becomes `0.2.0` ([data-model.md](data-model.md)).

**Testing**:
- **Domain**: Vitest, test-first. New tests cover the language module, English summaries, money
  formatting, message rendering (including the legacy-warning fallback), note matching, and the
  game text pack check. The existing summary and snapshot tests are pinned to `es`.
- **UI**: Testing Library. The helpers pin Spanish. New tests cover the language switch, English
  smoke tests and the four-game Spanish-leak sweep.
- **Voice**: prompt and tool snapshots in both languages (Spanish unchanged), and English
  `resolve` cases.
- **E2E**: Playwright keeps `es-ES` and adds one `en-US` spec, on phone and tablet.
- **Eval**: `lang` on cases, English cases, per-language reports. The paid runs are the user's.

**Target Platform**: Installable PWA (Chrome Android, Safari iOS 17+, desktop), phone portrait and
tablet landscape, light and dark themes. Speech uses the Web Speech API with `en-*` or `es-*`
locales.

**Project Type**: Single-project web app (PWA), no backend.

**Performance Goals**:
- **Switching language**: re-renders the visible screen in under 1 s (SC-003). In practice it's
  one React render from context.
- **History**: rendering stays within the existing perf test budget in both languages, since
  catalog lookups are plain property reads.

**Constraints**:
- **Spanish unchanged**: Spanish output is byte-identical to today's (FR-010), in the UI, domain
  text and the voice prompt and tools.
- **No event changes**: no change to primitive events or action schemas (Principle I).
- **Exports**: still importable by 0.1.0 (FR-015).
- **Settings**: device-local and not exported (Principle VII).
- **Touch targets** stay at least 48 px in both languages.

**Scale/Scope**: about 700 strings per language:
- about 360+ UI literals in 45 files;
- about 90 domain text functions and tables;
- about 170 domain messages: 52 warning codes, about 77 `unavailable` sites, about 40 other;
- about 45 game-definition strings in 4 built-in games;
- about 150 voice strings.

Plus 80–95 new English eval cases.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Checked against
constitution **2.1.0** (amended 2026-11-04 for this feature).

| Principle | Check | Status |
|---|---|---|
| **I. Event-Sourced Ledger** | No primitive event is added or changed. App notes keep their exact stored text and are matched at render time (R4). Ledger entries stay append-only. The only addition is the optional `params` on new `GroupEntry` warnings, and legacy entries without it render from their stored `messageEs` (R3). | ✅ Pass |
| **II. Money Is Conserved** | Only formatting changes. Amounts stay integers, and invariant checks and their visible warnings are unchanged (the warnings are translated). `formatMoney` changes only the separator (R8). | ✅ Pass |
| **III. Rules as Data, the Table Wins** | Game display text is data: per-game text packs keyed by element id (R5). No `customRules` hook is added. Warnings still don't block. | ✅ Pass |
| **IV. Propose, Confirm, Undo** | Voice output stays structured tool calls validated against state, and answers come from state. Confirmation cards, one-tap undo and undo-back-to-here are unchanged, only translated. The AI-unavailable path keeps the transcript and the touch fallback in both languages (contracts/voice.md). | ✅ Pass |
| **V. Voice and Touch Parity** | Both languages use the same tools, ids and validation path (FR-014b). Tap counts don't change. 48 px targets and the layout are checked in both languages on phone and tablet (SC-005). Company colors stay paired with short names. | ✅ Pass |
| **VI. Test-First Domain Logic** | Catalog functions, money formatting, detection, message rendering and note matching are written test-first. The eval set covers both languages, and every allowlisted provider/model is measured in both before English voice ships (R10). | ✅ Pass, with release gated on the user's paid eval runs |
| **VII. Local-First Simplicity** | No backend and no new dependency. The language and regions are device settings that are never exported, and they persist through IndexedDB. Only two languages are built, and there's no translation-management tooling (YAGNI). | ✅ Pass |
| **Platform: speech-to-text** | Follows the display language, `es-*` or `en-*`. A voice-language gate (`voiceLanguages()`, FR-014e) keeps English voice off in production until its eval cases exist and the paid runs pass (T073). Until then the mic is hidden under an English display. | ✅ Pass (fixed after `/speckit-analyze` C1) |
| **Platform: resolvers** | Every resolver gets the same prompt, tools and snapshot for a given language. The language is part of the stable prefix, so caching works per language with no cache code changes. | ✅ Pass |
| **Workflow: docs** | `docs/spec.md` is updated in the same change (R14). | ✅ Planned |

**Post-design re-check (after Phase 1)**: the data model, contracts and quickstart add nothing
that changes the table above. No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-multi-language-support/
├── plan.md              # This file
├── research.md          # Phase 0: R1–R14
├── data-model.md        # Phase 1: Lang, settings, messages, notes, game text, catalogs
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   ├── catalogs.md      # Catalog interfaces, language module, hooks
│   ├── ui.md            # Settings selector, switching, layout, first launch
│   └── voice.md         # Prompt/tools/snapshot per language, aliases, eval cases and gate
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── i18n/                      # NEW  all text, one folder per language (research R2)
│   ├── lang.ts                # Lang, LANGUAGES, detectLanguage, navigatorLanguages
│   ├── format.ts              # formatMoney(amount, game, lang)  (moved from src/domain/i18n/)
│   ├── mentions.ts            # moved unchanged from src/domain/i18n/
│   ├── render.ts              # renderMessage, renderWarning, renderNote, SYSTEM_NOTES
│   ├── gameText.ts            # gameText(game, lang) lookup
│   ├── index.ts               # DOMAIN_TEXT, UI_TEXT, VOICE_TEXT, GAME_TEXT by Lang
│   ├── contract/              # domain.ts, ui.ts, voice.ts, games.ts: what every language provides
│   ├── es/                    # index.ts, domain.ts (today's es.ts, verbatim), messages/*.ts,
│   │                          #   ui/*.ts, voice.ts, games/*.ts
│   └── en/                    # the same files, in English
├── domain/
│   ├── i18n/                  # REMOVED  contents moved to src/i18n/
│   ├── actions/               # CHANGED  warning()/unavailable() take codes + params; Warning.params
│   ├── mechanics/             # CHANGED  messageEs → Message (endTriggers, custom/*)
│   ├── games/                 # CHANGED  option warnings → Message; alias audit
│   └── queries.ts             # CHANGED  answers as data for the voice catalog
├── app/
│   ├── language.tsx           # NEW  LanguageProvider, useLang, useText, useDomainText
│   ├── AppProvider.tsx        # CHANGED  loads language before first render; Feedback.message
│   ├── SessionStore.ts        # CHANGED  failures carry Message
│   ├── useVoice.ts            # CHANGED  voiceLocales[lang], VoiceSession.lang
│   └── version.ts             # CHANGED  0.2.0
├── persistence/
│   └── settingsRepo.ts        # CHANGED  language, voiceLocales, voiceLocale migration
├── ui/
│   ├── screens/Settings.tsx   # CHANGED  language selector; region list per language
│   └── **/*.tsx               # CHANGED  literals → useText(); domain text → useDomainText()
└── voice/
    ├── prompt.ts, tools.ts, snapshot.ts, resolve.ts   # CHANGED  read session.lang, text from VOICE_TEXT
    └── providers/*.ts         # CHANGED  call the language-neutral prompt builder

eval/voice/                    # CHANGED  cases.jsonl lang + English cases; run/compare/grade per language
tests/                         # setup pins "es"; new English, catalog, leak-sweep, settings-migration tests
e2e/                           # NEW  language.spec.ts (en-US)
eslint.config.js               # CHANGED  src/domain/** may not import src/i18n/*/ui or */voice
index.html, vite.config.ts     # CHANGED  lang="en"; English manifest description
docs/spec.md, README.md, package.json   # CHANGED  bilingual product description; version 0.2.0
```

**Structure Decision**: this is the existing single-project layout, plus one new top-level
`src/i18n/` that holds all text, with one folder per language (clarified 2026-11-04). An ESLint
import rule keeps the domain from importing UI or voice text, so imports still point one way
(domain ← voice ← ui).

## Complexity Tracking

No constitution violations, so nothing is recorded here.
