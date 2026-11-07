import type { ProviderId } from "../../../voice/providers";
import type { Around } from "./table";

/** Spanish text of the Settings screen (feature 014), moved verbatim. */

export const settings = {
  title: "Ajustes",
  language: "Idioma",
  voice: "Voz",
  provider: "Proveedor",
  keyOf: (shortLabel: string) => `Clave de ${shortLabel}`,
  show: "Mostrar",
  hide: "Ocultar",
  /** Where to get a key, by provider. */
  keyHelp: {
    anthropic: "Créala en console.anthropic.com, en un espacio de trabajo con límite de gasto mensual.",
    gemini: "Consigue una clave gratis en Google AI Studio (aistudio.google.com) → «Get API key».",
  } as Readonly<Record<ProviderId, string>>,
  /** Privacy and limits notes shown when the provider is selected. */
  notes: {
    anthropic: [],
    gemini: [
      "En el plan gratuito, Google puede usar las órdenes y respuestas para mejorar sus productos. Se envían el estado de la partida y la transcripción, no datos personales. Usa el plan de pago si te importa.",
      "El plan gratuito tiene límites por minuto y por día. Si se alcanzan, la voz se pausa y el modo táctil sigue funcionando.",
    ],
  } as Readonly<Record<ProviderId, readonly string[]>>,
  noRemember: "No recordar las claves en este dispositivo",
  region: "Variante de español",
  /** The speech regions offered for this language, in order. */
  regions: {
    "es-ES": "España",
    "es-MX": "México",
    "es-AR": "Argentina",
    "es-CO": "Colombia",
    "es-CL": "Chile",
    "es-PE": "Perú",
    "es-UY": "Uruguay",
    "es-US": "Estados Unidos",
  } as Readonly<Record<string, string>>,
  voiceUnavailable: "La voz todavía no está disponible en este idioma.",
  model: "Modelo",
  saved: "Guardado",
  privacy: "Privacidad",
  audio: "El audio se procesa en el servicio de voz del navegador.",
  sent: [
    "La transcripción y el estado de la partida se envían a ",
    " para interpretar la orden. Las claves solo se guardan en este dispositivo y nunca se incluyen al exportar una partida.",
  ] as Around,
};
