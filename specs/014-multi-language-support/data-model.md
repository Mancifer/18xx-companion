# Data Model: Multi-Language Support (English and Spanish)

Phase 1 for [plan.md](plan.md). This covers the device settings, the in-memory language state, the
message values and the catalogs. **No primitive event changes, and the export format version
stays the same.** The only change to stored session data is one optional field on stored warnings
(§4).

## 1. `Lang`

```text
Lang = "en" | "es"
LANGUAGES: readonly { id: Lang; nativeName: string }[]
  = [{ id: "en", nativeName: "English" }, { id: "es", nativeName: "Español" }]
DEFAULT_LANG = "en"
```

- The `nativeName` is shown in the selector whatever the current language is (FR-011).
- The order of `LANGUAGES` is the order in the selector. English comes first because it's the
  default.

**Voice languages (FR-014e)**:

```text
voiceLanguages(): Lang[]  = parse(VITE_VOICE_LANGUAGES) ∪ {"es"}, unknown entries dropped; default ["es"]
voiceEnabled(lang)        = voiceLanguages() includes lang
```

- This is a build setting, not a device setting. It changes only when English voice passes its
  eval gate.

## 2. Device settings (`SettingsRepo`, store `settings`)

New and changed rows. Settings stay device-local and are never exported (FR-004, FR-015,
Principle VII).

| Key | Type | Written when | Read rule |
|---|---|---|---|
| `language` | `"en" \| "es"` | The user picks a language in Settings | Missing or invalid → `undefined` (use detection, §3) |
| `voiceLocales` | `{ en?: string; es?: string }` | The user picks a voice region | Missing → from legacy `voiceLocale` (below), then defaults |
| `voiceLocale` *(legacy)* | `string` | Never again | If it starts with `es` → `voiceLocales.es`; if it starts with `en` → `voiceLocales.en`. Deleted on the next save. |

`Settings` (the read model) gains:

```text
language?: Lang                          // the saved choice; absent = follow the device
voiceLocales: { en: string; es: string } // always both, after defaults
```

