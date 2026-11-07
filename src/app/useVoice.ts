import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Interpreter, InterpreterOptions } from "../voice/interpreter";
import { activeCredentials, PROVIDERS, type ProviderId } from "../voice/providers";
import { browserRecognizer, speechAvailable, type RecognizerFactory } from "../voice/speech";
import { browserEngine, type SpeechEngine } from "../voice/engine";
import { browserMediaDeps, pickMimeType, type MediaDeps, type Recording } from "../voice/recorder";
import { createGroqTranscriber, type Transcriber } from "../voice/transcription/groq";
import { buildHint } from "../voice/transcription/hint";
import { whisperEngine } from "../voice/whisperEngine";
import { whisperOffered, type Lang } from "../i18n/lang";
import { DEFAULT_SETTINGS, type Settings } from "../persistence/settingsRepo";
import { useServices } from "./AppProvider";
import { SessionContext } from "./contexts";
import { useDispatch } from "./useSession";
import { SETTINGS_CHANGED } from "./settingsEvents";
import { message, type Message } from "../i18n/contract/domain";
import { useLang } from "./language";
import { VoiceController, type VoicePhase } from "./voiceController";

/** What the voice layer needs from the outside world; tests swap these (T121). */
export interface VoiceDeps {
  readonly recognizer: RecognizerFactory;
  readonly createInterpreter: (provider: ProviderId, apiKey: string, model: string, options?: InterpreterOptions) => Interpreter;
  readonly online: () => boolean;
  /** Feature 015: the media APIs Whisper records with; absent → this browser can't use Whisper. */
  readonly media?: () => MediaDeps | undefined;
  /** Feature 015: the Groq Whisper client; absent → Whisper isn't used. */
  readonly transcriber?: Transcriber;
}

export const defaultVoiceDeps: VoiceDeps = {
  recognizer: browserRecognizer,
  createInterpreter: (provider, apiKey, model, options) => PROVIDERS[provider].createInterpreter(apiKey, model, options),
  online: () => navigator.onLine,
  media: browserMediaDeps,
  transcriber: createGroqTranscriber(),
};

/** Feature 015: whether this browser can record for Whisper (availability check 2a). */
function recorderSupported(deps: VoiceDeps): boolean {
  const media = deps.media?.();
  return deps.transcriber !== undefined && media !== undefined && pickMimeType(media.MediaRecorder) !== undefined;
}

/**
 * Feature 015 (data-model §2): Whisper is used only while the toggle is on and Whisper is offered
 * in the display language (FR-018); otherwise the browser engine, as before.
 */
export function whisperActive(settings: Settings | null, lang: Lang): boolean {
  return settings?.whisper === true && whisperOffered(lang);
}

export const VoiceDepsContext = createContext<VoiceDeps>(defaultVoiceDeps);

export { SETTINGS_CHANGED };

/** `reason` is shown in the display language (feature 014). */
export type VoiceAvailability = { readonly ok: true } | { readonly ok: false; readonly reason: Message };

/**
 * FR-075: the mic is unavailable without the selected provider's key, offline, or without speech
 * recognition. Another provider's key is never used instead (feature 005). Feature 015 (data-model
 * §2): with Whisper on, the recorder and the Groq key replace the recognizer; never a silent
 * fallback to the browser engine (FR-004).
 */
export function voiceAvailability(deps: VoiceDeps, settings: Settings | null, lang: Lang = "es"): VoiceAvailability {
  const whisper = whisperActive(settings, lang);
  if (whisper) {
    if (!recorderSupported(deps)) return { ok: false, reason: message("voice.noRecorder", {}) };
  } else if (!speechAvailable(deps.recognizer)) {
    const nudge = recorderSupported(deps) && whisperOffered(lang);
    return { ok: false, reason: message(nudge ? "voice.noSpeechTryWhisper" : "voice.noSpeech", {}) };
  }
  if (!deps.online()) return { ok: false, reason: message("voice.offline", {}) };
  if (whisper && !settings?.groqKey) return { ok: false, reason: message("voice.noGroqKey", {}) };
  const { provider, apiKey } = activeCredentials(settings ?? DEFAULT_SETTINGS);
  if (!apiKey) return { ok: false, reason: message("voice.noKey", { provider: PROVIDERS[provider].shortLabel }) };
  return { ok: true };
}

type ClipSink = (recording: Recording, engine: "browser" | "whisper") => void;

interface Engines {
  readonly browser: SpeechEngine;
  readonly whisper: SpeechEngine | undefined;
}

/** What the engines read when a command runs: the latest settings and, in dev, the clip sink. */
interface LiveRefs {
  readonly settings: { readonly current: Settings | null };
  readonly clipSink: { readonly current: ClipSink | undefined };
}

/** Feature 015: both engines. Whisper needs a transcriber; check clips exist in dev builds only. */
function createEngines(deps: VoiceDeps, live: LiveRefs): Engines {
  const clips = () => import.meta.env.DEV && live.settings.current?.checkClips === true;
  const transcribe = deps.transcriber;
  return {
    browser: browserEngine(
      deps.recognizer,
      import.meta.env.DEV
        ? { clipRecorder: () => (clips() ? deps.media?.() : undefined), onClip: (r) => live.clipSink.current?.(r, "browser") }
        : {},
    ),
    whisper: transcribe
      ? whisperEngine({
          media: deps.media ?? (() => undefined),
          transcribe,
          apiKey: () => live.settings.current?.groqKey,
          ...(import.meta.env.DEV ? { onClip: (r: Recording) => (clips() ? live.clipSink.current?.(r, "whisper") : undefined) } : {}),
        })
      : undefined,
  };
}

