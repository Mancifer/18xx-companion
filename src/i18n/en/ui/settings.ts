import type { UiText } from "../../contract/ui";

/** English text of the Settings screen (feature 014). */

export const settings: UiText["settings"] = {
  title: "Settings",
  language: "Language",
  voice: "Voice",
  provider: "Provider",
  keyOf: (shortLabel) => `${shortLabel} key`,
  show: "Show",
  hide: "Hide",
  keyHelp: {
    anthropic: "Create it at console.anthropic.com, in a workspace with a monthly spend limit.",
    gemini: "Get a free key in Google AI Studio (aistudio.google.com) → “Get API key”.",
  },
  notes: {
    anthropic: [],
    gemini: [
      "On the free plan, Google may use the commands and answers to improve its products. The game state and the transcript are sent, not personal data. Use the paid plan if that matters to you.",
      "The free plan has per-minute and per-day limits. If they're reached, voice pauses and touch keeps working.",
    ],
  },
  noRemember: "Don't remember the keys on this device",
  region: "Voice region",
  regions: {
    "en-US": "United States",
    "en-GB": "United Kingdom",
    "en-AU": "Australia",
    "en-CA": "Canada",
    "en-IE": "Ireland",
    "en-IN": "India",
    "en-NZ": "New Zealand",
  },
  voiceUnavailable: "Voice isn't available in English yet.",
  model: "Model",
  saved: "Saved",
  privacy: "Privacy",
  audio: "Audio is processed by the browser's speech service.",
  sent: [
    "The transcript and the game state are sent to ",
    " to interpret the command. Keys are only stored on this device and are never included when exporting a game.",
  ],
};
