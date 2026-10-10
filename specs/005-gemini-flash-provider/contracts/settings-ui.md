# Contract: Settings Screen (Voice section)

**Feature**: 005-gemini-flash-provider | Screen: `src/ui/screens/Settings.tsx`

## Layout (Voz section)

```text
Voz
  Proveedor           ( ● Anthropic Claude   ○ Google Gemini )   ← segmented control, 48 px targets
  Clave de <Proveedor> [••••••••••••••]  [Mostrar]
  <key help line for the selected provider>
  ☐ No recordar las claves en este dispositivo
  Variante de español  [Español de España (es-ES) ▾]
  Modelo              [<placeholder = provider default>]
  <Gemini notes, only when Gemini is selected>
  [Guardar]  Guardado
```

- Switching the provider control swaps the key and model fields to that provider's draft values. Both drafts are kept until Guardar, so switching back and forth loses nothing (US3).
- Guardar saves `provider`, both keys and both models in one `set()`, then fires `SETTINGS_CHANGED`.
- The key field's `placeholder` comes from the registry (`sk-ant-…` / `AIza…`). The field is `type=password` by default, with `autoComplete="off"`.
- The selected provider is shown by the radio state and by its name, not by color alone.

## Copy (Spanish)

| Element | Anthropic | Gemini |
|---|---|---|
| Provider label | Anthropic Claude | Google Gemini |
| Key label | Clave de Anthropic | Clave de Gemini |
| Key help | Créala en console.anthropic.com, en un espacio de trabajo con límite de gasto mensual. | Consigue una clave gratis en Google AI Studio (aistudio.google.com) → «Get API key». |
| Note 1 | — | En el plan gratuito, Google puede usar las órdenes y respuestas para mejorar sus productos. Se envían el estado de la partida y la transcripción, no datos personales. Usa el plan de pago si te importa. |
| Note 2 | — | El plan gratuito tiene límites por minuto y por día. Si se alcanzan, la voz se pausa y el modo táctil sigue funcionando. |

**Privacy section**: "La transcripción y el estado de la partida se envían a **<Proveedor seleccionado>** para interpretar la orden. Las claves solo se guardan en este dispositivo y nunca se incluyen al exportar una partida."

## Availability banner (mic)

| Situation | Message |
|---|---|
| Selected provider has no key | Añade tu clave de Anthropic en Ajustes / Añade tu clave de Gemini en Ajustes |
| Others | unchanged |

## Error messages on the voice card

Unchanged strings, plus one new string for an unknown model: «Este modelo no está disponible para esta clave.» See [research R7](../research.md#r7-provider-errors).

## Tests (tests/ui/settings.test.tsx)

1. Upgrade: legacy `apiKey`/`model` rows → Claude selected, key and model shown, voice available.
2. Select Gemini, paste a key, keep the default model, save → `provider: "gemini"`, `apiKeys.gemini` set, `apiKeys.anthropic` unchanged.
3. Switch back to Claude without retyping → the Claude key is still there.
4. Gemini notes are visible only when Gemini is selected.
5. "No recordar" → neither key is in IndexedDB after save.
