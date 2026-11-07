import { useEffect, useRef, useState } from "react";
import { useServices } from "../../app/AppProvider";
import { useLang, useText } from "../../app/language";
import { useHasSession } from "../../app/useSession";
import { SETTINGS_CHANGED } from "../../app/useVoice";
import { LANGUAGES, voiceEnabled, type Lang } from "../../i18n/lang";
import type { Settings as StoredSettings } from "../../persistence/settingsRepo";
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../voice/providers";
import { useNav } from "../nav";

interface Draft {
  provider: ProviderId;
  /** Every provider's key and model: switching the control swaps the visible pair (US3). */
  apiKeys: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  rememberKey: boolean;
  /** The speech region of the display language (feature 014, FR-014a). */
  voiceLocale: string;
}

const perProvider = (value: (id: ProviderId) => string) =>
  Object.fromEntries(PROVIDER_IDS.map((id) => [id, value(id)])) as Record<ProviderId, string>;

const draftOf = (s: StoredSettings, lang: Lang): Draft => ({
  provider: s.provider,
  apiKeys: perProvider((id) => s.apiKeys[id] ?? ""),
  models: perProvider((id) => s.models[id]),
  rememberKey: s.rememberKey,
  voiceLocale: s.voiceLocales[lang],
});

/**
 * The display language (feature 014, contracts/ui.md), then the provider, per-provider key and
 * model and the voice region (FR-076; feature 005), with the privacy notes. The language applies
 * at once and saves on its own; the provider section keeps its draft until "Guardar".
 */
export function Settings() {
  const { settings } = useServices();
  const { go } = useNav();
  const hasSession = useHasSession();
  const text = useText();
  const t = text.settings;
  const { lang, setLang } = useLang();
  const [draft, setDraft] = useState<Draft | null>(null);
  const regionLang = useRef<Lang>(lang);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void settings.get().then((s) => setDraft(draftOf(s, lang)));
    // Loaded once: a language switch must not reset the unsaved fields (FR-003).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // A language switch shows that language's saved region; the key and model drafts stay.
  useEffect(() => {
    if (regionLang.current === lang) return;
    regionLang.current = lang;
    void settings.get().then((s) => setDraft((d) => (d ? { ...d, voiceLocale: s.voiceLocales[lang] } : d)));
  }, [lang, settings]);

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
      voiceLocales: { [lang]: draft.voiceLocale },
      models: draft.models,
    });
    setDraft(draftOf(next, lang));
    setSaved(true);
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  };

  const provider = PROVIDERS[draft?.provider ?? "anthropic"];
  const regions = Object.entries(t.regions).map(([id, label]) => ({ id, label }));
  const locales =
    draft && !regions.some((l) => l.id === draft.voiceLocale) ? [...regions, { id: draft.voiceLocale, label: draft.voiceLocale }] : regions;

  return (
    <main className="screen">
      <header className="topbar">
        <button className="ghost" aria-label={text.common.back} onClick={() => go({ name: hasSession ? "table" : "home" })}>
          ←
        </button>
        <h1 className="topbar-center">{t.title}</h1>
      </header>
      {draft ? (
        <div className="screen-body">
          <section className="stack">
            <h2 id="settings-language">{t.language}</h2>
            <div className="row segmented" role="radiogroup" aria-labelledby="settings-language">
              {LANGUAGES.map((l) => (
                <button key={l.id} role="radio" lang={l.id} aria-checked={lang === l.id} onClick={() => void setLang(l.id)}>
                  {l.nativeName}
                </button>
              ))}
            </div>
          </section>
          <section className="stack">
            <h2>{t.voice}</h2>
            <span className="label" id="settings-provider">
              {t.provider}
            </span>
            <div className="row segmented" role="radiogroup" aria-labelledby="settings-provider">
              {PROVIDER_IDS.map((id) => (
                <button key={id} role="radio" aria-checked={draft.provider === id} onClick={() => edit({ provider: id })}>
                  {PROVIDERS[id].label}
                </button>
              ))}
            </div>
            <label htmlFor="settings-key">{t.keyOf(provider.shortLabel)}</label>
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
              <button onClick={() => setShowKey((v) => !v)}>{showKey ? t.hide : t.show}</button>
            </div>
            <p className="muted">{t.keyHelp[provider.id]}</p>
            <label className="checkbox">
              <input type="checkbox" checked={!draft.rememberKey} onChange={(e) => edit({ rememberKey: !e.target.checked })} />
              {t.noRemember}
            </label>
            {voiceEnabled(lang) ? (
              <label>
                {t.region}
                <select value={draft.voiceLocale} onChange={(e) => edit({ voiceLocale: e.target.value })}>
                  {locales.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label} ({l.id})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="muted" role="note">
                {t.voiceUnavailable}
              </p>
            )}
            <label>
              {t.model}
              <input
                spellCheck={false}
                placeholder={provider.defaultModel}
                value={draft.models[draft.provider]}
                onChange={(e) => edit({ models: { ...draft.models, [draft.provider]: e.target.value } })}
              />
            </label>
            {t.notes[provider.id].map((note) => (
              <p key={note} className="muted">
                {note}
              </p>
            ))}
            <div className="row">
              <button className="primary" onClick={() => void save()}>
                {text.common.save}
              </button>
              {saved ? (
                <span className="muted" role="status">
                  {t.saved}
                </span>
              ) : null}
            </div>
          </section>
          <section className="stack">
            <h2>{t.privacy}</h2>
            <p className="muted">{t.audio}</p>
            <p className="muted">
              {t.sent[0]}
              <strong>{provider.label}</strong>
              {t.sent[1]}
            </p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
