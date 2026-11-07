import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Interpreter, InterpreterOptions } from "../voice/interpreter";
import { activeCredentials, PROVIDERS, type ProviderId } from "../voice/providers";
import { browserRecognizer, speechAvailable, type RecognizerFactory } from "../voice/speech";
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
}

export const defaultVoiceDeps: VoiceDeps = {
  recognizer: browserRecognizer,
  createInterpreter: (provider, apiKey, model, options) => PROVIDERS[provider].createInterpreter(apiKey, model, options),
  online: () => navigator.onLine,
};

export const VoiceDepsContext = createContext<VoiceDeps>(defaultVoiceDeps);

export { SETTINGS_CHANGED };

/** `reason` is shown in the display language (feature 014). */
export type VoiceAvailability = { readonly ok: true } | { readonly ok: false; readonly reason: Message };

/**
 * FR-075: the mic is unavailable without the selected provider's key, offline, or without speech
 * recognition. Another provider's key is never used instead (feature 005).
 */
export function voiceAvailability(deps: VoiceDeps, settings: Settings | null): VoiceAvailability {
  if (!speechAvailable(deps.recognizer)) return { ok: false, reason: message("voice.noSpeech", {}) };
  if (!deps.online()) return { ok: false, reason: message("voice.offline", {}) };
  const { provider, apiKey } = activeCredentials(settings ?? DEFAULT_SETTINGS);
  if (!apiKey) return { ok: false, reason: message("voice.noKey", { provider: PROVIDERS[provider].shortLabel }) };
  return { ok: true };
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

  const controller = useMemo(() => {
    if (!store) throw new Error("useVoice needs an open session");
    return new VoiceController({
      recognizer: deps.recognizer,
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

  const phase = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const availability = voiceAvailability({ ...deps, online: () => online }, settings);
  return { controller, phase, availability };
}
