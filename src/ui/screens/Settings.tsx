import { useEffect, useState } from "react";
import { useServices } from "../../app/AppProvider";
import { useHasSession } from "../../app/useSession";
import { SETTINGS_CHANGED } from "../../app/useVoice";
import type { Settings as StoredSettings } from "../../persistence/settingsRepo";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../voice/providers";
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
  provider: ProviderId;
  /** Every provider's key and model: switching the control swaps the visible pair (US3). */
  apiKeys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  rememberKey: boolean;
  voiceLocale: string;
}

const perProvider = (value: (id: ProviderId) => string) =>
  Object.fromEntries(PROVIDER_IDS.map((id) => [id, value(id)])) as Record<ProviderId, string>;

const draftOf = (s: StoredSettings): Draft => ({
  provider: s.provider,
  apiKeys: perProvider((id) => s.apiKeys[id] ?? ""),
  models: perProvider((id) => s.models[id]),
  rememberKey: s.rememberKey,
  voiceLocale: s.voiceLocale,
});

/** Provider, per-provider key and model, voice locale (FR-076; feature 005), with the privacy notes. */
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

  /** One set() with the provider, every key and every model, then the voice layer reloads. */
  const save = async () => {
    if (!draft) return;
    const next = await settings.set({
      provider: draft.provider,
      rememberKey: draft.rememberKey,
      apiKeys: draft.apiKeys,
      voiceLocale: draft.voiceLocale,
      models: draft.models,
    });
    setDraft(draftOf(next));
    setSaved(true);
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  };

  const provider = PROVIDERS[draft?.provider ?? "anthropic"];
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
            <span className="label" id="settings-provider">
              Proveedor
            </span>
            <div className="row segmented" role="radiogroup" aria-labelledby="settings-provider">
              {PROVIDER_IDS.map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={draft.provider === id}
                  onClick={() => edit({ provider: id })}
                >
                  {PROVIDERS[id].label}
                </button>
              ))}
            </div>
            <label htmlFor="settings-key">Clave de {provider.shortLabel}</label>
            <div className="row">
              <input
                id="settings-key"
                className="spacer"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder={provider.keyPlaceholder}
                value={draft.apiKeys[draft.provider]}
                onChange={(e) => edit({ apiKeys: { ...draft.apiKeys, [draft.provider]: e.target.value } })}
              />
              <button onClick={() => setShowKey((v) => !v)}>{showKey ? "Ocultar" : "Mostrar"}</button>
            </div>
            <p className="muted">{provider.keyHelpEs}</p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!draft.rememberKey}
                onChange={(e) => edit({ rememberKey: !e.target.checked })}
              />
              No recordar las claves en este dispositivo
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
                placeholder={provider.defaultModel}
                value={draft.models[draft.provider]}
                onChange={(e) => edit({ models: { ...draft.models, [draft.provider]: e.target.value } })}
              />
            </label>
            {provider.notesEs.map((note) => (
              <p key={note} className="muted">
                {note}
              </p>
            ))}
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
            <p className="muted">El audio se procesa en el servicio de voz del navegador.</p>
            <p className="muted">
              La transcripción y el estado de la partida se envían a <strong>{provider.label}</strong> para interpretar la
              orden. Las claves solo se guardan en este dispositivo y nunca se incluyen al exportar una partida.
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
