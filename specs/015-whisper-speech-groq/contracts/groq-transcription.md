# Contract: Groq Transcription

**Feature**: [../spec.md](../spec.md) | **Research**: R1, R2, R6–R8 | **Data model**: §4, §5

`src/voice/transcription/groq.ts` exposes one function, which the app and `eval:audio` both use:

```ts
export const GROQ_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

export type Transcriber = (
  audio: Blob,
  options: { readonly apiKey: string; readonly lang: Lang; readonly prompt: string;
             readonly fileName: string; readonly signal?: AbortSignal;
             readonly model?: string /* eval only */ },
) => Promise<TranscriptionResult>;   // never rejects; errors come back as { kind: "error" }
```

## 1. Request

`POST https://api.groq.com/openai/v1/audio/transcriptions`

Header: `Authorization: Bearer <apiKey>`. The `Content-Type` is set by the browser from the
`FormData` (multipart boundary).

| Field | Value |
|---|---|
| `file` | `audio` as `command.<webm|ogg|mp4>` (research R3) |
| `model` | `GROQ_TRANSCRIPTION_MODEL` |
| `language` | `"es"` or `"en"` |
| `prompt` | `buildHint(session, lang)`, at most 400 characters and 180 estimated tokens (data-model §4) |
| `response_format` | `"verbose_json"` |
| `temperature` | `"0"` |

## 2. Response (200)

Validated with zod (`passthrough`):

```json
{ "text": " Ana compra una del B&O.",
  "segments": [ { "text": " Ana compra una del B&O.", "no_speech_prob": 0.01, "avg_logprob": -0.21 } ] }
```

- `segments` present → filter (data-model §5), join the remaining `text` with a space, trim.
- `segments` absent → use `text`, trimmed.
- The result is checked against the hallucination list of `lang` → `empty/hallucination`.
- Empty after trimming → `empty/noSpeech`.
- A body that fails validation → `error` with kind `service`.

## 3. Timeout and retry

- Each attempt has an 8 s budget (`AbortController`). The caller's `signal` aborts too. A caller
  abort resolves as `empty/cancelled`, never as an error.
- At most **one** retry, after `min(retry-after, 1 s)` or 0.5 s, when one of these happens:
  - a 429 with `retry-after` of 1 s or less (or none);
  - a 5xx;
  - a network `TypeError`.
- No retry on 400, 401, 403, 404, 413 or 422, or on a timeout.

## 4. Error mapping

| Condition | `TranscriptionError.kind` | Message `voice.transcription { kind }` (en / es) |
|---|---|---|
| 401 | `auth` | "Groq: the key isn't valid. Check it in Settings" / "Groq: la clave no es válida. Revisar la clave en Ajustes" |
| 403 | `permission` | "Groq: this key can't use the transcription model" / "Groq: esta clave no puede usar el modelo de transcripción" |
| 404 | `model` | "Groq: the transcription model isn't available" / "Groq: el modelo de transcripción no está disponible" |
| 429 | `rateLimit` | "Groq: too many requests, wait a moment" / "Groq: demasiados pedidos, intentar de nuevo en un momento" |
| 400, 413, 422 | `audio` | "Groq couldn't read the recording" / "Groq no pudo leer la grabación" |
| 5xx, bad body | `service` | "Groq isn't responding, try again" / "Groq no responde, intentar de nuevo" |
| 8 s elapsed | `timeout` | "Groq took too long to answer" / "Groq tardó demasiado en responder" |
| network failure (`TypeError` from fetch) | `connection` | "No connection to Groq" / "Sin conexión con Groq" |
| any other thrown error | `service` | (as 5xx; not retried) |

The error's `message` holds `Groq: <status> <error.message from body>` for the dev log only. It
never contains the key, the prompt or the audio.

## 5. Mic errors (not Groq, same card)

| `MicError.kind` | Message code | en / es |
|---|---|---|
| `denied` | `voice.micDenied` | "Voice needs the microphone. Allow it in the browser's site settings" / "La voz necesita el micrófono. Hay que permitirlo en los ajustes del sitio del navegador" |
| `noDevice` | `voice.noMic` | "No microphone found" / "No se encontró un micrófono" |
| `other` | `voice.unexpected` | (existing) |

## 6. Empty hints (not errors)

| Hint | Message code | en / es |
|---|---|---|
| `empty` | `voice.heardNothing` | "Didn't hear anything" / "No escuché nada" |
| `cut` | `voice.cut` | "Recording stopped at 30 seconds" / "La grabación se cortó a los 30 segundos" |

## 7. Hallucination lists (in each language's voice text)

The lists are matched after normalization: lower case, no accents, no punctuation, collapsed
spaces. They start as below and grow from the audio check.

- **es**: `gracias por ver el video`, `gracias por ver`, `subtitulos realizados por la comunidad
  de amaraorg`, `suscribete`, `gracias`
- **en**: `thank you for watching`, `thanks for watching`, `you`, `thank you`, `bye`

Match the *whole* transcript only, never a substring. "Gracias" alone is dropped, but "gracias,
Ana paga 30" is kept.
