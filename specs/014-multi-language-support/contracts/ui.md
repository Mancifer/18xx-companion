# Contract: Language in the UI

Feature 014. What the user sees and can do, written as checks. Spanish wording is today's
wording. English wording follows the glossary in [research.md](../research.md#r12-english-terminology).

## Settings screen

A **Language / Idioma** section comes first on the screen, above the AI provider section.

| Element | Behavior |
|---|---|
| Section heading | The current language's word ("Language" or "Idioma") |
| Choice | Two options in a radio group or segmented control, each at least 48 px: "English" and "Español". These labels are the same in both languages (FR-011). |
| Selected option | The effective language: the saved one, or the detected one if none is saved. With no saved choice, it shows the detected language selected. It doesn't show "Automatic". |
| Selecting | Applies at once and saves. It doesn't use the "Guardar"/"Save" button of the provider section. Unsaved edits in the provider section (key, model) stay in their fields (FR-003). |
| Voice region | The existing region select now lists the **current language's** regions (FR-014a). Its value is `voiceLocales[lang]`. Changing it is still part of the provider section's draft and saved with "Save", as today. |

Spanish regions are the current 8. English regions: United States, United Kingdom, Australia,
Canada, Ireland, India, New Zealand. Region names are in the current language.

## Switching language

When the user selects the other language:
- **Visible text**: everything visible re-renders in the new language within one frame. There is
  no reload and no navigation (SC-003).
- **Open views**: the open screen, any open sheet, any open confirmation card (touch or voice),
  the undo toast and the round indicator re-render in the new language. A confirmation card keeps
  the same proposed action, flows and chips. Only its wording changes.
- **`<html lang>`**: becomes `en` or `es`.
- **Persistence**: the choice survives reload, sleep and restart (FR-004).

## Text built from saved data

- **History**: each entry's summary and effects, warnings (data-model §4 rule), system notes
  (data-model §5) and undone markers are built in the current language.
- **Built-in game text**: option names, revenue parts, payments and rule questions come from the
  game text pack in the current language.
- **Custom games**: their text shows as authored.
- **User text**: player names, session names, notes, payment reasons, voice transcripts and
  custom-game labels show as typed in every language (FR-007).
- **Money**: English `$1,200`, `£630`, `−₡40`; Spanish `$1.200`, `£630`, `−₡40` (FR-009).

## Layout

- **Both languages**: on phone portrait (Pixel 7) and tablet landscape (iPad Pro 11), no
  horizontal page scroll, no clipped button labels, and every touch target is at least 48 px
  (SC-005).
- **Long labels**: these wrap rather than truncate, except company badges, which never wrap or
  truncate (feature 013).

## First launch

| Device first language | Saved choice | App opens in |
|---|---|---|
| `es`, `es-UY`, `es-419`, … | none | Spanish |
| `en-US`, `pt-BR`, `fr`, anything else, or nothing | none | English |
| any | `en` | English |
| any | `es` | Spanish |
