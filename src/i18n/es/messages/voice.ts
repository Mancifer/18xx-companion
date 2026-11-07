import type { AreaText } from "../../contract/domain";
import type { VoiceMessages } from "../../contract/messages/voice";

/** Spanish voice messages, moved verbatim from the voice layer (feature 014). */

const PROVIDER: Readonly<Record<string, string>> = {
  auth: "La clave de la API no es válida.",
  permission: "La clave no tiene permiso para este modelo.",
  model: "Este modelo no está disponible para esta clave.",
  rateLimit: "Se alcanzó el límite de uso; prueba en un momento.",
  timeout: "La respuesta tardó demasiado.",
  connection: "Sin conexión con el servicio de voz.",
  service: "Error del servicio de voz.",
};

/** Feature 015 (contracts/groq-transcription.md §4): Groq Whisper failures; neutral verb forms, no voseo. */
const TRANSCRIPTION: Readonly<Record<string, string>> = {
  auth: "Groq: la clave no es válida. Revisar la clave en Ajustes",
  permission: "Groq: esta clave no puede usar el modelo de transcripción",
  model: "Groq: el modelo de transcripción no está disponible",
  rateLimit: "Groq: demasiados pedidos, intentar de nuevo en un momento",
  audio: "Groq no pudo leer la grabación",
  service: "Groq no responde, intentar de nuevo",
  timeout: "Groq tardó demasiado en responder",
  connection: "Sin conexión con Groq",
};

export const voice: AreaText<VoiceMessages> = {
  "voice.refused": () => "La orden fue rechazada.",
  "voice.truncated": () => "La respuesta quedó incompleta.",
  "voice.incomplete": () => "La orden llegó incompleta.",
  "voice.noOrder": () => "No reconocí ninguna orden.",
  "voice.badQuestion": () => "La pregunta no se pudo mostrar.",
  "voice.badQuery": () => "No entendí la pregunta.",
  "voice.notGame": () => "No es una orden del juego.",
  "voice.correctByUndo": () => "Para corregir, deshacé hasta esa entrada y volvé a anotarla.",
  "voice.unknownEntity": () => "La orden nombra algo que no existe.",
  "voice.noEntry": () => "No encontré esa entrada. Usá el historial.",
  "voice.nothingToConfirm": () => "No hay nada que confirmar.",
  "voice.unexpected": () => "No entendí: error inesperado.",
  "voice.provider": ({ kind }) => PROVIDER[kind] ?? PROVIDER["service"] ?? "",
  "voice.noSpeech": () => "Este navegador no reconoce la voz",
  "voice.offline": () => "Sin conexión: la voz no está disponible",
  "voice.noKey": ({ provider }) => `Añade tu clave de ${provider} en Ajustes`,
  "voice.transcription": ({ kind }) => TRANSCRIPTION[kind] ?? TRANSCRIPTION["service"] ?? "",
  "voice.micDenied": () => "La voz necesita el micrófono. Hay que permitirlo en los ajustes del sitio del navegador",
  "voice.noMic": () => "No se encontró un micrófono",
  "voice.heardNothing": () => "No escuché nada",
  "voice.cut": () => "La grabación se cortó a los 30 segundos",
  "voice.noRecorder": () => "Este navegador no puede grabar audio para Whisper",
  "voice.noSpeechTryWhisper": () => "Este navegador no reconoce la voz. Para usar la voz, activar Whisper en Ajustes",
  "voice.noGroqKey": () => "Falta la clave de Groq en Ajustes",
};