export function useVoice(): { controller: VoiceController; phase: VoicePhase; availability: VoiceAvailability } {
  const deps = useContext(VoiceDepsContext);
  const store = useContext(SessionContext);
  const { settings: repo } = useServices();
  const { dispatch, undoLast, undoTo } = useDispatch();
  const { lang: displayLang } = useLang();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [online, setOnline] = useState(deps.online());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void repo.get().then((s) => {
        if (!cancelled) setSettings(s);
        if (import.meta.env.DEV) {
          const loaded = String(s.whisper);
          console.info(`voz: ajustes recargados, whisper=${loaded}`);
        }
      });
    };
    const net = () => setOnline(deps.online());
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      cancelled = true;
      window.removeEventListener(SETTINGS_CHANGED, load);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, [repo, deps]);

  const credentials = settings ? activeCredentials(settings) : undefined;
  const provider = credentials?.provider;
  const apiKey = credentials?.apiKey;
  const model = credentials?.model;
  // Feature 014: speech in the display language, with that language's saved region (FR-014a).
  const lang = settings?.voiceLocales[displayLang] ?? DEFAULT_SETTINGS.voiceLocales[displayLang];
  // Read when a command starts, so a language switch keeps an open card and applies to the next command.
  const langRef = useRef(lang);
  // The session's language for the prompt, tools and snapshot of the next command (feature 014).
  const displayLangRef = useRef(displayLang);
  useEffect(() => {
    langRef.current = lang;
    displayLangRef.current = displayLang;
  }, [lang, displayLang]);
  // A key or model change makes a new interpreter, so a prompt cache is never shared (009 FR-004).
  // In development, cache events (no name, no key) go to the console.
  const interpreter = useMemo(
    () =>
      provider && apiKey && model
        ? deps.createInterpreter(
            provider,
            apiKey,
            model,
            import.meta.env.DEV ? { onCacheEvent: (e) => console.debug("[voice cache]", e.kind, e) } : undefined,
          )
        : undefined,
    [deps, provider, apiKey, model],
  );
  // Read when a command starts: a provider switch applies to the next command, while one in
  // flight finishes with the interpreter it started with, on the same controller (005 US3).
  const interpreterRef = useRef(interpreter);
  useEffect(() => {
    interpreterRef.current = interpreter;
  }, [interpreter]);

  // Feature 015: both engines; the controller reads the active one at press time.
  const settingsRef = useRef(settings);
  const whisperOnRef = useRef(whisperActive(settings, displayLang));
  useEffect(() => {
    settingsRef.current = settings;
    whisperOnRef.current = whisperActive(settings, displayLang);
  }, [settings, displayLang]);
  // Dev builds only (research R11): where each hold's audio goes when check clips are on.
  const clipSink = useRef<ClipSink | undefined>(undefined);

  const controller = useMemo(() => {
    if (!store) throw new Error("useVoice needs an open session");
    // Built at the first press (never during render), then reused for this controller.
    let engines: Engines | undefined;
    const live: LiveRefs = { settings: settingsRef, clipSink };
    return new VoiceController({
      get engine() {
        engines ??= createEngines(deps, live);
        const engine = whisperOnRef.current && engines.whisper ? engines.whisper : engines.browser;
        if (import.meta.env.DEV) {
          // Which engine a press uses, and why (the toggle as last loaded, the display language).
          const toggle = String(settingsRef.current?.whisper);
          const shown = displayLangRef.current;
          console.info(`voz: motor ${engine.id} (toggle whisper=${toggle}, idioma ${shown}, ofrecido ${String(whisperOffered(shown))})`);
        }
        return engine;
      },
      get lang() {
        return langRef.current;
      },
      interpreter: (session, userMessage) => {
        const current = interpreterRef.current;
        return current ? current(session, userMessage) : Promise.reject(new Error("no API key"));
      },
      context: () => {
        const snap = store.getSnapshot();
        return {
          game: snap.meta.game,
          players: snap.meta.players,
          state: snap.state,
          effective: snap.effective,
          gameEnd: snap.gameEnd,
          lang: displayLangRef.current,
        };
      },
      // Feature 015 (FR-010): Whisper's vocabulary hint from the session, in the display language.
      hint: () => {
        const snap = store.getSnapshot();
        return buildHint({ game: snap.meta.game, players: snap.meta.players }, displayLangRef.current);
      },
      effects: {
        dispatch: (action, options) => dispatch(action, options),
        undoLast: () => undoLast(),
        undoTo: (groupId, options) => undoTo(groupId, options),
      },
      ...(import.meta.env.DEV ? { log: (m: string) => console.info(m) } : {}),
    });
    // The effects close over the store; a new controller per session is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, deps]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    clipSink.current = (r, engine) => {
      controller.lastClip = { blob: r.blob, extension: r.extension, engine, durationMs: r.durationMs };
    };
  }, [controller]);

  // FR-013: hiding the page (another app, the screen locks) stops listening or transcribing.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== "hidden") return;
      const p = controller.getSnapshot().phase;
      if (p === "listening" || p === "transcribing") controller.cancel();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [controller]);

  const phase = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const availability = voiceAvailability({ ...deps, online: () => online }, settings, displayLang);
  return { controller, phase, availability };
}
