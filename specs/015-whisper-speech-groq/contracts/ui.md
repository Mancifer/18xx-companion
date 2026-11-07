# Contract: UI (Settings, mic, voice card)

**Feature**: [../spec.md](../spec.md) | **Research**: R4, R5, R7, R10 | **Data model**: §1, §2, §6

Spanish strings use Uruguayan vocabulary with neutral verb forms, no voseo (user preference, 2026-11-07). The final wording goes in the catalogs
(`src/i18n/<lang>/ui/settings.ts`, `components.ts`, `messages/voice.ts`), checked by the catalog
test. All controls keep 48 px targets and work on phone portrait and tablet landscape.

## 1. Settings → Voz / Voice section

New controls go after the AI provider key and before the voice region:

| Control | en | es |
|---|---|---|
| Toggle (checkbox, off by default) | "Use Whisper (Groq) for speech recognition" | "Usar Whisper (Groq) para reconocer la voz" |
| Help under toggle | "Records your command and sends the audio to Groq. Works in more browsers and recognizes names better." | "Graba tu orden y manda el audio a Groq. Funciona en más navegadores y reconoce mejor los nombres." |
| Billing note | "Groq may charge for this depending on your plan (each command counts as at least 10 s of audio)." | "Groq puede cobrar según tu plan (cada orden cuenta como al menos 10 s de audio)." |
| Key field (`type=password`, placeholder `gsk_…`) | "Groq key" | "Clave de Groq" |
| Where to get it (link `https://console.groq.com/keys`) | "Get a key at console.groq.com" | "Las claves se consiguen en console.groq.com" |
| Unsupported browser (toggle disabled) | "This browser can't record audio for Whisper" | "Este navegador no puede grabar audio para Whisper" |

Rules:
- **Language gate** (FR-018): the toggle, its help and billing note are shown only when
  `whisperOffered(lang)` (data-model §2). Otherwise they're hidden, and only the key field and its
  link stay.
- The key field is shown **whatever the toggle state**, so a key can be entered first and kept
  while Whisper is off (FR-003). The existing "don't remember keys" checkbox applies to it too.
- Saving the key never changes the toggle, and changing the toggle never clears the key.
- The toggle **saves as soon as it's tapped**, like the language picker; it saves only itself.
  The key and the other fields still wait for "Guardar". (Changed 2026-11-07: on a phone,
  Guardar is off screen below the toggle, and a lost change keeps sending audio to Groq. See
  bug `browser-speech-regression`.)
- Dev builds on Android: under "Grabar clips de control" / "Record check clips", a muted note
  says check clips can't be recorded alongside the browser's recognition there. Chrome Android
  can't share the microphone.
- In a browser with no built-in recognizer and the toggle off, the section shows the reason
  `voice.noSpeechTryWhisper`: "This browser doesn't recognize speech. Turn on Whisper to use
  voice" / "Este navegador no reconoce la voz. Para usar la voz, activar Whisper en Ajustes" (FR-004).
- **Dev builds only**: a "Grabar clips de control" / "Record check clips" checkbox
  (`checkClips`), under the existing dev controls.

## 2. Settings → Privacidad / Privacy

The audio line depends on the active engine (FR-005):
- **Browser**: unchanged ("audio goes to the browser's speech service").
- **Whisper**: "Your voice is recorded only while you hold the button and sent to Groq to turn it
  into text. It isn't stored on this device." / "Tu voz se graba solo mientras el botón está pulsado
  y se manda a Groq para pasarla a texto. No se guarda en este dispositivo."

The line about transcripts and state going to the selected AI provider is unchanged.

## 3. Mic button (`MicButton.tsx`)

| Phase | Shows |
|---|---|
| `listening`, browser | unchanged: live interim text or "Escuchando…" |
| `listening`, Whisper | "Escuchando…" / "Listening…", and a ring around the button scaled by `level` (CSS custom property, no color-only cue: the ring's thickness changes) |
| `transcribing` | "Transcribiendo…" / "Transcribing…" with a "Cancelar" / "Cancel" button (48 px); the mic is disabled |
| `interpreting` | unchanged: «transcript» · interpretando… |

- `aria-live="polite"` text announces each phase change, not every level update.
- The reason line under a disabled mic uses the availability order (data-model §2).

## 4. Voice card (`VoicePanel.tsx`)

- **Transcription error** (`voice.transcription`, `voice.micDenied`, `voice.noMic`): shown as the
  existing not-understood card, with no transcript line.
- When the browser has its own recognizer and the error is a Groq one, there is one more button:
  "Use the browser's recognition" / "Usar el reconocimiento del navegador". It saves
  `whisper: false`, closes the card and doesn't apply anything (FR-016).
- **Hints** `voice.heardNothing` and `voice.cut` show as a toast-sized line (the same style as the
  undo toast), never as an error card.
- `SaveForEval` (dev) also downloads the clip when one is held (contracts/speech-engine.md, "Dev
  check clips").
