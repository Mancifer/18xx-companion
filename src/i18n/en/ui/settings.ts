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
  whisper: {
    toggle: "Use Whisper (Groq) for speech recognition",
    help: "Records your command and sends the audio to Groq. Works in more browsers and recognizes names better.",
    billing: "Groq may charge for this depending on your plan (each command counts as at least 10 s of audio).",
    key: "Groq key",
    getKey: "Get a key at console.groq.com",
    unsupported: "This browser can't record audio for Whisper",
    checkClips: "Record check clips",
    /** Dev builds only, on Android (bug browser-speech-regression). */
    checkClipsAndroid: "On Android, the browser's recognition can't record clips at the same time: record them on a computer.",
  },
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
  audioWhisper: "Your voice is recorded only while you hold the button and sent to Groq to turn it into text. It isn't stored on this device.",
  sent: [
    "The transcript and the game state are sent to ",
    " to interpret the command. Keys are only stored on this device and are never included when exporting a game.",
  ],
};
