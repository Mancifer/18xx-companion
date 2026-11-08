import type { ProviderId } from "../../../voice/providers";
import type { Around } from "./table";

/** Spanish text of the Settings screen (feature 014), moved verbatim. */

export const settings = {
  title: "Ajustes",
  /** Feature 016 (US5): the screen's groups, in order. */
  groups: {
    language: "Idioma",
    ai: "Interpretación (IA)",
    speech: "Reconocimiento de voz",
    privacy: "Privacidad",
    dev: "Desarrollo",
  },
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
  /**
   * Notes shown when the provider is selected, by name (feature 016): `data` goes under
   * Privacidad, `limits` under Interpretación (IA).
   */
  notes: {
    anthropic: {},
    gemini: {
      data: "En el plan gratuito, Google puede usar las órdenes y respuestas para mejorar sus productos. Se envían el estado de la partida y la transcripción, no datos personales. Usa el plan de pago si te importa.",
      limits: "El plan gratuito tiene límites por minuto y por día. Si se alcanzan, la voz se pausa y el modo táctil sigue funcionando.",
    },
  } as Readonly<Record<ProviderId, { readonly data?: string; readonly limits?: string }>>,
  noRemember: "No recordar las claves en este dispositivo",
  /** Feature 015 (contracts/ui.md §1): Whisper on Groq, opt-in. */
  whisper: {
    /** Feature 016: the speech engine, a choice of two (the browser's own or Whisper). */
    engine: "Motor de reconocimiento",
    engineBrowser: "Del navegador",
    engineWhisper: "Whisper (Groq)",
    help: "Graba tu orden y manda el audio a Groq. Funciona en más navegadores y reconoce mejor los nombres.",
    billing: "Groq puede cobrar según tu plan (cada orden cuenta como al menos 10 s de audio).",
    key: "Clave de Groq",
    getKey: "Las claves se consiguen en console.groq.com",
    unsupported: "Este navegador no puede grabar audio para Whisper",
    /** Dev builds only (research R11). */
    checkClips: "Grabar clips de control",
    /** Dev builds only, on Android (bug browser-speech-regression). */
    checkClipsAndroid: "En Android, el reconocimiento del navegador no puede grabar clips a la vez: hay que grabarlos en una computadora.",
  },
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
  /** Feature 015 (FR-005): the audio line with Whisper on. */
  audioWhisper: "Tu voz se graba solo mientras el botón está pulsado y se manda a Groq para pasarla a texto. No se guarda en este dispositivo.",
  sent: [
    "La transcripción y el estado de la partida se envían a ",
    " para interpretar la orden. Las claves solo se guardan en este dispositivo y nunca se incluyen al exportar una partida.",
  ] as Around,
};
