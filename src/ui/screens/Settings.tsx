import { useEffect, useState } from "react";
import { useServices } from "../../app/AppProvider";
import { useHasSession } from "../../app/useSession";
import { SETTINGS_CHANGED } from "../../app/useVoice";
import { DEFAULT_MODEL, type Settings as StoredSettings } from "../../persistence/settingsRepo";
import { useNav } from "../nav";

const LOCALES: readonly { readonly id: string; readonly label: string }[] = [
  { id: "es-ES", label: "España" },
  { id: "es-MX", label: "México" },
  { id: "es-AR", label: "Argentina" },
  { id: "es-CO", label: "Colombia" },
  { id: "es-CL", label: "Chile" },
  { id: "es-PE", label: "Perú" },
  { id: "es-UY", label: "Uruguay" },
  { id: "es-US", label: "Estados Unidos" },
];

interface Draft {
  apiKey: string;
  rememberKey: boolean;
  voiceLocale: string;
  model: string;
}

const draftOf = (s: StoredSettings): Draft => ({
  apiKey: s.apiKey ?? "",
  rememberKey: s.rememberKey,
  voiceLocale: s.voiceLocale,
  model: s.model,
});

/** AI key, voice locale and interpreter model (FR-076), with the R17 privacy notes. */
export function Settings() {
  const { settings } = useServices();
  const { go } = useNav();
  const hasSession = useHasSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void settings.get().then((s) => setDraft(draftOf(s)));
  }, [settings]);

  const edit = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const save = async () => {
    if (!draft) return;
    const apiKey = draft.apiKey.trim();
    const next = await settings.set({
      rememberKey: draft.rememberKey,
      apiKey: apiKey === "" ? undefined : apiKey,
      voiceLocale: draft.voiceLocale,
      model: draft.model.trim() || DEFAULT_MODEL,
    });
    setDraft(draftOf(next));
    setSaved(true);
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  };

  const locales = draft && !LOCALES.some((l) => l.id === draft.voiceLocale)
    ? [...LOCALES, { id: draft.voiceLocale, label: draft.voiceLocale }]
    : LOCALES;

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label="Volver" onClick={() => go({ name: hasSession ? "table" : "home" })}>
          ←
        </button>
        <h1 className="topbar-center">Ajustes</h1>
      </header>
      {draft ? (
        <div className="screen-body">
          <section className="stack">
            <h2>Voz</h2>
            <label htmlFor="settings-key">Clave de API</label>
            <div className="row">
              <input
                id="settings-key"
                className="spacer"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={draft.apiKey}
                onChange={(e) => edit({ apiKey: e.target.value })}
              />
              <button onClick={() => setShowKey((v) => !v)}>{showKey ? "Ocultar" : "Mostrar"}</button>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!draft.rememberKey}
                onChange={(e) => edit({ rememberKey: !e.target.checked })}
              />
              No recordar la clave en este dispositivo
            </label>
            <label>
              Variante de español
              <select value={draft.voiceLocale} onChange={(e) => edit({ voiceLocale: e.target.value })}>
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label} ({l.id})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Modelo
              <input
                spellCheck={false}
                placeholder={DEFAULT_MODEL}
                value={draft.model}
                onChange={(e) => edit({ model: e.target.value })}
              />
            </label>
            <div className="row">
              <button className="primary" onClick={() => void save()}>
                Guardar
              </button>
              {saved ? (
                <span className="muted" role="status">
                  Guardado
                </span>
              ) : null}
            </div>
          </section>
          <section className="stack">
            <h2>Privacidad</h2>
            <p className="muted">
              El audio se procesa en el servicio de voz del navegador. La transcripción y el estado de la partida se
              envían a Anthropic para interpretar la orden. La clave solo se guarda en este dispositivo y nunca se
              incluye al exportar una partida.
            </p>
            <p className="muted">
              Crea la clave en un espacio de trabajo propio de la consola de Anthropic con un límite de gasto mensual:
              si la clave se filtra, el gasto queda acotado y es fácil revocarla.
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
