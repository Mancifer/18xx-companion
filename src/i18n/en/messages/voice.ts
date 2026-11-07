import type { AreaText } from "../../contract/domain";
import type { VoiceMessages } from "../../contract/messages/voice";

/** English voice messages (feature 014). */

const PROVIDER: Readonly<Record<string, string>> = {
  auth: "The API key isn't valid.",
  permission: "The key doesn't have permission for this model.",
  model: "This model isn't available for this key.",
  rateLimit: "The usage limit was reached; try again in a moment.",
  timeout: "The answer took too long.",
  connection: "No connection to the voice service.",
  service: "Voice service error.",
};

/** Feature 015 (contracts/groq-transcription.md §4): Groq Whisper failures. */
const TRANSCRIPTION: Readonly<Record<string, string>> = {
  auth: "Groq: the key isn't valid. Check it in Settings",
  permission: "Groq: this key can't use the transcription model",
  model: "Groq: the transcription model isn't available",
  rateLimit: "Groq: too many requests, wait a moment",
  audio: "Groq couldn't read the recording",
  service: "Groq isn't responding, try again",
  timeout: "Groq took too long to answer",
  connection: "No connection to Groq",
};

export const voice: AreaText<VoiceMessages> = {
  "voice.refused": () => "The command was refused.",
  "voice.truncated": () => "The answer was cut short.",
  "voice.incomplete": () => "The command arrived incomplete.",
  "voice.noOrder": () => "I didn't recognize any command.",
  "voice.badQuestion": () => "The question couldn't be shown.",
  "voice.badQuery": () => "I didn't understand the question.",
  "voice.notGame": () => "That isn't a game command.",
  "voice.correctByUndo": () => "To correct it, undo back to that entry and record it again.",
  "voice.unknownEntity": () => "The command names something that doesn't exist.",
  "voice.noEntry": () => "I couldn't find that entry. Use the history.",
  "voice.nothingToConfirm": () => "There's nothing to confirm.",
  "voice.unexpected": () => "I didn't understand: unexpected error.",
  "voice.provider": ({ kind }) => PROVIDER[kind] ?? PROVIDER["service"] ?? "",
  "voice.noSpeech": () => "This browser doesn't recognize speech",
  "voice.offline": () => "Offline: voice isn't available",
  "voice.noKey": ({ provider }) => `Add your ${provider} key in Settings`,
  "voice.transcription": ({ kind }) => TRANSCRIPTION[kind] ?? TRANSCRIPTION["service"] ?? "",
  "voice.micDenied": () => "Voice needs the microphone. Allow it in the browser's site settings",
  "voice.noMic": () => "No microphone found",
  "voice.heardNothing": () => "Didn't hear anything",
  "voice.cut": () => "Recording stopped at 30 seconds",
  "voice.noRecorder": () => "This browser can't record audio for Whisper",
  "voice.noSpeechTryWhisper": () => "This browser doesn't recognize speech. Turn on Whisper to use voice",
  "voice.noGroqKey": () => "Add your Groq key in Settings",
};
