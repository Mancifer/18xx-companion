import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createInterpreter, type Interpreter } from "../voice/interpreter";
import { browserRecognizer, speechAvailable, type RecognizerFactory } from "../voice/speech";
import type { Settings } from "../persistence/settingsRepo";
import { useServices } from "./AppProvider";
import { SessionContext } from "./contexts";
import { useDispatch } from "./useSession";
import { VoiceController, type VoicePhase } from "./voiceController";

/** What the voice layer needs from the outside world; tests swap these (T121). */
export interface VoiceDeps {
  readonly recognizer: RecognizerFactory;
  readonly createInterpreter: (apiKey: string, model: string) => Interpreter;
  readonly online: () => boolean;
}

export const defaultVoiceDeps: VoiceDeps = {
  recognizer: browserRecognizer,
  createInterpreter,
  online: () => navigator.onLine,
};

export const VoiceDepsContext = createContext<VoiceDeps>(defaultVoiceDeps);

/** Fired by the Settings screen after a save, so the mic picks up a new key at once. */
export const SETTINGS_CHANGED = "companion:settings";

export type VoiceAvailability = { readonly ok: true } | { readonly ok: false; readonly reasonEs: string };

/** FR-075: the mic is unavailable without a key, offline, or without speech recognition. */
export function voiceAvailability(deps: VoiceDeps, settings: Settings | null): VoiceAvailability {
  if (!speechAvailable(deps.recognizer)) return { ok: false, reasonEs: "Este navegador no reconoce la voz" };
  if (!deps.online()) return { ok: false, reasonEs: "Sin conexión: la voz no está disponible" };
  if (!settings?.apiKey) return { ok: false, reasonEs: "Añade tu clave de API en Ajustes" };
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

  const apiKey = settings?.apiKey;
  const model = settings?.model;
  const lang = settings?.voiceLocale ?? "es-ES";
  const interpreter = useMemo(
    () => (apiKey && model ? deps.createInterpreter(apiKey, model) : undefined),
    [deps, apiKey, model],
  );

  const controller = useMemo(() => {
    if (!store) throw new Error("useVoice needs an open session");
    return new VoiceController({
      recognizer: deps.recognizer,
      lang,
      interpreter: (session, message) =>
        interpreter ? interpreter(session, message) : Promise.reject(new Error("Sin clave de API")),
      context: () => {
        const snap = store.getSnapshot();
        return { game: snap.meta.game, players: snap.meta.players, state: snap.state, effective: snap.effective };
      },
      effects: {
        dispatch: (action, options) => dispatch(action, options),
        revert: () => revert(),
        amend: (groupId, action) => amend(groupId, action, { confirmed: true }),
      },
      ...(import.meta.env.DEV ? { log: (m: string) => console.info(m) } : {}),
    });
    // The effects close over the store; a new controller per session/settings is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, deps, lang, interpreter]);

  const phase = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const availability = voiceAvailability({ ...deps, online: () => online }, settings);
  return { controller, phase, availability };
}
