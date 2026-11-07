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
};