- `voiceLocale` is removed from the read model.
- Defaults: `voiceLocales.en = "en-US"` and `voiceLocales.es = "es-ES"` (today's default).
- `SettingsPatch` gains `language?: Lang` and
  `voiceLocales?: Partial<Record<Lang, string>>`, which merge per language like `apiKeys`.

**Validation**:
- `language` must be one of `LANGUAGES`.
- A `voiceLocales[lang]` value must be a non-empty BCP 47 tag whose primary subtag equals `lang`.
  A stored value that breaks this falls back to the default for that language. A value not in
  the region list but valid for its language (for example `es-VE`) is kept and shown, as the
  Settings screen does today.

## 3. The language in use (in memory)

```text
effectiveLanguage = settings.language ?? detectLanguage(navigatorLanguages)
detectLanguage(list) = primarySubtag(list[0]) === "es" ? "es" : "en"
navigatorLanguages = navigator.languages if non-empty, else [navigator.language], else []
```

`LanguageContext` value:

```text
{ lang: Lang; setLang(next: Lang): Promise<void> }
```

`setLang` makes the following changes, in this order:

1. Updates context state, so the next render is in the new language.
2. Sets `document.documentElement.lang`.
3. Saves `language` through `SettingsRepo.set`.
4. Dispatches `SETTINGS_CHANGED`, so `useVoice` picks up the region for the new language.

A save failure leaves the new language active for this page load and shows the catalog's save
error.

**State transitions**:

```text
(no saved language) --launch--> detected language
(no saved language) --user picks L--> saved L
saved L --user picks M--> saved M
saved L --device language changes--> saved L      (a saved choice always wins, FR-002)
```

## 4. Messages

```text
Message = { code: string; params?: Record<string, string | number> }
```

- `code` is unique across the domain. Existing warning codes are kept exactly. New codes are
  added for the reasons and errors that had none.
- `params` holds only raw values: amounts (number), counts (number), company ids, player ids,
  holder refs, train types, cell refs, phase ids, option values. **Never names or formatted
  money**, because the catalog resolves names and formats money in the current language.
- The catalog function for a code turns `(params, ctx)` into text. `ctx` gives game, players and
  state for name lookup.

Where `Message` replaces a Spanish string (none of these is saved):

| Before | After |
|---|---|
| `AvailabilityResult { ok: false; reasonEs }` | `{ ok: false; reason: Message }` |
| `FiredTrigger { type; messageEs }` (end triggers) | `{ type; message: Message }` |
| option warnings `{ code; messageEs }` (`games/index.ts`) | `{ code; message: Message }` |
| `SessionStore` failures `{ error; messageEs }` | `{ error; message: Message }` |
| `Feedback { kind: "error"; messageEs }` | `{ kind: "error"; message: Message }` |
| voice `notUnderstood { reasonEs; hint? }` | `{ reason: Message; hint?: Message }` |
| voice `proposal { summaryEs }` | removed; the summary is built when shown |

### Stored warnings (`GroupEntry.warnings`, `WarningSchema`)

```text
Warning = { code: string; messageEs: string; severity: "info" | "warn"; params?: Record<string, string | number> }
```

- **Written**: `code`, `severity` and `params` as above. `messageEs` is the Spanish rendering at
  write time, for older app versions and as the fallback.
- **Rendered** (`renderWarning(w, ctx, lang)`): if the catalog has `w.code`, and the message
  needs no params or `w.params` is present, use the catalog text in `lang`. Otherwise use
  `w.messageEs`.
- Older apps ignore the added `params`, since zod strips unknown keys. The export `version` is
  unchanged.

## 5. Notes written by the app

The domain catalog adds a closed table:

```text
SYSTEM_NOTES: { stored: string; key: "gameOver" | "gameReopened" }[]
  = [{ stored: "Fin de la partida", key: "gameOver" }, { stored: "Partida reabierta", key: "gameReopened" }]
```

`renderNote(text, game, lang)`:
1. If `text` matches a `SYSTEM_NOTES.stored` → the catalog's text for that key.
2. Else, if the game's text pack has a schedule note whose Spanish text equals `text` → that
   note's text in `lang`.
3. Else → `text` unchanged (user note).

The stored strings stay exactly as they are. `flow.ts` keeps writing them, using constants
exported next to `SYSTEM_NOTES`, so the two can't drift.

## 6. Game text packs

```text
GameTextPack = {
  options?:      Record<optionId, { label: string; choices?: Record<value, string> }>
  revenueParts?: Record<partId, string>
  payments?:     Record<paymentId, string>
  rules?:        Record<customRuleId, Record<field, string>>      // e.g. manualFloatCondition.question
  notes?:        Record<slot, string>                              // schedule notes, by "OR3.1"
}
GAME_TEXT: Record<gameId, Record<Lang, GameTextPack>>
```

The lookup (`gameText(game, lang)`) works like this:
- **Built-in game** (its `game.id` has a pack): returns the pack's text for `lang`, falling back
  to English, then to the definition's own string.
- **Other games** (custom): always returns the definition's own string.

**Validation (test)**:
- Every user-visible text field in each built-in definition has an entry in both languages of
  its pack. The Spanish entry equals the definition's current string, which keeps the Spanish UI
  unchanged and the note matching in §5 exact.
- Every pack key exists in the definition, so there are no orphan entries.

## 7. Catalogs

Each catalog is one object per language that `satisfies` its interface, so a missing key or a
wrong parameter list is a type error (SC-004). The shapes are in
[contracts/catalogs.md](contracts/catalogs.md).

| Interface | Languages | Owner |
|---|---|---|
| `DomainText` | `en`, `es` | `src/i18n/contract/domain.ts`; text in `src/i18n/<lang>/domain.ts` and `messages/` |
| `UiText` | `en`, `es` | `src/i18n/contract/ui.ts`; text in `src/i18n/<lang>/ui/` |
| `VoiceText` | `en`, `es` | `src/i18n/contract/voice.ts`; text in `src/i18n/<lang>/voice.ts` |
| `GameTextPack` | per built-in game × `en`, `es` | `src/i18n/contract/games.ts`; text in `src/i18n/<lang>/games/` |

**Fallback rule (FR-012)**: the types require every key in both languages, so the runtime
fallback to English only matters for data-driven lookups (game text, warning codes from a newer
app version). Those lookups never show a key or an id. They show English, then the stored or
authored text.

## 8. Voice session and eval case

```text
VoiceSession = { game; players; lang: Lang }        // lang added; part of the cached prefix
EvalCase     = { ...today; lang?: Lang }             // absent = "es"
```

`VoiceController` takes `lang` (the speech locale) from `settings.voiceLocales[effectiveLanguage]`.

## 9. What does not change

- **Primitive events**: the vocabulary and shapes are unchanged (Principle I).
- **Action schemas**: user text fields (`note.text`, `payCost.reason`, `bankPays.reason`) are
  unchanged and stay as typed (FR-007).
- **Game definition schema**: field names and types are unchanged, and the Spanish values are
  unchanged.
- **Export format**: same `version`. `appVersion` becomes `"0.2.0"`. No language is written
  (FR-015).
