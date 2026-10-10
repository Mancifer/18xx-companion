import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Interpreter } from "../voice/interpreter";
import { activeCredentials, PROVIDERS, type ProviderId } from "../voice/providers";
import { browserRecognizer, speechAvailable, type RecognizerFactory } from "../voice/speech";
import { DEFAULT_SETTINGS, type Settings } from "../persistence/settingsRepo";
import { useServices } from "./AppProvider";
import { SessionContext } from "./contexts";
import { useDispatch } from "./useSession";
import { VoiceController, type VoicePhase } from "./voiceController";

/** What the voice layer needs from the outside world; tests swap these (T121). */
export interface VoiceDeps {
  readonly recognizer: RecognizerFactory;
  readonly createInterpreter: (provider: ProviderId, apiKey: string, model: string) => Interpreter;
  readonly online: () => boolean;
}

export const defaultVoiceDeps: VoiceDeps = {
  recognizer: browserRecognizer,
  createInterpreter: (provider, apiKey, model) => PROVIDERS[provider].createInterpreter(apiKey, model),
  online: () => navigator.onLine,
};

export const VoiceDepsContext = createContext<VoiceDeps>(defaultVoiceDeps);

/** Fired by the Settings screen after a save, so the mic picks up a new key at once. */
export const SETTINGS_CHANGED = "companion:settings";

export type VoiceAvailability = { readonly ok: true } | { readonly ok: false; readonly reasonEs: string };

/**
 * FR-075: the mic is unavailable without the selected provider's key, offline, or without speech
 * recognition. Another provider's key is never used instead (feature 005).
 */
export function voiceAvailability(deps: VoiceDeps, settings: Settings | null): VoiceAvailability {
  if (!speechAvailable(deps.recognizer)) return { ok: false, reasonEs: "Este navegador no reconoce la voz" };
  if (!deps.online()) return { ok: false, reasonEs: "Sin conexión: la voz no está disponible" };
  const { provider, apiKey } = activeCredentials(settings ?? DEFAULT_SETTINGS);
  if (!apiKey) return { ok: false, reasonEs: `Añade tu clave de ${PROVIDERS[provider].shortLabel} en Ajustes` };
  return { ok: true };
}

export function useVoice(): { controller: VoiceController; phase: VoicePhase; availability: VoiceAvailability } {
  const deps = useContext(VoiceDepsContext);
  const store = useContext(SessionContext);
  const { settings: repo } = useServices();
  const { dispatch, revert, amend } = useDispatch();
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
  const lang = settings?.voiceLocale ?? "es-ES";
  const interpreter = useMemo(
    () => (provider && apiKey && model ? deps.createInterpreter(provider, apiKey, model) : undefined),
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
      lang,
      interpreter: (session, message) => {
        const current = interpreterRef.current;
        return current ? current(session, message) : Promise.reject(new Error("Sin clave de API"));
      },
      context: () => {
        const snap = store.getSnapshot();
        return { game: snap.meta.game, players: snap.meta.players, state: snap.state, effective: snap.effective, gameEnd: snap.gameEnd };
      },
      effects: {
        dispatch: (action, options) => dispatch(action, options),
        revert: () => revert(),
        amend: (groupId, action) => amend(groupId, action, { confirmed: true }),
      },
      ...(import.meta.env.DEV ? { log: (m: string) => console.info(m) } : {}),
    });
    // The effects close over the store; a new controller per session/locale is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, deps, lang]);

  const phase = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const availability = voiceAvailability({ ...deps, online: () => online }, settings);
  return { controller, phase, availability };
}
